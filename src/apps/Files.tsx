/**
 * Files — browser for the per-user file-server (see examples/file-server).
 *
 * Identity is a cookie the server sets on first visit; no login screen.
 * Every fetch carries `credentials: 'include'` so the cookie travels with
 * cross-origin requests. Toolbar shows a live "X.X / Y MB used" indicator
 * driven by `/api/quota`. Supported file types open straight into Preview;
 * everything else downloads.
 *
 * Server URL defaults to `http://localhost:4000`. Override at runtime via
 * `window.__REACT_OS_SHELL_FILE_SERVER__ = 'https://files.example.com'`.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { WindowTitle } from '../shell/Modal';
import { useWindowManager } from '../shell/WindowManager';
import toast from '../shell/toast';
import { setPdfPreview } from './Preview';

const DEFAULT_SERVER =
  (typeof window !== 'undefined' && (window as any).__REACT_OS_SHELL_FILE_SERVER__) ||
  'http://localhost:4000';

const PREVIEW_EXTS: Record<string, 'pdf' | 'image' | 'dxf' | '3d'> = {
  pdf: 'pdf',
  dxf: 'dxf',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image',
  webp: 'image', svg: 'image', avif: 'image', bmp: 'image',
  stp: '3d', step: '3d', stl: '3d', obj: '3d',
  gltf: '3d', glb: '3d', '3mf': '3d', iges: '3d', igs: '3d', ply: '3d', fbx: '3d',
};

interface FileEntry {
  name: string;
  kind: 'file' | 'folder';
  size: number;
  modifiedAt: string;
}

function joinPath(parent: string, name: string) {
  if (parent === '/' || parent === '') return '/' + name;
  return parent.replace(/\/$/, '') + '/' + name;
}

function parentOf(p: string) {
  if (p === '/' || p === '') return '/';
  const trimmed = p.replace(/\/$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx <= 0 ? '/' : trimmed.slice(0, idx);
}

function formatSize(bytes: number) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch { return iso; }
}

export default function Files() {
  const server = DEFAULT_SERVER.replace(/\/$/, '');
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const { openPage } = useWindowManager();

  const authedFetch = useCallback(
    (url: string, init: RequestInit = {}) =>
      // `credentials: 'include'` makes the browser send the identity
      // cookie with every cross-origin request, and accept any
      // Set-Cookie response (e.g. the first-visit assignment).
      fetch(url, { ...init, credentials: 'include' }),
    [],
  );

  const refreshQuota = useCallback(async () => {
    try {
      const res = await authedFetch(`${server}/api/quota`);
      if (res.ok) {
        const q = await res.json();
        setQuota({ used: q.used, limit: q.limit });
      }
    } catch {}
  }, [authedFetch, server]);

  const loadDir = useCallback(async (dir: string) => {
    setLoading(true);
    setSelected(null);
    try {
      const res = await authedFetch(
        `${server}/api/files?path=${encodeURIComponent(dir)}`,
      );
      if (!res.ok) {
        const msg = await res.json().catch(() => ({} as any));
        toast.error(msg.error || `Failed to list (${res.status})`);
        return;
      }
      const data = await res.json();
      setEntries(data.entries || []);
      setPath(data.path || dir);
      setUnreachable(false);
    } catch (e: any) {
      setUnreachable(true);
    } finally {
      setLoading(false);
    }
    refreshQuota();
  }, [authedFetch, server, refreshQuota]);

  useEffect(() => { loadDir(path); /* eslint-disable-next-line */ }, [path]);

  // Open a file: fetch as Blob, route to Preview if extension is supported.
  const openFile = async (entry: FileEntry) => {
    const fullPath = joinPath(path, entry.name);
    const ext = (entry.name.split('.').pop() || '').toLowerCase();
    const kind = PREVIEW_EXTS[ext];
    if (!kind) {
      downloadFile(entry);
      return;
    }
    try {
      const res = await authedFetch(
        `${server}/api/file?path=${encodeURIComponent(fullPath)}`,
      );
      if (!res.ok) { toast.error(`Download failed (${res.status})`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, filename: entry.name, kind });
      openPage('/preview');
    } catch (e: any) {
      toast.error(e?.message || 'Open failed');
    }
  };

  const downloadFile = async (entry: FileEntry) => {
    const fullPath = joinPath(path, entry.name);
    try {
      const res = await authedFetch(
        `${server}/api/file?path=${encodeURIComponent(fullPath)}`,
      );
      if (!res.ok) { toast.error(`Download failed (${res.status})`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast.error(e?.message || 'Download failed');
    }
  };

  const handlePick = () => fileRef.current?.click();

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await authedFetch(
          `${server}/api/upload?path=${encodeURIComponent(path)}`,
          { method: 'POST', body: form },
        );
        if (!res.ok) {
          const msg = await res.json().catch(() => ({} as any));
          if (res.status === 413) {
            const remaining = Math.max(0, (msg.limit || 0) - (msg.used || 0));
            toast.error(
              `Quota exceeded — ${formatSize(remaining)} free, ${file.name} is ${formatSize(msg.attempted || file.size)}`,
            );
          } else {
            toast.error(`Upload ${file.name}: ${msg.error || res.status}`);
          }
        }
      } catch (e: any) {
        toast.error(`Upload ${file.name}: ${e?.message || 'failed'}`);
      }
    }
    loadDir(path);
  };

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name');
    if (!name) return;
    if (/[\\/]/.test(name)) { toast.error('Folder names cannot contain slashes'); return; }
    const target = joinPath(path, name);
    const res = await authedFetch(`${server}/api/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target }),
    });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({} as any));
      toast.error(msg.error || `Create folder failed (${res.status})`);
      return;
    }
    loadDir(path);
  };

  const handleRename = async (entry: FileEntry) => {
    const next = window.prompt('New name', entry.name);
    if (!next || next === entry.name) return;
    if (/[\\/]/.test(next)) { toast.error('Names cannot contain slashes'); return; }
    const from = joinPath(path, entry.name);
    const to = joinPath(path, next);
    const res = await authedFetch(`${server}/api/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({} as any));
      toast.error(msg.error || `Rename failed (${res.status})`);
      return;
    }
    loadDir(path);
  };

  const handleDelete = async (entry: FileEntry) => {
    if (!window.confirm(`Delete "${entry.name}"${entry.kind === 'folder' ? ' and everything inside' : ''}?`)) return;
    const target = joinPath(path, entry.name);
    const res = await authedFetch(
      `${server}/api/files?path=${encodeURIComponent(target)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const msg = await res.json().catch(() => ({} as any));
      toast.error(msg.error || `Delete failed (${res.status})`);
      return;
    }
    loadDir(path);
  };

  const resetDrag = () => { dragDepthRef.current = 0; setIsDragging(false); };
  useEffect(() => {
    const reset = () => resetDrag();
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, []);

  // ── render ─────────────────────────────────────────────────────────────
  if (unreachable) {
    return (
      <div className="flex flex-col h-full bg-white">
        <WindowTitle title="Files - offline" />
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <svg className="h-12 w-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
            </svg>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Can't reach the file server</h3>
            <p className="text-sm text-gray-500 mb-3">
              No response from <span className="font-mono">{server}</span>. Make sure the
              server is running — see <span className="font-mono">examples/file-server/README.md</span>.
            </p>
            <button onClick={() => loadDir(path)} className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const segments = path === '/' ? [] : path.split('/').filter(Boolean);
  const usagePct = quota && quota.limit > 0
    ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
    : 0;
  const usageColor = usagePct > 90 ? 'bg-red-500' : usagePct > 75 ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div
      className="relative flex flex-col h-full bg-white"
      onDragEnter={(e) => {
        if (!e.dataTransfer?.types?.includes?.('Files')) return;
        e.preventDefault();
        dragDepthRef.current++;
        if (!isDragging) setIsDragging(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types?.includes?.('Files')) return;
        e.preventDefault();
      }}
      onDragLeave={() => {
        if (dragDepthRef.current > 0) dragDepthRef.current--;
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        resetDrag();
        if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
      }}
    >
      <WindowTitle title={`Files${path === '/' ? '' : ' - ' + path}`} />
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) uploadFiles(e.target.files);
          if (fileRef.current) fileRef.current.value = '';
        }}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0 text-xs">
        <button
          onClick={() => setPath(parentOf(path))}
          disabled={path === '/'}
          className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-600"
          title="Parent folder"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>

        <div className="flex-1 flex items-center gap-0.5 text-gray-700 truncate min-w-0">
          <button onClick={() => setPath('/')} className="px-1.5 py-0.5 rounded hover:bg-gray-200 font-medium">My files</button>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5">
              <span className="text-gray-400">/</span>
              <button
                onClick={() => setPath('/' + segments.slice(0, i + 1).join('/'))}
                className="px-1.5 py-0.5 rounded hover:bg-gray-200"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        <button onClick={() => loadDir(path)} className="px-2 py-1 rounded hover:bg-gray-200 text-gray-600" title="Refresh">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992M3.05 9.348a9 9 0 0114.85-3.36L21.015 9.348m0 5.304a9 9 0 01-14.85 3.36l-3.115-3.36" />
          </svg>
        </button>
        <button onClick={handleNewFolder} className="px-2 py-1 rounded hover:bg-gray-200 text-gray-600 flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          New Folder
        </button>
        <button onClick={handlePick} className="px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 7.5L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          Upload
        </button>

        {/* Quota indicator */}
        {quota && (
          <>
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <div className="flex items-center gap-1.5" title={`${formatSize(quota.used)} of ${formatSize(quota.limit)} used`}>
              <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full ${usageColor} transition-all`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500 tabular-nums whitespace-nowrap">
                {formatSize(quota.used)} / {formatSize(quota.limit)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading && entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            Empty folder. Drop files here or click <span className="font-medium">Upload</span>.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left font-medium px-3 py-1.5">Name</th>
                <th className="text-right font-medium px-3 py-1.5 w-24">Size</th>
                <th className="text-right font-medium px-3 py-1.5 w-40">Modified</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.name}
                  onClick={() => setSelected(e.name)}
                  onDoubleClick={() => {
                    if (e.kind === 'folder') setPath(joinPath(path, e.name));
                    else openFile(e);
                  }}
                  className={`cursor-default border-b border-gray-100 ${selected === e.name ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-3 py-1.5 flex items-center gap-2">
                    {e.kind === 'folder' ? (
                      <svg className="h-4 w-4 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M2.25 7.125A2.25 2.25 0 014.5 4.875h4.504c.61 0 1.193.243 1.624.673l1.494 1.494a.75.75 0 00.53.22h7.098A2.25 2.25 0 0122 9.51v8.366A2.25 2.25 0 0119.75 20.125H4.25A2.25 2.25 0 012 17.875V7.125z" /></svg>
                    ) : (
                      <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    )}
                    <span className="truncate" title={e.name}>{e.name}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    {e.kind === 'folder' ? '—' : formatSize(e.size)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-500 tabular-nums">
                    {formatTime(e.modifiedAt)}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {e.kind === 'file' && (
                      <button
                        onClick={(ev) => { ev.stopPropagation(); downloadFile(e); }}
                        className="px-1.5 py-0.5 rounded hover:bg-gray-200 text-gray-500 text-[11px]"
                      >Download</button>
                    )}
                    <button
                      onClick={(ev) => { ev.stopPropagation(); handleRename(e); }}
                      className="px-1.5 py-0.5 rounded hover:bg-gray-200 text-gray-500 text-[11px] ml-1"
                    >Rename</button>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); handleDelete(e); }}
                      className="px-1.5 py-0.5 rounded hover:bg-red-100 text-red-600 text-[11px] ml-1"
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/15 border-4 border-dashed border-blue-500 pointer-events-none flex items-center justify-center z-20">
          <div className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow-lg">
            Drop to upload
          </div>
        </div>
      )}
    </div>
  );
}
