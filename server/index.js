import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(projectRoot, 'data'));
const storageDirectory = path.join(dataDirectory, 'files');
const accessKey = process.env.APP_TOKEN;
const authenticationDisabled = process.env.NODE_ENV !== 'production' && process.env.AUTH_ENABLED !== 'true';
fs.mkdirSync(storageDirectory, {
  recursive: true
});
const database = new Database(path.join(dataDirectory, 'folio.sqlite'));
const scrypt = promisify(crypto.scrypt);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    search_text TEXT NOT NULL DEFAULT '',
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
  );
`);
if (!database.prepare('PRAGMA table_info(files)').all().some(column => column.name === 'search_text')) {
  database.exec("ALTER TABLE files ADD COLUMN search_text TEXT NOT NULL DEFAULT ''");
}
if (!database.prepare('PRAGMA table_info(files)').all().some(column => column.name === 'hidden')) {
  database.exec('ALTER TABLE files ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
}
if (!database.prepare('PRAGMA table_info(folders)').all().some(column => column.name === 'hidden')) {
  database.exec('ALTER TABLE folders ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
}
const app = express();
app.disable('x-powered-by');
app.use(express.json({
  limit: '2mb'
}));
if (process.env.CORS_ORIGIN) {
  const cors = (await import('cors')).default;
  app.use(cors({
    origin: process.env.CORS_ORIGIN
  }));
}
function sessionCookie(value, maxAge = 60 * 60 * 24 * 14) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `folio_session=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}
function cookieValue(request, name) {
  const entry = (request.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  try {
    return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
  } catch {
    return '';
  }
}
const hiddenSessions = new Map();
const hiddenLoginAttempts = new Map();
const hiddenSessionCookie = (value, maxAge = 60 * 60 * 8) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `folio_hidden_session=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
};
function hasHiddenAccess(request) {
  const id = cookieValue(request, 'folio_hidden_session');
  const expiresAt = hiddenSessions.get(id);
  if (!id || !expiresAt) return false;
  if (expiresAt <= Date.now()) {
    hiddenSessions.delete(id);
    return false;
  }
  return true;
}
function requireHiddenAccess(request, response) {
  if (hasHiddenAccess(request)) return true;
  response.status(423).json({ error: 'Unlock Hidden with your password to access this file.' });
  return false;
}
function storedHiddenPassword() {
  const setting = database.prepare('SELECT value FROM app_settings WHERE key = ?').get('hidden_password');
  return setting ? JSON.parse(setting.value) : null;
}
function tooManyHiddenAttempts(request) {
  const address = request.ip || request.socket.remoteAddress || 'unknown';
  const recent = hiddenLoginAttempts.get(address);
  if (!recent || Date.now() - recent.startedAt > 15 * 60 * 1000) {
    hiddenLoginAttempts.set(address, { startedAt: Date.now(), count: 0 });
    return false;
  }
  return recent.count >= 10;
}
function recordHiddenFailure(request) {
  const address = request.ip || request.socket.remoteAddress || 'unknown';
  const recent = hiddenLoginAttempts.get(address) || { startedAt: Date.now(), count: 0 };
  recent.count += 1;
  hiddenLoginAttempts.set(address, recent);
}
function createHiddenSession(response) {
  const id = crypto.randomBytes(32).toString('hex');
  hiddenSessions.set(id, Date.now() + 8 * 60 * 60 * 1000);
  response.setHeader('Set-Cookie', hiddenSessionCookie(id));
}
function readZipEntries(buffer, wantedNames) {
  const entries = new Map();
  const minimum = Math.max(0, buffer.length - 65_557);
  let endRecord = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { endRecord = offset; break; }
  }
  if (endRecord < 0) throw new Error('This Office file is not a readable ZIP document.');
  const entryCount = buffer.readUInt16LE(endRecord + 10);
  let cursor = buffer.readUInt32LE(endRecord + 16);
  let expandedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('This Office file has an invalid archive.');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const expandedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!wantedNames.has(name)) continue;
    if (expandedSize > 12_000_000 || expandedTotal + expandedSize > 45_000_000) throw new Error('This document is too large to preview.');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('This Office file has an invalid entry.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    const content = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 12_000_000 }) : null;
    if (!content) throw new Error('This Office file uses an unsupported compression format.');
    expandedTotal += content.length;
    entries.set(name, content.toString('utf8'));
  }
  return entries;
}
function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, digits) => {
      const codePoint = Number(digits);
      return codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff) ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&#x([\da-f]+);/gi, (_match, digits) => {
      const codePoint = Number.parseInt(digits, 16);
      return codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff) ? String.fromCodePoint(codePoint) : '';
    });
}
function xmlText(xml) {
  return [...xml.matchAll(/<(?:[\w.-]+:)?(t|tab|br|cr)\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?\1\s*>|<(?:[\w.-]+:)?(tab|br|cr)\b[^>]*\/>/g)]
    .map((match) => {
      const tag = match[1] || match[4];
      if (tag === 'tab') return '\t';
      if (tag === 'br' || tag === 'cr') return '\n';
      return decodeXmlEntities((match[3] || '').replace(/<[^>]+>/g, ''));
    }).join('');
}
function docxBlocks(xml) {
  const body = xml.match(/<(?:[\w.-]+:)?body\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?body\s*>/)?.[1] || xml;
  const blocks = [];
  const blockPattern = /<(?:[\w.-]+:)?(p|tbl)\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?\1\s*>/g;
  for (const match of body.matchAll(blockPattern)) {
    const blockXml = match[0];
    if (match[1] === 'p') {
      const text = xmlText(blockXml);
      if (text.trim()) blocks.push({ type: 'paragraph', text });
      continue;
    }
    const rows = [...blockXml.matchAll(/<(?:[\w.-]+:)?tr\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?tr\s*>/g)].map((row) =>
      [...row[1].matchAll(/<(?:[\w.-]+:)?tc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?tc\s*>/g)].map((cell) =>
        [...cell[1].matchAll(/<(?:[\w.-]+:)?p\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?p\s*>/g)].map((paragraph) => xmlText(paragraph[0])).filter(Boolean).join('\n')
      )
    );
    if (rows.length) blocks.push({ type: 'table', rows });
  }
  return blocks;
}
function officePreview(filePath, extension) {
  const fileBuffer = fs.readFileSync(filePath);
  if (fileBuffer.length > 50_000_000) throw new Error('This file is too large to preview here.');
  if (extension === '.docx') {
    const entries = readZipEntries(fileBuffer, new Set(['word/document.xml']));
    const xml = entries.get('word/document.xml');
    if (!xml) throw new Error('Could not find document content in this file.');
    const blocks = docxBlocks(xml);
    const text = blocks.map((block) => block.type === 'table' ? block.rows.map((row) => row.join('\t')).join('\n') : block.text).join('\n\n');
    return { kind: 'document', sections: [{ title: 'Document', text: text || 'This document has no readable text.', blocks }] };
  }
  if (extension === '.pptx') {
    const slideNames = new Set([...fileBuffer.toString('latin1').matchAll(/ppt\/slides\/slide\d+\.xml/g)].map((match) => match[0]));
    const entries = readZipEntries(fileBuffer, slideNames);
    const sections = [...entries].sort(([a], [b]) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1])).map(([name, xml]) => {
      const paragraphs = [...xml.matchAll(/<(?:\w+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?p\s*>/g)].map((match) => xmlText(match[1])).filter(Boolean);
      return { title: `Slide ${name.match(/slide(\d+)/)?.[1]}`, text: paragraphs.join('\n') || 'No readable text on this slide.' };
    });
    if (!sections.length) throw new Error('Could not find slides in this file.');
    return { kind: 'presentation', sections };
  }
  if (extension === '.xlsx') {
    const wanted = new Set([...fileBuffer.toString('latin1').matchAll(/xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml)/g)].map((match) => match[0]));
    const entries = readZipEntries(fileBuffer, wanted);
    const sharedXml = entries.get('xl/sharedStrings.xml') || '';
    const shared = [...sharedXml.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si\s*>/g)].map((match) => xmlText(match[1]));
    const sections = [...entries].filter(([name]) => /worksheets\/sheet\d+\.xml$/.test(name)).sort(([a], [b]) => Number(a.match(/sheet(\d+)/)?.[1]) - Number(b.match(/sheet(\d+)/)?.[1])).map(([name, xml], index) => {
      const rows = [...xml.matchAll(/<(?:\w+:)?row(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?row\s*>/g)].map((row) => [...row[1].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c\s*>/g)].map((cell) => {
        const type = cell[1].match(/\bt="([^"]+)"/)?.[1];
        const value = cell[2].match(/<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v\s*>/)?.[1] || xmlText(cell[2]);
        return type === 's' ? (shared[Number(value)] || '') : decodeXmlEntities(value);
      }).join('\t'));
      return { title: `Sheet ${index + 1}`, text: rows.join('\n') || `No readable cells in ${name}.` };
    });
    if (!sections.length) throw new Error('Could not find spreadsheet data in this file.');
    return { kind: 'spreadsheet', sections };
  }
  throw new Error('Read-only preview is available for DOCX, XLSX, and PPTX files.');
}
app.use('/api', (request, response, next) => {
  if (authenticationDisabled) {
    const origin = request.headers.origin;
    if (origin) {
      let hostname = '';
      try {
        const parsedOrigin = new URL(origin);
        if (parsedOrigin.protocol === 'http:') hostname = parsedOrigin.hostname;
      } catch { /* Reject invalid origins below. */ }
      if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) {
        return response.status(403).json({ error: 'Local workspace requests must come from this computer.' });
      }
    }
    if (request.path === '/session' && request.method === 'DELETE') return response.json({ ok: true });
    return next();
  }
  if (!accessKey) return response.status(503).json({
    error: 'Set APP_TOKEN in your environment before starting the app.'
  });
  if (request.path === '/health') return next();
  if (request.path === '/session' && request.method === 'POST') {
    if (request.headers.authorization !== `Bearer ${accessKey}`) {
      return response.status(401).json({
        error: 'That access key was not accepted.'
      });
    }
    response.setHeader('Set-Cookie', sessionCookie(accessKey));
    return response.json({
      ok: true
    });
  }
  const hasValidKey = request.headers.authorization === `Bearer ${accessKey}`;
  const hasValidSession = cookieValue(request, 'folio_session') === accessKey;
  if (!hasValidKey && !hasValidSession) {
    return response.status(401).json({
      error: 'Enter your workspace access key.'
    });
  }
  if (request.path === '/session' && request.method === 'DELETE') {
    response.setHeader('Set-Cookie', sessionCookie('', 0));
    hiddenSessions.delete(cookieValue(request, 'folio_hidden_session'));
    response.append('Set-Cookie', hiddenSessionCookie('', 0));
    return response.json({
      ok: true
    });
  }
  if (request.path === '/session' && request.method === 'GET' && hasValidKey) {
    response.setHeader('Set-Cookie', sessionCookie(accessKey));
  }
  next();
});
app.get('/api/health', (_request, response) => response.json({
  ok: true
}));
app.get('/api/session', (_request, response) => response.json({
  ok: true,
  requiresAuth: !authenticationDisabled
}));
app.get('/api/hidden/status', (request, response) => response.json({
  configured: Boolean(storedHiddenPassword()),
  unlocked: hasHiddenAccess(request)
}));
app.post('/api/hidden/setup', async (request, response) => {
  if (storedHiddenPassword()) return response.status(409).json({ error: 'A Hidden password is already set. Enter it to unlock Hidden.' });
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  if (password.length < 8 || password.length > 256) return response.status(400).json({ error: 'Use a password between 8 and 256 characters.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  database.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('hidden_password', JSON.stringify({ salt, hash: hash.toString('hex') }));
  createHiddenSession(response);
  response.json({ ok: true });
});
app.post('/api/hidden/unlock', async (request, response) => {
  if (tooManyHiddenAttempts(request)) return response.status(429).json({ error: 'Too many incorrect attempts. Try again in 15 minutes.' });
  const saved = storedHiddenPassword();
  if (!saved) return response.status(409).json({ error: 'Set up a Hidden password first.' });
  const password = typeof request.body.password === 'string' ? request.body.password : '';
  const expected = Buffer.from(saved.hash, 'hex');
  const actual = await scrypt(password, saved.salt, expected.length);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    recordHiddenFailure(request);
    return response.status(401).json({ error: 'That password was not accepted.' });
  }
  hiddenLoginAttempts.delete(request.ip || request.socket.remoteAddress || 'unknown');
  createHiddenSession(response);
  response.json({ ok: true });
});
app.delete('/api/hidden/session', (request, response) => {
  hiddenSessions.delete(cookieValue(request, 'folio_hidden_session'));
  response.setHeader('Set-Cookie', hiddenSessionCookie('', 0));
  response.json({ ok: true });
});
app.get('/api/storage', (_request, response) => {
  const totals = database.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(size), 0) AS bytes, SUM(CASE WHEN hidden = 1 THEN 1 ELSE 0 END) AS hiddenCount FROM files').get();
  response.json({ ...totals, hiddenCount: totals.hiddenCount || 0 });
});
app.get('/api/files/:id/office-preview', (request, response) => {
  const file = database.prepare('SELECT * FROM files WHERE id = ?').get(request.params.id);
  if (!file) return response.status(404).json({ error: 'File not found.' });
  if (file.hidden && !requireHiddenAccess(request, response)) return;
  const extension = path.extname(file.name).toLowerCase();
  if (!['.docx', '.xlsx', '.pptx'].includes(extension)) {
    return response.status(415).json({ error: 'Read-only preview is available for DOCX, XLSX, and PPTX files.' });
  }
  const filePath = path.resolve(storageDirectory, file.stored_name);
  if (!filePath.startsWith(`${storageDirectory}${path.sep}`)) return response.status(400).end();
  try {
    response.json(officePreview(filePath, extension));
  } catch (error) {
    response.status(422).json({ error: error.message || 'This file could not be previewed.' });
  }
});
const sourceCodeExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.py', '.pyi', '.pyw', '.java', '.c', '.h', '.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx', '.cs', '.csx', '.cshtml', '.razor', '.fs', '.fsi', '.fsx', '.vb', '.go', '.rs', '.php', '.rb', '.r', '.swift', '.kt', '.kts', '.dart', '.lua', '.pl', '.pm', '.ex', '.exs', '.hs', '.lhs', '.scala', '.sc', '.clj', '.cljc', '.cljs', '.edn', '.erl', '.hrl', '.sql', '.pgsql', '.psql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.psd1', '.bat', '.cmd', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.json', '.jsonc', '.json5', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.gradle', '.groovy', '.hcl', '.tf', '.tfvars', '.nix', '.vue', '.svelte', '.astro', '.graphql', '.gql', '.proto', '.mdx', '.ipynb', '.tex', '.asm', '.s', '.d', '.zig', '.v', '.nim', '.cr', '.jl', '.m', '.mm', '.sol', '.move', '.wat', '.wgsl', '.diff', '.patch', '.make', '.mk', '.cmake', '.bzl', '.lisp', '.lsp', '.scm', '.rkt', '.el', '.ml', '.mli', '.f', '.for', '.f77', '.f90', '.f95', '.f03', '.f08', '.f18', '.fpp', '.cob', '.cbl', '.cobol', '.pas', '.p', '.pp', '.ino', '.sv', '.vhd', '.vhdl', '.tcl', '.awk', '.elm', '.purs', '.re', '.rei']);
const textFileExtensions = new Set([...sourceCodeExtensions, '.txt', '.md', '.csv']);
const supportedTypes = new Map([
  ...Object.entries({
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
  }),
  ...Array.from(sourceCodeExtensions, extension => [extension, extension === '.js' ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8'])
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: storageDirectory,
    filename: (_request, _file, callback) => callback(null, `${crypto.randomUUID()}.bin`)
  }),
  limits: {
    files: 20,
    fields: 5
  },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!supportedTypes.has(extension)) return callback(new Error(`The .${extension.slice(1) || 'unknown'} file type is not supported.`));
    callback(null, true);
  }
});
const timestamp = () => new Date().toISOString();
const fileQuery = `
  SELECT files.id, files.name, files.stored_name, files.mime, files.size, files.folder_id,
         files.tags, files.hidden, files.created_at, files.modified_at, folders.name AS folder_name
  FROM files LEFT JOIN folders ON folders.id = files.folder_id
`;
async function fileTypeIsValid(filePath, extension) {
  const descriptor = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(4096);
  let length;
  try {
    length = fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  const bytes = header.subarray(0, length);
  const startsWith = (...signature) => signature.every((byte, index) => bytes[index] === byte);
  if (extension === '.pdf') return bytes.subarray(0, 1024).toString('latin1').includes('%PDF-');
  if (extension === '.png') return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (extension === '.jpg' || extension === '.jpeg') return startsWith(0xff, 0xd8, 0xff);
  if (extension === '.gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  if (extension === '.webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (extension === '.webm') return startsWith(0x1a, 0x45, 0xdf, 0xa3);
  if (extension === '.mp4' || extension === '.mov') {
    const isIsoBaseMedia = bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
    if (!isIsoBaseMedia) return false;
    const brand = bytes.subarray(8, 12).toString('ascii');
    const mp4Brands = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'M4VH', 'M4VP', 'MSNV', 'F4V ', 'dash']);
    return extension === '.mov' ? brand === 'qt  ' : mp4Brands.has(brand);
  }
  if (['.doc', '.ppt', '.xls'].includes(extension)) return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  if (['.docx', '.pptx', '.xlsx'].includes(extension)) return startsWith(0x50, 0x4b, 0x03, 0x04);
  if (extension === '.zip') return [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]].some(signature => startsWith(...signature));
  if (extension === '.svg') return /<svg[\s>]/i.test(bytes.toString('utf8'));
  for await (const chunk of fs.createReadStream(filePath)) {
    if (chunk.includes(0)) return false;
  }
  return true;
}
function cleanUploadedFiles(files = []) {
  for (const file of files) fs.rmSync(file.path, {
    force: true
  });
}
app.get('/api/folders', (request, response) => {
  const hiddenView = request.query.view === 'hidden';
  if (hiddenView && !requireHiddenAccess(request, response)) return;
  const folders = database.prepare('SELECT * FROM folders WHERE hidden = ? ORDER BY name COLLATE NOCASE').all(Number(hiddenView));
  response.json(folders);
});
app.post('/api/folders', (request, response) => {
  const name = String(request.body.name || '').trim();
  const parentId = request.body.parentId || null;
  const hidden = request.body.hidden === true;
  if (hidden && !requireHiddenAccess(request, response)) return;
  if (!name || name.length > 80) return response.status(400).json({
    error: 'Folder name must be 1–80 characters.'
  });
  const parent = parentId ? database.prepare('SELECT id, hidden FROM folders WHERE id = ?').get(parentId) : null;
  if (parentId && !parent) {
    return response.status(400).json({
      error: 'The parent folder was not found.'
    });
  }
  if (parent && Boolean(parent.hidden) !== hidden) return response.status(400).json({ error: 'Hidden folders must stay inside Hidden, and regular folders must stay in the workspace.' });
  const id = crypto.randomUUID();
  database.prepare('INSERT INTO folders (id, name, parent_id, hidden, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, parentId, Number(hidden), timestamp());
  response.status(201).json(database.prepare('SELECT * FROM folders WHERE id = ?').get(id));
});
app.patch('/api/folders/:id', (request, response) => {
  const folder = database.prepare('SELECT * FROM folders WHERE id = ?').get(request.params.id);
  if (!folder) return response.status(404).json({ error: 'Folder not found.' });
  if (folder.hidden && !requireHiddenAccess(request, response)) return;
  const name = String(request.body.name || '').trim();
  if (!name || name.length > 80) return response.status(400).json({
    error: 'Folder name must be 1–80 characters.'
  });
  database.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, request.params.id);
  response.json({
    ok: true
  });
});
app.delete('/api/folders/:id', (request, response) => {
  const folder = database.prepare('SELECT * FROM folders WHERE id = ?').get(request.params.id);
  if (!folder) return response.status(404).json({ error: 'Folder not found.' });
  if (folder.hidden && !requireHiddenAccess(request, response)) return;
  const result = database.prepare('DELETE FROM folders WHERE id = ?').run(request.params.id);
  if (!result.changes) return response.status(404).json({
    error: 'Folder not found.'
  });
  response.json({
    ok: true
  });
});
app.get('/api/files', (request, response) => {
  const conditions = [];
  const values = [];
  const folderId = request.query.folder;
  const hiddenView = request.query.view === 'hidden';
  if (hiddenView && !requireHiddenAccess(request, response)) return;
  conditions.push(`files.hidden = ${hiddenView ? 1 : 0}`);
  const query = String(request.query.q || '').trim().slice(0, 200);
  if (folderId === 'root') conditions.push('files.folder_id IS NULL');else if (folderId) {
    conditions.push('files.folder_id = ?');
    values.push(folderId);
  }
  if (query) {
    conditions.push('(files.name LIKE ? ESCAPE \'\\\' OR files.tags LIKE ? ESCAPE \'\\\' OR files.search_text LIKE ? ESCAPE \'\\\')');
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    values.push(pattern, pattern, pattern);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const files = database.prepare(`${fileQuery}${where} ORDER BY files.modified_at DESC`).all(...values);
  response.json(files.map(file => ({
    ...file,
    tags: JSON.parse(file.tags)
  })));
});
app.post('/api/files', (request, response, next) => {
  upload.array('files', 20)(request, response, async error => {
    if (error) {
      cleanUploadedFiles(request.files);
      return next(error);
    }
    const files = request.files || [];
    const folderId = request.body.folderId || null;
    if (!files.length) return response.status(400).json({
      error: 'Choose at least one file.'
    });
    const destinationFolder = folderId ? database.prepare('SELECT id, hidden FROM folders WHERE id = ?').get(folderId) : null;
    if (folderId && !destinationFolder) {
      cleanUploadedFiles(files);
      return response.status(400).json({
        error: 'The destination folder was not found.'
      });
    }
    const hidden = request.body.hidden === 'true' || Boolean(destinationFolder?.hidden);
    if (hidden && !requireHiddenAccess(request, response)) {
      cleanUploadedFiles(files);
      return;
    }
    let invalid;
    try {
      for (const file of files) {
        if (!(await fileTypeIsValid(file.path, path.extname(file.originalname).toLowerCase()))) {
          invalid = file;
          break;
        }
      }
    } catch (validationError) {
      cleanUploadedFiles(files);
      return next(validationError);
    }
    if (invalid) {
      cleanUploadedFiles(files);
      return response.status(400).json({
        error: `The file contents do not match “${path.extname(invalid.originalname)}”.`
      });
    }
    const addFiles = database.transaction(() => files.map(file => {
      const id = crypto.randomUUID();
      const name = path.basename(file.originalname.replaceAll('\\', '/')).slice(0, 255);
      const extension = path.extname(name).toLowerCase();
      const modifiedAt = timestamp();
      database.prepare(`
        INSERT INTO files (id, name, stored_name, mime, size, folder_id, tags, search_text, hidden, created_at, modified_at)
        VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)
      `).run(id, name, file.filename, supportedTypes.get(extension), file.size, folderId, textFileExtensions.has(extension) ? fs.readFileSync(file.path, 'utf8').slice(0, 1_000_000) : '', Number(hidden), modifiedAt, modifiedAt);
      return {
        id,
        name,
        size: file.size
      };
    }));
    try {
      response.status(201).json({
        items: addFiles()
      });
    } catch (error) {
      cleanUploadedFiles(files);
      next(error);
    }
  });
});
app.get('/api/files/:id', (request, response) => {
  const file = database.prepare(`${fileQuery} WHERE files.id = ?`).get(request.params.id);
  if (!file) return response.status(404).json({
    error: 'File not found.'
  });
  if (file.hidden && !requireHiddenAccess(request, response)) return;
  response.json({
    ...file,
    tags: JSON.parse(file.tags)
  });
});
app.get('/api/files/:id/content', (request, response, next) => {
  const file = database.prepare('SELECT * FROM files WHERE id = ?').get(request.params.id);
  if (!file) return response.status(404).json({
    error: 'File not found.'
  });
  if (file.hidden && !requireHiddenAccess(request, response)) return;
  const filePath = path.resolve(storageDirectory, file.stored_name);
  if (!filePath.startsWith(`${storageDirectory}${path.sep}`)) return response.status(400).end();
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const extension = path.extname(file.name).toLowerCase();
  // Use the validated filename extension for known formats. Older uploads may
  // have a generic or incorrect MIME value stored in their metadata, which can
  // prevent browsers from rendering otherwise valid JPG/PNG previews.
  const contentType = textFileExtensions.has(extension)
    ? 'text/plain; charset=utf-8'
    : supportedTypes.get(extension) || file.mime || 'application/octet-stream';
  response.setHeader('Content-Type', contentType);
  const forceDownload = request.query.download || extension === '.svg' || sourceCodeExtensions.has(extension);
  const disposition = forceDownload ? 'attachment' : 'inline';
  response.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  const isVideo = ['.mp4', '.webm', '.mov'].includes(extension);
  if (!isVideo) {
    const stream = fs.createReadStream(filePath);
    stream.on('error', next);
    return stream.pipe(response);
  }
  let fileSize;
  try {
    fileSize = fs.statSync(filePath).size;
  } catch (error) {
    return next(error);
  }
  response.setHeader('Accept-Ranges', 'bytes');
  const range = forceDownload ? null : request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      response.setHeader('Content-Range', `bytes */${fileSize}`);
      return response.status(416).end();
    }
    const start = match[1] ? Number(match[1]) : Math.max(fileSize - Number(match[2]), 0);
    const end = match[2] && match[1] ? Math.min(Number(match[2]), fileSize - 1) : fileSize - 1;
    if (start >= fileSize || start > end) {
      response.setHeader('Content-Range', `bytes */${fileSize}`);
      return response.status(416).end();
    }
    response.status(206);
    response.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    response.setHeader('Content-Length', end - start + 1);
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', next);
    return stream.pipe(response);
  }
  response.setHeader('Content-Length', fileSize);
  const stream = fs.createReadStream(filePath);
  stream.on('error', next);
  stream.pipe(response);
});
app.put('/api/files/:id/content', (request, response) => {
  const file = database.prepare('SELECT * FROM files WHERE id = ?').get(request.params.id);
  if (!file) return response.status(404).json({ error: 'File not found.' });
  if (file.hidden && !requireHiddenAccess(request, response)) return;
  const extension = path.extname(file.name).toLowerCase();
  if (!textFileExtensions.has(extension)) {
    return response.status(415).json({ error: 'In-app editing is only available for supported text and source-code files.' });
  }
  const content = typeof request.body.content === 'string' ? request.body.content : null;
  if (content === null) return response.status(400).json({ error: 'Document content is required.' });
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > 1_000_000) return response.status(413).json({ error: 'Text documents must be 1 MB or smaller to edit in the app.' });
  if (content.includes('\0')) return response.status(400).json({ error: 'Text documents cannot contain binary data.' });
  const filePath = path.resolve(storageDirectory, file.stored_name);
  if (!filePath.startsWith(`${storageDirectory}${path.sep}`)) return response.status(400).end();
  const temporaryPath = path.join(storageDirectory, `${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, filePath);
    const modifiedAt = timestamp();
    database.prepare('UPDATE files SET size = ?, search_text = ?, modified_at = ? WHERE id = ?')
      .run(bytes, content.slice(0, 1_000_000), modifiedAt, file.id);
    response.json({ ok: true, size: bytes, modified_at: modifiedAt });
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    response.status(500).json({ error: 'The document could not be saved.' });
  }
});
app.patch('/api/files/:id', (request, response) => {
  const file = database.prepare('SELECT * FROM files WHERE id = ?').get(request.params.id);
  if (!file) return response.status(404).json({
    error: 'File not found.'
  });
  if (file.hidden && !requireHiddenAccess(request, response)) return;
  const name = request.body.name === undefined ? file.name : String(request.body.name).trim();
  const folderId = request.body.folderId === undefined ? file.folder_id : request.body.folderId || null;
  const tags = request.body.tags === undefined ? JSON.parse(file.tags) : request.body.tags;
  const hidden = request.body.hidden === undefined ? Boolean(file.hidden) : request.body.hidden;
  if (!name || name.length > 255 || /[\\/]/.test(name) || name === '.' || name === '..') {
    return response.status(400).json({
      error: 'Use a valid file name up to 255 characters.'
    });
  }
  if (path.extname(name).toLowerCase() !== path.extname(file.name).toLowerCase()) {
    return response.status(400).json({
      error: 'Keep the original file extension when renaming this file.'
    });
  }
  const destinationFolder = folderId ? database.prepare('SELECT id, hidden FROM folders WHERE id = ?').get(folderId) : null;
  if (folderId && !destinationFolder) {
    return response.status(400).json({
      error: 'The destination folder was not found.'
    });
  }
  if (destinationFolder?.hidden && !requireHiddenAccess(request, response)) return;
  if (!Array.isArray(tags) || tags.length > 20 || tags.some(tag => typeof tag !== 'string' || tag.trim().length > 30)) {
    return response.status(400).json({
      error: 'Use up to 20 tags, with no more than 30 characters each.'
    });
  }
  if (typeof hidden !== 'boolean') {
    return response.status(400).json({ error: 'Hidden must be true or false.' });
  }
  const cleanTags = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
  const remainHidden = hidden || Boolean(destinationFolder?.hidden);
  database.prepare('UPDATE files SET name = ?, folder_id = ?, tags = ?, hidden = ?, modified_at = ? WHERE id = ?').run(name, folderId, JSON.stringify(cleanTags), Number(remainHidden), timestamp(), file.id);
  response.json({
    ok: true
  });
});
app.delete('/api/files/:id', (request, response) => {
  const file = database.prepare('SELECT * FROM files WHERE id = ?').get(request.params.id);
  if (!file) return response.status(404).json({
    error: 'File not found.'
  });
  if (file.hidden && !requireHiddenAccess(request, response)) return;
  database.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  const filePath = path.resolve(storageDirectory, file.stored_name);
  if (filePath.startsWith(`${storageDirectory}${path.sep}`)) fs.rmSync(filePath, {
    force: true
  });
  response.json({
    ok: true
  });
});
app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_COUNT' ? 'Upload up to 20 files at a time.' : error.message;
    return response.status(400).json({
      error: message
    });
  }
  response.status(400).json({
    error: error.message || 'Upload failed.'
  });
});
const builtApp = path.join(projectRoot, 'dist');
if (fs.existsSync(builtApp)) {
  app.use(express.static(builtApp));
  app.get('*', (_request, response) => response.sendFile(path.join(builtApp, 'index.html')));
}
const port = Number(process.env.PORT || 3001);
const host = authenticationDisabled ? '127.0.0.1' : '0.0.0.0';
app.listen(port, host, () => console.log(`Folio server listening on ${host}:${port}`));
