import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Folder, FolderOpen, Files, Image as ImageIcon, FileText, Presentation, Table2, Archive, Code2, Video, Upload, Plus, Grid2X2, List, MoreHorizontal, Download, Eye, EyeOff, Pencil, Trash2, ChevronRight, ChevronDown, ArrowLeft, ArrowUpDown, Tag, X, File, CheckCircle2, AlertCircle, CloudUpload, Menu, ArrowLeftRight, LockKeyhole, Command } from 'lucide-react';
import './style.css';
const fmtSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const date = x => new Date(x).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});
const ext = x => (x.split('.').pop() || 'FILE').toUpperCase();
const sourceCodeTypes = ['JS', 'MJS', 'CJS', 'JSX', 'TS', 'MTS', 'CTS', 'TSX', 'PY', 'PYI', 'PYW', 'JAVA', 'C', 'H', 'CC', 'CPP', 'CXX', 'HH', 'HPP', 'HXX', 'CS', 'CSX', 'CSHTML', 'RAZOR', 'FS', 'FSI', 'FSX', 'VB', 'GO', 'RS', 'PHP', 'RB', 'R', 'SWIFT', 'KT', 'KTS', 'DART', 'LUA', 'PL', 'PM', 'EX', 'EXS', 'HS', 'LHS', 'SCALA', 'SC', 'CLJ', 'CLJC', 'CLJS', 'EDN', 'ERL', 'HRL', 'SQL', 'PGSQL', 'PSQL', 'SH', 'BASH', 'ZSH', 'FISH', 'PS1', 'PSM1', 'PSD1', 'BAT', 'CMD', 'HTML', 'HTM', 'CSS', 'SCSS', 'SASS', 'LESS', 'JSON', 'JSONC', 'JSON5', 'XML', 'YAML', 'YML', 'TOML', 'INI', 'CFG', 'CONF', 'PROPERTIES', 'GRADLE', 'GROOVY', 'HCL', 'TF', 'TFVARS', 'NIX', 'VUE', 'SVELTE', 'ASTRO', 'GRAPHQL', 'GQL', 'PROTO', 'MDX', 'IPYNB', 'TEX', 'ASM', 'S', 'D', 'ZIG', 'V', 'NIM', 'CR', 'JL', 'M', 'MM', 'SOL', 'MOVE', 'WAT', 'WGSL', 'DIFF', 'PATCH', 'MAKE', 'MK', 'CMAKE', 'BZL', 'LISP', 'LSP', 'SCM', 'RKT', 'EL', 'ML', 'MLI', 'F', 'FOR', 'F77', 'F90', 'F95', 'F03', 'F08', 'F18', 'FPP', 'COB', 'CBL', 'COBOL', 'PAS', 'P', 'PP', 'INO', 'SV', 'VHD', 'VHDL', 'TCL', 'AWK', 'ELM', 'PURS', 'RE', 'REI'];
const sourceCodeTypeSet = new Set(sourceCodeTypes);
const acceptedFileTypes = ['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX', 'ZIP', ...sourceCodeTypes, 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'MP4', 'WEBM', 'MOV', 'TXT', 'MD', 'CSV'];
const videoFileTypes = new Set(['MP4', 'WEBM', 'MOV']);
const fileTypes = ['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX', 'ZIP', 'CODE', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'VIDEO', 'TXT', 'MD', 'CSV'];
const iconFor = n => {
  const e = ext(n);
  return e === 'ZIP' ? Archive : videoFileTypes.has(e) ? Video : sourceCodeTypeSet.has(e) ? Code2 : e === 'PDF' || ['DOC', 'DOCX', 'TXT', 'MD'].includes(e) ? FileText : ['PPT', 'PPTX'].includes(e) ? Presentation : ['XLS', 'XLSX', 'CSV'].includes(e) ? Table2 : ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'].includes(e) ? ImageIcon : File;
};
function App() {
  const [token, setToken] = useState(''),
    [authorized, setAuthorized] = useState(false),
    [requiresAuth, setRequiresAuth] = useState(true),
    [sessionChecking, setSessionChecking] = useState(true),
    [files, setFiles] = useState([]),
    [workspaceFiles, setWorkspaceFiles] = useState([]),
    [hiddenWorkspaceFiles, setHiddenWorkspaceFiles] = useState([]),
    [workspaceStats, setWorkspaceStats] = useState({ total: 0, bytes: 0, hiddenCount: 0 }),
    [folders, setFolders] = useState([]),
    [hiddenFolders, setHiddenFolders] = useState([]),
    [folder, setFolder] = useState('all'),
    [loadedFolder, setLoadedFolder] = useState(null),
    [sort, setSort] = useState('modified_at'),
    [view, setView] = useState('grid'),
    [sizeFilter, setSizeFilter] = useState('all'),
    [dateFilter, setDateFilter] = useState('all'),
    [selected, setSelected] = useState(null),
    [modal, setModal] = useState(''),
    [target, setTarget] = useState(null),
    [message, setMessage] = useState(null),
    [progress, setProgress] = useState(0),
    [busy, setBusy] = useState(false),
    [isDragging, setIsDragging] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [filter, setFilter] = useState('all');
  const [hiddenPasswordConfigured, setHiddenPasswordConfigured] = useState(false);
  const [hiddenUnlocked, setHiddenUnlocked] = useState(false);
  const [hiddenStatusReady, setHiddenStatusReady] = useState(false);
  const hiddenMode = folder === 'hidden' || hiddenFolders.some(item => item.id === folder);
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const input = useRef();
  const refreshVersion = useRef(0);
  const dragDepth = useRef(0);
  const headers = {
    Authorization: `Bearer ${token}`
  };
  async function api(url, opts = {}) {
    const r = await fetch(url, {
      ...opts,
      headers: {
        ...headers,
        ...opts.headers
      }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(data.error || 'Something went wrong.');
    return data;
  }
  async function refresh() {
    const version = ++refreshVersion.current;
    const folderQuery = folder === 'all' || folder === 'hidden' ? 'root' : folder === 'starred' ? '' : folder;
    const listingQuery = hiddenMode ? 'view=hidden&' : '';
    const [currentFiles, allFiles, allFolders, stats, privateFolders, allPrivateFiles] = await Promise.all([api(`/api/files?${listingQuery}folder=${encodeURIComponent(folderQuery)}`), api('/api/files'), api('/api/folders'), api('/api/storage'), hiddenMode ? api('/api/folders?view=hidden') : Promise.resolve([]), hiddenMode ? api('/api/files?view=hidden') : Promise.resolve([])]);
    if (version !== refreshVersion.current) return;
    setWorkspaceFiles(allFiles);
    setWorkspaceStats(stats);
    setFiles(folder === 'starred' ? allFiles.filter(file => file.tags.includes('starred')) : currentFiles);
    setFolders(allFolders);
    setHiddenFolders(privateFolders);
    setHiddenWorkspaceFiles(allPrivateFiles);
    setLoadedFolder(folder);
  }
  useEffect(() => {
    localStorage.removeItem('folio-token');
    api('/api/session').then(session => {
      setRequiresAuth(session.requiresAuth !== false);
      setAuthorized(true);
    }).catch(() => setAuthorized(false)).finally(() => setSessionChecking(false));
  }, []);
  useEffect(() => {
    if (!authorized) return;
    const timer = window.setTimeout(() => refresh().catch(e => {
      if (folder === 'hidden') {
        setHiddenUnlocked(false);
        setFolder('all');
        setModal('hidden-password');
      }
      toast(e.message, 'error');
    }), 0);
    return () => window.clearTimeout(timer);
  }, [authorized, folder]);
  useEffect(() => {
    if (!authorized) return;
    api('/api/hidden/status').then(status => {
      setHiddenPasswordConfigured(status.configured);
      setHiddenUnlocked(status.unlocked);
    }).catch(() => {
      setHiddenPasswordConfigured(false);
      setHiddenUnlocked(false);
    }).finally(() => setHiddenStatusReady(true));
  }, [authorized]);
  function toast(text, type = 'ok') {
    setMessage({
      text,
      type
    });
    setTimeout(() => setMessage(null), 3200);
  }
  const visible = useMemo(() => {
    let a = [...files];
    if (folder === 'all' && filter === 'all') a = [];
    else if (filter === 'CODE') a = a.filter(f => sourceCodeTypeSet.has(ext(f.name)));
    else if (filter === 'VIDEO') a = a.filter(f => videoFileTypes.has(ext(f.name)));
    else if (filter !== 'all') a = a.filter(f => ext(f.name) === filter);
    if (sizeFilter === 'small') a = a.filter(file => file.size < 1024 * 1024);
    if (sizeFilter === 'medium') a = a.filter(file => file.size >= 1024 * 1024 && file.size < 10 * 1024 * 1024);
    if (sizeFilter === 'large') a = a.filter(file => file.size >= 10 * 1024 * 1024);
    if (dateFilter !== 'all') {
      const [field, days] = dateFilter.split(':');
      const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
      a = a.filter(file => new Date(file[field]).getTime() >= cutoff);
    }
    a.sort((x, y) => sort === 'name' ? x.name.localeCompare(y.name) : sort === 'type' ? ext(x.name).localeCompare(ext(y.name)) : sort === 'size' ? y.size - x.size : new Date(y[sort]) - new Date(x[sort]));
    return a;
  }, [files, folder, filter, sizeFilter, dateFilter, sort]);
  const childFolders = useMemo(() => {
    if (folder === 'starred') return [];
    const parentId = folder === 'all' || folder === 'hidden' ? null : folder;
    return (hiddenMode ? hiddenFolders : folders)
      .filter(item => (item.parent_id || null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, hiddenFolders, hiddenMode, folder]);
  const folderItemCount = item => (hiddenMode ? hiddenWorkspaceFiles : workspaceFiles).filter(file => file.folder_id === item.id).length + (hiddenMode ? hiddenFolders : folders).filter(child => child.parent_id === item.id).length;
  function sendUploadBatch(items, folderId, onProgress, hidden = false) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      items.forEach(({ file }) => form.append('files', file, file.name));
      if (folderId) form.append('folderId', folderId);
      if (hidden) form.append('hidden', 'true');

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files');
      xhr.withCredentials = true;
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress(event.loaded);
      };
      xhr.onload = () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status >= 400) throw Error(result.error || 'Upload failed.');
          resolve(result.items);
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => reject(Error('Upload failed. Check your connection.'));
      xhr.send(form);
    });
  }

  async function uploadItems(items, folderId = folder === 'all' || folder === 'starred' || folder === 'hidden' ? null : folder, directories = []) {
    if (busy) throw Error('An upload is already in progress.');
    setBusy(true);
    setProgress(0);

    try {
      const allFolders = await api(hiddenMode ? '/api/folders?view=hidden' : '/api/folders');
      const folderByParentAndName = new Map(allFolders.map(item => [`${item.parent_id || ''}\0${item.name.toLocaleLowerCase()}`, item.id]));
      const ensureFolderPath = async segments => {
        let parentId = folderId;
        for (const segment of segments) {
          const name = segment.trim().slice(0, 80);
          if (!name) continue;
          const key = `${parentId || ''}\0${name.toLocaleLowerCase()}`;
          let id = folderByParentAndName.get(key);
          if (!id) {
            const created = await api('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, parentId, hidden: hiddenMode })
            });
            id = created.id;
            folderByParentAndName.set(key, id);
          }
          parentId = id;
        }
        return parentId;
      };

      for (const directory of [...directories].sort((a, b) => a.length - b.length)) {
        await ensureFolderPath(directory);
      }

      const batches = new Map();
      for (const item of items) {
        const destination = item.folderSegments.length ? await ensureFolderPath(item.folderSegments) : folderId;
        batches.set(destination || '', [...(batches.get(destination || '') || []), item]);
      }

      const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
      let completedBytes = 0;
      let uploadedCount = 0;
      for (const [destination, destinationItems] of batches) {
        for (let offset = 0; offset < destinationItems.length; offset += 20) {
          const batch = destinationItems.slice(offset, offset + 20);
          await sendUploadBatch(batch, destination || null, loaded => {
            setProgress(totalBytes ? Math.round((completedBytes + loaded) / totalBytes * 100) : 100);
          }, hiddenMode && !destination);
          completedBytes += batch.reduce((sum, item) => sum + item.file.size, 0);
          uploadedCount += batch.length;
        }
      }

      setProgress(100);
      toast(uploadedCount
        ? `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} uploaded`
        : `${directories.length} folder${directories.length === 1 ? '' : 's'} added`);
      await refresh();
    } finally {
      setBusy(false);
      window.setTimeout(() => setProgress(0), 700);
    }
  }

  async function upload(event) {
    const items = [...event.target.files].map(file => {
      const segments = (file.webkitRelativePath || '').split('/').filter(Boolean);
      return { file, folderSegments: segments.slice(0, -1) };
    });
    const directories = [...new Map(items.flatMap(item => item.folderSegments.map((_, index) => {
      const path = item.folderSegments.slice(0, index + 1);
      return [path.join('\0'), path];
    })))].map(([, path]) => path);
    event.target.value = '';
    if (!items.length) return;
    try {
      await uploadItems(items, folder === 'all' || folder === 'starred' || folder === 'hidden' ? null : folder, directories);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function readDirectoryEntries(directory) {
    const reader = directory.createReader();
    const entries = [];
    return new Promise((resolve, reject) => {
      const readBatch = () => reader.readEntries(batch => {
        if (!batch.length) return resolve(entries);
        entries.push(...batch);
        readBatch();
      }, reject);
      readBatch();
    });
  }

  async function collectDroppedEntries(entries, handles, fallbackFiles) {
    const files = [];
    const directories = [];
    const visit = async (entry, parentSegments = []) => {
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        files.push({ file, folderSegments: parentSegments });
        return;
      }
      if (!entry.isDirectory) return;
      const folderSegments = [...parentSegments, entry.name];
      directories.push(folderSegments);
      const children = await readDirectoryEntries(entry);
      for (const child of children) await visit(child, folderSegments);
    };
    const visitHandle = async (handle, parentSegments = []) => {
      if (handle.kind === 'file') {
        const file = await handle.getFile();
        files.push({ file, folderSegments: parentSegments });
        return;
      }
      const folderSegments = [...parentSegments, handle.name];
      directories.push(folderSegments);
      for await (const [name, child] of handle.entries()) {
        if (child.name !== name) continue;
        await visitHandle(child, folderSegments);
      }
    };

    for (const entry of entries) await visit(entry);
    if (!entries.length && handles.length) {
      for (const handle of handles) if (handle) await visitHandle(handle);
    }
    if (!entries.length && !handles.length) {
      for (const file of fallbackFiles) {
        const segments = (file.webkitRelativePath || '').split('/').filter(Boolean);
        files.push({ file, folderSegments: segments.slice(0, -1) });
        for (let depth = 1; depth < segments.length; depth++) {
          directories.push(segments.slice(0, depth));
        }
      }
    }
    return { files, directories };
  }

  async function handleDrop(event) {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (busy) return toast('Wait for the current upload to finish first.', 'error');

    const transferItems = Array.from(event.dataTransfer.items || []);
    // Call the async handle API synchronously during drop; browsers restrict later access.
    const handleReads = transferItems.map(item => typeof item.getAsFileSystemHandle === 'function'
      ? item.getAsFileSystemHandle().catch(() => null)
      : Promise.resolve(null));
    const entries = transferItems
      .map(item => item.webkitGetAsEntry?.())
      .filter(Boolean);
    const fallbackFiles = Array.from(event.dataTransfer.files || []);
    try {
      const handles = (await Promise.all(handleReads)).filter(Boolean);
      const dropped = await collectDroppedEntries(entries, handles, fallbackFiles);
      if (!dropped.files.length && !dropped.directories.length) {
        throw Error('No files or folders were found in that drop.');
      }
      await uploadItems(dropped.files, folder === 'all' || folder === 'starred' || folder === 'hidden' ? null : folder, dropped.directories);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function handleDragEnter(event) {
    if (!authorized || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event) {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event) {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setIsDragging(false);
  }
  async function createFolder(name) {
    await api('/api/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        parentId: folder === 'all' || folder === 'starred' || folder === 'hidden' ? null : folder,
        hidden: hiddenMode
      })
    });
    toast('Folder created');
    setModal('');
    await refresh();
  }
  async function removeFile(f) {
    if (!confirm(`Delete “${f.name}”? This cannot be undone.`)) return;
    await api(`/api/files/${f.id}`, {
      method: 'DELETE'
    });
    toast('File deleted');
    setSelected(null);
    await refresh();
  }
  async function editFile(f, body) {
    await api(`/api/files/${f.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    toast('Changes saved');
    setModal('');
    await refresh();
  }
  async function saveFileContent(file, content) {
    const result = await api(`/api/files/${file.id}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    setSelected(current => current?.id === file.id ? { ...current, size: result.size, modified_at: result.modified_at } : current);
    await refresh();
    toast('Document saved');
  }
  async function toggleStar(file) {
    const tags = file.tags.includes('starred') ? file.tags.filter(tag => tag !== 'starred') : [...file.tags, 'starred'];
    await editFile(file, {
      tags
    });
    toast(tags.includes('starred') ? 'Added to Starred' : 'Removed from Starred');
  }
  async function toggleHidden(file) {
    const hidden = !file.hidden;
    await api(`/api/files/${file.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden })
    });
    setModal('');
    toast(hidden ? 'Moved to Hidden' : 'Restored from Hidden');
    await refresh();
  }
  function openHidden() {
    setMobileNav(false);
    if (!hiddenStatusReady) {
      toast('Hidden is still loading. Try again in a moment.');
      return;
    }
    if (hiddenUnlocked) setFolder('hidden');
    else setModal('hidden-password');
  }
  async function submitHiddenPassword(password) {
    const endpoint = hiddenPasswordConfigured ? '/api/hidden/unlock' : '/api/hidden/setup';
    await api(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    setHiddenPasswordConfigured(true);
    setHiddenUnlocked(true);
    setModal('');
    setFolder('hidden');
    toast(hiddenPasswordConfigured ? 'Hidden unlocked' : 'Hidden password created');
  }
  async function lockHidden() {
    await api('/api/hidden/session', { method: 'DELETE' });
    setHiddenUnlocked(false);
    if (folder === 'hidden') setFolder('all');
    toast('Hidden locked');
  }
  async function removeFolder(f) {
    if (!confirm(`Delete folder “${f.name}”? Its files will move to All files, and its subfolders will move up one level.`)) return;
    await api(`/api/folders/${f.id}`, {
      method: 'DELETE'
    });
    if (folder === f.id) setFolder('all');
    toast('Folder deleted');
    await refresh();
  }
  async function renameFolder(folderToRename) {
    const name = window.prompt('Rename folder', folderToRename.name)?.trim();
    if (!name || name === folderToRename.name) return;
    await api(`/api/folders/${folderToRename.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name
      })
    });
    toast('Folder renamed');
    await refresh();
  }
  async function logout() {
    await api('/api/session', {
      method: 'DELETE'
    });
    setAuthorized(false);
    setToken('');
  }
  function onError(fn) {
    return (...a) => fn(...a).catch(e => toast(e.message, 'error'));
  }
  const folderTree = useMemo(() => {
    const children = new Map();
    folders.forEach(item => {
      const parentId = item.parent_id || '';
      children.set(parentId, [...(children.get(parentId) || []), item]);
    });
    const ordered = [];
    const visit = (parentId, depth) => {
      (children.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
        ordered.push({
          folder: item,
          depth,
          hasChildren: (children.get(item.id) || []).length > 0,
          expanded: !collapsedFolders.has(item.id)
        });
        if (!collapsedFolders.has(item.id)) visit(item.id, depth + 1);
      });
    };
    visit('', 0);
    return ordered;
  }, [folders, collapsedFolders]);
  if (sessionChecking) return <div className="session-loading" role="status">Opening your workspace…</div>;
  if (!authorized) return <div className="login">
      <div className="login-card">
      <div className="brand">
      <div className="brand-mark">
      <Command size={21} />
      </div>
      <span>folio</span>
      </div>
      <div className="login-icon">
      <LockKeyhole size={23} />
      </div>
      <h1>Your files, in one place.</h1>
      <p>Enter your workspace access key to open your private library.</p>
      <form onSubmit={e => {
        e.preventDefault();
        api('/api/session').then(session => {
          setRequiresAuth(session.requiresAuth !== false);
          setToken('');
          setAuthorized(true);
        }).catch(error => toast(error.message, 'error'));
      }}>
      <label htmlFor="key">Workspace access key</label>
      <input id="key" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Enter access key" required />
      <button className="primary full">Open workspace <ChevronRight size={17} />
      </button>
      </form>{message && <div className="login-alert">{message.text}</div>}</div>
      </div>;
  const current = (hiddenMode ? hiddenFolders : folders).find(f => f.id === folder);
  return <div className="app" onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isDragging && <div className="drop-overlay" aria-live="polite">
      <div className="drop-overlay-card">
      <span className="drop-overlay-icon"><CloudUpload size={28} /></span>
      <strong>Drop files or folders to upload</strong>
      <span>Folders and their contents will be kept together.</span>
      </div>
      </div>}
      <header className="topbar">
      <button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}>
      <Menu />
      </button>
      <div className="brand">
      <span>folio</span>
      </div>
      </header>
      <aside className={`sidebar ${mobileNav ? 'show' : ''}`}>
      <div className="side-scroll">
      <div className="side-label">WORKSPACE</div>
      <button className={`nav-item ${folder === 'all' ? 'active' : ''}`} onClick={() => {
          setFolder('all');
          setMobileNav(false);
        }}>
      <Files size={18} />All files
      </button>
      <div className="hidden-nav-row">
      <button className={`nav-item ${hiddenMode ? 'active' : ''}`} onClick={openHidden}>
      <EyeOff size={18} />Hidden<span className="nav-count">{workspaceStats.hiddenCount}</span>
      </button>{hiddenUnlocked && <button className="hidden-lock" aria-label="Lock Hidden" title="Lock Hidden" onClick={onError(lockHidden)}><LockKeyhole size={15} /></button>}
      </div>
      <div className="side-label folders-label">FOLDERS <button className="plus-mini" aria-label="Create folder" onClick={() => setModal('folder')}>
      <Plus size={15} />
      </button>
      </div>
      <div className="folder-list">
      <button className={`nav-item ${folders.length === 0 ? 'no-folder' : ''}`} onClick={() => setModal('folder')}>
      <Folder size={17} />New folder</button>{folderTree.map(({
            folder: f,
            depth,
            hasChildren,
            expanded
          }) => <div className="folder-row" key={f.id} style={{
            paddingLeft: `${depth * 13}px`
          }}>
      {hasChildren ? <button className="folder-expand" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${f.name}`} aria-expanded={expanded} title={`${expanded ? 'Collapse' : 'Expand'} subfolders`} onClick={() => setCollapsedFolders(current => {
              const next = new Set(current);
              if (next.has(f.id)) next.delete(f.id);
              else next.add(f.id);
              return next;
            })}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="folder-expand-placeholder" aria-hidden="true" />}
      <button className={`nav-item ${folder === f.id ? 'active' : ''}`} onClick={() => setFolder(f.id)}>
      <Folder size={17} />
      <span>{f.name}</span>
      </button>
      <button className="folder-menu" aria-label={`Rename ${f.name}`} title="Rename folder" onClick={() => onError(renameFolder)(f)}>
      <Pencil size={14} />
      </button>
      <button className="folder-menu" aria-label={`Delete ${f.name}`} title="Delete folder" onClick={() => onError(removeFolder)(f)}>
      <Trash2 size={14} />
      </button>
      </div>)}</div>
      <div className="side-label type-label">FILE TYPES</div>{fileTypes.map(type => <button className={`nav-item type-item ${filter === type ? 'active' : ''}`} key={type} onClick={() => setFilter(filter === type ? 'all' : type)}>
      {type === 'CODE' ? <Code2 size={17} /> : type === 'VIDEO' ? <Video size={17} /> : <FileText size={17} />}{type === 'CODE' ? 'Code files' : type === 'VIDEO' ? 'Videos' : type}</button>)}</div>
      <div className="sidebar-bottom">
      <div className="storage">
      <div className="storage-title">
      <span>Storage used</span>
      <span>{fmtSize(workspaceStats.bytes)}</span>
      </div>
      <small>No app storage quota · limited by server disk space</small>
      </div>
      </div>
      </aside>{mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}<main className="main">
      <div className="page-head">
      <div>
      <div className="breadcrumbs">
      <span>Workspace</span>
      <ChevronRight size={14} />
      <b>{folder === 'all' ? 'All files' : folder === 'starred' ? 'Starred' : folder === 'hidden' ? 'Hidden' : current?.name || 'Folder'}</b>
      </div>
      <h1>{folder === 'all' ? 'All files' : folder === 'starred' ? 'Starred' : folder === 'hidden' ? 'Hidden' : current?.name || 'Folder'}</h1>
      <p>Manage and organize your digital workspace.</p>
      </div>
      <div className="head-actions">
      <button className="secondary" onClick={() => setModal('folder')}>
      <Plus size={16} />New folder</button>
      <button className="primary" onClick={() => input.current.click()}>
      <Upload size={16} />Upload files</button>
      <input ref={input} type="file" accept={acceptedFileTypes.map(type => `.${type.toLowerCase()}`).join(',')} multiple hidden onChange={upload} />
      </div>
      </div>
      <div className="stats">
      <div className="stat">
      <span className="stat-icon lavender">
      <Files size={18} />
      </span>
      <div>
      <b>{workspaceFiles.length}</b>
      <small>Total files</small>
      </div>
      </div>
      <div className="stat">
      <span className="stat-icon blue">
      <Folder size={18} />
      </span>
      <div>
      <b>{folders.length}</b>
      <small>Folders</small>
      </div>
      </div>
      <div className="stat">
      <span className="stat-icon mint">
      <ArrowUpDown size={18} />
      </span>
      <div>
      <b>{fmtSize(workspaceStats.bytes)}</b>
      <small>Storage used</small>
      </div>
      </div>
      <div className="stat date-stat">
      <span className="stat-icon peach">
      <CheckCircle2 size={18} />
      </span>
      <div>
      <b>Up to date</b>
      <small>Everything is synced</small>
      </div>
      </div>
      </div>
      <section className="files-section">
      <div className="section-head">
      <div>
      <div className="section-title-row">
      {folder !== 'all' && folder !== 'starred' && folder !== 'hidden' && <button className="folder-back" aria-label="Go back to parent folder" title="Back to parent folder" onClick={() => {
        setFolder(hiddenMode ? current?.parent_id || 'hidden' : current?.parent_id || 'all');
        setMobileNav(false);
      }}><ArrowLeft size={15} /></button>}
      <h2>{folder === 'hidden' ? 'Hidden files' : 'Files'} <span className="count-pill">{visible.length}</span>
      </h2>
      </div>
      <p>Your files and folders, neatly organized.</p>
      </div>
      <div className="list-controls">
      <label className="sort-control">
      <select aria-label="Filter by file size" value={sizeFilter} onChange={e => setSizeFilter(e.target.value)}>
      <option value="all">Any size</option>
      <option value="small">Under 1 MB</option>
      <option value="medium">1–10 MB</option>
      <option value="large">10 MB or more</option>
      </select>
      </label>
      <label className="sort-control">
      <select aria-label="Filter by date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
      <option value="all">Any date</option>
      <option value="created_at:7">Added in 7 days</option>
      <option value="created_at:30">Added in 30 days</option>
      <option value="modified_at:7">Modified in 7 days</option>
      <option value="modified_at:30">Modified in 30 days</option>
      </select>
      </label>
      <label className="sort-control">
      <ArrowUpDown size={15} />
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort files">
      <option value="modified_at">Last modified</option>
      <option value="name">Name</option>
      <option value="type">File type</option>
      <option value="size">File size</option>
      <option value="created_at">Date added</option>
      </select>
      </label>
      <div className="view-switch">
      <button aria-label="Grid view" className={view === 'grid' ? 'picked' : ''} onClick={() => setView('grid')}>
      <Grid2X2 size={17} />
      </button>
      <button aria-label="List view" className={view === 'list' ? 'picked' : ''} onClick={() => setView('list')}>
      <List size={18} />
      </button>
      </div>
      </div>
      </div>{busy && <div className="upload-progress">
      <div>
      <CloudUpload size={18} />
      <span>Uploading files…</span>
      <b>{progress}%</b>
      </div>
      <div className="progress-line">
      <span style={{
              width: `${progress}%`
            }} />
      </div>
      </div>}{childFolders.length > 0 && <div className="subfolder-section">
      <div className="subfolder-heading"><h3>Folders</h3><span className="count-pill">{childFolders.length}</span></div>
      {view === 'grid' ? <div className="subfolder-grid">{childFolders.map(item => <button className="subfolder-card" key={item.id} onClick={() => {
        setFolder(item.id);
        setMobileNav(false);
      }} aria-label={`Open folder ${item.name}`}>
        <span className="subfolder-icon"><FolderOpen size={21} /></span>
        <span className="subfolder-details"><strong title={item.name}>{item.name}</strong><small>{folderItemCount(item)} items</small></span>
        <ChevronRight className="subfolder-chevron" size={16} />
      </button>)}</div> : <div className="table-wrap folder-table-wrap"><table>
        <thead><tr><th>Name</th><th>Type</th><th>Items</th></tr></thead>
        <tbody>{childFolders.map(item => <tr key={item.id}>
          <td><button className="table-name" onClick={() => {
            setFolder(item.id);
            setMobileNav(false);
          }}><FolderOpen size={18} />{item.name}</button></td>
          <td><span className="type-badge">Folder</span></td>
          <td>{folderItemCount(item)}</td>
        </tr>)}</tbody>
      </table></div>}
      </div>}{loadedFolder !== folder ? <div className="folder-loading" role="status">Loading folder…</div> : visible.length ? view === 'grid' ? <div className="file-grid">{visible.map(f => <FileCard key={f.id} f={f} onSelect={() => {
            setSelected(f);
            setModal('preview');
          }} onMore={() => {
            setTarget(f);
            setModal('actions');
          }} token={token} />)}</div> : <div className="table-wrap">
      <table>
      <thead>
      <tr>
      <th>Name</th>
      <th>Type</th>
      <th>Size</th>
      <th>Date added</th>
      <th>Last modified</th>
      <th>
      </th>
      </tr>
      </thead>
      <tbody>{visible.map(f => <tr key={f.id}>
      <td>
      <button className="table-name" onClick={() => {
                    setSelected(f);
                    setModal('preview');
                  }}>{React.createElement(iconFor(f.name), {
                      size: 18
                    })}{f.name}</button>
      </td>
      <td>
      <span className="type-badge">{ext(f.name)}</span>
      </td>
      <td>{fmtSize(f.size)}</td>
      <td>{date(f.created_at)}</td>
      <td>{date(f.modified_at)}</td>
      <td>
      <button className="icon-btn" onClick={() => {
                    setTarget(f);
                    setModal('actions');
                  }} aria-label="File actions">
      <MoreHorizontal size={18} />
      </button>
      </td>
      </tr>)}</tbody>
      </table>
      </div> : childFolders.length ? null : <div className="empty">
      <div className="empty-art">
      <div className="empty-back">
      <FolderOpen size={34} />
      </div>
      <div className="empty-front">
      <Files size={28} />
      </div>
      </div>
      <h3>{folder === 'hidden' ? 'No hidden files' : hiddenMode ? 'This hidden folder is empty' : folder === 'all' ? 'Browse your folders' : 'Your workspace is ready'}</h3>
      <p>{folder === 'hidden' ? 'Files you hide and folders you create will appear here.' : hiddenMode ? 'Add files or create a subfolder here.' : folder === 'all' ? 'Open a folder to see its files, or choose a file type to filter files here.' : 'Upload your first file or create a folder to get started.'}</p>
      <div>
      <button className="secondary" onClick={() => setModal('folder')}>
      <Plus size={16} />Create folder</button>
      <button className="primary" onClick={() => input.current.click()}>
      <Upload size={16} />Upload files</button>
      </div>
      </div>}</section>
      <footer>Folio <span>·</span> Your personal file workspace</footer>
      </main>{message && <div className={`toast ${message.type}`} role="status">{message.type === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />} {message.text}</div>}{modal === 'folder' && <FolderModal onClose={() => setModal('')} onCreate={onError(createFolder)} />}{modal === 'hidden-password' && <HiddenPasswordModal configured={hiddenPasswordConfigured} onClose={() => setModal('')} onSubmit={onError(submitHiddenPassword)} />}{modal === 'actions' && target && <ActionModal file={target} close={() => setModal('')} onPreview={() => {
      setSelected(target);
      setModal('preview');
    }} onRename={() => setModal('rename')} onMove={() => setModal('move')} onTags={() => setModal('tags')} onStar={() => onError(() => toggleStar(target))()} onToggleHidden={() => onError(() => toggleHidden(target))()} onDelete={() => onError(removeFile)(target)} token={token} />}{['rename', 'move', 'tags'].includes(modal) && target && <EditModal mode={modal} file={target} folders={hiddenMode ? hiddenFolders : folders} onClose={() => setModal('')} onSave={onError(body => editFile(target, body))} />}{modal === 'preview' && selected && <Preview file={selected} token={token} close={() => setModal('')} onActions={() => {
      setTarget(selected);
      setModal('actions');
    }} onSaveContent={content => saveFileContent(selected, content)} />}</div>;
}
function FileCard({
  f,
  onSelect,
  onMore,
  token
}) {
  const e = ext(f.name),
    img = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'].includes(e);
  return <article className="file-card">
      <button className={`file-preview ${img ? 'image-preview' : ''}`} onClick={onSelect} aria-label={`Preview ${f.name}`}>{img ? <img src={`/api/files/${f.id}/content`} alt="" /> : <div className={`file-art ${e.toLowerCase()} ${sourceCodeTypeSet.has(e) ? 'source-code' : ''}`}>{React.createElement(iconFor(f.name), {
          size: 25
        })}<span>{e}</span>
      </div>}<span className="preview-hover">
      <Eye size={15} /> Preview</span>
      </button>
      <div className="file-info">
      <button className="file-title" onClick={onSelect} title={f.name}>{f.name}</button>
      <div className="file-meta">
      <span>{fmtSize(f.size)}</span>
      <i>·</i>
      <span>{date(f.modified_at)}</span>
      </div>{f.tags.length > 0 && <div className="tags">{f.tags.map(t => <span key={t}>{t}</span>)}</div>}<button className="card-menu" onClick={onMore} aria-label={`Actions for ${f.name}`}>
      <MoreHorizontal size={18} />
      </button>
      </div>
      </article>;
}
function FolderModal({
  onClose,
  onCreate
}) {
  const [name, setName] = useState('');
  return <Dialog title="Create a folder" close={onClose}>
      <p className="modal-copy">Give your new folder a name.</p>
      <form onSubmit={e => {
      e.preventDefault();
      onCreate(name);
    }}>
      <label>Folder name</label>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Project Atlas" maxLength={80} />
      <div className="modal-buttons">
      <button type="button" className="secondary" onClick={onClose}>Cancel</button>
      <button className="primary">Create folder</button>
      </div>
      </form>
      </Dialog>;
}
function HiddenPasswordModal({ configured, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  return <Dialog title={configured ? 'Unlock Hidden' : 'Create a Hidden password'} close={onClose}>
      <p className="modal-copy">{configured ? 'Enter your Hidden password to view protected files.' : 'Choose a password of at least 8 characters. Folio stores a salted password hash.'}</p>
      <form className="hidden-password-form" onSubmit={event => {
        event.preventDefault();
        if (!configured && password !== confirmation) {
          setError('The passwords do not match.');
          return;
        }
        setError('');
        onSubmit(password);
      }}>
      <label htmlFor="hidden-password">Password</label>
      <input id="hidden-password" type="password" autoFocus autoComplete={configured ? 'current-password' : 'new-password'} minLength={configured ? undefined : 8} maxLength={256} required value={password} onChange={event => setPassword(event.target.value)} />
      {!configured && <><label htmlFor="hidden-password-confirm">Confirm password</label>
      <input id="hidden-password-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={256} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></>}
      {error && <p className="hidden-password-error" role="alert">{error}</p>}
      <div className="modal-buttons">
      <button type="button" className="secondary" onClick={onClose}>Cancel</button>
      <button className="primary">{configured ? 'Unlock' : 'Set password'}</button>
      </div>
      </form>
      </Dialog>;
}
function ActionModal({
  file,
  close,
  onPreview,
  onRename,
  onMove,
  onTags,
  onStar,
  onToggleHidden,
  onDelete
}) {
  return <Dialog title="File actions" close={close}>
      <p className="modal-copy action-name">{file.name}</p>
      <div className="action-list">
      <button onClick={onPreview}>
      <Eye size={17} />Preview</button>
      <a href={`/api/files/${file.id}/content?download=1`}>
      <Download size={17} />Download</a>
      <button onClick={onStar}>
      <Tag size={17} />{file.tags.includes('starred') ? 'Remove from Starred' : 'Add to Starred'}</button>
      <button onClick={onToggleHidden}>
      {file.hidden ? <Eye size={17} /> : <EyeOff size={17} />}{file.hidden ? 'Unhide file' : 'Hide file'}</button>
      <button onClick={onRename}>
      <Pencil size={17} />Rename</button>
      <button onClick={onMove}>
      <ArrowLeftRight size={17} />Move to folder</button>
      <button onClick={onTags}>
      <Tag size={17} />Edit tags</button>
      <button className="danger-text" onClick={onDelete}>
      <Trash2 size={17} />Delete file</button>
      </div>
      </Dialog>;
}
function EditModal({
  mode,
  file,
  folders,
  onClose,
  onSave
}) {
  const [val, setVal] = useState(mode === 'rename' ? file.name : mode === 'tags' ? file.tags.join(', ') : file.folder_id || '');
  const title = {
    rename: 'Rename file',
    move: 'Move to folder',
    tags: 'Edit tags'
  }[mode];
  const folderLabel = folder => {
    const parts = [folder.name];
    let parentId = folder.parent_id;
    while (parentId) {
      const parent = folders.find(item => item.id === parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return parts.join(' / ');
  };
  return <Dialog title={title} close={onClose}>
      <p className="modal-copy">{file.name}</p>
      <form onSubmit={e => {
      e.preventDefault();
      onSave(mode === 'rename' ? {
        name: val
      } : mode === 'tags' ? {
        tags: val.split(',').map(x => x.trim()).filter(Boolean)
      } : {
        folderId: val
      });
    }}>{mode === 'move' ? <>
      <label>Destination folder</label>
      <select value={val} onChange={e => setVal(e.target.value)}>
      <option value="">All files (no folder)</option>{folders.map(f => <option value={f.id} key={f.id}>{folderLabel(f)}</option>)}</select>
      </> : <>
      <label>{mode === 'rename' ? 'File name' : 'Tags (comma separated)'}</label>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)} placeholder={mode === 'tags' ? 'design, 2026, client' : 'Enter a file name'} maxLength={mode === 'rename' ? 255 : 300} />
      </>}<div className="modal-buttons">
      <button type="button" className="secondary" onClick={onClose}>Cancel</button>
      <button className="primary">Save changes</button>
      </div>
      </form>
      </Dialog>;
}
function Preview({
  file,
  token,
  close,
  onActions,
  onSaveContent
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  const e = ext(file.name),
    url = `/api/files/${file.id}/content`;
  return <div className="preview-overlay" onMouseDown={e => {
    if (e.target === e.currentTarget) close();
  }}>
      <div className="preview-dialog">
      <div className="preview-top">
      <div>{React.createElement(iconFor(file.name), {
            size: 19
          })}<div>
      <b>{file.name}</b>
      <small>{ext(file.name)} · {fmtSize(file.size)}</small>
      </div>
      </div>
      <div className="preview-actions">
      <a href={`${url}?download=1`}>
      <Download size={18} />
      </a>
      <button onClick={onActions}>
      <MoreHorizontal size={19} />
      </button>
      <button onClick={close} aria-label="Close preview">
      <X size={19} />
      </button>
      </div>
      </div>
      <div className="preview-body">{['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'].includes(e) ? <img src={url} alt={file.name} /> : videoFileTypes.has(e) ? <video src={url} controls playsInline preload="metadata" aria-label={file.name} /> : e === 'PDF' ? <iframe src={url} title={file.name} /> : ['TXT', 'MD', 'CSV'].includes(e) || sourceCodeTypeSet.has(e) ? <TextPreview url={url} file={file} onSave={onSaveContent} /> : ['DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX'].includes(e) ? <OfficeFilePreview file={file} /> : <div className="unsupported">
      <div className={`file-art ${e.toLowerCase()} ${sourceCodeTypeSet.has(e) ? 'source-code' : ''}`}>{React.createElement(iconFor(file.name), {
              size: 35
            })}<span>{e}</span>
      </div>
      <h3>Preview not available</h3>
      <p>Download this file to open it in a compatible app.</p>
      <a className="primary" href={`${url}?download=1`}>
      <Download size={16} />Download file</a>
      </div>}</div>
      </div>
      </div>;
}
function OfficeFilePreview({ file }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const supportsReadOnly = ['DOCX', 'PPTX', 'XLSX'].includes(ext(file.name));
  useEffect(() => {
    if (!supportsReadOnly) { setLoading(false); return; }
    let active = true;
    fetch(`/api/files/${file.id}/office-preview`).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error || 'Could not preview this file.');
      return result;
    }).then(result => active && setPreview(result)).catch(loadError => active && setError(loadError.message || 'Could not preview this file.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [file.id, supportsReadOnly]);
  return <div className="office-readonly-shell">
    <div className="office-readonly-toolbar"><span>Read-only extracted content{preview ? ` · ${preview.sections.length} ${preview.kind === 'presentation' ? 'slides' : preview.kind === 'spreadsheet' ? 'sheets' : 'document'}` : ''}</span></div>
    <div className="office-readonly-content" aria-live="polite">
      {loading && <p className="office-readonly-message" role="status">Loading file content…</p>}
      {!loading && error && <div className="office-readonly-message" role="alert"><strong>Preview unavailable</strong><span>{error}</span></div>}
      {!loading && !error && !supportsReadOnly && <div className="office-readonly-message"><strong>Read-only content preview isn’t available for this older Office format.</strong><span>Download this file to open it in a compatible app. PDF versions can be previewed directly in Folio.</span></div>}
      {!loading && preview?.sections.map((section, index) => <section className={`office-readonly-section ${preview.kind}`} key={`${section.title}-${index}`}>
        <h3>{section.title}</h3>
        {preview.kind === 'document' && section.blocks?.length ? <div className="docx-content">
          {section.blocks.map((block, blockIndex) => block.type === 'table' ? <div className="docx-table-scroll" key={blockIndex}><table><tbody>
            {block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell || '\u00a0'}</td>)}</tr>)}
          </tbody></table></div> : <p key={blockIndex}>{block.text}</p>)}
        </div> : <pre>{section.text}</pre>}
      </section>)}
    </div>
  </div>;
}
function TextPreview({ url, file, onSave }) {
  const [text, setText] = useState('Loading preview…');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(url).then(r => r.text()).then(setText).catch(() => setText('Could not load preview.'));
  }, [url]);
  async function save() {
    setSaving(true);
    setError('');
    try {
      await onSave(text);
      setEditing(false);
    } catch (saveError) {
      setError(saveError.message || 'Could not save document.');
    } finally {
      setSaving(false);
    }
  }
  return <div className="text-editor">
      <div className="text-editor-toolbar"><span>{file.name}</span>{editing ? <div>
      <button className="secondary" onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
      <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div> : <button className="secondary" onClick={() => setEditing(true)}><Pencil size={15} />Edit document</button>}</div>
      {editing ? <textarea className="text-editor-input" aria-label={`Edit ${file.name}`} value={text} onChange={event => setText(event.target.value)} spellCheck={false} /> : <pre className="text-preview">{text}</pre>}
      {error && <p className="text-editor-error" role="alert">{error}</p>}
      </div>;
}
function Dialog({
  title,
  close,
  children
}) {
  return <div className="modal-backdrop" onMouseDown={e => {
    if (e.target === e.currentTarget) close();
  }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="modal-head">
      <h3 id="dialog-title">{title}</h3>
      <button className="icon-btn" onClick={close} aria-label="Close">
      <X size={18} />
      </button>
      </div>{children}</div>
      </div>;
}
createRoot(document.getElementById('root')).render(<App />);
