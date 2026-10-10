import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(projectRoot, 'data'));
const storageDirectory = path.join(dataDirectory, 'files');
const accessKey = process.env.APP_TOKEN;
fs.mkdirSync(storageDirectory, {
  recursive: true
});
const database = new Database(path.join(dataDirectory, 'folio.sqlite'));
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
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
    created_at TEXT NOT NULL,
    modified_at TEXT NOT NULL
  );
`);
if (!database.prepare('PRAGMA table_info(files)').all().some(column => column.name === 'search_text')) {
  database.exec("ALTER TABLE files ADD COLUMN search_text TEXT NOT NULL DEFAULT ''");
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
  return [...xml.matchAll(/<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t\s*>/g)]
    .map((match) => decodeXmlEntities(match[1].replace(/<[^>]+>/g, ''))).join('');
}
function officePreview(filePath, extension) {
  const fileBuffer = fs.readFileSync(filePath);
  if (fileBuffer.length > 50_000_000) throw new Error('This file is too large to preview here.');
  if (extension === '.docx') {
    const entries = readZipEntries(fileBuffer, new Set(['word/document.xml']));
    const xml = entries.get('word/document.xml');
    if (!xml) throw new Error('Could not find document content in this file.');
    const paragraphs = [...xml.matchAll(/<(?:\w+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?p\s*>/g)].map((match) => xmlText(match[1])).filter(Boolean);
    return { kind: 'document', sections: [{ title: 'Document', text: paragraphs.join('\n\n') || 'This document has no readable text.' }] };
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
  ok: true
}));
app.get('/api/files/:id/office-preview', (request, response) => {
  const file = database.prepare('SELECT * FROM files WHERE id = ?').get(request.params.id);
  if (!file) return response.status(404).json({ error: 'File not found.' });
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
const supportedTypes = new Map(Object.entries({
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
}));
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
         files.tags, files.created_at, files.modified_at, folders.name AS folder_name
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
  if (['.doc', '.ppt', '.xls'].includes(extension)) return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  if (['.docx', '.pptx', '.xlsx'].includes(extension)) return startsWith(0x50, 0x4b, 0x03, 0x04);
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
app.get('/api/folders', (_request, response) => {
  const folders = database.prepare('SELECT * FROM folders ORDER BY name COLLATE NOCASE').all();
  response.json(folders);
});
app.post('/api/folders', (request, response) => {
  const name = String(request.body.name || '').trim();
  const parentId = request.body.parentId || null;
  if (!name || name.length > 80) return response.status(400).json({
    error: 'Folder name must be 1–80 characters.'
  });
  if (parentId && !database.prepare('SELECT id FROM folders WHERE id = ?').get(parentId)) {
    return response.status(400).json({
      error: 'The parent folder was not found.'
    });
  }
  const id = crypto.randomUUID();
  database.prepare('INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)').run(id, name, parentId, timestamp());
  response.status(201).json(database.prepare('SELECT * FROM folders WHERE id = ?').get(id));
});
app.patch('/api/folders/:id', (request, response) => {
  const name = String(request.body.name || '').trim();
  if (!name || name.length > 80) return response.status(400).json({
    error: 'Folder name must be 1–80 characters.'
  });
  const result = database.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, request.params.id);
  if (!result.changes) return response.status(404).json({
    error: 'Folder not found.'
  });
  response.json({
    ok: true
  });
});
app.delete('/api/folders/:id', (request, response) => {
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
    if (folderId && !database.prepare('SELECT id FROM folders WHERE id = ?').get(folderId)) {
      cleanUploadedFiles(files);
      return response.status(400).json({
        error: 'The destination folder was not found.'
      });
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
        INSERT INTO files (id, name, stored_name, mime, size, folder_id, tags, search_text, created_at, modified_at)
        VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)
      `).run(id, name, file.filename, supportedTypes.get(extension), file.size, folderId, ['.txt', '.md', '.csv'].includes(extension) ? fs.readFileSync(file.path, 'utf8').slice(0, 1_000_000) : '', modifiedAt, modifiedAt);
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
  const filePath = path.resolve(storageDirectory, file.stored_name);
  if (!filePath.startsWith(`${storageDirectory}${path.sep}`)) return response.status(400).end();
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', file.mime);
  const forceDownload = request.query.download || path.extname(file.name).toLowerCase() === '.svg';
  const disposition = forceDownload ? 'attachment' : 'inline';
  response.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  const stream = fs.createReadStream(filePath);
  stream.on('error', next);
  stream.pipe(response);
});
app.put('/api/files/:id/content', (request, response) => {
  const file = database.prepare('SELECT * FROM files WHERE id = ?').get(request.params.id);
  if (!file) return response.status(404).json({ error: 'File not found.' });
  const extension = path.extname(file.name).toLowerCase();
  if (!['.txt', '.md', '.csv'].includes(extension)) {
    return response.status(415).json({ error: 'In-app editing is available for TXT, MD, and CSV files.' });
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
  const name = request.body.name === undefined ? file.name : String(request.body.name).trim();
  const folderId = request.body.folderId === undefined ? file.folder_id : request.body.folderId || null;
  const tags = request.body.tags === undefined ? JSON.parse(file.tags) : request.body.tags;
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
  if (folderId && !database.prepare('SELECT id FROM folders WHERE id = ?').get(folderId)) {
    return response.status(400).json({
      error: 'The destination folder was not found.'
    });
  }
  if (!Array.isArray(tags) || tags.length > 20 || tags.some(tag => typeof tag !== 'string' || tag.trim().length > 30)) {
    return response.status(400).json({
      error: 'Use up to 20 tags, with no more than 30 characters each.'
    });
  }
  const cleanTags = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))];
  database.prepare('UPDATE files SET name = ?, folder_id = ?, tags = ?, modified_at = ? WHERE id = ?').run(name, folderId, JSON.stringify(cleanTags), timestamp(), file.id);
  response.json({
    ok: true
  });
});
app.delete('/api/files/:id', (request, response) => {
  const file = database.prepare('SELECT * FROM files WHERE id = ?').get(request.params.id);
  if (!file) return response.status(404).json({
    error: 'File not found.'
  });
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
app.listen(port, '0.0.0.0', () => console.log(`Folio server listening on ${port}`));
