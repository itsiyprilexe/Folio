import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Folder, FolderOpen, Files, Image as ImageIcon, FileText, Presentation, Table2, Upload, Plus, Search, Grid2X2, List, MoreHorizontal, Download, Eye, Pencil, Trash2, ChevronRight, ChevronLeft, ArrowUpDown, Tag, X, File, CheckCircle2, AlertCircle, CloudUpload, Menu, ArrowLeftRight, LockKeyhole, Command } from 'lucide-react';
import './style.css';
const fmtSize = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const date = x => new Date(x).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});
const ext = x => (x.split('.').pop() || 'FILE').toUpperCase();
const fileTypes = ['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'TXT', 'MD', 'CSV'];
const iconFor = n => {
  const e = ext(n);
  return e === 'PDF' || ['DOC', 'DOCX', 'TXT', 'MD'].includes(e) ? FileText : ['PPT', 'PPTX'].includes(e) ? Presentation : ['XLS', 'XLSX', 'CSV'].includes(e) ? Table2 : ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'].includes(e) ? ImageIcon : File;
};
function App() {
  const [token, setToken] = useState(''),
    [authorized, setAuthorized] = useState(false),
    [files, setFiles] = useState([]),
    [workspaceFiles, setWorkspaceFiles] = useState([]),
    [folders, setFolders] = useState([]),
    [folder, setFolder] = useState('all'),
    [query, setQuery] = useState(''),
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
    [filter, setFilter] = useState('all'),
    [page, setPage] = useState(0);
  const input = useRef();
  const folderInput = useRef();
  const searchInput = useRef();
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
    const folderQuery = folder === 'all' || folder === 'starred' ? '' : folder;
    const [currentFiles, allFiles, allFolders, searchedFiles] = await Promise.all([api(`/api/files?folder=${encodeURIComponent(folderQuery)}&q=${encodeURIComponent(query)}`), api('/api/files'), api('/api/folders'), folder === 'starred' ? api(`/api/files?q=${encodeURIComponent(query)}`) : Promise.resolve([])]);
    if (version !== refreshVersion.current) return;
    setWorkspaceFiles(allFiles);
    setFiles(folder === 'starred' ? searchedFiles.filter(file => file.tags.includes('starred')) : currentFiles);
    setFolders(allFolders);
  }
  useEffect(() => {
    localStorage.removeItem('folio-token');
    api('/api/session').then(() => setAuthorized(true)).catch(() => setAuthorized(false));
  }, []);
  useEffect(() => {
    if (!authorized) return;
    const timer = window.setTimeout(() => refresh().catch(e => toast(e.message, 'error')), query ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [authorized, folder, query]);
  useEffect(() => {
    setPage(0);
  }, [folder, query, filter, sizeFilter, dateFilter, sort]);
  useEffect(() => {
    const handleShortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === searchInput.current) {
        setQuery('');
        searchInput.current?.blur();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  function toast(text, type = 'ok') {
    setMessage({
      text,
      type
    });
    setTimeout(() => setMessage(null), 3200);
  }
  const visible = useMemo(() => {
    let a = [...files];
    if (filter !== 'all') a = a.filter(f => ext(f.name) === filter);
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
  }, [files, filter, sizeFilter, dateFilter, sort]);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageFiles = visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function sendUploadBatch(items, folderId, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      items.forEach(({ file }) => form.append('files', file, file.name));
      if (folderId) form.append('folderId', folderId);

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

  async function uploadItems(items, folderId = folder === 'all' || folder === 'starred' ? null : folder, directories = []) {
    if (busy) throw Error('An upload is already in progress.');
    setBusy(true);
    setProgress(0);

    try {
      const allFolders = await api('/api/folders');
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
              body: JSON.stringify({ name, parentId })
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
          });
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
      await uploadItems(items, folder === 'all' || folder === 'starred' ? null : folder, directories);
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
      await uploadItems(dropped.files, folder === 'all' || folder === 'starred' ? null : folder, dropped.directories);
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
        parentId: folder === 'all' || folder === 'starred' ? null : folder
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
          depth
        });
        visit(item.id, depth + 1);
      });
    };
    visit('', 0);
    return ordered;
  }, [folders]);
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
        api('/api/session').then(() => {
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
  const current = folders.find(f => f.id === folder);
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
      <div className="brand-mark">
      <Command size={19} />
      </div>
      <span>folio</span>
      </div>
      <div className="top-search">
      <Search size={17} />
      <input ref={searchInput} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names, tags, and text files" aria-label="Search files" />
      <kbd>⌘ K</kbd>
      </div>
      <div className="top-actions">
      <span className="secure">
      <span /> Private workspace</span>
      <div className="avatar">A</div>
      </div>
      </header>
      <aside className={`sidebar ${mobileNav ? 'show' : ''}`}>
      <div className="side-scroll">
      <div className="side-label">WORKSPACE</div>
      <button className={`nav-item ${folder === 'all' ? 'active' : ''}`} onClick={() => {
          setFolder('all');
          setMobileNav(false);
        }}>
      <Files size={18} />All files<span className="nav-count">{workspaceFiles.length}</span>
      </button>
      <button className={`nav-item ${folder === 'starred' ? 'active' : ''}`} onClick={() => setFolder('starred')}>
      <Tag size={18} />Starred</button>
      <div className="side-label folders-label">FOLDERS <button className="plus-mini" aria-label="Create folder" onClick={() => setModal('folder')}>
      <Plus size={15} />
      </button>
      </div>
      <div className="folder-list">
      <button className={`nav-item ${folders.length === 0 ? 'no-folder' : ''}`} onClick={() => setModal('folder')}>
      <Folder size={17} />New folder</button>{folderTree.map(({
            folder: f,
            depth
          }) => <div className="folder-row" key={f.id} style={{
            paddingLeft: `${depth * 13}px`
          }}>
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
      <FileText size={17} />{type}</button>)}</div>
      <div className="sidebar-bottom">
      <div className="storage">
      <div className="storage-title">
      <span>Storage used</span>
      <span>{fmtSize(workspaceFiles.reduce((a, f) => a + f.size, 0))}</span>
      </div>
      <small>No app storage quota · limited by server disk space</small>
      </div>
      <button className="profile" onClick={() => onError(logout)}>
      <div className="avatar">A</div>
      <div>
      <b>April Lentejas</b>
      <small>Personal workspace</small>
      </div>
      <MoreHorizontal size={18} />
      </button>
      </div>
      </aside>{mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}<main className="main">
      <div className="page-head">
      <div>
      <div className="breadcrumbs">
      <span>Workspace</span>
      <ChevronRight size={14} />
      <b>{folder === 'all' ? 'All files' : folder === 'starred' ? 'Starred' : current?.name || 'Folder'}</b>
      </div>
      <h1>{folder === 'all' ? 'All files' : folder === 'starred' ? 'Starred' : current?.name || 'Folder'}</h1>
      <p>Manage and organize your digital workspace.</p>
      </div>
      <div className="head-actions">
      <button className="secondary" onClick={() => setModal('folder')}>
      <Plus size={16} />New folder</button>
      <button className="primary" onClick={() => input.current.click()}>
      <Upload size={16} />Upload files</button>
      <button className="secondary" title="Choose a folder from your computer" aria-label="Upload folder" onClick={() => folderInput.current.click()}>
      <Folder size={16} />Upload folder</button>
      <input ref={input} type="file" accept={fileTypes.map(type => `.${type.toLowerCase()}`).join(',')} multiple hidden onChange={upload} />
      <input ref={folderInput} type="file" accept={fileTypes.map(type => `.${type.toLowerCase()}`).join(',')} webkitdirectory="" directory="" multiple hidden onChange={upload} />
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
      <b>{fmtSize(workspaceFiles.reduce((a, f) => a + f.size, 0))}</b>
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
      <h2>{folder === 'all' ? 'Recent files' : 'Files'} <span className="count-pill">{visible.length}</span>
      </h2>
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
      </div>}{visible.length ? view === 'grid' ? <div className="file-grid">{pageFiles.map(f => <FileCard key={f.id} f={f} onSelect={() => {
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
      <tbody>{pageFiles.map(f => <tr key={f.id}>
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
      </div> : <div className="empty">
      <div className="empty-art">
      <div className="empty-back">
      <FolderOpen size={34} />
      </div>
      <div className="empty-front">
      <Files size={28} />
      </div>
      </div>
      <h3>{query ? 'No matching files' : 'Your workspace is ready'}</h3>
      <p>{query ? 'Try another search or clear your filters.' : 'Upload your first file or create a folder to get started.'}</p>
      <div>
      <button className="secondary" onClick={() => setModal('folder')}>
      <Plus size={16} />Create folder</button>
      <button className="primary" onClick={() => input.current.click()}>
      <Upload size={16} />Upload files</button>
      </div>
      </div>}{visible.length > pageSize && <nav className="file-pagination" aria-label="File pages">
      <span>Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, visible.length)} of {visible.length} files</span>
      <div>
      <button className="secondary" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} />Previous</button>
      <span aria-live="polite">Page {currentPage + 1} of {pageCount}</span>
      <button className="secondary" aria-label="Next page" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={16} /></button>
      </div>
      </nav>}</section>
      <footer>Folio <span>·</span> Your personal file workspace</footer>
      </main>{message && <div className={`toast ${message.type}`} role="status">{message.type === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />} {message.text}</div>}{modal === 'folder' && <FolderModal onClose={() => setModal('')} onCreate={onError(createFolder)} />}{modal === 'actions' && target && <ActionModal file={target} close={() => setModal('')} onPreview={() => {
      setSelected(target);
      setModal('preview');
    }} onRename={() => setModal('rename')} onMove={() => setModal('move')} onTags={() => setModal('tags')} onStar={() => onError(() => toggleStar(target))()} onDelete={() => onError(removeFile)(target)} token={token} />}{['rename', 'move', 'tags'].includes(modal) && target && <EditModal mode={modal} file={target} folders={folders} onClose={() => setModal('')} onSave={onError(body => editFile(target, body))} />}{modal === 'preview' && selected && <Preview file={selected} token={token} close={() => setModal('')} onActions={() => {
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
      <button className={`file-preview ${img ? 'image-preview' : ''}`} onClick={onSelect} aria-label={`Preview ${f.name}`}>{img ? <img src={`/api/files/${f.id}/content`} alt="" /> : <div className={`file-art ${e.toLowerCase()}`}>{React.createElement(iconFor(f.name), {
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
function ActionModal({
  file,
  close,
  onPreview,
  onRename,
  onMove,
  onTags,
  onStar,
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
      <div className="preview-body">{['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'].includes(e) ? <img src={url} alt={file.name} /> : e === 'PDF' ? <iframe src={url} title={file.name} /> : ['TXT', 'MD', 'CSV'].includes(e) ? <TextPreview url={url} file={file} onSave={onSaveContent} /> : ['DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX'].includes(e) ? <OfficeFilePreview file={file} /> : <div className="unsupported">
      <div className={`file-art ${e.toLowerCase()}`}>{React.createElement(iconFor(file.name), {
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
      {!loading && preview?.sections.map((section, index) => <section className={`office-readonly-section ${preview.kind}`} key={`${section.title}-${index}`}><h3>{section.title}</h3><pre>{section.text}</pre></section>)}
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
