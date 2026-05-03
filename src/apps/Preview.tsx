/**
 * Preview — windowed PDF viewer app.
 *
 * Consumers stage a PDF via `setPdfPreview({ url, filename, ... })` and then
 * call `openPage('/preview')`. If the window is already open, it swaps to the
 * new PDF in-place via a custom event.
 */
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import toast from '../shell/toast';
import { WindowTitle, getActiveModalId } from '../shell/Modal';
import ImageAnnotator, { type ImageAnnotatorHandle } from './ImageAnnotator';

/** Slot at the right end of the outer Preview toolbar — each format panel
 *  portals its own action buttons (page nav, zoom, layers, download, etc.)
 *  here so we render a single toolbar row instead of two stacked. */
const ToolbarSlotContext = createContext<HTMLElement | null>(null);
function PanelActions({ children }: { children: React.ReactNode }) {
  const slot = useContext(ToolbarSlotContext);
  return slot ? createPortal(children, slot) : null;
}

// online-3d-viewer pulls three@0.176, where WebGLRenderer's stencil context
// attribute defaults to FALSE. Without a stencil buffer the capped section
// view's mask test always reads zero and the cap never renders. Patch the
// canvas getContext call once so the WebGL context is created with stencil
// enabled. Always force stencil:true on webgl context requests — three.js
// passes stencil:false explicitly when it isn't user-specified, so a
// "preserve if already set" check would skip the path that needs us most.
let _stencilContextPatched = false;
function ensureStencilContextAttribute() {
  if (_stencilContextPatched) return;
  if (typeof HTMLCanvasElement === 'undefined') return;
  _stencilContextPatched = true;
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patchedGetContext(
    this: HTMLCanvasElement,
    type: string,
    attrs?: any,
  ) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      // Force stencil regardless of what the caller asked for.
      attrs = { ...(attrs || {}), stencil: true };
    }
    return (orig as any).call(this, type, attrs);
  } as any;
  // eslint-disable-next-line no-console
  console.info('[Preview] section: canvas getContext patched (force stencil=true)');
}

const TITLE_DISPLAY_MAX = 24;
function truncateForTitle(s: string) {
  return s.length > TITLE_DISPLAY_MAX ? `${s.slice(0, TITLE_DISPLAY_MAX - 1)}…` : s;
}

// Default the worker to the matching unpkg build (mirrors the consumer's
// installed npm version exactly). Consumers can override by setting
// pdfjsLib.GlobalWorkerOptions.workerSrc themselves before opening the
// Preview window.
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface PdfPreviewData {
  /** Object URL or remote URL of the PDF. Blob URLs are revoked when the window unmounts.
   *  Leave blank when staging a `converting: true` placeholder; call `setPdfPreview` again
   *  with the resolved URL once conversion finishes. */
  url?: string;
  /** Display name (and download filename). */
  filename: string;
  /** Renderer to use. Defaults to `'pdf'`. `'dxf'` requires the consumer to
   *  have `dxf-viewer` installed (it's an optional peer dep). `'image'`
   *  renders an `<img>` for raster screenshots / photos. `'3d'` covers
   *  STEP / STL / OBJ / GLTF / 3MF / IGES via the optional
   *  `online-3d-viewer` peer dep. */
  kind?: 'pdf' | 'dxf' | 'image' | '3d';
  /** Optional download handler — replaces the built-in "save URL as filename" if supplied. */
  onDownload?: () => void;
  /** Optional email handler — only shown when supplied. */
  onEmail?: () => void;
  /** Show a progress placeholder while the consumer fetches/converts the file. */
  converting?: boolean;
  /** Headline shown on the converting placeholder (e.g. "CONVERTING DWG FILE"). */
  convertingMessage?: string;
}

const EVENT_NAME = 'react-os-shell:pdf-preview';

let pendingData: PdfPreviewData | null = null;

/** Stage a PDF for the next Preview window mount, or swap into an open one. */
export function setPdfPreview(data: PdfPreviewData) {
  pendingData = data;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: data }));
  }
}

export default function Preview() {
  const [data, setData] = useState<PdfPreviewData | null>(() => {
    const d = pendingData;
    pendingData = null;
    return d;
  });

  // Swap to a new PDF if `setPdfPreview` is called while the window is open.
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<PdfPreviewData>).detail;
      setData(prev => {
        if (prev?.url && prev.url !== next.url && prev.url.startsWith('blob:')) {
          URL.revokeObjectURL(prev.url);
        }
        return next;
      });
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  // Revoke blob URL on unmount.
  useEffect(() => () => {
    if (data?.url?.startsWith('blob:')) URL.revokeObjectURL(data.url);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Window title reflects whatever is loaded — same pattern Spreadsheets uses.
  const titleName = data?.filename ? truncateForTitle(data.filename) : 'Untitled';

  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Slot element for panel-portaled action buttons. Use state (not ref) so the
  // first render that mounts the slot triggers a re-render in panel children.
  const [toolbarSlotEl, setToolbarSlotEl] = useState<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Drag-enter/leave fire on every child the cursor crosses, so a single
  // boolean flickers. Track depth with a counter — overlay shows on first
  // enter, clears only when the counter unwinds back to zero.
  const dragDepthRef = useRef(0);
  const handlePick = () => fileRef.current?.click();
  const resetDrag = () => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  };
  // Only the frontmost (active) Preview window should accept drags. With
  // multiple Previews open this prevents the overlay flashing on every
  // window the cursor crosses, and matches the user's expectation that
  // they activate a window first by clicking it.
  const isActiveWindow = (el: HTMLElement) => {
    const myModal = el.closest('[data-modal-id]') as HTMLElement | null;
    if (!myModal) return true; // outside any modal — be permissive
    return getActiveModalId() === myModal.dataset.modalId;
  };
  // If the drag ends outside our component (e.g. dropped onto desktop trash),
  // we never receive `drop` or our outer `dragleave`. Listen on window so
  // any end of any drag clears the overlay. Also wire ESC as an escape hatch.
  useEffect(() => {
    const onWindowDragEnd = () => resetDrag();
    const onWindowDrop = () => resetDrag();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetDrag();
    };
    window.addEventListener('dragend', onWindowDragEnd);
    window.addEventListener('drop', onWindowDrop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('dragend', onWindowDragEnd);
      window.removeEventListener('drop', onWindowDrop);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const ingestFile = (file: File) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const kind: 'pdf' | 'image' | 'dxf' | '3d' | undefined =
      ext === 'pdf' ? 'pdf'
      : ext === 'dxf' ? 'dxf'
      : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext) ? 'image'
      : ['stp', 'step', 'stl', 'obj', 'gltf', 'glb', '3mf', 'iges', 'igs', 'ply', 'fbx'].includes(ext) ? '3d'
      : undefined;
    if (!kind) {
      if (ext === 'dwg') toast.error('DWG files need server-side conversion. Convert to PDF or DXF first.');
      else toast.error(`Unsupported file type: .${ext || 'unknown'}`);
      return;
    }
    const url = URL.createObjectURL(file);
    // Local-only update: do NOT route through setPdfPreview, which dispatches
    // a global event that every other open Preview window also listens to —
    // that would replace whatever those other windows are showing. Update
    // only this instance's state.
    setData(prev => {
      if (prev?.url?.startsWith('blob:') && prev.url !== url) {
        URL.revokeObjectURL(prev.url);
      }
      return { url, filename: file.name, kind };
    });
  };
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) ingestFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    resetDrag();
    const file = e.dataTransfer.files?.[0];
    if (file) ingestFile(file);
  };

  const Toolbar = (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.dxf,.jpg,.jpeg,.png,.gif,.webp,.svg,.avif,.bmp,.stp,.step,.stl,.obj,.gltf,.glb,.3mf,.iges,.igs,.ply,.fbx"
        onChange={handleFile}
        className="hidden"
      />
      <button
        onClick={handlePick}
        className="text-xs text-gray-700 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors flex items-center gap-1"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
        </svg>
        Open
      </button>
      <span className="text-[10px] text-gray-400 ml-1">PDF · DXF · 3D · Images</span>
      {data?.filename && (
        <>
          <div className="h-4 w-px bg-gray-300 mx-1" />
          <span className="text-xs font-medium text-gray-700 truncate max-w-[200px]" title={data.filename}>{data.filename}</span>
        </>
      )}
      {/* Panel-specific actions (page nav, zoom, layers, download, …) get
       *  portaled into this slot by whichever panel is active. */}
      <div ref={setToolbarSlotEl} className="ml-auto flex items-center gap-1 text-xs" />
    </div>
  );

  let body: React.ReactNode;
  if (!data) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center text-gray-500 text-sm gap-3 p-8 text-center">
        <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="font-medium text-gray-700">Drop a file here, or click <button onClick={handlePick} className="text-blue-600 hover:underline">Open</button>.</p>
        <div className="text-xs text-gray-500 max-w-sm">
          <p className="font-semibold uppercase tracking-wide text-[10px] text-gray-400 mb-1">Supported formats</p>
          <ul className="space-y-0.5">
            <li><span className="font-mono text-gray-700">.pdf</span> — multi-page document viewer</li>
            <li><span className="font-mono text-gray-700">.dxf</span> — vector CAD drawings (optional <span className="font-mono">dxf-viewer</span> peer dep)</li>
            <li><span className="font-mono text-gray-700">.stp .step .stl .obj .gltf .glb .3mf .iges</span> — 3D models (optional <span className="font-mono">online-3d-viewer</span> peer dep)</li>
            <li><span className="font-mono text-gray-700">.jpg .jpeg .png .gif .webp .svg .avif .bmp</span> — raster images</li>
          </ul>
          <p className="mt-2 text-[11px] text-gray-400 italic">DWG files need to be converted to PDF or DXF first (server-side).</p>
        </div>
      </div>
    );
  } else if (data.converting || !data.url) {
    body = <ConvertingPanel filename={data.filename} message={data.convertingMessage} />;
  } else if (data.kind === 'dxf') {
    body = <DxfPanel key={data.url} url={data.url} filename={data.filename} onDownload={data.onDownload} onEmail={data.onEmail} />;
  } else if (data.kind === '3d') {
    body = <StepPanel key={data.url} url={data.url} filename={data.filename} onDownload={data.onDownload} onEmail={data.onEmail} />;
  } else if (data.kind === 'image') {
    body = <ImagePanel key={data.url} url={data.url} filename={data.filename} onDownload={data.onDownload} onEmail={data.onEmail} />;
  } else {
    body = <PdfPanel key={data.url} url={data.url} filename={data.filename} onDownload={data.onDownload} onEmail={data.onEmail} />;
  }

  return (
    <div
      className="relative flex flex-col h-full"
      ref={rootRef}
      onDragEnter={(e) => {
        // Only count drags that actually carry files — ignore stray drags
        // (e.g. text selections) so we don't flash the overlay.
        if (!e.dataTransfer?.types?.includes?.('Files')) return;
        // And only the active (frontmost) Preview window responds.
        if (!isActiveWindow(e.currentTarget as HTMLElement)) return;
        e.preventDefault();
        dragDepthRef.current++;
        if (!isDragging) setIsDragging(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types?.includes?.('Files')) return;
        if (!isActiveWindow(e.currentTarget as HTMLElement)) return;
        e.preventDefault();
      }}
      onDragLeave={() => {
        if (dragDepthRef.current > 0) dragDepthRef.current--;
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDrop={(e) => {
        if (!isActiveWindow(e.currentTarget as HTMLElement)) {
          resetDrag();
          return;
        }
        handleDrop(e);
      }}
    >
      <WindowTitle title={`${titleName} - Preview`} />
      {Toolbar}
      <ToolbarSlotContext.Provider value={toolbarSlotEl}>
        <div className="flex-1 min-h-0">{body}</div>
      </ToolbarSlotContext.Provider>
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/15 border-4 border-dashed border-blue-500 pointer-events-none flex items-center justify-center z-20">
          <div className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow-lg">
            Drop to open
          </div>
        </div>
      )}
    </div>
  );
}

function ConvertingPanel({ filename, message }: { filename: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-100 gap-4 px-8">
      <div className="flex flex-col items-center gap-3">
        <svg className="h-12 w-12 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
          <path d="M22 12a10 10 0 0 1-10 10" strokeLinecap="round" />
        </svg>
        <div className="text-base font-semibold tracking-wide text-gray-700 uppercase">{message || 'Converting file'}</div>
        <div className="text-xs text-gray-400 truncate max-w-md">{filename}</div>
      </div>
      <div className="w-72 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className="h-full w-1/3 bg-blue-500 rounded-full animate-pulse" style={{ animation: 'preview-bar 1.4s ease-in-out infinite' }} />
      </div>
      <style>{`@keyframes preview-bar { 0% { transform: translateX(-110%); } 100% { transform: translateX(310%); } }`}</style>
    </div>
  );
}

interface PdfPanelProps {
  url: string;
  filename: string;
  onDownload?: () => void;
  onEmail?: () => void;
}

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300, 400];

function PdfPanel({ url, filename, onDownload, onEmail }: PdfPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    pdfjsLib.getDocument(url).promise.then(doc => {
      if (cancelled) return;
      setPdf(doc);
      setTotalPages(doc.numPages);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { toast.error('Failed to load PDF'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    pdf.getPage(1).then(p => {
      const containerW = containerRef.current?.clientWidth || 800;
      const viewport = p.getViewport({ scale: 1 });
      const fitScale = (containerW - 40) / viewport.width;
      setScale(Math.min(Math.max(fitScale, 0.5), 3));
    });
  }, [pdf]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    pdf.getPage(page).then(p => {
      if (cancelled || !canvasRef.current) return;
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      // Lock the displayed (CSS) size to the viewport. pdf.js stamps inline
      // style.width/height on render and inline values stick across re-renders
      // even when canvas.width shrinks — without this, zoom changes only
      // affect resolution, not visible size.
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext('2d')!;
      p.render({ canvas, canvasContext: ctx, viewport }).promise.catch(() => {});
    });
    return () => { cancelled = true; };
  }, [pdf, page, scale]);

  const handlePrint = () => {
    if (!pdf) return;
    const win = window.open('', '_blank');
    if (!win) { toast.error('Allow popups to print'); return; }
    const promises: Promise<string>[] = [];
    for (let i = 1; i <= totalPages; i++) {
      promises.push(pdf.getPage(i).then(p => {
        const vp = p.getViewport({ scale: 2 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        return p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise.then(() => c.toDataURL());
      }));
    }
    Promise.all(promises).then(images => {
      win.document.write(`<html><head><title>${filename}</title><style>@media print{body{margin:0}img{width:100%;page-break-after:always}}</style></head><body>`);
      win.document.write(images.map(src => `<img src="${src}"/>`).join(''));
      win.document.write('</body></html>');
      win.document.close();
      setTimeout(() => { win.print(); win.close(); }, 300);
    });
  };

  const handleDefaultDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const fitWidth = () => {
    if (!pdf || !containerRef.current) return;
    pdf.getPage(page).then(p => {
      const containerW = containerRef.current?.clientWidth || 800;
      const viewport = p.getViewport({ scale: 1 });
      setScale(Math.min(Math.max((containerW - 40) / viewport.width, 0.5), 3));
    });
  };

  const btn = 'px-2 py-1 rounded hover:bg-gray-200 transition-colors text-gray-600 flex items-center gap-1';

  return (
    <div className="flex flex-col h-full">
      <PanelActions>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-1 py-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <span className="text-gray-600 font-medium tabular-nums">{page} / {totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-1 py-1 rounded hover:bg-gray-200 disabled:opacity-30 text-gray-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
        <div className="h-4 w-px bg-gray-300 mx-1" />
        <button onClick={() => setScale(s => Math.max(0.3, Math.round((s - 0.25) * 100) / 100))} className={btn}>−</button>
        <select
          value={ZOOM_PRESETS.includes(Math.round(scale * 100)) ? Math.round(scale * 100) : 'custom'}
          onChange={e => {
            const v = e.target.value;
            if (v !== 'custom') setScale(Number(v) / 100);
          }}
          className="bg-transparent hover:bg-gray-200 rounded px-1 py-1 text-gray-600 tabular-nums cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
          title="Zoom"
        >
          {!ZOOM_PRESETS.includes(Math.round(scale * 100)) && (
            <option value="custom">{Math.round(scale * 100)}%</option>
          )}
          {ZOOM_PRESETS.map(p => <option key={p} value={p}>{p}%</option>)}
        </select>
        <button onClick={() => setScale(s => Math.min(4, Math.round((s + 0.25) * 100) / 100))} className={btn}>+</button>
        <button onClick={fitWidth} className={btn}>Fit</button>
        <div className="h-4 w-px bg-gray-300 mx-1" />
        <button onClick={handlePrint} className={btn}>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
          Print
        </button>
        <button onClick={onDownload ?? handleDefaultDownload} className={btn}>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          Download
        </button>
        {onEmail && (
          <button onClick={onEmail} className={btn}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
            Email
          </button>
        )}
      </PanelActions>

      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading PDF...</div>
        ) : (
          <div className="min-h-full flex items-center justify-center p-4">
            <canvas ref={canvasRef} className="shadow-lg rounded" />
          </div>
        )}
      </div>
    </div>
  );
}

interface DxfPanelProps {
  url: string;
  filename: string;
  onDownload?: () => void;
  onEmail?: () => void;
}

// Default font set covering Latin + CJK glyphs, served from jsdelivr's mirror
// of the dxf-viewer example assets. Without these, any TEXT/MTEXT entities in
// the drawing render as empty boxes. Consumers can override by setting
// `window.__REACT_OS_SHELL_DXF_FONTS__` to a different array of TTF/OTF URLs.
const DEFAULT_DXF_FONTS: string[] = [
  'https://cdn.jsdelivr.net/gh/vagran/dxf-viewer-example-src@master/src/assets/fonts/Roboto-LightItalic.ttf',
  'https://cdn.jsdelivr.net/gh/vagran/dxf-viewer-example-src@master/src/assets/fonts/NotoSansDisplay-SemiCondensedLightItalic.ttf',
  'https://cdn.jsdelivr.net/gh/vagran/dxf-viewer-example-src@master/src/assets/fonts/NanumGothic-Regular.ttf',
];

interface DxfLayer {
  name: string;
  displayName?: string;
  color?: number;
  visible: boolean;
}

function DxfPanel({ url, filename, onDownload, onEmail }: DxfPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<DxfLayer[]>([]);
  const [showLayers, setShowLayers] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // Measurement tool — DXF (2D) edition.
  //
  // Two modes (toggled via a Point | ⊥ pill that appears next to the
  // Measure button):
  //   - Point: straight-line distance between two picks.
  //   - ⊥:     the first pick must snap to a line; the second pick can
  //            be anywhere; we report the perpendicular distance from the
  //            second pick to the first line.
  //
  // All visuals (markers, line, distance label, snap indicator) are HTML/
  // SVG overlays positioned via camera projection — fixed pixel size, so
  // they don't grow into giant orange blobs when the user zooms in.
  // Snap-to-endpoint and snap-to-nearest-on-line are computed in screen
  // space against a cached list of every line segment in the scene
  // (built once on viewer load).
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measureMode, setMeasureMode] = useState<'point' | 'perp'>('point');
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const measureRef = useRef<{
    /** Picked scene points, at most two. */
    picks: { x: number; y: number }[];
    /** Direction vector of the first picked line in ⊥ mode (unit-length, scene-space). */
    lineDir: { dx: number; dy: number } | null;
    /** Imperative DOM nodes — recreated on each enable. */
    overlay: HTMLDivElement | null;
    svg: SVGSVGElement | null;
    line: SVGLineElement | null;
    /** Dashed extension of the captured reference line (⊥ mode only). */
    refLine: SVGLineElement | null;
    markers: HTMLDivElement[];
    label: HTMLDivElement | null;
    snap: HTMLDivElement | null;
    /** Cached scene-space segment endpoints — built once after the dxf
     *  scene is loaded; used for snap detection on pointer move. */
    segments: { ax: number; ay: number; bx: number; by: number }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let viewer: any = null;
    setLoading(true);
    setError(null);
    setLayers([]);

    (async () => {
      let DxfViewer: any;
      try {
        const mod = await import('dxf-viewer');
        DxfViewer = (mod as any).DxfViewer;
      } catch (e) {
        if (!cancelled) {
          setError('dxf-viewer is not installed in this app.');
          setLoading(false);
        }
        return;
      }
      if (cancelled || !containerRef.current) return;
      try {
        // dxf-viewer reads container dimensions in its constructor (with
        // autoResize:true, those become the canvas size). If the Modal is
        // still settling we may be measured as 0×0, breaking aspect math
        // and the WebGL viewport. Wait until the container has a real
        // bounding box before constructing the viewer.
        await new Promise<void>(resolve => {
          const tryStart = () => {
            const r = containerRef.current?.getBoundingClientRect();
            if (r && r.width > 4 && r.height > 4) resolve();
            else requestAnimationFrame(tryStart);
          };
          tryStart();
        });
        if (cancelled || !containerRef.current) return;

        // clearColor must be a THREE.Color (Library calls .getHex()).
        let three: any = null;
        try { three = await import(/* @vite-ignore */ 'three' as any); } catch {}
        const ClearColor = three?.Color ?? null;
        const viewerOpts: any = { autoResize: true };
        if (ClearColor) viewerOpts.clearColor = new ClearColor(0xffffff);
        viewer = new DxfViewer(containerRef.current, viewerOpts);
        viewerRef.current = viewer;

        const fontUrls = (typeof window !== 'undefined' && (window as any).__REACT_OS_SHELL_DXF_FONTS__)
          || DEFAULT_DXF_FONTS;
        await viewer.Load({ url, fonts: fontUrls, workerFactory: null });
        if (cancelled) return;

        // Snapshot layer list — used to render the toggle panel.
        try {
          const list: any[] = viewer.GetLayers?.() ?? [];
          if (Array.isArray(list)) {
            setLayers(list.map(l => ({
              name: l.name,
              displayName: l.displayName ?? l.name,
              color: typeof l.color === 'number' ? l.color : undefined,
              visible: true,
            })));
          }
        } catch {}

        // Force-fit using the actual loaded bounds and refresh canvas size.
        const refit = () => {
          try {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect && rect.width > 0 && rect.height > 0) {
              viewer.SetSize?.(Math.round(rect.width), Math.round(rect.height));
            }
            const bounds = viewer.GetBounds?.();
            const origin = viewer.GetOrigin?.();
            if (bounds && origin) {
              viewer.FitView(
                bounds.minX - origin.x, bounds.maxX - origin.x,
                bounds.minY - origin.y, bounds.maxY - origin.y,
              );
            }
            viewer.Render?.();
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[Preview] DXF refit failed', err);
          }
        };
        refit();
        requestAnimationFrame(refit);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to render DXF.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try { viewer?.Destroy?.(); } catch {}
      viewerRef.current = null;
    };
  }, [url]);

  // Auto-hide the usage hint after a few seconds.
  useEffect(() => {
    if (!showHint || loading) return;
    const t = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(t);
  }, [showHint, loading]);

  // ──────────────────────────────────────────────────────────────────────
  // Measurement tool — DXF (2D) edition.
  //
  // All visuals (markers, line, label, snap indicator) are HTML / SVG
  // overlays positioned via camera projection — they stay constant size
  // in pixels regardless of zoom, so they never balloon into giant
  // orange blobs as the user zooms in.
  //
  // Snap-to-line / snap-to-endpoint is computed in *screen space* against
  // a cached list of every line segment in the dxf-viewer scene (built
  // once from `scene.traverse(LineSegments)`). On hover, the closest
  // endpoint or the closest point on a segment within 12 px snaps the
  // cursor — clicks then use that snapped position.
  //
  // Two modes via a Point | ⊥ pill that appears next to Measure:
  //   - Point: straight-line distance between two picks.
  //   - ⊥:     first pick must snap to a line (we capture that line's
  //            unit direction); second pick can be any point. The
  //            reported distance is the perpendicular from the second
  //            point to the first line.
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current;
    if (loading || error || !v) return;

    const scene: any = v.GetScene?.();
    const camera: any = v.GetCamera?.();
    const canvas: HTMLCanvasElement | undefined = v.GetCanvas?.();
    if (!scene || !camera || !canvas || !containerRef.current) return;

    const teardown = () => {
      const s = measureRef.current;
      if (!s) return;
      if (s.overlay && s.overlay.parentElement) s.overlay.parentElement.removeChild(s.overlay);
      measureRef.current = null;
    };

    if (!measureEnabled) {
      teardown();
      setMeasureDistance(null);
      return;
    }

    // ── HTML overlay scaffold ──────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;';
    containerRef.current.appendChild(overlay);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;');
    overlay.appendChild(svg);

    // Dashed extension of the captured ⊥ reference line — drawn first so
    // the solid measurement line renders on top of it.
    const refLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    refLineEl.setAttribute('stroke', '#ff8800');
    refLineEl.setAttribute('stroke-width', '1');
    refLineEl.setAttribute('stroke-dasharray', '6,4');
    refLineEl.setAttribute('opacity', '0.55');
    refLineEl.style.display = 'none';
    svg.appendChild(refLineEl);

    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineEl.setAttribute('stroke', '#ff8800');
    lineEl.setAttribute('stroke-width', '1.5');
    lineEl.setAttribute('stroke-linecap', 'round');
    lineEl.style.display = 'none';
    svg.appendChild(lineEl);

    const snapEl = document.createElement('div');
    snapEl.style.cssText = `position:absolute;width:14px;height:14px;border:2px solid #ff8800;background:rgba(255,255,255,0.7);transform:translate(-50%,-50%) rotate(45deg);box-sizing:border-box;display:none;`;
    overlay.appendChild(snapEl);

    measureRef.current = {
      picks: [],
      lineDir: null,
      overlay, svg, line: lineEl, refLine: refLineEl,
      markers: [], label: null, snap: snapEl,
      segments: [],
    };

    // ── THREE — needed for projection math ────────────────────────
    let THREE: any = null;
    let ready = false;

    // Unproject canvas (CSS) px → scene coords (matches dxf-viewer's
    // private _CanvasToSceneCoord).
    const sceneFromPx = (cx: number, cy: number) => {
      if (!THREE) return null;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const v3 = new THREE.Vector3(cx * 2 / w - 1, -cy * 2 / h + 1, 1).unproject(camera);
      return { x: v3.x, y: v3.y };
    };
    // Project scene coords → canvas (CSS) px.
    const pxFromScene = (sx: number, sy: number) => {
      if (!THREE) return { x: 0, y: 0 };
      const v3 = new THREE.Vector3(sx, sy, 0).project(camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      return { x: (v3.x + 1) / 2 * w, y: (-v3.y + 1) / 2 * h };
    };

    // Load THREE and build the snap-segment cache. dxf-viewer batches
    // its line entities into a small number of LineSegments objects;
    // we walk every one and collect the world-space endpoint pairs.
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        THREE = await import(/* @vite-ignore */ 'three' as any);
        const segs = measureRef.current?.segments;
        if (!segs) return;
        const va = new THREE.Vector3(), vb = new THREE.Vector3();
        scene.traverse((obj: any) => {
          if (!obj?.isLineSegments) return;
          const pos = obj.geometry?.attributes?.position;
          if (!pos) return;
          const arr: ArrayLike<number> = pos.array;
          obj.updateMatrixWorld?.();
          const m = obj.matrixWorld;
          // LineSegments draws disjoint line pairs — vertices come in
          // adjacent pairs (a, b), (c, d), ...
          for (let i = 0; i < arr.length; i += 6) {
            va.set(arr[i],     arr[i + 1], arr[i + 2]).applyMatrix4(m);
            vb.set(arr[i + 3], arr[i + 4], arr[i + 5]).applyMatrix4(m);
            segs.push({ ax: va.x, ay: va.y, bx: vb.x, by: vb.y });
          }
        });
        ready = true;
      } catch {}
    })();

    // ── Snap detection in screen space ────────────────────────────
    const SNAP_PX = 12;
    const findSnap = (cx: number, cy: number) => {
      const s = measureRef.current;
      if (!s || !ready) return null;
      let best: {
        sx: number; sy: number;
        type: 'endpoint' | 'line';
        dir?: { dx: number; dy: number };
      } | null = null;
      let bestD2 = SNAP_PX * SNAP_PX;
      for (const seg of s.segments) {
        const ap = pxFromScene(seg.ax, seg.ay);
        const bp = pxFromScene(seg.bx, seg.by);
        // Endpoint snaps still carry the parent segment's direction so that
        // ⊥ mode can use a corner pick as the reference line — corners are
        // exactly where users want to anchor a perpendicular measurement.
        const ldx = seg.bx - seg.ax, ldy = seg.by - seg.ay;
        const llen = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
        const segDir = { dx: ldx / llen, dy: ldy / llen };
        // Endpoint A
        let dx = cx - ap.x, dy = cy - ap.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { best = { sx: seg.ax, sy: seg.ay, type: 'endpoint', dir: segDir }; bestD2 = d2; }
        // Endpoint B
        dx = cx - bp.x; dy = cy - bp.y;
        d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { best = { sx: seg.bx, sy: seg.by, type: 'endpoint', dir: segDir }; bestD2 = d2; }
        // Nearest point on segment (in screen space).
        const sdx = bp.x - ap.x, sdy = bp.y - ap.y;
        const len2 = sdx * sdx + sdy * sdy;
        if (len2 > 0) {
          const t = ((cx - ap.x) * sdx + (cy - ap.y) * sdy) / len2;
          if (t > 0 && t < 1) {
            const px = ap.x + t * sdx, py = ap.y + t * sdy;
            dx = cx - px; dy = cy - py;
            d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              const sx = seg.ax + t * (seg.bx - seg.ax);
              const sy = seg.ay + t * (seg.by - seg.ay);
              best = { sx, sy, type: 'line', dir: segDir };
              bestD2 = d2;
            }
          }
        }
      }
      return best;
    };

    // ── Marker / label / line rendering (HTML/SVG, fixed-pixel) ──
    const makeMarker = (): HTMLDivElement => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;width:10px;height:10px;border-radius:50%;background:#ff8800;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.25);transform:translate(-50%,-50%);pointer-events:none;`;
      overlay.appendChild(el);
      return el;
    };
    const ensureLabel = () => {
      const s = measureRef.current!;
      if (s.label) return s.label;
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;transform:translate(-50%,-50%);padding:2px 6px;font-size:11px;font-weight:600;font-family:system-ui,-apple-system,sans-serif;background:rgba(255,136,0,0.95);color:#fff;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);pointer-events:none;`;
      overlay.appendChild(el);
      s.label = el;
      return el;
    };

    const positionMarker = (el: HTMLDivElement, x: number, y: number) => {
      const p = pxFromScene(x, y);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    };

    // For ⊥ mode, the rendered line goes from the second pick perpendicular
    // to the first line — exactly the same idea as the STP version.
    const computeRenderedEnds = () => {
      const s = measureRef.current!;
      const a = s.picks[0];
      let b = s.picks[1];
      if (measureMode === 'perp' && s.lineDir) {
        // P_perp is the foot of the perpendicular from b onto the line
        // through a with direction s.lineDir.
        const d = s.lineDir;
        const ax = a.x, ay = a.y;
        const t = (b.x - ax) * d.dx + (b.y - ay) * d.dy;
        const fx = ax + d.dx * t;
        const fy = ay + d.dy * t;
        // The visible perpendicular line goes between b and that foot.
        return { from: { x: fx, y: fy }, to: { x: b.x, y: b.y } };
      }
      return { from: a, to: b };
    };

    const updateOverlay = () => {
      const s = measureRef.current;
      if (!s) return;
      // Markers
      if (s.markers[0]) positionMarker(s.markers[0], s.picks[0].x, s.picks[0].y);
      if (s.markers[1]) positionMarker(s.markers[1], s.picks[1].x, s.picks[1].y);
      // ⊥ reference line — dashed extension across the canvas, drawn from
      // the first pick along the captured segment direction. Lets the user
      // see exactly which line was captured (catches bad snaps).
      if (measureMode === 'perp' && s.picks.length >= 1 && s.lineDir && s.refLine) {
        const a = s.picks[0];
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const screenSpan = Math.hypot(w, h) * 4; // generous extension in px
        // Scene-per-pixel along the direction so the dashed line stretches
        // beyond the visible canvas (visible portion gets clipped by SVG).
        const ap = pxFromScene(a.x, a.y);
        const probe = pxFromScene(a.x + s.lineDir.dx, a.y + s.lineDir.dy);
        const pxLen = Math.hypot(probe.x - ap.x, probe.y - ap.y) || 1;
        const sceneStep = screenSpan / pxLen;
        const x0 = a.x - s.lineDir.dx * sceneStep;
        const y0 = a.y - s.lineDir.dy * sceneStep;
        const x1 = a.x + s.lineDir.dx * sceneStep;
        const y1 = a.y + s.lineDir.dy * sceneStep;
        const p0 = pxFromScene(x0, y0);
        const p1 = pxFromScene(x1, y1);
        s.refLine.setAttribute('x1', String(p0.x));
        s.refLine.setAttribute('y1', String(p0.y));
        s.refLine.setAttribute('x2', String(p1.x));
        s.refLine.setAttribute('y2', String(p1.y));
        s.refLine.style.display = '';
      } else if (s.refLine) {
        s.refLine.style.display = 'none';
      }
      // Line + label
      if (s.picks.length === 2) {
        const ends = computeRenderedEnds();
        const fp = pxFromScene(ends.from.x, ends.from.y);
        const tp = pxFromScene(ends.to.x, ends.to.y);
        s.line!.setAttribute('x1', String(fp.x));
        s.line!.setAttribute('y1', String(fp.y));
        s.line!.setAttribute('x2', String(tp.x));
        s.line!.setAttribute('y2', String(tp.y));
        s.line!.style.display = '';
        if (s.label) {
          s.label.style.left = `${(fp.x + tp.x) / 2}px`;
          s.label.style.top = `${(fp.y + tp.y) / 2}px`;
        }
      } else {
        s.line!.style.display = 'none';
      }
    };

    // ── Click-vs-drag + snap on hover ─────────────────────────────
    const DRAG_TOL = 4;
    const DRAG_TIME = 350;
    let downX = 0, downY = 0, downTime = 0, downActive = false, dragging = false;
    let lastSnap: ReturnType<typeof findSnap> = null;

    const handlePointerDown = (ev: any) => {
      const d = ev?.detail;
      if (!d || d.domEvent?.button !== 0) return;
      downX = d.canvasCoord.x;
      downY = d.canvasCoord.y;
      downTime = performance.now();
      dragging = false;
      downActive = true;
    };

    const handlePointerMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      // Drag detection (only matters when a button is down).
      if (downActive) {
        if ((cx - downX) ** 2 + (cy - downY) ** 2 > DRAG_TOL * DRAG_TOL) dragging = true;
      }
      // Snap indicator update — only when the user isn't actively
      // dragging (avoid flicker mid-pan).
      const s = measureRef.current;
      if (!s || !s.snap) return;
      if (downActive && dragging) {
        s.snap.style.display = 'none';
        return;
      }
      lastSnap = findSnap(cx, cy);
      if (lastSnap) {
        const p = pxFromScene(lastSnap.sx, lastSnap.sy);
        s.snap.style.left = `${p.x}px`;
        s.snap.style.top = `${p.y}px`;
        s.snap.style.display = '';
      } else {
        s.snap.style.display = 'none';
      }
    };

    const handlePointerUp = (ev: any) => {
      if (!downActive) return;
      downActive = false;
      const elapsed = performance.now() - downTime;
      if (dragging || elapsed > DRAG_TIME) return;
      // Use the snapped position if we have one, otherwise the raw
      // pointer position from dxf-viewer's event.
      const raw = ev?.detail?.position;
      if (!raw) return;
      const useSnap = lastSnap && Math.hypot(downX - (canvas.getBoundingClientRect().width), 0) >= 0; // always prefer snap when present
      const picked = useSnap && lastSnap
        ? { x: lastSnap.sx, y: lastSnap.sy, snapType: lastSnap.type, lineDir: lastSnap.dir }
        : { x: raw.x, y: raw.y, snapType: undefined, lineDir: undefined };
      doPick(picked);
    };

    const doPick = (p: { x: number; y: number; snapType?: string; lineDir?: { dx: number; dy: number } }) => {
      const s = measureRef.current;
      if (!s) return;

      // Third click → start fresh.
      if (s.picks.length === 2) {
        for (const m of s.markers) m.parentElement?.removeChild(m);
        s.markers = [];
        s.picks = [];
        s.lineDir = null;
        s.line!.style.display = 'none';
        if (s.refLine) s.refLine.style.display = 'none';
        if (s.label) s.label.style.opacity = '0';
        setMeasureDistance(null);
      }

      // ⊥ mode: the FIRST pick must land on (or at the endpoint of) a line —
      // we need a reference direction for the perpendicular. A snap of either
      // 'line' or 'endpoint' type carries that direction.
      if (measureMode === 'perp' && s.picks.length === 0) {
        if (!p.lineDir) {
          // Quick visual cue — flash a hint label and bail.
          const label = ensureLabel();
          label.style.opacity = '1';
          label.style.left = `${pxFromScene(p.x, p.y).x}px`;
          label.style.top = `${pxFromScene(p.x, p.y).y - 18}px`;
          label.textContent = '⊥: snap to a line or corner first';
          setTimeout(() => { if (s.label && s.picks.length === 0) s.label.style.opacity = '0'; }, 1500);
          return;
        }
        s.lineDir = p.lineDir;
      }

      s.picks.push({ x: p.x, y: p.y });
      s.markers.push(makeMarker());

      if (s.picks.length === 2) {
        const a = s.picks[0], b = s.picks[1];
        let dist: number;
        let suffix = '';
        if (measureMode === 'perp' && s.lineDir) {
          // Perpendicular distance from b to the line through a with
          // direction lineDir.
          const dx = b.x - a.x, dy = b.y - a.y;
          // Cross product magnitude with unit direction = perpendicular distance.
          dist = Math.abs(dx * s.lineDir.dy - dy * s.lineDir.dx);
          suffix = ' ⊥';
        } else {
          const dx = b.x - a.x, dy = b.y - a.y;
          dist = Math.sqrt(dx * dx + dy * dy);
        }
        setMeasureDistance(dist);
        const label = ensureLabel();
        label.style.opacity = '1';
        label.textContent = `${formatMeasureDistance(dist)}${suffix}`;
      }
      updateOverlay();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMeasureEnabled(false);
    };

    // ── Wire it up ────────────────────────────────────────────────
    canvas.style.cursor = 'crosshair';
    try { v.Subscribe?.('pointerdown', handlePointerDown); } catch {}
    try { v.Subscribe?.('pointerup', handlePointerUp); } catch {}
    try { v.Subscribe?.('viewChanged', updateOverlay); } catch {}
    canvas.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.style.cursor = '';
      try { v.Unsubscribe?.('pointerdown', handlePointerDown); } catch {}
      try { v.Unsubscribe?.('pointerup', handlePointerUp); } catch {}
      try { v.Unsubscribe?.('viewChanged', updateOverlay); } catch {}
      canvas.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('keydown', onKeyDown);
      teardown();
      setMeasureDistance(null);
    };
  }, [measureEnabled, measureMode, loading, error]);

  const toggleLayer = (name: string) => {
    setLayers(prev => prev.map(l => {
      if (l.name !== name) return l;
      const next = !l.visible;
      try { viewerRef.current?.ShowLayer?.(name, next); } catch {}
      return { ...l, visible: next };
    }));
  };

  const setAllLayers = (visible: boolean) => {
    setLayers(prev => prev.map(l => {
      if (l.visible === visible) return l;
      try { viewerRef.current?.ShowLayer?.(l.name, visible); } catch {}
      return { ...l, visible };
    }));
  };

  const handleDefaultDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const handleResetView = () => {
    try {
      const v = viewerRef.current;
      const bounds = v?.GetBounds?.();
      const origin = v?.GetOrigin?.();
      if (bounds && origin) {
        v.FitView(
          bounds.minX - origin.x, bounds.maxX - origin.x,
          bounds.minY - origin.y, bounds.maxY - origin.y,
        );
      } else {
        v?.FitView?.();
      }
      v?.Render?.();
    } catch {}
  };

  const btn = 'px-2 py-1 rounded hover:bg-gray-200 transition-colors text-gray-600 flex items-center gap-1';
  const colorHex = (n?: number) => {
    if (typeof n !== 'number') return '#999';
    return '#' + n.toString(16).padStart(6, '0');
  };

  return (
    <div className="flex flex-col h-full">
      <PanelActions>
        <button
          onClick={() => setShowLayers(s => !s)}
          className={btn + (showLayers ? ' bg-gray-200' : '')}
          title="Toggle layer visibility"
          disabled={layers.length === 0}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" /></svg>
          Layers {layers.length > 0 && <span className="text-gray-400">({layers.filter(l => l.visible).length}/{layers.length})</span>}
        </button>
        <button onClick={() => setShowHint(s => !s)} className={btn} title="How to navigate">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
        </button>
        <button
          onClick={() => setMeasureEnabled(m => !m)}
          className={btn + (measureEnabled ? ' bg-gray-200' : '')}
          title={measureEnabled ? 'Stop measuring (Esc)' : 'Measure distance — click two points on the drawing'}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.25l6-6 6 6 4.5-4.5M9.75 8.25v3M12.75 11.25v3M15.75 14.25v3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75h19.5" />
          </svg>
          Measure
        </button>
        {measureEnabled && (
          <div className="flex items-stretch h-7 rounded border border-gray-200 overflow-hidden text-[11px] font-semibold">
            <button
              onClick={() => setMeasureMode('point')}
              className={`px-2 transition-colors ${measureMode === 'point' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              title="Point — straight-line distance between two picks"
            >
              Point
            </button>
            <button
              onClick={() => setMeasureMode('perp')}
              className={`px-2 transition-colors ${measureMode === 'perp' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              title="Perpendicular — click on a line first, then pick a point. Reports the perpendicular distance."
            >
              ⊥
            </button>
          </div>
        )}
        {measureEnabled && measureDistance !== null && (
          <div className="px-2 py-1 text-[11px] font-mono font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded whitespace-nowrap" title={measureMode === 'perp' ? 'Perpendicular distance from second pick to first line' : 'Straight-line distance between the two picked points'}>
            {formatMeasureDistance(measureDistance)}{measureMode === 'perp' ? ' ⊥' : ''}
          </div>
        )}
        <button onClick={handleResetView} className={btn} title="Fit drawing to view">Fit</button>
        <button onClick={onDownload ?? handleDefaultDownload} className={btn}>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          Download
        </button>
        {onEmail && (
          <button onClick={onEmail} className={btn}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
            Email
          </button>
        )}
      </PanelActions>
      <div className="relative flex-1 bg-white min-h-0">
        {/* dxf-viewer overrides container's `position` to `relative` in its
         *  constructor, which kills any `inset: 0` sizing. Use explicit
         *  width/height: 100% so the container always fills its flex parent. */}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {showLayers && layers.length > 0 && (
          <div className="absolute top-2 right-2 w-64 max-h-[70%] flex flex-col bg-white/95 backdrop-blur border border-gray-200 rounded-md shadow-xl z-10 text-xs">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 bg-gray-50">
              <span className="font-medium text-gray-700">Layers</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setAllLayers(true)} className="px-1.5 py-0.5 rounded hover:bg-gray-200 text-gray-600">All</button>
                <button onClick={() => setAllLayers(false)} className="px-1.5 py-0.5 rounded hover:bg-gray-200 text-gray-600">None</button>
                <button onClick={() => setShowLayers(false)} className="px-1.5 py-0.5 rounded hover:bg-gray-200 text-gray-600" title="Close">×</button>
              </div>
            </div>
            <div className="overflow-y-auto py-1">
              {layers.map(l => (
                <label key={l.name} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={l.visible}
                    onChange={() => toggleLayer(l.name)}
                    className="h-3.5 w-3.5"
                  />
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-gray-300 shrink-0"
                    style={{ background: colorHex(l.color) }}
                  />
                  <span className="truncate text-gray-700" title={l.displayName}>{l.displayName || l.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {showHint && !loading && !error && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-gray-900/85 text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg flex items-center gap-3 z-10 pointer-events-none">
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
              Drag to pan
            </span>
            <span className="text-white/40">•</span>
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg>
              Scroll to zoom
            </span>
            <span className="text-white/40">•</span>
            <span>Fit to reset</span>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-gray-500">Loading drawing…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 px-6 text-center">{error}</div>
        )}
      </div>
    </div>
  );
}

interface StepPanelProps {
  url: string;
  filename: string;
  onDownload?: () => void;
  onEmail?: () => void;
}

// online-3d-viewer expects an "external libs" base URL where it can find the
// occt-import-js WASM (for STEP/IGES) plus draco/rhino3dm/web-ifc decoders.
// jsdelivr mirrors the npm package at this path; consumers can override via
// `window.__REACT_OS_SHELL_O3DV_LIBS__` to self-host (e.g. air-gapped).
const DEFAULT_O3DV_LIBS = 'https://cdn.jsdelivr.net/npm/online-3d-viewer@0.18.0/libs/';

interface TreeNode {
  id: number;
  name: string;
  isMeshNode: boolean;
  meshIndices: number[];
  children: TreeNode[];
}

function buildTree(node: any, depth = 0): TreeNode {
  return {
    id: node.GetId?.() ?? 0,
    name: node.GetName?.() || (depth === 0 ? 'Root' : 'Node'),
    isMeshNode: !!node.IsMeshNode?.(),
    meshIndices: node.GetMeshIndices?.() ?? [],
    children: (node.GetChildNodes?.() ?? []).map((c: any) => buildTree(c, depth + 1)),
  };
}

// Collect every nodeId in the subtree rooted at `node` (inclusive).
function collectNodeIds(node: TreeNode, out: Set<number>) {
  out.add(node.id);
  for (const c of node.children) collectNodeIds(c, out);
}

// Hex string ("#rrggbb") → RGBColor instance.
function hexToRgb(OV: any, hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return new OV.RGBColor((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
}
function rgbToHex(c: { r?: number; g?: number; b?: number }) {
  const r = (c.r ?? 0) | 0, g = (c.g ?? 0) | 0, b = (c.b ?? 0) | 0;
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Format a 3D-space distance for the measurement label. STEP files are
 *  conventionally in millimetres, so we surface mm with a sensible
 *  precision and switch to metres for >= 1000 mm. */
function formatMeasureDistance(mm: number): string {
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  if (mm >= 10)   return `${mm.toFixed(1)} mm`;
  return `${mm.toFixed(2)} mm`;
}

function StepPanel({ url, filename, onDownload, onEmail }: StepPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const ovRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(true);

  // Mesh tree + per-node visibility (true = visible).
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  // Right-panel display settings.
  const [bgColor, setBgColor] = useState('#f5f6f8');
  const [showEdges, setShowEdges] = useState(true);
  const [edgeColor, setEdgeColor] = useState('#000000');
  const [edgeThreshold, setEdgeThreshold] = useState(1);

  // Floating panel visibility — default closed so the viewport is unobstructed.
  const [showMeshes, setShowMeshes] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Camera projection — orthographic by default. CAD users expect ortho
  // when first opening a STEP file; perspective is one click away via
  // the toolbar toggle.
  const [perspective, setPerspective] = useState(false);

  // Section view (capped clipping plane).
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<'x' | 'y' | 'z'>('x');
  const [sectionFlip, setSectionFlip] = useState(false);
  const [sectionPosition, setSectionPosition] = useState(0.5); // 0–1 within bbox
  const [sectionAngle, setSectionAngle] = useState(0);         // degrees, 0–180 — rotates the cut plane around a perpendicular axis

  // Measurement tool — point picker. Two modes:
  //   - 'point': click two points on the model → straight-line distance.
  //   - 'perp':  click two surfaces → perpendicular gap between the two
  //             face planes (the typical CAD "wall thickness" measurement).
  // Clicked points + visual artefacts (markers, line, label) live in the
  // ref so the user can orbit the camera between picks without losing
  // anything.
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measureMode, setMeasureMode] = useState<'point' | 'perp'>('point');
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const measureRef = useRef<{
    points: any[];           // THREE.Vector3[] — at most 2
    normals: ({ x: number; y: number; z: number } | null)[]; // surface normal at each pick (null if pick missed a face)
    markers: any[];          // small spheres at each point
    line: any | null;        // line connecting them
    label: HTMLDivElement | null;
    rafId: number | null;    // requestAnimationFrame for label-follows-camera
  } | null>(null);

  // Persistent section state — stencil helpers, cap mesh, original material
  // settings — held in a ref so we can mutate the plane in place on slider
  // tick instead of rebuilding every helper mesh.
  const sectionRef = useRef<{
    plane: any;
    capMesh: any;
    helpers: any[];
    materialState: Map<any, { clippingPlanes: any; clipShadows: any }>;
    bbox: any;
  } | null>(null);

  // Load model.
  useEffect(() => {
    let cancelled = false;
    let viewer: any = null;
    let resizeObserver: ResizeObserver | null = null;
    setLoading(true);
    setError(null);
    setTree(null);
    setExpanded({});
    setHidden(new Set());

    (async () => {
      let OV: any;
      try {
        OV = await import('online-3d-viewer');
      } catch {
        if (!cancelled) {
          setError('online-3d-viewer is not installed in this app. Add it to enable 3D file viewing.');
          setLoading(false);
        }
        return;
      }
      ovRef.current = OV;
      if (cancelled || !containerRef.current) return;

      // Wait for container to have a real layout before constructing the
      // viewer — same dance as the DXF panel.
      await new Promise<void>(resolve => {
        const tryStart = () => {
          const r = containerRef.current?.getBoundingClientRect();
          if (r && r.width > 4 && r.height > 4) resolve();
          else requestAnimationFrame(tryStart);
        };
        tryStart();
      });
      if (cancelled || !containerRef.current) return;

      try {
        const libsBase = (typeof window !== 'undefined' && (window as any).__REACT_OS_SHELL_O3DV_LIBS__)
          || DEFAULT_O3DV_LIBS;
        OV.SetExternalLibLocation?.(libsBase);

        // Must run before EmbeddedViewer creates its canvas so the WebGL
        // context is granted a stencil buffer (needed by the section
        // view's capping technique).
        ensureStencilContextAttribute();

        viewer = new OV.EmbeddedViewer(containerRef.current, {
          backgroundColor: new OV.RGBAColor(245, 246, 248, 255),
          defaultColor: new OV.RGBColor(180, 188, 200),
          edgeSettings: new OV.EdgeSettings(true, new OV.RGBColor(0, 0, 0), 1),
          onModelLoaded: () => {
            if (cancelled) return;
            try {
              const model = viewer.GetModel?.();
              const root = model?.GetRootNode?.();
              if (root) {
                const t = buildTree(root);
                setTree(t);
                // Expand top two levels by default.
                const expandIds: Record<number, boolean> = { [t.id]: true };
                for (const c of t.children) expandIds[c.id] = true;
                setExpanded(expandIds);
              }
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[Preview] mesh tree extraction failed', err);
            }
            setLoading(false);
          },
          onModelLoadFailed: () => {
            if (!cancelled) {
              setError('Failed to load 3D model.');
              setLoading(false);
            }
          },
        });
        viewerRef.current = viewer;

        const inputFile = new OV.InputFile(filename, OV.FileSource.Url, url);
        viewer.LoadModelFromInputFiles([inputFile]);

        // Re-size the WebGL canvas whenever the container's box changes —
        // window resize, Modal drag-resize, taskbar repositioning, etc.
        // The OV EmbeddedViewer ships its own `Resize()` that auto-detects
        // the container size; we feature-detect the underlying inner
        // viewer too in case OV's wrapper API changes.
        if (containerRef.current && typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            try {
              const v = viewerRef.current as any;
              if (v?.Resize)             v.Resize();
              else if (v?.viewer?.Resize) v.viewer.Resize();
              v?.viewer?.Render?.();
            } catch {}
          });
          resizeObserver.observe(containerRef.current);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load 3D model.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try { resizeObserver?.disconnect(); } catch {}
      try { viewer?.Destroy?.(); } catch {}
      viewerRef.current = null;
    };
  }, [url, filename]);

  // Apply per-node visibility by walking the THREE scene's mesh userData. The
  // engine's public `SetMeshesVisibility` is global-only, so we go one level
  // deeper to flip individual `mesh.visible` flags.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v?.viewer) return;
    try {
      const visit = (mesh: any) => {
        if (mesh.userData?.__sectionHelper) return;
        const ud = mesh.userData?.originalMeshInstance ?? mesh.userData;
        const nodeId: number | undefined = ud?.id?.nodeId ?? ud?.nodeId;
        if (typeof nodeId === 'number') {
          mesh.visible = !hidden.has(nodeId);
        }
      };
      v.viewer.mainModel?.EnumerateMeshesAndLines?.(visit);
      v.viewer.mainModel?.EnumerateEdges?.(visit);
      v.viewer.Render?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Preview] visibility update failed', err);
    }
  }, [hidden, tree]);

  // Apply edge settings.
  useEffect(() => {
    const OV = ovRef.current;
    const v = viewerRef.current;
    if (!OV || !v?.viewer) return;
    try {
      v.viewer.SetEdgeSettings(new OV.EdgeSettings(showEdges, hexToRgb(OV, edgeColor), edgeThreshold));
      v.viewer.Render?.();
    } catch {}
  }, [showEdges, edgeColor, edgeThreshold]);

  // Apply background color.
  useEffect(() => {
    const OV = ovRef.current;
    const v = viewerRef.current;
    if (!OV || !v?.viewer) return;
    try {
      const c = hexToRgb(OV, bgColor);
      v.viewer.SetBackgroundColor(new OV.RGBAColor(c.r, c.g, c.b, 255));
      v.viewer.Render?.();
    } catch {}
  }, [bgColor]);

  // Section view — set / tear down on enable.
  //
  // Capped clipping using the standard three.js stencil technique. The
  // tricky bit is that we can't `import('three')` — it resolves to a
  // different three instance than the one online-3d-viewer bundles
  // (transitive duplicate), which breaks instanceof checks against the
  // renderer's THREE. Workaround: pluck constructors (Mesh, BufferGeometry,
  // BufferAttribute, MeshPhongMaterial) from a sample mesh in the loaded
  // scene — those are guaranteed to be from the renderer's THREE. The
  // stencil/side constants are universal numeric values, so we hardcode
  // them. The plane itself stays duck-typed — three's WebGLClipping just
  // calls `.copy()` on it (reads .normal.x/y/z and .constant).
  useEffect(() => {
    const v = viewerRef.current;
    if (!v?.viewer || loading) return;

    const renderer = v.viewer.renderer;
    const scene = v.viewer.scene;
    if (!renderer || !scene) return;

    // Tear down any previous state.
    if (sectionRef.current) {
      const s = sectionRef.current;
      for (const [mat, prev] of s.materialState.entries()) {
        mat.clippingPlanes = prev.clippingPlanes;
        mat.clipShadows = prev.clipShadows;
        mat.needsUpdate = true;
      }
      for (const helper of s.helpers) {
        helper.parent?.remove(helper);
        // Don't dispose helper.geometry — it's shared with the original mesh.
        helper.material?.dispose?.();
      }
      if (s.capMesh) {
        scene.remove(s.capMesh);
        s.capMesh.geometry?.dispose?.();
        s.capMesh.material?.dispose?.();
      }
      sectionRef.current = null;
    }

    if (!sectionEnabled) {
      renderer.localClippingEnabled = false;
      v.viewer.Render?.();
      return;
    }

    const bbox = v.viewer.GetBoundingBox?.(() => true);
    if (!bbox) return;

    // Snapshot the mesh list — never traverse-and-mutate.
    const targets: any[] = [];
    v.viewer.mainModel?.EnumerateMeshes?.((mesh: any) => {
      if (!mesh.userData?.__sectionHelper) targets.push(mesh);
    });
    if (!targets.length) {
      renderer.localClippingEnabled = false;
      v.viewer.Render?.();
      return;
    }

    // Pluck THREE constructors from a sample mesh (these come from the
    // renderer's THREE, so the renderer recognizes the resulting objects).
    const sample = targets[0];
    const Mesh = sample.constructor;
    const Material = sample.material?.constructor; // MeshPhongMaterial
    const Geometry = sample.geometry?.constructor;
    const BufferAttr = sample.geometry?.attributes?.position?.constructor;
    if (!Mesh || !Material || !Geometry || !BufferAttr) {
      // Fallback to plain clipping if we can't pluck constructors.
      // eslint-disable-next-line no-console
      console.warn('[Preview] section: missing THREE constructors, falling back to no cap');
    }

    // Universal three.js / WebGL constants.
    const FrontSide = 0, BackSide = 1, DoubleSide = 2;
    const AlwaysStencilFunc = 519, NotEqualStencilFunc = 517;
    const IncrementWrapStencilOp = 7682, DecrementWrapStencilOp = 7683;
    const ReplaceStencilOp = 7681;

    // Verify the WebGL context actually has a stencil buffer — without one
    // every stencil op is a no-op, the cap stays at ref 0 forever, and the
    // cut reads as a hollow shell. If we can't get one, log and skip the
    // cap (clipping still works, just without fill).
    let hasStencil = true;
    try {
      const gl = renderer.getContext?.();
      const attrs = gl?.getContextAttributes?.();
      hasStencil = attrs?.stencil !== false;
      // Force the renderer to clear stencil between frames; without this
      // the helper writes accumulate (or never start at 0) and the cap
      // mask drifts.
      renderer.autoClearStencil = true;
      // eslint-disable-next-line no-console
      console.info('[Preview] section: stencil buffer =', hasStencil, 'targets =', targets.length);
    } catch {}

    // Enable local clipping BEFORE we modify material clippingPlanes so the
    // shaders pick up the clipping path on first compile. Setting this
    // afterwards still works (with material.needsUpdate), but doing it
    // early avoids one wasted recompile and is closer to three.js's
    // documented usage pattern.
    renderer.localClippingEnabled = true;

    // Duck-typed plane. three.js's WebGLClipping calls `_plane.copy(this)`
    // — that just reads `.normal.x/y/z` and `.constant`, so a plain object
    // works. BUT `Material.copy()` deep-clones a source material's
    // clippingPlanes via `srcPlanes[i].clone()`, so our plane needs a
    // `.clone()` method or material cloning crashes with
    // `t[s].clone is not a function`. The clone returned here is a fresh
    // object with the same shape (so a clone-of-the-clone also works);
    // we always overwrite the cloned material's clippingPlanes back to
    // the shared plane reference afterwards, so this isn't load-bearing
    // for the actual rendering — it just has to not throw.
    const plane: any = {
      normal: { x: 0, y: 0, z: -1 },
      constant: 0,
    };
    plane.clone = function planeClone(this: any) {
      const c: any = {
        normal: { x: this.normal.x, y: this.normal.y, z: this.normal.z },
        constant: this.constant,
      };
      c.clone = planeClone;
      return c;
    };
    const helpers: any[] = [];
    const materialState = new Map<any, { clippingPlanes: any; clipShadows: any }>();

    const applyToMaterial = (mat: any) => {
      if (!mat || materialState.has(mat)) return;
      materialState.set(mat, { clippingPlanes: mat.clippingPlanes, clipShadows: mat.clipShadows });
      mat.clippingPlanes = [plane];
      mat.clipShadows = true;
      mat.needsUpdate = true;
    };

    for (const mesh of targets) {
      const mat = mesh.material;
      if (Array.isArray(mat)) for (const m of mat) applyToMaterial(m);
      else applyToMaterial(mat);

      // Stencil-only helpers per mesh: back-faces increment the stencil,
      // front-faces decrement. Where the running count is non-zero on the
      // cap plane, we're inside the solid → cap renders.
      //
      // We clone the source material rather than `new Material()` so the
      // shader compiles with the same uniform/attribute setup as the
      // existing scene (avoids subtle "shader fails silently" cases).
      const sourceMat = Array.isArray(mat) ? mat[0] : mat;
      if (Mesh && hasStencil && sourceMat?.clone) {
        const makeStencil = (side: number, op: number) => {
          const m: any = sourceMat.clone();
          m.depthWrite = false;
          m.depthTest = false;
          m.colorWrite = false;
          m.stencilWrite = true;
          m.stencilFunc = AlwaysStencilFunc;
          m.stencilFail = op;
          m.stencilZFail = op;
          m.stencilZPass = op;
          m.side = side;
          m.transparent = false;
          m.clippingPlanes = [plane];
          m.clipShadows = true;
          m.needsUpdate = true;
          const helper = new Mesh(mesh.geometry, m);
          helper.matrixAutoUpdate = false;
          helper.renderOrder = 1;
          helper.userData.__sectionHelper = true;
          mesh.add(helper);
          helpers.push(helper);
        };
        makeStencil(BackSide, IncrementWrapStencilOp);
        makeStencil(FrontSide, DecrementWrapStencilOp);
      }
    }

    // Edges — clip them too so the cut isn't framed by a stale outline.
    v.viewer.mainModel?.EnumerateEdges?.((edge: any) => {
      const mat = edge.material;
      if (Array.isArray(mat)) for (const m of mat) applyToMaterial(m);
      else applyToMaterial(mat);
    });

    // Cap quad — sized to the bbox diagonal × 2 so it always covers the cut,
    // built as a manual BufferGeometry quad (4 verts, 2 tris). We clone
    // the source material (same shader as the rest of the scene) instead
    // of `new Material()` so the cap actually receives lighting consistent
    // with the model.
    let capMesh: any = null;
    const sourceMat = (targets[0]?.material && (Array.isArray(targets[0].material) ? targets[0].material[0] : targets[0].material)) as any;
    if (hasStencil && Mesh && Geometry && BufferAttr && sourceMat?.clone) {
      const dx = bbox.max.x - bbox.min.x;
      const dy = bbox.max.y - bbox.min.y;
      const dz = bbox.max.z - bbox.min.z;
      const capSize = Math.max(dx, dy, dz, 1) * 2;
      const half = capSize / 2;

      const capGeom: any = new Geometry();
      const positions = new Float32Array([
        -half, -half, 0,
         half, -half, 0,
         half,  half, 0,
        -half,  half, 0,
      ]);
      const normals = new Float32Array([
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      ]);
      capGeom.setAttribute('position', new BufferAttr(positions, 3));
      capGeom.setAttribute('normal', new BufferAttr(normals, 3));
      capGeom.setIndex([0, 1, 2, 0, 2, 3]);

      const capMat: any = sourceMat.clone();
      // Match the body's main color — the cap should look like a slice of
      // the same material, not a contrasting fill. The cloned material
      // already carries the source color; we just keep it. Add a low-
      // intensity emissive of the same color so the cap is still visible
      // even on faces facing away from any scene light, without changing
      // its hue.
      const sourceColorHex = (sourceMat.color?.getHex?.() ?? 0xb4bcc8) as number;
      capMat.emissive?.setHex?.(sourceColorHex);
      if ('emissiveIntensity' in capMat) capMat.emissiveIntensity = 0.25;
      capMat.side = DoubleSide;
      capMat.transparent = false;
      capMat.opacity = 1;
      capMat.stencilWrite = true;
      capMat.stencilRef = 0;
      capMat.stencilFunc = NotEqualStencilFunc;
      capMat.stencilFail = ReplaceStencilOp;
      capMat.stencilZFail = ReplaceStencilOp;
      capMat.stencilZPass = ReplaceStencilOp;
      // Don't clip the cap itself by the same plane.
      capMat.clippingPlanes = [];
      // Push the cap a hair toward the camera so it wins z-fights with
      // any model fragments that happen to sit exactly at the plane.
      capMat.polygonOffset = true;
      capMat.polygonOffsetFactor = -1;
      capMat.polygonOffsetUnits = -1;
      capMat.needsUpdate = true;

      capMesh = new Mesh(capGeom, capMat);
      capMesh.renderOrder = 2;
      capMesh.userData.__sectionHelper = true;
      scene.add(capMesh);
    }

    sectionRef.current = { plane, capMesh, helpers, materialState, bbox };
    // eslint-disable-next-line no-console
    console.info('[Preview] section: helpers =', helpers.length, 'cap =', !!capMesh);
    v.viewer.Render?.();
  }, [sectionEnabled, loading, tree]);

  // Section view — update plane orientation/position on axis/flip/angle/slider change.
  useEffect(() => {
    const v = viewerRef.current;
    const s = sectionRef.current;
    if (!v?.viewer || !s || !sectionEnabled) return;
    try {
      const bbox = s.bbox;
      const axisIdx = sectionAxis === 'x' ? 0 : sectionAxis === 'y' ? 1 : 2;
      const min = [bbox.min.x, bbox.min.y, bbox.min.z][axisIdx];
      const max = [bbox.max.x, bbox.max.y, bbox.max.z][axisIdx];
      const t = min + (max - min) * sectionPosition;

      // Cut-plane normal = chosen axis rotated through `sectionAngle` around a
      // perpendicular reference axis. At θ=0 every axis matches the original
      // axis-aligned behaviour; sweeping 0 → 360 spins the plane once around
      // the model. `sectionFlip` continues to negate the whole normal.
      const θ = (sectionAngle * Math.PI) / 180;
      const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
      const sign = sectionFlip ? -1 : 1;
      let nx = 0, ny = 0, nz = 0;
      if (sectionAxis === 'x')      { nx = sign * cosθ; nz = sign * sinθ; }
      else if (sectionAxis === 'y') { ny = sign * cosθ; nz = sign * sinθ; }
      else                          { nx = sign * sinθ; nz = sign * cosθ; }

      // The plane passes through point P on the chosen-axis line at
      // `sectionPosition` of the bbox extent; the other two coordinates use
      // the bbox centre so the plane stays anchored within the model when it
      // rotates.
      const center = {
        x: (bbox.min.x + bbox.max.x) / 2,
        y: (bbox.min.y + bbox.max.y) / 2,
        z: (bbox.min.z + bbox.max.z) / 2,
      };
      const Px = sectionAxis === 'x' ? t : center.x;
      const Py = sectionAxis === 'y' ? t : center.y;
      const Pz = sectionAxis === 'z' ? t : center.z;

      s.plane.normal.x = nx;
      s.plane.normal.y = ny;
      s.plane.normal.z = nz;
      // three.js clips fragments where (normal · p) + constant < 0; the plane
      // equation we want is normal · p = normal · P, so constant = -(normal·P).
      s.plane.constant = -(nx * Px + ny * Py + nz * Pz);

      // Re-position the cap mesh on the plane and orient it so its visible
      // face points along the plane normal.
      if (s.capMesh) {
        const cx = center.x, cy = center.y, cz = center.z;
        // Distance from bbox center to plane along the normal.
        const dist = nx * cx + ny * cy + nz * cz + s.plane.constant;
        const px = cx - nx * dist;
        const py = cy - ny * dist;
        const pz = cz - nz * dist;
        s.capMesh.position.set(px, py, pz);
        s.capMesh.lookAt?.(px + nx, py + ny, pz + nz);
      }

      v.viewer.Render?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Preview] section update failed', err);
    }
  }, [sectionEnabled, sectionAxis, sectionFlip, sectionPosition, sectionAngle]);

  // ──────────────────────────────────────────────────────────────────────
  // Measurement tool
  //
  // Click two points on the model; we raycast from the camera, drop a small
  // sphere marker at each hit, draw a line between them, and overlay an
  // HTML distance label that re-projects every animation frame so it
  // tracks as the user orbits the camera. A third click clears and starts
  // a fresh measurement. ESC or toggling the toolbar button off cleans up
  // all visuals.
  //
  // THREE constructors are plucked from a sample mesh in the loaded scene
  // (same trick the section view uses) so we share the renderer's THREE
  // instance. `THREE.Raycaster` doesn't naturally appear on any mesh, so
  // we dynamically `import('three')` for it — Raycaster is duck-typed
  // against `mesh.isMesh` / `geometry.isBufferGeometry` flags, not
  // `instanceof`, so a different THREE instance is fine for that bit.
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current;
    if (!v?.viewer || loading || !containerRef.current) return;

    const renderer = v.viewer.renderer;
    const scene = v.viewer.scene;
    const camera = v.viewer.camera;
    const canvas: HTMLCanvasElement | undefined = renderer?.domElement;
    if (!renderer || !scene || !camera || !canvas) return;

    // Snapshot a sample mesh to pluck THREE constructors that share the
    // renderer's THREE instance.
    let sampleMesh: any = null;
    v.viewer.mainModel?.EnumerateMeshes?.((m: any) => {
      if (!sampleMesh && !m.userData?.__sectionHelper && !m.userData?.__measureHelper) sampleMesh = m;
    });
    if (!sampleMesh) return;

    const Vector3Ctor = sampleMesh.position.constructor;
    const MeshCtor = sampleMesh.constructor;
    const MaterialCtor = (Array.isArray(sampleMesh.material) ? sampleMesh.material[0] : sampleMesh.material)?.constructor;
    const GeometryCtor = sampleMesh.geometry.constructor;
    const BufferAttrCtor = sampleMesh.geometry.attributes?.position?.constructor;
    if (!Vector3Ctor || !MeshCtor || !MaterialCtor || !GeometryCtor || !BufferAttrCtor) return;

    // Tear-down helper, used both on toggle-off and on next-mount cleanup.
    const teardown = () => {
      const s = measureRef.current;
      if (!s) return;
      if (s.rafId !== null) cancelAnimationFrame(s.rafId);
      for (const m of s.markers) {
        scene.remove(m);
        m.geometry?.dispose?.();
        m.material?.dispose?.();
      }
      if (s.line) {
        scene.remove(s.line);
        s.line.geometry?.dispose?.();
        s.line.material?.dispose?.();
      }
      if (s.label && s.label.parentElement) s.label.parentElement.removeChild(s.label);
      measureRef.current = null;
      v.viewer.Render?.();
    };

    if (!measureEnabled) {
      teardown();
      setMeasureDistance(null);
      return;
    }

    // Initial state for this session.
    measureRef.current = { points: [], normals: [], markers: [], line: null, label: null, rafId: null };

    // Try to load THREE for Raycaster. import('three') will likely resolve
    // to a different copy than OV's bundle, but Raycaster works against
    // duck-typed mesh.isMesh + geometry.isBufferGeometry flags, so this is
    // safe in practice.
    let THREE: any = null;
    let raycaster: any = null;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        THREE = await import(/* @vite-ignore */ 'three' as any);
        raycaster = new THREE.Raycaster();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[Preview] measure: failed to load three for raycaster', err);
      }
    })();

    // Modest sphere size — scales with the model's bbox so it stays
    // visible on tiny and huge models alike.
    const bbox = v.viewer.GetBoundingBox?.(() => true);
    const diag = bbox
      ? Math.sqrt(
          (bbox.max.x - bbox.min.x) ** 2 +
          (bbox.max.y - bbox.min.y) ** 2 +
          (bbox.max.z - bbox.min.z) ** 2,
        )
      : 100;
    const markerRadius = Math.max(diag * 0.005, 0.2);

    const ndcFromEvent = (ev: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((ev.clientY - rect.top) / rect.height) * 2 - 1),
      };
    };

    const collectTargets = (): any[] => {
      const out: any[] = [];
      v.viewer.mainModel?.EnumerateMeshes?.((m: any) => {
        if (m.userData?.__sectionHelper || m.userData?.__measureHelper) return;
        if (m.visible === false) return;
        out.push(m);
      });
      return out;
    };

    const makeMarker = (point: any) => {
      // Build a tiny sphere from a 12×8 lat-long mesh — cheap, no helper geom.
      const widthSegs = 16, heightSegs = 12;
      const positions: number[] = [];
      const indices: number[] = [];
      for (let iy = 0; iy <= heightSegs; iy++) {
        const v = iy / heightSegs;
        const phi = v * Math.PI;
        for (let ix = 0; ix <= widthSegs; ix++) {
          const u = ix / widthSegs;
          const theta = u * Math.PI * 2;
          positions.push(
            markerRadius * Math.sin(phi) * Math.cos(theta),
            markerRadius * Math.cos(phi),
            markerRadius * Math.sin(phi) * Math.sin(theta),
          );
        }
      }
      for (let iy = 0; iy < heightSegs; iy++) {
        for (let ix = 0; ix < widthSegs; ix++) {
          const a = iy * (widthSegs + 1) + ix;
          const b = a + widthSegs + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      const geom = new GeometryCtor();
      geom.setAttribute('position', new BufferAttrCtor(new Float32Array(positions), 3));
      geom.setIndex(indices);
      geom.computeVertexNormals?.();
      const mat: any = new MaterialCtor();
      mat.color?.setHex?.(0xff8800);
      mat.depthTest = false;
      mat.depthWrite = false;
      mat.transparent = true;
      mat.opacity = 0.95;
      const mesh: any = new MeshCtor(geom, mat);
      mesh.position.copy(point);
      mesh.renderOrder = 9999;
      mesh.userData.__measureHelper = true;
      scene.add(mesh);
      return mesh;
    };

    // Build a translucent overlay covering every triangle in the picked
    // mesh that's coplanar with the picked face — i.e. the entire flat
    // surface the user clicked. Used in ⊥ mode so the user sees which
    // surface they selected rather than a single point.
    //
    // Two triangles count as part of the same face when:
    //   1. their normals point the same way within ~1.8°, AND
    //   2. their centroids lie within a small band of the picked plane.
    //
    // Returns null for curved surfaces or mis-fitted picks; the caller
    // falls back to the sphere marker so the user always gets *some*
    // visual feedback.
    const buildFaceHighlight = (mesh: any, hit: any): any | null => {
      const geom = mesh?.geometry;
      const posAttr = geom?.attributes?.position;
      if (!geom || !posAttr || !hit?.face?.normal) return null;
      const positions: ArrayLike<number> = posAttr.array;
      const indices: ArrayLike<number> | null = geom.index ? geom.index.array : null;

      // Local-space hit data.
      const localPoint = new Vector3Ctor(hit.point.x, hit.point.y, hit.point.z);
      mesh.worldToLocal?.(localPoint);
      const ln = hit.face.normal;
      // Plane equation in local space: ln · X + planeC = 0 (passes through localPoint).
      const planeC = -(ln.x * localPoint.x + ln.y * localPoint.y + ln.z * localPoint.z);

      // Tolerance scales with the bbox so tiny parts and huge parts both
      // pick up the same face cleanly.
      geom.computeBoundingBox?.();
      const bb = geom.boundingBox;
      const diag = bb
        ? Math.sqrt((bb.max.x - bb.min.x) ** 2 + (bb.max.y - bb.min.y) ** 2 + (bb.max.z - bb.min.z) ** 2)
        : 100;
      const PLANE_TOL = Math.max(diag * 0.001, 0.005);
      const NORMAL_TOL = 0.9995; // ~1.8°

      const triCount = indices ? indices.length / 3 : posAttr.count / 3;
      const matched: number[] = [];

      // Bake the world transform into the highlight geometry so we can
      // attach it to the scene directly with no parent-tracking — it
      // stays in place even if the source mesh is later transformed.
      const tmpV = new Vector3Ctor();

      for (let t = 0; t < triCount; t++) {
        const ia = indices ? indices[t * 3]     : t * 3;
        const ib = indices ? indices[t * 3 + 1] : t * 3 + 1;
        const ic = indices ? indices[t * 3 + 2] : t * 3 + 2;
        const ax = positions[ia * 3],     ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
        const bx = positions[ib * 3],     by = positions[ib * 3 + 1], bz = positions[ib * 3 + 2];
        const cx = positions[ic * 3],     cy = positions[ic * 3 + 1], cz = positions[ic * 3 + 2];

        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nlen === 0) continue;
        nx /= nlen; ny /= nlen; nz /= nlen;

        // Triangle's normal must align with the picked face normal (front side).
        const ndot = nx * ln.x + ny * ln.y + nz * ln.z;
        if (ndot < NORMAL_TOL) continue;

        // Triangle centroid must lie on the picked plane.
        const ccx = (ax + bx + cx) / 3, ccy = (ay + by + cy) / 3, ccz = (az + bz + cz) / 3;
        const dist = Math.abs(ln.x * ccx + ln.y * ccy + ln.z * ccz + planeC);
        if (dist > PLANE_TOL) continue;

        // Push all three vertices in world space.
        for (const [vx_, vy_, vz_] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
          tmpV.set?.(vx_, vy_, vz_);
          mesh.localToWorld?.(tmpV);
          matched.push(tmpV.x, tmpV.y, tmpV.z);
        }
      }

      if (matched.length === 0) return null;

      const hgeom = new GeometryCtor();
      hgeom.setAttribute('position', new BufferAttrCtor(new Float32Array(matched), 3));
      hgeom.computeVertexNormals?.();

      const hmat: any = new MaterialCtor();
      hmat.color?.setHex?.(0xff8800);
      hmat.transparent = true;
      hmat.opacity = 0.45;
      hmat.depthWrite = false;
      // Pull the overlay slightly toward the camera so it doesn't z-fight
      // with the source surface. Negative offset = closer to viewer in
      // depth.
      hmat.polygonOffset = true;
      hmat.polygonOffsetFactor = -2;
      hmat.polygonOffsetUnits = -2;
      // Render after the model so the see-through colour blends on top.
      const highlight: any = new MeshCtor(hgeom, hmat);
      highlight.renderOrder = 9998;
      highlight.userData.__measureHelper = true;
      scene.add(highlight);
      return highlight;
    };

    const drawLine = (a: any, b: any) => {
      const geom = new GeometryCtor();
      geom.setAttribute('position', new BufferAttrCtor(new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]), 3));
      // Use the same material constructor — it'll render as a line because
      // we use the line-flavour mesh below if THREE has it; otherwise we
      // settle for a thin-mesh approximation. Cleanest: import THREE.Line
      // via the dynamic THREE import we already started.
      const LineCtor = THREE?.Line ?? MeshCtor; // fallback
      const LineMatCtor = THREE?.LineBasicMaterial ?? MaterialCtor;
      const mat: any = new LineMatCtor({ color: 0xff8800, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
      const line: any = new LineCtor(geom, mat);
      line.renderOrder = 9998;
      line.userData.__measureHelper = true;
      scene.add(line);
      return line;
    };

    const ensureLabel = () => {
      const s = measureRef.current!;
      if (s.label) return s.label;
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.transform = 'translate(-50%, -50%)';
      el.style.padding = '2px 6px';
      el.style.fontSize = '11px';
      el.style.fontWeight = '600';
      el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      el.style.background = 'rgba(255, 136, 0, 0.95)';
      el.style.color = '#fff';
      el.style.borderRadius = '4px';
      el.style.pointerEvents = 'none';
      el.style.whiteSpace = 'nowrap';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.25)';
      el.style.zIndex = '5';
      containerRef.current!.appendChild(el);
      s.label = el;
      return el;
    };

    const updateLabel = () => {
      const s = measureRef.current;
      if (!s || s.points.length < 2 || !s.label) return;
      const a = s.points[0], b = s.points[1];
      const mid = new Vector3Ctor((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      // Project midpoint to screen.
      const projected = mid.clone();
      projected.project?.(camera);
      const rect = canvas.getBoundingClientRect();
      const x = ((projected.x + 1) / 2) * rect.width;
      const y = ((-projected.y + 1) / 2) * rect.height;
      s.label.style.left = `${x}px`;
      s.label.style.top = `${y}px`;
      // Hide if behind the camera (z > 1).
      s.label.style.opacity = projected.z > 1 ? '0' : '1';
    };

    // Continuous re-projection so the label tracks orbit/pan/zoom — RAF is
    // cheap when the only work is one Vector3.project() and two style
    // assignments.
    const tick = () => {
      const s = measureRef.current;
      if (!s) return;
      updateLabel();
      s.rafId = requestAnimationFrame(tick);
    };
    measureRef.current.rafId = requestAnimationFrame(tick);

    // ── Click-vs-drag gating ──
    // We can't simply `stopPropagation()` on pointerdown — that would
    // block OV's orbit controls and pin the camera. Instead, we track
    // each pointer gesture: only treat it as a measurement pick when
    // the pointer barely moved (≤ DRAG_TOL px) between down and up
    // *and* the press was short. Anything longer is a camera drag and
    // we hand it off to OV unmodified.
    const DRAG_TOL = 4;     // px of cumulative movement that still counts as a click
    const DRAG_TIME = 350;  // ms; longer presses count as a drag even if pointer stayed still
    let downX = 0, downY = 0, downTime = 0, dragging = false, downActive = false;

    // Compute the world-space normal at the picked surface. Useful for
    // surface-to-surface distance: if the user picks two roughly-parallel
    // faces, we report the perpendicular distance instead of the raw
    // point-to-point distance.
    const worldNormalFromHit = (hit: any): { x: number; y: number; z: number } | null => {
      const fn = hit?.face?.normal;
      const obj = hit?.object;
      if (!fn || !obj) return null;
      try {
        const local = new Vector3Ctor(fn.x, fn.y, fn.z);
        // `transformDirection` is on three's Vector3 — applies the
        // upper-3x3 of `matrixWorld` and re-normalises.
        local.transformDirection?.(obj.matrixWorld);
        return { x: local.x, y: local.y, z: local.z };
      } catch {
        return { x: fn.x, y: fn.y, z: fn.z };
      }
    };

    const doMeasurePick = (ev: PointerEvent) => {
      const targets = collectTargets();
      if (!targets.length || !raycaster) return;
      const ndc = ndcFromEvent(ev);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(targets, false);
      if (!hits.length) return;

      const s = measureRef.current!;
      const point = new Vector3Ctor(hits[0].point.x, hits[0].point.y, hits[0].point.z);
      const normal = worldNormalFromHit(hits[0]);

      // Third click → start over.
      if (s.points.length === 2) {
        for (const m of s.markers) {
          scene.remove(m);
          m.geometry?.dispose?.();
          m.material?.dispose?.();
        }
        if (s.line) {
          scene.remove(s.line);
          s.line.geometry?.dispose?.();
          s.line.material?.dispose?.();
        }
        if (s.label) s.label.style.opacity = '0';
        s.points = []; s.markers = []; s.line = null;
        s.normals = [];
        setMeasureDistance(null);
      }

      s.points.push(point);
      s.normals.push(normal);
      // In ⊥ mode the user is selecting a *surface*, so paint a
      // translucent overlay on the entire coplanar face instead of the
      // single-point sphere marker. Falls back to the sphere if face
      // detection fails (e.g. the user picked a curved surface where no
      // coplanar triangles exist).
      if (measureMode === 'perp') {
        const highlight = buildFaceHighlight(hits[0].object, hits[0]);
        s.markers.push(highlight ?? makeMarker(point));
      } else {
        s.markers.push(makeMarker(point));
      }

      if (s.points.length === 2) {
        const a = s.points[0];
        let b = s.points[1];

        let dist: number;
        let suffix = '';

        if (measureMode === 'perp') {
          // Perpendicular mode: draw the line *along the surface normal*
          // (i.e. at 90° to surface A), ending on the plane parallel to
          // A passing through B's click point. The endpoint may land
          // inside or outside face B's highlight depending on where the
          // user clicked, but the line itself is unambiguously the
          // perpendicular gap — never the diagonal between two arbitrary
          // click points. Falls back to point-to-point if the first pick
          // missed a face.
          const refN = s.normals[0] ?? s.normals[1];
          if (refN) {
            const len = Math.sqrt(refN.x * refN.x + refN.y * refN.y + refN.z * refN.z) || 1;
            const nx = refN.x / len, ny = refN.y / len, nz = refN.z / len;
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            // Signed projection of (b − a) onto n. Sign keeps the
            // perpendicular endpoint on the same side as the second
            // click, so the line visually crosses the gap rather than
            // drawing into the source body.
            const proj = dx * nx + dy * ny + dz * nz;
            const projectedB = new Vector3Ctor(a.x + nx * proj, a.y + ny * proj, a.z + nz * proj);
            // Re-anchor the second endpoint to the perpendicular foot —
            // both the rendered line and the label midpoint follow.
            s.points[1] = projectedB;
            b = projectedB;
            dist = Math.abs(proj);
            suffix = ' ⊥';
          } else {
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          }
        } else {
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        s.line = drawLine(a, b);
        setMeasureDistance(dist);
        const label = ensureLabel();
        label.textContent = `${formatMeasureDistance(dist)}${suffix}`;
      }

      v.viewer.Render?.();
    };

    const onPointerDown = (ev: PointerEvent) => {
      // Left-button only. Right-click and middle-click are camera-pan/orbit
      // gestures we don't want to interfere with.
      if (ev.button !== 0) return;
      downX = ev.clientX;
      downY = ev.clientY;
      downTime = performance.now();
      dragging = false;
      downActive = true;
      // *No* stopPropagation here — OV needs the event for orbit drag.
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!downActive) return;
      const dx = ev.clientX - downX, dy = ev.clientY - downY;
      if (dx * dx + dy * dy > DRAG_TOL * DRAG_TOL) dragging = true;
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (ev.button !== 0 || !downActive) return;
      const elapsed = performance.now() - downTime;
      const wasClick = !dragging && elapsed < DRAG_TIME;
      downActive = false;
      if (!wasClick) return;            // it was a camera gesture, hand off
      doMeasurePick(ev);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMeasureEnabled(false);
    };

    canvas.style.cursor = 'crosshair';
    // Bubble phase — OV's orbit-control listeners are also bubble; we
    // don't preempt them since we never call stopPropagation.
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      canvas.style.cursor = '';
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      teardown();
      setMeasureDistance(null);
    };
  }, [measureEnabled, measureMode, loading, tree]);

  // Hint timer.
  useEffect(() => {
    if (!showHint || loading) return;
    const t = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(t);
  }, [showHint, loading]);

  const toggleNodeVisible = (node: TreeNode) => {
    const ids = new Set<number>();
    collectNodeIds(node, ids);
    setHidden(prev => {
      const next = new Set(prev);
      // If any descendant is currently visible, hide them all; else reveal.
      const anyVisible = [...ids].some(id => !next.has(id));
      for (const id of ids) {
        if (anyVisible) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleExpanded = (id: number) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fitNode = (node: TreeNode) => {
    // Fit the whole model — fitting to a specific subtree would need its
    // bounds via a custom enumerator; defer that for now.
    handleFit();
    // Future: filter visibility-by-subtree to focus.
    void node;
  };

  const handleFit = () => {
    try {
      const v = viewerRef.current;
      const sphere = v?.viewer?.GetBoundingSphere?.(() => true);
      if (sphere) v.viewer.FitSphereToWindow(sphere, true);
      v?.viewer?.Render?.();
    } catch {}
  };

  // Switch between perspective and orthographic projection. The viewer keeps
  // the current camera position; just rebuilds the THREE camera under the hood.
  useEffect(() => {
    const OV = ovRef.current;
    const v = viewerRef.current;
    if (!OV || !v?.viewer || loading) return;
    try {
      v.viewer.SetProjectionMode(perspective ? OV.ProjectionMode.Perspective : OV.ProjectionMode.Orthographic);
    } catch {}
  }, [perspective, loading]);

  // Camera presets — eye/center/up around the model's bounding sphere.
  const setCameraPreset = (preset: 'top' | 'front' | 'side' | 'iso') => {
    const OV = ovRef.current;
    const v = viewerRef.current;
    if (!OV || !v?.viewer) return;
    try {
      const sphere = v.viewer.GetBoundingSphere?.(() => true);
      if (!sphere) return;
      const c = sphere.center;
      const r = sphere.radius || 1;
      const dist = r * 3;
      const cx = c.x ?? 0, cy = c.y ?? 0, cz = c.z ?? 0;
      let eye: any, up: any;
      switch (preset) {
        case 'top':   eye = new OV.Coord3D(cx, cy, cz + dist); up = new OV.Coord3D(0, 1, 0); break;
        case 'front': eye = new OV.Coord3D(cx, cy - dist, cz); up = new OV.Coord3D(0, 0, 1); break;
        case 'side':  eye = new OV.Coord3D(cx + dist, cy, cz); up = new OV.Coord3D(0, 0, 1); break;
        case 'iso':
        default: {
          const k = dist / Math.sqrt(3);
          eye = new OV.Coord3D(cx + k, cy - k, cz + k);
          up = new OV.Coord3D(0, 0, 1);
          break;
        }
      }
      const center = new OV.Coord3D(cx, cy, cz);
      const cam = new OV.Camera(eye, center, up, 45);
      v.viewer.SetCamera(cam);
      v.viewer.AdjustClippingPlanesToSphere?.(sphere);
      v.viewer.Render?.();
    } catch {}
  };

  const handleSnapshot = () => {
    try {
      const v = viewerRef.current;
      const size = v?.viewer?.GetCanvasSize?.() ?? { width: 1280, height: 720 };
      const dataUrl = v?.viewer?.GetImageAsDataUrl?.(size.width, size.height, false);
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filename.replace(/\.[^.]+$/, '')}-snapshot.png`;
      a.click();
    } catch {}
  };

  const handleResetDisplay = () => {
    setBgColor('#f5f6f8');
    setShowEdges(true);
    setEdgeColor('#000000');
    setEdgeThreshold(1);
    setSectionEnabled(false);
    setSectionAxis('x');     // matches the new default
    setSectionFlip(false);
    setSectionPosition(0.5);
    setSectionAngle(0);
  };

  const handleDefaultDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const ext = (filename.split('.').pop() || '').toUpperCase();

  // ── render helpers ───────────────────────────────────────────────────────
  const renderTreeNode = (node: TreeNode, depth = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded[node.id] !== false; // default expanded for first two levels
    const isVisible = !hidden.has(node.id);
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1 px-1.5 py-1 hover:bg-gray-100 cursor-default text-[12px] text-gray-700"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpanded(node.id)}
              className="h-4 w-4 shrink-0 flex items-center justify-center text-gray-500 hover:text-gray-900"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={isExpanded ? 'M19.5 8.25l-7.5 7.5-7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
              </svg>
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0 flex items-center justify-center">
              <span className="h-1 w-1 rounded-full bg-gray-400" />
            </span>
          )}
          <span className={`flex-1 truncate ${isVisible ? '' : 'opacity-40'}`} title={node.name}>{node.name}</span>
          <button
            onClick={() => fitNode(node)}
            className="h-4 w-4 shrink-0 text-gray-400 hover:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Fit to view"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
          <button
            onClick={() => toggleNodeVisible(node)}
            className="h-4 w-4 shrink-0 text-gray-500 hover:text-gray-900"
            title={isVisible ? 'Hide' : 'Show'}
          >
            {isVisible ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            )}
          </button>
        </div>
        {isExpanded && hasChildren && (
          <div>{node.children.map(c => renderTreeNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  const tBtn = 'h-8 w-8 shrink-0 flex items-center justify-center rounded text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors';
  const tBtnActive = 'h-8 w-8 shrink-0 flex items-center justify-center rounded bg-gray-200 text-gray-900';
  // Wide variant — used for text-labelled buttons (e.g. Perspective /
  // Orthographic) so the label has room to render without being clipped
  // by the fixed 32 px square of `tBtn`.
  const tBtnWide = 'h-8 shrink-0 flex items-center justify-center px-2 rounded text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors';
  const tBtnWideActive = 'h-8 shrink-0 flex items-center justify-center px-2 rounded bg-gray-200 text-gray-900';
  const tBtnSep = 'h-5 w-px bg-gray-300 mx-1';

  return (
    <div className="flex flex-col h-full bg-white">
      <PanelActions>
        <button onClick={handleFit} className={tBtn} title="Fit to view">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
        <div className={tBtnSep} />
        <button onClick={() => setCameraPreset('iso')} className={tBtn} title="Isometric view">
          <span className="text-[10px] font-semibold">ISO</span>
        </button>
        <button onClick={() => setCameraPreset('top')} className={tBtn} title="Top view">
          <span className="text-[10px] font-semibold">TOP</span>
        </button>
        <button onClick={() => setCameraPreset('front')} className={tBtn} title="Front view">
          <span className="text-[10px] font-semibold">FRT</span>
        </button>
        <button onClick={() => setCameraPreset('side')} className={tBtn} title="Side view">
          <span className="text-[10px] font-semibold">SDE</span>
        </button>
        <button
          onClick={() => setPerspective(p => !p)}
          className={perspective ? tBtnWideActive : tBtnWide}
          title={perspective ? 'Switch to orthographic view' : 'Switch to perspective view'}
        >
          <span className="text-[11px] font-semibold whitespace-nowrap">{perspective ? 'Perspective' : 'Orthographic'}</span>
        </button>
        <div className={tBtnSep} />
        <button onClick={handleSnapshot} className={tBtn} title="Save snapshot as PNG">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
        </button>
        <button onClick={() => setShowHint(s => !s)} className={tBtn} title="How to navigate">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
        </button>
        <button
          onClick={() => setMeasureEnabled(m => !m)}
          className={measureEnabled ? tBtnActive : tBtn}
          title={measureEnabled ? 'Stop measuring (Esc)' : 'Measure distance — click two points on the model'}
        >
          {/* Ruler icon */}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.25l6-6 6 6 4.5-4.5M9.75 8.25v3M12.75 11.25v3M15.75 14.25v3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75h19.5" />
          </svg>
        </button>
        {measureEnabled && (
          <div className="flex items-stretch h-8 rounded border border-gray-200 overflow-hidden">
            <button
              onClick={() => setMeasureMode('point')}
              className={`px-2 text-[11px] font-semibold transition-colors ${measureMode === 'point' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              title="Point — measure straight-line distance between two picked points"
            >
              Point
            </button>
            <button
              onClick={() => setMeasureMode('perp')}
              className={`px-2 text-[12px] font-semibold transition-colors ${measureMode === 'perp' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              title="Perpendicular — pick two surfaces and measure the perpendicular gap between them"
            >
              ⊥
            </button>
          </div>
        )}
        {measureEnabled && measureDistance !== null && (
          <div className="px-2 py-1 text-[11px] font-mono font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded whitespace-nowrap" title={measureMode === 'perp' ? 'Perpendicular distance between the two picked surfaces' : 'Straight-line distance between the two picked points'}>
            {formatMeasureDistance(measureDistance)}{measureMode === 'perp' ? ' ⊥' : ''}
          </div>
        )}
        <div className={tBtnSep} />
        <button onClick={() => setShowMeshes(s => !s)} className={showMeshes ? tBtnActive : tBtn} title="Toggle meshes panel">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <button onClick={() => setShowSettings(s => !s)} className={showSettings ? tBtnActive : tBtn} title="Toggle display panel">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button onClick={onDownload ?? handleDefaultDownload} className={tBtn} title="Download original file">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
        {onEmail && (
          <button onClick={onEmail} className={tBtn} title="Email">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </button>
        )}
      </PanelActions>

      {/* Body: viewport with floating Meshes / Model Display panels overlaid */}
      <div className="flex-1 flex min-h-0">
        <div className="relative flex-1 min-w-0" style={{ background: bgColor }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

          {/* Floating Meshes panel — anchored top-left, mirrors DXF Layers panel */}
          {showMeshes && (
            <div className="absolute top-2 left-2 w-64 max-h-[80%] flex flex-col bg-white/95 backdrop-blur border border-gray-200 rounded-md shadow-xl z-10 text-xs">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 bg-gray-50">
                <span className="font-medium text-gray-700">Meshes</span>
                <button onClick={() => setShowMeshes(false)} className="px-1.5 py-0.5 rounded hover:bg-gray-200 text-gray-600" title="Close">×</button>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {tree ? renderTreeNode(tree) : (
                  <div className="px-3 py-3 text-[11px] text-gray-500 italic">{loading ? 'Reading model…' : 'No structure available'}</div>
                )}
              </div>
              {tree && (
                <div className="px-3 py-1.5 text-[10px] text-gray-500 border-t border-gray-200">
                  {hidden.size === 0 ? 'All visible' : `${hidden.size} hidden`}
                </div>
              )}
            </div>
          )}

          {showHint && !loading && !error && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-gray-900/85 text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg flex items-center gap-3 z-10 pointer-events-none">
              <span>Drag to rotate</span>
              <span className="text-white/40">•</span>
              <span>Right-click drag to pan</span>
              <span className="text-white/40">•</span>
              <span>Scroll to zoom</span>
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 text-sm text-gray-600 gap-2">
              <svg className="h-6 w-6 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                <path d="M22 12a10 10 0 0 1-10 10" strokeLinecap="round" />
              </svg>
              <span>Loading 3D model…</span>
              {ext === 'STP' || ext === 'STEP' ? <span className="text-[10px] text-gray-400">STEP files load OpenCascade WASM (~5 MB) on first use.</span> : null}
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 px-6 text-center bg-white/85">{error}</div>
          )}

          {/* Floating Model Display panel — anchored top-right */}
          {showSettings && (
            <div className="absolute top-2 right-2 w-64 max-h-[80%] flex flex-col bg-white/95 backdrop-blur border border-gray-200 rounded-md shadow-xl z-10 text-xs">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 bg-gray-50">
                <span className="font-medium text-gray-700">Model Display</span>
                <button onClick={() => setShowSettings(false)} className="px-1.5 py-0.5 rounded hover:bg-gray-200 text-gray-600" title="Close">×</button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-[12px] text-gray-700">
                <label className="flex items-center justify-between gap-2">
                  <span>Background Color</span>
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-6 w-10 rounded border border-gray-300 bg-white" />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>Show Edges</span>
                  <button
                    onClick={() => setShowEdges(s => !s)}
                    role="switch"
                    aria-checked={showEdges}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${showEdges ? 'bg-blue-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${showEdges ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className={showEdges ? '' : 'opacity-40'}>Edge Color</span>
                  <input
                    type="color"
                    value={edgeColor}
                    onChange={(e) => setEdgeColor(e.target.value)}
                    disabled={!showEdges}
                    className="h-6 w-10 rounded border border-gray-300 bg-white disabled:opacity-40"
                  />
                </label>
                <div className={showEdges ? '' : 'opacity-40 pointer-events-none'}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span>Edge Threshold</span>
                    <span className="text-gray-500 tabular-nums">{edgeThreshold}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    step={1}
                    value={edgeThreshold}
                    onChange={(e) => setEdgeThreshold(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div className="border-t border-gray-200 -mx-3 px-3 pt-3 mt-1">
                  <label className="flex items-center justify-between gap-2">
                    <span className="font-medium">Section View</span>
                    <button
                      onClick={() => setSectionEnabled(s => !s)}
                      role="switch"
                      aria-checked={sectionEnabled}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${sectionEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${sectionEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </button>
                  </label>

                  <div className={sectionEnabled ? 'mt-2 space-y-2' : 'mt-2 space-y-2 opacity-40 pointer-events-none'}>
                    {/* Angle — rotates the cut plane around a perpendicular
                        reference axis (full 0–360° sweep). Sits above
                        Axis + Position because changing it visibly affects
                        both, so users find it first. */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span>Angle</span>
                        <span className="text-gray-500 tabular-nums">{sectionAngle}°</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={180}
                        step={1}
                        value={sectionAngle}
                        onChange={(e) => setSectionAngle(Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span>Axis</span>
                        <button
                          onClick={() => setSectionFlip(f => !f)}
                          className="text-[10px] text-gray-600 hover:text-gray-900 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200"
                          title="Flip section direction"
                        >
                          {sectionFlip ? '← flipped' : 'flip →'}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['x', 'y', 'z'] as const).map(ax => (
                          <button
                            key={ax}
                            onClick={() => setSectionAxis(ax)}
                            className={`py-1 rounded text-[11px] font-semibold ${sectionAxis === ax ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                          >
                            {ax.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span>Position</span>
                        <span className="text-gray-500 tabular-nums">{Math.round(sectionPosition * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={sectionPosition}
                        onChange={(e) => setSectionPosition(Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>

                  </div>
                </div>
              </div>
              <div className="px-3 py-2 border-t border-gray-200">
                <button
                  onClick={handleResetDisplay}
                  className="w-full text-[11px] text-gray-700 bg-gray-100 hover:bg-gray-200 rounded py-1.5 transition-colors"
                >
                  Reset to Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ImagePanelProps {
  url: string;
  filename: string;
  onDownload?: () => void;
  onEmail?: () => void;
}

function ImagePanel({ url, filename, onDownload, onEmail }: ImagePanelProps) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const annotatorRef = useRef<ImageAnnotatorHandle>(null);

  const handleDefaultDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const btn = 'px-2 py-1 rounded hover:bg-gray-200 transition-colors text-gray-600 flex items-center gap-1';

  return (
    <div className="flex flex-col h-full">
      <PanelActions>
        {!annotating && (
          <>
            <button onClick={() => setZoom(z => Math.max(0.1, Math.round((z - 0.25) * 100) / 100))} className={btn}>−</button>
            <span className="text-gray-500 w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(8, Math.round((z + 0.25) * 100) / 100))} className={btn}>+</button>
            <button onClick={() => setZoom(1)} className={btn}>1:1</button>
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <button onClick={() => setAnnotating(true)} className={btn} title="Annotate this image">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
              Annotate
            </button>
          </>
        )}
        {annotating && (
          <>
            <button onClick={() => setAnnotating(false)} className={btn} title="Back to viewer">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              View
            </button>
            <button onClick={() => annotatorRef.current?.copy()} className={btn}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
              Copy
            </button>
            <button onClick={() => annotatorRef.current?.save()} className={btn}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Save
            </button>
          </>
        )}
        <button onClick={onDownload ?? handleDefaultDownload} className={btn}>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          Download
        </button>
        {onEmail && (
          <button onClick={onEmail} className={btn}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
            Email
          </button>
        )}
      </PanelActions>
      {annotating ? (
        <ImageAnnotator ref={annotatorRef} src={url} filename={filename} />
      ) : (
        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-4">
          {error ? (
            <div className="text-sm text-red-600">Failed to load image.</div>
          ) : (
            <img
              src={url}
              alt={filename}
              onError={() => setError(true)}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 120ms ease' }}
              className="max-w-full max-h-full shadow-lg rounded bg-white"
            />
          )}
        </div>
      )}
    </div>
  );
}
