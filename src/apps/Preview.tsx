/**
 * Preview — windowed PDF viewer app.
 *
 * Consumers stage a PDF via `setPdfPreview({ url, filename, ... })` and then
 * call `openPage('/preview')`. The next Preview window to mount drains the
 * staged data — each window owns its own content, so opening a second Preview
 * never disturbs the first. To swap content in an *already-open* window (e.g.
 * a converting placeholder being replaced by the resolved file), keep the
 * handle returned by `setPdfPreview` and call `.update(next)` on it.
 */
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import toast from '../shell/toast';
import { WindowTitle, getActiveModalId, registerModalEscapeInterceptor } from '../shell/Modal';
import AboutApp from './_about';
import ImageAnnotator, { type ImageAnnotatorHandle } from './ImageAnnotator';
import {
  PDF_PREVIEW_UPDATE_EVENT,
  peekPdfPreviewStage,
  claimPdfPreviewStage,
  type PdfPreviewData,
  type PendingPdfStage,
} from './_previewStage';

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

// The consumer-facing staging surface (`setPdfPreview`, PdfPreviewData,
// PdfPreviewHandle) lives in ./_previewStage so that hosts importing it don't
// pull this module — and its static pdfjs-dist import — into their startup
// bundle. This component drains the stage via the @internal peek/claim pair.

export default function Preview() {
  // One-shot drain: this instance claims whatever was staged and stores the
  // token so it can recognise later `.update()` calls aimed at it. The render
  // phase only PEEKS — under React 18 concurrent rendering a render pass can
  // be discarded and replayed (the first mount of this lazy component
  // suspends on its chunk), and a destructive read here would let the
  // discarded pass swallow the payload, leaving the committed window empty.
  // The stage is cleared in the mount effect below (commit phase) instead.
  const consumedRef = useRef<PendingPdfStage | null | undefined>(undefined);
  if (consumedRef.current === undefined) {
    consumedRef.current = peekPdfPreviewStage();
  }
  useEffect(() => {
    // Claim the stage for real once mounted. The identity check (inside
    // claimPdfPreviewStage) keeps a payload staged *after* our render-phase
    // peek (e.g. a second preview opened in quick succession) available for
    // the window it belongs to.
    if (consumedRef.current != null) {
      claimPdfPreviewStage(consumedRef.current);
    }
  }, []);
  const [data, setData] = useState<PdfPreviewData | null>(consumedRef.current?.data ?? null);

  // Only respond to update events whose token matches our claim.
  useEffect(() => {
    const myToken = consumedRef.current?.token;
    if (myToken == null) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PendingPdfStage>).detail;
      if (!detail || detail.token !== myToken) return;
      setData(prev => {
        if (prev?.url && prev.url !== detail.data.url && prev.url.startsWith('blob:')) {
          URL.revokeObjectURL(prev.url);
        }
        return detail.data;
      });
    };
    window.addEventListener(PDF_PREVIEW_UPDATE_EVENT, handler);
    return () => window.removeEventListener(PDF_PREVIEW_UPDATE_EVENT, handler);
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
    // Local-only update: setPdfPreview stages content for the *next* window
    // to mount — calling it from inside an open window would overwrite that
    // slot and steal the payload from whoever opens next.
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
      <AboutApp app="preview" />
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

// Trimmed copy of pdf.js's text-layer rules (pdf_viewer.css), under our own
// class name so a consumer that loads the full viewer CSS doesn't
// double-apply. The layer is a sheet of transparent spans positioned over
// the canvas glyphs — that's what makes the rendered page selectable. Span
// positions are % of page size; font-size derives from
// --total-scale-factor, which the render effect sets to the viewport scale.
// The .endOfContent sentinel plus the .selecting toggle keep a
// drag-selection alive between lines and past the last line (same trick as
// pdf.js's own TextLayerBuilder).
const TEXT_LAYER_CSS = `
.preview-pdf-textlayer {
  position: absolute;
  inset: 0;
  overflow: clip;
  line-height: 1;
  text-align: initial;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor, 1) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}
.preview-pdf-textlayer :is(span, br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
}
.preview-pdf-textlayer > :not(.markedContent),
.preview-pdf-textlayer .markedContent span:not(.markedContent) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.preview-pdf-textlayer .markedContent {
  display: contents;
}
.preview-pdf-textlayer span[role="img"] {
  user-select: none;
  cursor: default;
}
.preview-pdf-textlayer ::selection {
  background: rgba(0, 80, 255, 0.25);
}
.preview-pdf-textlayer br::selection {
  background: transparent;
}
.preview-pdf-textlayer .endOfContent {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: 0;
  cursor: default;
  user-select: none;
}
.preview-pdf-textlayer.selecting .endOfContent {
  top: 0;
}
`;

function PdfPanel({ url, filename, onDownload, onEmail }: PdfPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  // Fit mode is the default — scale stays auto-tracking the container width
  // until the user picks a manual zoom (− / + / dropdown). Re-armed by the
  // Fit toolbar button.
  const [fitMode, setFitMode] = useState(true);
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

  // Auto-fit: re-compute scale from container width whenever fit mode is on,
  // the document changes, the page changes, or the container resizes. Window
  // resize and Modal drag-resize both trigger ResizeObserver. Manual zoom
  // turns this off until the user clicks Fit again.
  useEffect(() => {
    if (!pdf || !fitMode || !containerRef.current) return;
    const fit = () => {
      if (!containerRef.current) return;
      pdf.getPage(page).then(p => {
        const containerW = containerRef.current?.clientWidth || 800;
        const viewport = p.getViewport({ scale: 1 });
        const next = Math.min(Math.max((containerW - 40) / viewport.width, 0.3), 4);
        setScale(prev => (Math.abs(prev - next) < 0.005 ? prev : next));
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [pdf, page, fitMode]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayer: pdfjsLib.TextLayer | null = null;
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
      task = p.render({ canvas, canvasContext: ctx, viewport });
      task.promise.catch(() => {});
      // Selectable text layer — transparent spans over the canvas glyphs.
      // Rebuilt per page/zoom render; pdf.js reads --total-scale-factor for
      // span font-size and the container's own width/height.
      const textEl = textLayerRef.current;
      if (textEl) {
        textEl.replaceChildren();
        textEl.style.setProperty('--total-scale-factor', String(viewport.scale));
        textLayer = new pdfjsLib.TextLayer({
          textContentSource: p.streamTextContent(),
          container: textEl,
          viewport,
        });
        textLayer.render().then(() => {
          if (cancelled) return;
          const end = document.createElement('div');
          end.className = 'endOfContent';
          textEl.append(end);
        }).catch(() => {});
      }
    });
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, page, scale]);

  // End a selection drag wherever the pointer is released — the .selecting
  // class is added on pointerdown in the layer itself (see JSX below).
  useEffect(() => {
    const up = () => textLayerRef.current?.classList.remove('selecting');
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

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

  // Re-arm fit mode. The auto-fit effect picks the new scale on its next
  // tick once `fitMode` flips to true.
  const fitWidth = () => setFitMode(true);

  // Wheel and keyboard page navigation. Only takes the wheel event when
  // the container is at the top/bottom edge — otherwise normal scroll
  // moves through a tall page first, matching native PDF readers.
  const onWheelPage = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!pdf) return;
    if (e.ctrlKey || e.metaKey) return; // browser-zoom shortcut, leave alone
    const el = containerRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if (e.deltaY > 0 && atBottom && page < totalPages) {
      e.preventDefault();
      setPage(p => Math.min(totalPages, p + 1));
      // Land at the top of the next page so wheel-down keeps reading
      // forward. requestAnimationFrame so the canvas has a tick to
      // resize before we scroll.
      requestAnimationFrame(() => { if (containerRef.current) containerRef.current.scrollTop = 0; });
    } else if (e.deltaY < 0 && atTop && page > 1) {
      e.preventDefault();
      setPage(p => Math.max(1, p - 1));
      requestAnimationFrame(() => {
        if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
      });
    }
  };
  const onKeyPage = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!pdf) return;
    // Ignore keyboard nav when an input/textarea has focus.
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) return;
    if (e.key === 'PageDown' || e.key === 'ArrowRight') {
      if (page < totalPages) { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }
    } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
      if (page > 1) { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }
    } else if (e.key === 'Home') {
      e.preventDefault(); setPage(1);
    } else if (e.key === 'End') {
      e.preventDefault(); setPage(totalPages);
    }
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
        <button
          onClick={() => { setFitMode(false); setScale(s => Math.max(0.3, Math.round((s - 0.25) * 100) / 100)); }}
          className={btn}
        >−</button>
        <select
          value={fitMode ? 'fit' : (ZOOM_PRESETS.includes(Math.round(scale * 100)) ? Math.round(scale * 100) : 'custom')}
          onChange={e => {
            const v = e.target.value;
            if (v === 'fit') { setFitMode(true); return; }
            if (v !== 'custom') { setFitMode(false); setScale(Number(v) / 100); }
          }}
          className="bg-transparent hover:bg-gray-200 rounded px-1 py-1 text-gray-600 tabular-nums cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
          title="Zoom"
        >
          <option value="fit">Fit</option>
          {!fitMode && !ZOOM_PRESETS.includes(Math.round(scale * 100)) && (
            <option value="custom">{Math.round(scale * 100)}%</option>
          )}
          {ZOOM_PRESETS.map(p => <option key={p} value={p}>{p}%</option>)}
        </select>
        <button
          onClick={() => { setFitMode(false); setScale(s => Math.min(4, Math.round((s + 0.25) * 100) / 100)); }}
          className={btn}
        >+</button>
        <button
          onClick={fitWidth}
          className={btn + (fitMode ? ' bg-gray-200 text-gray-900' : '')}
          title="Fit page width — auto-tracks the window size until you zoom manually"
        >Fit</button>
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

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-100 outline-none"
        // tabIndex makes the scroll container itself focusable so PageUp /
        // PageDown / Arrow keys are captured even when no inner element
        // has focus (e.g. right after the panel mounts). Wheel handler
        // page-flips when the user reaches the top/bottom of a long page.
        tabIndex={0}
        onWheel={onWheelPage}
        onKeyDown={onKeyPage}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading PDF...</div>
        ) : (
          <div className="min-h-full flex items-center justify-center p-4">
            <style>{TEXT_LAYER_CSS}</style>
            <div className="relative shadow-lg rounded">
              <canvas ref={canvasRef} className="block rounded" />
              <div
                ref={textLayerRef}
                className="preview-pdf-textlayer"
                onPointerDown={e => e.currentTarget.classList.add('selecting')}
              />
            </div>
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

/** AutoCAD drawing/editing commands we recognise (so the muscle-memory
 *  user gets a helpful "viewer is read-only" echo instead of a generic
 *  unknown-command error). Alias → canonical name. */
const DXF_EDIT_COMMANDS: Record<string, string> = {
  l: 'LINE', line: 'LINE', pl: 'PLINE', pline: 'PLINE',
  ex: 'EXTEND', extend: 'EXTEND', tr: 'TRIM', trim: 'TRIM',
  e: 'ERASE', erase: 'ERASE', m: 'MOVE', move: 'MOVE',
  co: 'COPY', cp: 'COPY', copy: 'COPY', o: 'OFFSET', offset: 'OFFSET',
  f: 'FILLET', fillet: 'FILLET', cha: 'CHAMFER', chamfer: 'CHAMFER',
  x: 'EXPLODE', explode: 'EXPLODE', mi: 'MIRROR', mirror: 'MIRROR',
  ro: 'ROTATE', rotate: 'ROTATE', sc: 'SCALE', scale: 'SCALE',
  s: 'STRETCH', stretch: 'STRETCH', ar: 'ARRAY', array: 'ARRAY',
  rec: 'RECTANG', rectang: 'RECTANG', rectangle: 'RECTANG',
  c: 'CIRCLE', circle: 'CIRCLE', a: 'ARC', arc: 'ARC',
  el: 'ELLIPSE', ellipse: 'ELLIPSE', t: 'MTEXT', mt: 'MTEXT', mtext: 'MTEXT', text: 'TEXT',
  b: 'BLOCK', block: 'BLOCK', i: 'INSERT', insert: 'INSERT', ha: 'HATCH', hatch: 'HATCH',
};

const DXF_CMD_HELP = 'Commands: DI distance · DIM/DLI linear dim · H / V force axis · <number> lock Δ · U undo pick · Z fit · LA layers · Esc exit';

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
  // Four modes (pill next to the Measure button, or typed commands):
  //   - Auto:  AutoCAD DIMLINEAR — measures ΔX or ΔY, whichever delta is
  //            larger between the two picks.
  //   - H / V: force the axis (DIMLINEAR Horizontal / Vertical).
  //   - Point: straight-line (Euclidean) distance, AutoCAD DIST.
  //
  // All visuals (markers, line, distance label, snap indicator) are HTML/
  // SVG overlays positioned via camera projection — fixed pixel size, so
  // they don't grow into giant orange blobs when the user zooms in.
  // Snapping (endpoint / node / midpoint / intersection / nearest-on-line)
  // is computed in screen space against a cached list of every line
  // segment and point in the scene (built once per measure session).
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measureMode, setMeasureMode] = useState<'point' | 'horizontal' | 'vertical' | 'auto'>('auto');
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  /** Axis the current measurement actually resolved to — differs from
   *  measureMode when mode is 'auto' (DIMLINEAR picks the dominant axis).
   *  Drives the toolbar chip arrow/tooltip. */
  const [measureResolved, setMeasureResolved] = useState<'point' | 'horizontal' | 'vertical' | null>(null);
  /** When set in H or V mode, the second pick's X (H) or Y (V) snaps to
   *  the first pick's coord + this value, sign-matched to whichever side
   *  of A the user clicked on. The displayed measurement then becomes
   *  the perpendicular distance (Δy in H, Δx in V) — useful for "feature
   *  is 30mm horizontal from A; how far is it vertically?" workflows. */
  const [measureFixedDist, setMeasureFixedDist] = useState<number | null>(null);
  /** Raw text in the fixed-distance input — kept separate so partial
   *  edits (e.g. just "-") don't clobber the parsed value with NaN. */
  const [measureFixedInput, setMeasureFixedInput] = useState('');
  // Refs that mirror the React state so the main measure effect can read
  // the current values without rebuilding when the user switches mode or
  // changes the fixed distance — picks are preserved across these
  // changes.
  const measureModeRef = useRef(measureMode);
  const measureFixedDistRef = useRef(measureFixedDist);
  useEffect(() => { measureModeRef.current = measureMode; }, [measureMode]);
  useEffect(() => { measureFixedDistRef.current = measureFixedDist; }, [measureFixedDist]);
  /** Exposed by the measure effect so other effects can ask it to redraw
   *  using the current refs (e.g. after mode / fixed-distance change). */
  const measureRedrawRef = useRef<(() => void) | null>(null);
  /** Exposed by the measure effect — clears the current picks/markers so a
   *  typed command (DI, DIM, …) starts a fresh measurement. */
  const measureResetRef = useRef<(() => void) | null>(null);
  /** Exposed by the measure effect — removes the last pick (command U). */
  const measureUndoRef = useRef<(() => void) | null>(null);

  // AutoCAD-style command bar (bottom of the panel). Typing anywhere on
  // the drawing routes keystrokes into the input; Enter/Space executes,
  // Enter on an empty line repeats the last command, Esc cancels.
  const [cmdValue, setCmdValue] = useState('');
  const [cmdEcho, setCmdEcho] = useState<string | null>(null);
  const lastCmdRef = useRef('');
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<{
    /** Effective scene points used for the measurement, at most two.
     *  In a fixed-distance scenario, picks[1] is the *locked* position
     *  (axis-snapped to A + fixed), not the raw click. */
    picks: { x: number; y: number }[];
    /** Raw second-pick click position, kept separately so we can
     *  re-derive picks[1] when measureFixedDist changes without
     *  forcing the user to re-pick. */
    rawSecondClick: { x: number; y: number } | null;
    /** Imperative DOM nodes — recreated on each enable. */
    overlay: HTMLDivElement | null;
    svg: SVGSVGElement | null;
    /** Main dim line (B-leg in fixed-distance mode). */
    line: SVGLineElement | null;
    /** Fixed-axis leg (A → R) shown only when measureFixedDist is set. */
    fixedLine: SVGLineElement | null;
    /** Label for the fixed-axis leg. */
    fixedLabel: HTMLDivElement | null;
    /** Dashed extension of the dim-axis through the first pick. */
    refLine: SVGLineElement | null;
    /** AutoCAD-style extension lines from each pick to the dim line. */
    extLineA: SVGLineElement | null;
    extLineB: SVGLineElement | null;
    /** Second dashed ref line — vertical axis, used by V and Auto modes. */
    refLineV: SVGLineElement | null;
    markers: HTMLDivElement[];
    label: HTMLDivElement | null;
    snap: HTMLDivElement | null;
    /** Cached scene-space segment endpoints, flat [ax,ay,bx,by,…] — built
     *  once per measure session; used for snap detection on pointer move.
     *  Instance transforms (INSERT blocks) are baked in at build time. */
    segs: Float64Array | null;
    /** Cached POINT-entity coords, flat [x,y,…] — node snap targets. */
    nodes: Float64Array | null;
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
  // All visuals (markers, line, label, extension lines, snap indicator)
  // are HTML / SVG overlays positioned via camera projection — they stay
  // constant size in pixels regardless of zoom, so they never balloon
  // into giant orange blobs as the user zooms in.
  //
  // Snapping is computed in *screen space* against a cached list of every
  // line segment and POINT entity in the dxf-viewer scene. The cache walk
  // must mirror dxf-viewer's GPU data layout exactly: positions are
  // TWO-component (x,y) buffer attributes, long polylines are *indexed*
  // (vertex pairs come from the index buffer), and INSERT block geometry
  // is *instanced* — the per-insert 2×3 affine lives in
  // instanceTransform0/1 (FULL) or instanceTransform (POINT translation)
  // attributes and is applied in the vertex shader, never in matrixWorld.
  // So the builder reads via BufferAttribute.getX/getY, follows the index
  // buffer when present, and bakes every instance transform into the
  // cached world-space coords.
  //
  // Snap priority is AutoCAD-flavoured: a real geometric point beats
  // "somewhere along a line" even when the line passes closer to the
  // cursor — intersection/endpoint/node (closest wins, ties to
  // intersection) > midpoint > nearest-on-line, all within an 18 px
  // tolerance. Without the tiering, the projection of the cursor onto a
  // hovered segment is always nearer than the segment's endpoint, which
  // made endpoint snapping nearly impossible.
  //
  // Four modes via an Auto | H | V | Point pill next to Measure (also
  // reachable from the command bar: DIM/DLI, H, V, DI):
  //   - Auto:  AutoCAD DIMLINEAR — measures along the dominant axis of
  //            the two picks (|Δx| ≥ |Δy| → horizontal, else vertical).
  //   - H:     distance along the X axis (|Δx|). Dim line drawn through
  //            pick A horizontally, ending at pick B's projected X.
  //   - V:     distance along the Y axis (|Δy|). Dim line drawn through
  //            pick A vertically, ending at pick B's projected Y.
  //   - Point: straight-line (Euclidean) distance between two picks.
  //
  // All dimensions render AutoCAD DIMLINEAR-style — arrow heads at both
  // ends, plus an extension line dropping from the second pick to the
  // dim line in H/V mode.
  //
  // H/V also accept a *fixed-distance* input. When set, the second pick's
  // X (in H) or Y (in V) snaps to the first pick's coord plus that value
  // (signed by which side of A the user clicked), and the displayed
  // measurement becomes the *perpendicular* component — i.e. "this
  // feature is 30mm horizontally from A; how far is it vertically?". The
  // chain dim renders both legs: a fixed-value leg from A → R, and the
  // perpendicular measurement leg from R → B.
  //
  // Switching mode or editing the fixed distance preserves the two picks
  // — the overlay just re-renders. The main setup effect therefore
  // intentionally does not depend on measureMode / measureFixedDist; a
  // smaller effect calls measureRedrawRef.current() on those changes.
  // ──────────────────────────────────────────────────────────────────────
  const layersKey = layers.map(l => (l.visible ? '1' : '0')).join('');
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
      setMeasureResolved(null);
      return;
    }

    // ── HTML overlay scaffold ──────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;';
    containerRef.current.appendChild(overlay);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;');
    // AutoCAD-style arrowhead, applied to the dim line via marker-start /
    // marker-end. orient="auto-start-reverse" makes the same marker point
    // outward at *both* ends, so one definition covers both arrows.
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'dxf-measure-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowPath.setAttribute('fill', '#ff8800');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);
    overlay.appendChild(svg);

    // Dashed extension of the dim-axis through the first pick. Drawn first
    // so the solid dim line renders on top. Two of them — horizontal and
    // vertical — Auto mode shows both until the second pick resolves the
    // axis, H/V show their own.
    const mkRefLine = () => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      el.setAttribute('stroke', '#ff8800');
      el.setAttribute('stroke-width', '1');
      el.setAttribute('stroke-dasharray', '6,4');
      el.setAttribute('opacity', '0.55');
      el.style.display = 'none';
      svg.appendChild(el);
      return el;
    };
    const refLineEl = mkRefLine();
    const refLineVEl = mkRefLine();

    // AutoCAD-style extension lines — thin solid lines from each pick to
    // the dim line. Drawn before the dim line so the dim line + arrows
    // render on top.
    const extLineA = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    extLineA.setAttribute('stroke', '#ff8800');
    extLineA.setAttribute('stroke-width', '1');
    extLineA.setAttribute('opacity', '0.85');
    extLineA.style.display = 'none';
    svg.appendChild(extLineA);
    const extLineB = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    extLineB.setAttribute('stroke', '#ff8800');
    extLineB.setAttribute('stroke-width', '1');
    extLineB.setAttribute('opacity', '0.85');
    extLineB.style.display = 'none';
    svg.appendChild(extLineB);

    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineEl.setAttribute('stroke', '#ff8800');
    lineEl.setAttribute('stroke-width', '1.5');
    lineEl.setAttribute('stroke-linecap', 'round');
    lineEl.style.display = 'none';
    svg.appendChild(lineEl);

    // Second dim line — only used in fixed-distance mode, drawing the
    // A→R "locked" segment. Visually identical to lineEl so they read as
    // one continuous AutoCAD chain dim.
    const fixedLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    fixedLineEl.setAttribute('stroke', '#ff8800');
    fixedLineEl.setAttribute('stroke-width', '1.5');
    fixedLineEl.setAttribute('stroke-linecap', 'round');
    fixedLineEl.style.display = 'none';
    svg.appendChild(fixedLineEl);

    // AutoCAD-style snap indicator — one container, three glyphs swapped
    // by setSnapGlyph() based on what was matched: square for endpoint,
    // X for intersection, bowtie/hourglass for nearest-on-line.
    const snapEl = document.createElement('div');
    snapEl.style.cssText = `position:absolute;transform:translate(-50%,-50%);pointer-events:none;display:none;`;
    const SVGNS = 'http://www.w3.org/2000/svg';
    const snapSvg = document.createElementNS(SVGNS, 'svg');
    snapSvg.setAttribute('width', '22');
    snapSvg.setAttribute('height', '22');
    snapSvg.setAttribute('viewBox', '0 0 22 22');
    snapSvg.setAttribute('style', 'overflow:visible;display:block');
    snapEl.appendChild(snapSvg);
    const mkSnapGlyph = (build: (g: SVGGElement) => void): SVGGElement => {
      const g = document.createElementNS(SVGNS, 'g');
      build(g);
      g.style.display = 'none';
      snapSvg.appendChild(g);
      return g;
    };
    // Endpoint — hollow square (filled white, orange stroke)
    const snapGlyphEndpoint = mkSnapGlyph((g) => {
      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('x', '4');  r.setAttribute('y', '4');
      r.setAttribute('width', '14'); r.setAttribute('height', '14');
      r.setAttribute('fill', 'rgba(255,255,255,0.9)');
      r.setAttribute('stroke', '#ff8800');
      r.setAttribute('stroke-width', '1.8');
      g.appendChild(r);
    });
    // Intersection — X (two crossing diagonals)
    const snapGlyphIntersection = mkSnapGlyph((g) => {
      const mkLn = (x1: number, y1: number, x2: number, y2: number) => {
        const ln = document.createElementNS(SVGNS, 'line');
        ln.setAttribute('x1', String(x1)); ln.setAttribute('y1', String(y1));
        ln.setAttribute('x2', String(x2)); ln.setAttribute('y2', String(y2));
        ln.setAttribute('stroke', '#ff8800');
        ln.setAttribute('stroke-width', '2.2');
        ln.setAttribute('stroke-linecap', 'round');
        return ln;
      };
      g.appendChild(mkLn(4, 4, 18, 18));
      g.appendChild(mkLn(18, 4, 4, 18));
    });
    // Line ("nearest") — bowtie / hourglass
    const snapGlyphLine = mkSnapGlyph((g) => {
      const poly = document.createElementNS(SVGNS, 'polygon');
      poly.setAttribute('points', '4,4 18,4 4,18 18,18');
      poly.setAttribute('fill', 'rgba(255,255,255,0.9)');
      poly.setAttribute('stroke', '#ff8800');
      poly.setAttribute('stroke-width', '1.8');
      poly.setAttribute('stroke-linejoin', 'round');
      g.appendChild(poly);
    });
    // Midpoint — triangle
    const snapGlyphMidpoint = mkSnapGlyph((g) => {
      const poly = document.createElementNS(SVGNS, 'polygon');
      poly.setAttribute('points', '11,3 19,18 3,18');
      poly.setAttribute('fill', 'rgba(255,255,255,0.9)');
      poly.setAttribute('stroke', '#ff8800');
      poly.setAttribute('stroke-width', '1.8');
      poly.setAttribute('stroke-linejoin', 'round');
      g.appendChild(poly);
    });
    // Node (POINT entity) — circle with an X through it
    const snapGlyphNode = mkSnapGlyph((g) => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '7');
      c.setAttribute('fill', 'rgba(255,255,255,0.9)');
      c.setAttribute('stroke', '#ff8800');
      c.setAttribute('stroke-width', '1.8');
      g.appendChild(c);
      const mkLn = (x1: number, y1: number, x2: number, y2: number) => {
        const ln = document.createElementNS(SVGNS, 'line');
        ln.setAttribute('x1', String(x1)); ln.setAttribute('y1', String(y1));
        ln.setAttribute('x2', String(x2)); ln.setAttribute('y2', String(y2));
        ln.setAttribute('stroke', '#ff8800');
        ln.setAttribute('stroke-width', '1.6');
        ln.setAttribute('stroke-linecap', 'round');
        return ln;
      };
      g.appendChild(mkLn(6.5, 6.5, 15.5, 15.5));
      g.appendChild(mkLn(15.5, 6.5, 6.5, 15.5));
    });
    type SnapType = 'endpoint' | 'intersection' | 'line' | 'midpoint' | 'node';
    const setSnapGlyph = (type: SnapType) => {
      snapGlyphEndpoint.style.display = type === 'endpoint' ? '' : 'none';
      snapGlyphIntersection.style.display = type === 'intersection' ? '' : 'none';
      snapGlyphLine.style.display = type === 'line' ? '' : 'none';
      snapGlyphMidpoint.style.display = type === 'midpoint' ? '' : 'none';
      snapGlyphNode.style.display = type === 'node' ? '' : 'none';
    };
    overlay.appendChild(snapEl);

    measureRef.current = {
      picks: [],
      rawSecondClick: null,
      overlay, svg, line: lineEl, fixedLine: fixedLineEl, fixedLabel: null, refLine: refLineEl,
      refLineV: refLineVEl,
      extLineA, extLineB,
      markers: [], label: null, snap: snapEl,
      segs: null,
      nodes: null,
    };

    // ── THREE.Vector3 for projection math — plucked from the scene ─
    //
    // We need THREE.Vector3 to project/unproject through the camera, but
    // we must NOT `import('three')`. Under a consumer that installs
    // dxf-viewer without a top-level `three` (e.g. pnpm strict
    // node_modules, where `three` is only a transitive dep of
    // dxf-viewer), the bare import is left external and rejects at
    // runtime — THREE stays null, pxFromScene returns its {0,0} fallback,
    // and the whole measure overlay collapses to a zero-length segment at
    // the origin (EFFICIENT BG#00184). Instead pluck the Vector3
    // constructor from dxf-viewer's own scene/camera (both Object3D-
    // derived, so `.position` is guaranteed to be a Vector3 from the
    // bundled THREE). project/unproject only read camera.projectionMatrix
    // / matrixWorldInverse, so a cross-instance Vector3 is safe here —
    // unlike the 3D Raycaster instanceof case, which is why that path
    // routes through OV's own picking instead.
    const Vector3Ctor: any =
      camera?.position?.constructor ?? scene?.position?.constructor ?? null;
    let ready = false;

    // Unproject canvas (CSS) px → scene coords (matches dxf-viewer's
    // private _CanvasToSceneCoord).
    const sceneFromPx = (cx: number, cy: number) => {
      if (!Vector3Ctor) return null;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const v3 = new Vector3Ctor(cx * 2 / w - 1, -cy * 2 / h + 1, 1).unproject(camera);
      return { x: v3.x, y: v3.y };
    };
    // Project scene coords → canvas (CSS) px.
    const pxFromScene = (sx: number, sy: number) => {
      if (!Vector3Ctor) return { x: 0, y: 0 };
      const v3 = new Vector3Ctor(sx, sy, 0).project(camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      return { x: (v3.x + 1) / 2 * w, y: (-v3.y + 1) / 2 * h };
    };

    // Build the snap cache. The walk must match dxf-viewer's GPU layout —
    // see the block comment above: 2-component positions read via getX/getY
    // (NOT raw array triplets), index buffer followed for INDEXED_LINES, and
    // per-instance INSERT transforms baked in (they live in instance
    // attributes and are applied in the vertex shader, so matrixWorld is
    // always identity). traverseVisible skips layers hidden before the
    // measure session started. No THREE needed here — every read goes
    // through the BufferAttribute's own getX/getY accessors.
    const MAX_SNAP_SEGS = 400_000;
    (() => {
      try {
        const st = measureRef.current;
        if (!st) return;
        const segXY: number[] = [];
        const nodeXY: number[] = [];
        let truncated = false;
        // Per-instance 2×3 affines [m00, m01, tx, m10, m11, ty] for a
        // geometry; a single identity when the geometry isn't instanced.
        const instanceXforms = (g: any): number[][] => {
          const t0 = g?.attributes?.instanceTransform0;
          const t1 = g?.attributes?.instanceTransform1;
          if (t0 && t1) {
            const out: number[][] = [];
            const n = Math.min(t0.count, t1.count);
            for (let k = 0; k < n; k++) {
              out.push([t0.getX(k), t0.getY(k), t0.getZ(k), t1.getX(k), t1.getY(k), t1.getZ(k)]);
            }
            return out;
          }
          const tp = g?.attributes?.instanceTransform;
          if (tp) {
            const out: number[][] = [];
            for (let k = 0; k < tp.count; k++) out.push([1, 0, tp.getX(k), 0, 1, tp.getY(k)]);
            return out;
          }
          return [[1, 0, 0, 0, 1, 0]];
        };
        const visit = (obj: any) => {
          const isSeg = !!obj?.isLineSegments;
          const isPts = !!obj?.isPoints;
          if (!isSeg && !isPts) return;
          const g = obj.geometry;
          const pos = g?.attributes?.position;
          if (!pos) return;
          const xfs = instanceXforms(g);
          if (isSeg) {
            const idx = g.index;
            const pairCount = Math.floor((idx ? idx.count : pos.count) / 2);
            for (let p = 0; p < pairCount; p++) {
              const ia = idx ? idx.getX(2 * p) : 2 * p;
              const ib = idx ? idx.getX(2 * p + 1) : 2 * p + 1;
              const ax = pos.getX(ia), ay = pos.getY(ia);
              const bx = pos.getX(ib), by = pos.getY(ib);
              if (!Number.isFinite(ax + ay + bx + by)) continue;
              for (const m of xfs) {
                if (segXY.length >= MAX_SNAP_SEGS * 4) { truncated = true; return; }
                const tax = m[0] * ax + m[1] * ay + m[2], tay = m[3] * ax + m[4] * ay + m[5];
                const tbx = m[0] * bx + m[1] * by + m[2], tby = m[3] * bx + m[4] * by + m[5];
                if (tax === tbx && tay === tby) continue; // degenerate
                segXY.push(tax, tay, tbx, tby);
              }
            }
          } else {
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), y = pos.getY(i);
              if (!Number.isFinite(x + y)) continue;
              for (const m of xfs) {
                nodeXY.push(m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]);
              }
            }
          }
        };
        if (typeof scene.traverseVisible === 'function') scene.traverseVisible(visit);
        else scene.traverse(visit);
        st.segs = new Float64Array(segXY);
        st.nodes = new Float64Array(nodeXY);
        if (truncated) {
          // eslint-disable-next-line no-console
          console.warn(`[Preview] DXF snap cache truncated at ${MAX_SNAP_SEGS} segments — snapping may miss some geometry.`);
        }
        ready = true;
      } catch {}
    })();

    // ── Snap detection in screen space ────────────────────────────
    // Tolerance in CSS px from the cursor to a candidate snap target.
    // 18 px is wide enough to feel "sticky" without overlapping nearby
    // unrelated features on dense drawings.
    const SNAP_PX = 18;
    // Screen-space segment ↔ segment intersection. Operates directly on
    // the projected endpoints (which dxf-viewer's orthographic camera
    // turns into a linear scene→screen map), so the returned point is
    // already in pixel coords — no extra pxFromScene needed in the hot
    // pairwise loop. Returns the screen-space crossing AND the
    // parametric t along segment A, which we use to recover the
    // scene-space intersection by linear interp on A's scene endpoints.
    const segSegIntersectPx = (
      apx: number, apy: number, bpx: number, bpy: number,
      cpx: number, cpy: number, dpx: number, dpy: number,
    ) => {
      const d = (bpx - apx) * (dpy - cpy) - (bpy - apy) * (dpx - cpx);
      if (Math.abs(d) < 1e-9) return null;
      const t = ((cpx - apx) * (dpy - cpy) - (cpy - apy) * (dpx - cpx)) / d;
      const u = ((cpx - apx) * (bpy - apy) - (cpy - apy) * (bpx - apx)) / d;
      const eps = 1e-4;
      if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
      return { px: apx + t * (bpx - apx), py: apy + t * (bpy - apy), t };
    };

    const findSnap = (cx: number, cy: number) => {
      const s = measureRef.current;
      if (!s || !ready || !s.segs) return null;
      // Scene→px affine, derived once per call from three probe points —
      // exact for dxf-viewer's orthographic camera, and far cheaper than
      // a Vector3.project per endpoint per mousemove.
      const o = pxFromScene(0, 0);
      const ex = pxFromScene(1, 0);
      const ey = pxFromScene(0, 1);
      const mxx = ex.x - o.x, mxy = ex.y - o.y;
      const myx = ey.x - o.x, myy = ey.y - o.y;
      const det = mxx * myy - myx * mxy;
      if (!det) return null;
      // Cursor in scene coords (inverse affine) + per-axis scene-space
      // tolerance — a cheap bbox cull before any projection math.
      const csx = ((cx - o.x) * myy - (cy - o.y) * myx) / det;
      const csy = ((cy - o.y) * mxx - (cx - o.x) * mxy) / det;
      const rx = SNAP_PX / (Math.hypot(mxx, mxy) || 1);
      const ry = SNAP_PX / (Math.hypot(myx, myy) || 1);
      const minX = csx - rx, maxX = csx + rx, minY = csy - ry, maxY = csy + ry;

      const T2 = SNAP_PX * SNAP_PX;
      type Snap = { sx: number; sy: number; type: 'endpoint' | 'node' | 'midpoint' | 'line' | 'intersection' };
      // Tiered bests — see the block comment up top for the priority
      // rationale (endpoint must be reachable while hovering its own
      // segment, so "nearest-on-line" lives in a lower tier).
      let bestPt: Snap | null = null, dPt = T2;     // endpoint + node
      let bestMid: Snap | null = null, dMid = T2;   // midpoint
      let bestLine: Snap | null = null, dLine = T2; // nearest-on-line
      let bestX: Snap | null = null, dX = T2;       // intersection
      const cand: { ax: number; ay: number; bx: number; by: number; apx: number; apy: number; bpx: number; bpy: number }[] = [];

      const segs = s.segs;
      for (let i = 0; i < segs.length; i += 4) {
        const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
        if ((ax < minX && bx < minX) || (ax > maxX && bx > maxX) ||
            (ay < minY && by < minY) || (ay > maxY && by > maxY)) continue;
        const apx = o.x + mxx * ax + myx * ay, apy = o.y + mxy * ax + myy * ay;
        const bpx = o.x + mxx * bx + myx * by, bpy = o.y + mxy * bx + myy * by;
        let near = false;
        // Endpoints
        let dx = cx - apx, dy = cy - apy;
        let d2 = dx * dx + dy * dy;
        if (d2 < T2) { near = true; if (d2 < dPt) { dPt = d2; bestPt = { sx: ax, sy: ay, type: 'endpoint' }; } }
        dx = cx - bpx; dy = cy - bpy;
        d2 = dx * dx + dy * dy;
        if (d2 < T2) { near = true; if (d2 < dPt) { dPt = d2; bestPt = { sx: bx, sy: by, type: 'endpoint' }; } }
        // Midpoint
        dx = cx - (apx + bpx) / 2; dy = cy - (apy + bpy) / 2;
        d2 = dx * dx + dy * dy;
        if (d2 < T2) { near = true; if (d2 < dMid) { dMid = d2; bestMid = { sx: (ax + bx) / 2, sy: (ay + by) / 2, type: 'midpoint' }; } }
        // Nearest point on segment (in screen space).
        const sdx = bpx - apx, sdy = bpy - apy;
        const len2 = sdx * sdx + sdy * sdy;
        if (len2 > 0) {
          const t = ((cx - apx) * sdx + (cy - apy) * sdy) / len2;
          if (t > 0 && t < 1) {
            dx = cx - (apx + t * sdx); dy = cy - (apy + t * sdy);
            d2 = dx * dx + dy * dy;
            if (d2 < T2) {
              near = true;
              if (d2 < dLine) { dLine = d2; bestLine = { sx: ax + t * (bx - ax), sy: ay + t * (by - ay), type: 'line' }; }
            }
          }
        }
        if (near) cand.push({ ax, ay, bx, by, apx, apy, bpx, bpy });
      }

      // POINT entities — node snaps, same tier as endpoints.
      const nodes = s.nodes;
      if (nodes) {
        for (let i = 0; i < nodes.length; i += 2) {
          const x = nodes[i], y = nodes[i + 1];
          if (x < minX || x > maxX || y < minY || y > maxY) continue;
          const dx = cx - (o.x + mxx * x + myx * y);
          const dy = cy - (o.y + mxy * x + myy * y);
          const d2 = dx * dx + dy * dy;
          if (d2 < dPt) { dPt = d2; bestPt = { sx: x, sy: y, type: 'node' }; }
        }
      }

      // Pairwise intersections among the near segments — checked entirely
      // in screen space; the scene-space crossing is recovered by linear
      // interp on segment A (exact for the orthographic camera).
      for (let i = 0; i < cand.length; i++) {
        const A = cand[i];
        for (let j = i + 1; j < cand.length; j++) {
          const B = cand[j];
          const ix = segSegIntersectPx(A.apx, A.apy, A.bpx, A.bpy, B.apx, B.apy, B.bpx, B.bpy);
          if (!ix) continue;
          const dx = cx - ix.px, dy = cy - ix.py;
          const d2 = dx * dx + dy * dy;
          if (d2 >= T2 || d2 >= dX) continue;
          dX = d2;
          bestX = { sx: A.ax + ix.t * (A.bx - A.ax), sy: A.ay + ix.t * (A.by - A.ay), type: 'intersection' };
        }
      }

      // Priority: intersection and endpoint/node co-rank, then midpoint,
      // then nearest-on-line. Where two segments share a corner the
      // "intersection" lands on the endpoint itself — prefer the endpoint
      // glyph there (AutoCAD shows the square at corners), so the
      // intersection only wins when it's clearly closer (> 1 px² margin).
      const top = bestX && bestPt ? (dX < dPt - 1 ? bestX : bestPt) : (bestX ?? bestPt);
      return top ?? bestMid ?? bestLine;
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
      // Park the label off-screen on creation so it never flashes at (0,0)
      // — callers always set left/top before showing it, but the browser
      // would otherwise lay it out at the overlay's top-left corner the
      // first frame after appendChild.
      el.style.cssText = `position:absolute;left:-9999px;top:-9999px;transform:translate(-50%,-50%);padding:2px 6px;font-size:11px;font-weight:600;font-family:system-ui,-apple-system,sans-serif;background:rgba(255,136,0,0.95);color:#fff;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);pointer-events:none;`;
      overlay.appendChild(el);
      s.label = el;
      return el;
    };

    const positionMarker = (el: HTMLDivElement, x: number, y: number) => {
      const p = pxFromScene(x, y);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    };

    // Resolve picks[1] from the raw click + active fixedDist. In a
    // fixed-distance H/V scenario the X (or Y) is snapped to A's coord +
    // fixedDist, sign-matched to which side of A the user clicked, so
    // the marker visually sits at the *locked* position even though the
    // click landed elsewhere. Mutates s.picks[1] in place.
    const reconcileLockedPick = () => {
      const s = measureRef.current;
      if (!s || !s.rawSecondClick || s.picks.length < 2) return;
      const a = s.picks[0];
      const raw = s.rawSecondClick;
      const fixed = measureFixedDistRef.current;
      const mode = measureModeRef.current;
      if (fixed !== null && Number.isFinite(fixed) && (mode === 'horizontal' || mode === 'vertical')) {
        if (mode === 'horizontal') {
          const sign = raw.x >= a.x ? 1 : -1;
          s.picks[1] = { x: a.x + sign * Math.abs(fixed), y: raw.y };
        } else {
          const sign = raw.y >= a.y ? 1 : -1;
          s.picks[1] = { x: raw.x, y: a.y + sign * Math.abs(fixed) };
        }
      } else {
        s.picks[1] = { x: raw.x, y: raw.y };
      }
    };

    // Resolve the effective measure mode. 'auto' (AutoCAD DIMLINEAR)
    // measures along the dominant axis of the two picks; everything else
    // passes through. With fewer than two picks auto defaults to
    // horizontal — callers that care about the unresolved state (ref
    // lines) check the raw mode themselves.
    const resolveMode = (a?: { x: number; y: number }, b?: { x: number; y: number }): 'point' | 'horizontal' | 'vertical' => {
      const mode = measureModeRef.current;
      if (mode !== 'auto') return mode;
      if (!a || !b) return 'horizontal';
      return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'horizontal' : 'vertical';
    };

    // Endpoints of the *main* dim line (always rendered when picks=2).
    // In fixed mode this is the leg from R to B (perpendicular to the
    // fixed axis). Without a fixed distance it's the regular H / V / Point
    // line.
    const computeMainDimEnds = () => {
      const s = measureRef.current!;
      const a = s.picks[0];
      const b = s.picks[1];
      const mode = resolveMode(a, b);
      // Fixed distances only apply in *explicit* H/V — a value left over
      // from H mode must not activate when the user switches to Auto.
      const rawMode = measureModeRef.current;
      const fixed = measureFixedDistRef.current;
      if (fixed !== null && Number.isFinite(fixed) && rawMode === 'horizontal') {
        // Fixed H: main leg is vertical at b.x, from a.y to b.y.
        return { from: { x: b.x, y: a.y }, to: { x: b.x, y: b.y } };
      }
      if (fixed !== null && Number.isFinite(fixed) && rawMode === 'vertical') {
        // Fixed V: main leg is horizontal at b.y, from a.x to b.x.
        return { from: { x: a.x, y: b.y }, to: { x: b.x, y: b.y } };
      }
      if (mode === 'horizontal') return { from: a, to: { x: b.x, y: a.y } };
      if (mode === 'vertical')   return { from: a, to: { x: a.x, y: b.y } };
      return { from: a, to: b };
    };

    const updateOverlay = () => {
      const s = measureRef.current;
      if (!s) return;
      reconcileLockedPick();
      const rawMode = measureModeRef.current;
      const fixed = measureFixedDistRef.current;
      const fixedActive = fixed !== null && Number.isFinite(fixed) && (rawMode === 'horizontal' || rawMode === 'vertical');
      // Markers
      if (s.markers[0]) positionMarker(s.markers[0], s.picks[0].x, s.picks[0].y);
      if (s.markers[1]) positionMarker(s.markers[1], s.picks[1].x, s.picks[1].y);
      // Reference-axis preview — dashed line(s) across the canvas through
      // the first pick. H/V show their own axis; Auto shows both until
      // the second pick resolves which one the dimension follows.
      const drawRefLine = (el: SVGLineElement | null, dir: { dx: number; dy: number }, visible: boolean) => {
        if (!el) return;
        if (!visible || s.picks.length < 1) { el.style.display = 'none'; return; }
        const a = s.picks[0];
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const screenSpan = Math.hypot(w, h) * 4;
        const ap = pxFromScene(a.x, a.y);
        const probe = pxFromScene(a.x + dir.dx, a.y + dir.dy);
        const pxLen = Math.hypot(probe.x - ap.x, probe.y - ap.y) || 1;
        const sceneStep = screenSpan / pxLen;
        const p0 = pxFromScene(a.x - dir.dx * sceneStep, a.y - dir.dy * sceneStep);
        const p1 = pxFromScene(a.x + dir.dx * sceneStep, a.y + dir.dy * sceneStep);
        el.setAttribute('x1', String(p0.x));
        el.setAttribute('y1', String(p0.y));
        el.setAttribute('x2', String(p1.x));
        el.setAttribute('y2', String(p1.y));
        el.style.display = '';
      };
      let showH = rawMode === 'horizontal';
      let showV = rawMode === 'vertical';
      if (rawMode === 'auto') {
        if (s.picks.length >= 2) {
          const r = resolveMode(s.picks[0], s.picks[1]);
          showH = r === 'horizontal';
          showV = r === 'vertical';
        } else {
          showH = true;
          showV = true;
        }
      }
      drawRefLine(s.refLine, { dx: 1, dy: 0 }, showH);
      drawRefLine(s.refLineV, { dx: 0, dy: 1 }, showV);
      // Dim line + chain dim (if fixed) + extension lines + label
      if (s.picks.length === 2) {
        const a = s.picks[0], b = s.picks[1];
        const mode = resolveMode(a, b);
        const ends = computeMainDimEnds();
        const fp = pxFromScene(ends.from.x, ends.from.y);
        const tp = pxFromScene(ends.to.x, ends.to.y);
        s.line!.setAttribute('x1', String(fp.x));
        s.line!.setAttribute('y1', String(fp.y));
        s.line!.setAttribute('x2', String(tp.x));
        s.line!.setAttribute('y2', String(tp.y));
        s.line!.setAttribute('marker-start', 'url(#dxf-measure-arrow)');
        s.line!.setAttribute('marker-end', 'url(#dxf-measure-arrow)');
        // Hide the main dim line if it's degenerate (zero-length leg —
        // happens e.g. when picks are collinear in fixed-distance mode).
        const mainLen = Math.hypot(tp.x - fp.x, tp.y - fp.y);
        s.line!.style.display = mainLen > 0.5 ? '' : 'none';

        // Fixed-axis leg (A → R) — only in fixed mode.
        if (fixedActive && s.fixedLine) {
          const r = mode === 'horizontal' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
          const ap = pxFromScene(a.x, a.y);
          const rp = pxFromScene(r.x, r.y);
          s.fixedLine.setAttribute('x1', String(ap.x));
          s.fixedLine.setAttribute('y1', String(ap.y));
          s.fixedLine.setAttribute('x2', String(rp.x));
          s.fixedLine.setAttribute('y2', String(rp.y));
          s.fixedLine.setAttribute('marker-start', 'url(#dxf-measure-arrow)');
          s.fixedLine.setAttribute('marker-end', 'url(#dxf-measure-arrow)');
          s.fixedLine.style.display = '';
          // Fixed-leg label — show the user's entered fixed value.
          const fLabel = ensureFixedLabel();
          fLabel.textContent = formatMeasureDistance(Math.abs(fixed));
          const fcx = (ap.x + rp.x) / 2;
          const fcy = (ap.y + rp.y) / 2;
          fLabel.style.left = `${fcx}px`;
          fLabel.style.top  = `${fcy}px`;
          const w = canvas.clientWidth, h = canvas.clientHeight;
          fLabel.style.display = (fcx < 0 || fcy < 0 || fcx > w || fcy > h) ? 'none' : '';
        } else {
          if (s.fixedLine) s.fixedLine.style.display = 'none';
          if (s.fixedLabel) s.fixedLabel.style.display = 'none';
        }

        // Extension line — drops from second pick to the dim line in
        // free H/V (non-fixed) mode. In fixed mode the chain dim already
        // visually closes the loop, so no extension is needed.
        const extA = s.extLineA!;
        const extB = s.extLineB!;
        if (!fixedActive && mode === 'horizontal' && Math.abs(b.y - a.y) > 1e-9) {
          const p = pxFromScene(b.x, a.y);
          const q = pxFromScene(b.x, b.y);
          extB.setAttribute('x1', String(p.x));
          extB.setAttribute('y1', String(p.y));
          extB.setAttribute('x2', String(q.x));
          extB.setAttribute('y2', String(q.y));
          extB.style.display = '';
          extA.style.display = 'none';
        } else if (!fixedActive && mode === 'vertical' && Math.abs(b.x - a.x) > 1e-9) {
          const p = pxFromScene(a.x, b.y);
          const q = pxFromScene(b.x, b.y);
          extB.setAttribute('x1', String(p.x));
          extB.setAttribute('y1', String(p.y));
          extB.setAttribute('x2', String(q.x));
          extB.setAttribute('y2', String(q.y));
          extB.style.display = '';
          extA.style.display = 'none';
        } else {
          extA.style.display = 'none';
          extB.style.display = 'none';
        }
        // Main-leg label — at the midpoint of the main dim line.
        if (s.label) {
          const cx = (fp.x + tp.x) / 2;
          const cy = (fp.y + tp.y) / 2;
          s.label.style.left = `${cx}px`;
          s.label.style.top = `${cy}px`;
          const w = canvas.clientWidth, h = canvas.clientHeight;
          s.label.style.display = (cx < 0 || cy < 0 || cx > w || cy > h) ? 'none' : '';
          // Hide the main label too when the leg is degenerate (no
          // perpendicular distance to display, so nothing meaningful).
          if (mainLen <= 0.5) s.label.style.display = 'none';
        }
      } else {
        s.line!.style.display = 'none';
        if (s.fixedLine) s.fixedLine.style.display = 'none';
        if (s.fixedLabel) s.fixedLabel.style.display = 'none';
        if (s.extLineA) s.extLineA.style.display = 'none';
        if (s.extLineB) s.extLineB.style.display = 'none';
      }
    };

    const ensureFixedLabel = () => {
      const s = measureRef.current!;
      if (s.fixedLabel) return s.fixedLabel;
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;left:-9999px;top:-9999px;transform:translate(-50%,-50%);padding:2px 6px;font-size:11px;font-weight:600;font-family:system-ui,-apple-system,sans-serif;background:rgba(255,136,0,0.75);color:#fff;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);pointer-events:none;`;
      overlay.appendChild(el);
      s.fixedLabel = el;
      return el;
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
        setSnapGlyph(lastSnap.type);
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
      // Prefer the snapped position when one is available, otherwise the
      // raw pointer position from dxf-viewer's event.
      const picked = lastSnap
        ? { x: lastSnap.sx, y: lastSnap.sy }
        : { x: raw.x, y: raw.y };
      doPick(picked);
    };

    // Recompute the distance label from the current picks + active mode.
    // In fixed-distance mode the reported value is the *perpendicular*
    // component (Δy for H, Δx for V) — the fixed value itself shows on
    // the other dim leg's label.
    const recomputeLabel = () => {
      const s = measureRef.current;
      if (!s || s.picks.length !== 2) return;
      reconcileLockedPick();
      const a = s.picks[0], b = s.picks[1];
      const rawMode = measureModeRef.current;
      const mode = resolveMode(a, b);
      const fixed = measureFixedDistRef.current;
      const fixedActive = fixed !== null && Number.isFinite(fixed) && (rawMode === 'horizontal' || rawMode === 'vertical');
      let dist: number;
      let suffix = '';
      let echo: string;
      // Axis the *displayed* value follows — flips to the perpendicular
      // axis in fixed-distance mode (the chip arrow/tooltip track this).
      let shown: 'point' | 'horizontal' | 'vertical' = mode;
      const adx = Math.abs(b.x - a.x), ady = Math.abs(b.y - a.y);
      if (fixedActive && rawMode === 'horizontal') {
        dist = ady;
        suffix = ' ↕';
        shown = 'vertical';
        echo = `ΔY = ${formatMeasureDistance(ady)} with ΔX locked to ${formatMeasureDistance(Math.abs(fixed))}`;
      } else if (fixedActive && rawMode === 'vertical') {
        dist = adx;
        suffix = ' ↔';
        shown = 'horizontal';
        echo = `ΔX = ${formatMeasureDistance(adx)} with ΔY locked to ${formatMeasureDistance(Math.abs(fixed))}`;
      } else if (mode === 'horizontal') {
        dist = adx;
        suffix = ' ↔';
        echo = `Linear dimension = ${formatMeasureDistance(adx)} (ΔX)`;
      } else if (mode === 'vertical') {
        dist = ady;
        suffix = ' ↕';
        echo = `Linear dimension = ${formatMeasureDistance(ady)} (ΔY)`;
      } else {
        dist = Math.hypot(b.x - a.x, b.y - a.y);
        echo = `Distance = ${formatMeasureDistance(dist)}   ΔX = ${formatMeasureDistance(adx)}   ΔY = ${formatMeasureDistance(ady)}`;
      }
      // A non-finite distance means a corrupt pick slipped through (it
      // shouldn't — the snap cache filters non-finite coords). Show
      // nothing rather than a "NaN mm" label.
      if (!Number.isFinite(dist)) {
        setMeasureDistance(null);
        setMeasureResolved(null);
        if (s.label) s.label.style.opacity = '0';
        return;
      }
      setMeasureDistance(dist);
      setMeasureResolved(shown);
      setCmdEcho(echo);
      const label = ensureLabel();
      label.style.opacity = '1';
      label.textContent = `${formatMeasureDistance(dist)}${suffix}`;
    };

    // Expose for the mode / fixed-distance change effect — calling this
    // redraws the overlay using whatever the refs currently hold.
    measureRedrawRef.current = () => {
      recomputeLabel();
      updateOverlay();
    };

    // Hide every dim visual that only makes sense with two picks.
    const hideDimVisuals = (s: NonNullable<typeof measureRef.current>) => {
      s.line!.style.display = 'none';
      if (s.fixedLine) s.fixedLine.style.display = 'none';
      if (s.fixedLabel) s.fixedLabel.style.display = 'none';
      if (s.extLineA) s.extLineA.style.display = 'none';
      if (s.extLineB) s.extLineB.style.display = 'none';
      if (s.label) s.label.style.opacity = '0';
      setMeasureDistance(null);
      setMeasureResolved(null);
    };

    const resetPicks = () => {
      const s = measureRef.current;
      if (!s) return;
      for (const m of s.markers) m.parentElement?.removeChild(m);
      s.markers = [];
      s.picks = [];
      s.rawSecondClick = null;
      if (s.refLine) s.refLine.style.display = 'none';
      if (s.refLineV) s.refLineV.style.display = 'none';
      hideDimVisuals(s);
    };
    measureResetRef.current = resetPicks;

    // Command U — drop the most recent pick, keep the other (if any).
    measureUndoRef.current = () => {
      const s = measureRef.current;
      if (!s || s.picks.length === 0) return;
      s.picks.pop();
      const m = s.markers.pop();
      m?.parentElement?.removeChild(m);
      s.rawSecondClick = null;
      hideDimVisuals(s);
      updateOverlay();
    };

    const doPick = (p: { x: number; y: number }) => {
      const s = measureRef.current;
      if (!s) return;

      // Third click → start fresh.
      if (s.picks.length === 2) resetPicks();

      if (s.picks.length === 0) {
        s.picks.push({ x: p.x, y: p.y });
        s.markers.push(makeMarker());
      } else {
        // Second pick — remember the raw click so we can re-lock if the
        // user later edits the fixed-distance input; reconcileLockedPick
        // (called by recomputeLabel / updateOverlay) writes the effective
        // position into picks[1].
        s.rawSecondClick = { x: p.x, y: p.y };
        s.picks.push({ x: p.x, y: p.y });
        s.markers.push(makeMarker());
        recomputeLabel();
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
      measureRedrawRef.current = null;
      measureResetRef.current = null;
      measureUndoRef.current = null;
      teardown();
      setMeasureDistance(null);
      setMeasureResolved(null);
    };
    // NOTE: measureMode / measureFixedDist intentionally *not* in deps —
    // switching mode or editing the fixed distance preserves picks and
    // just triggers a redraw via the separate effect below. Layer
    // visibility *is* a dep (via layersKey): toggling a layer rebuilds the
    // snap cache so hidden geometry stops attracting the cursor — at the
    // cost of resetting in-progress picks, which a layer change
    // invalidates anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureEnabled, loading, error, layersKey]);

  // Redraw the measurement overlay when mode or fixed-distance changes,
  // using the picks that are already in measureRef. The main measure
  // effect exposes `measureRedrawRef.current` for this.
  useEffect(() => {
    measureRedrawRef.current?.();
  }, [measureMode, measureFixedDist]);

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

  // ── AutoCAD-style command bar ───────────────────────────────────────
  // Space and Enter both execute (AutoCAD treats space as enter); Enter
  // on an empty line repeats the last command; Esc clears, then exits
  // the measure tool. Typing anywhere over the drawing routes the
  // keystroke into the input — see the keydown effect below.
  const runCommand = (raw: string) => {
    const exec = raw.trim() || lastCmdRef.current;
    setCmdValue('');
    if (!exec) return;
    const cmd = exec.toLowerCase().split(/\s+/)[0];
    const remember = () => { lastCmdRef.current = exec; };
    const startMeasure = (mode: typeof measureMode, echo: string) => {
      setMeasureEnabled(true);
      setMeasureMode(mode);
      measureResetRef.current?.();
      setCmdEcho(echo);
      remember();
    };
    // Bare number → lock the axis-aligned Δ of the second pick (H/V).
    if (/^-?(\d+\.?\d*|\.\d+)$/.test(cmd)) {
      if (measureEnabled && (measureMode === 'horizontal' || measureMode === 'vertical')) {
        const n = parseFloat(cmd);
        if (n) {
          setMeasureFixedInput(cmd);
          setMeasureFixedDist(n);
          setCmdEcho(`Δ${measureMode === 'horizontal' ? 'X' : 'Y'} locked to ${formatMeasureDistance(Math.abs(n))} — the label shows the perpendicular distance`);
        } else {
          setMeasureFixedInput('');
          setMeasureFixedDist(null);
          setCmdEcho('Fixed distance cleared.');
        }
      } else {
        setCmdEcho('Fixed distances apply in H or V mode — type H or V first.');
      }
      return;
    }
    switch (cmd) {
      case 'di': case 'dist': case 'mea': case 'measuregeom':
        startMeasure('point', 'DIST — click two points; straight-line distance (Esc to exit)');
        break;
      case 'dim': case 'dli': case 'dimlin': case 'dimlinear':
        startMeasure('auto', 'DIMLINEAR — click two points; measures ΔX or ΔY, whichever is larger (H / V to force)');
        break;
      // H / V / AUTO switch the axis without dropping existing picks —
      // same as clicking the pill.
      case 'h': case 'hor': case 'horizontal':
        setMeasureEnabled(true);
        setMeasureMode('horizontal');
        setCmdEcho('Horizontal — ΔX between the two picks');
        remember();
        break;
      case 'v': case 'ver': case 'vertical':
        setMeasureEnabled(true);
        setMeasureMode('vertical');
        setCmdEcho('Vertical — ΔY between the two picks');
        remember();
        break;
      case 'au': case 'auto':
        setMeasureEnabled(true);
        setMeasureMode('auto');
        setCmdEcho('Auto (DIMLINEAR) — measures along the dominant axis of the two picks');
        remember();
        break;
      case 'measure':
        setMeasureEnabled(!measureEnabled);
        setCmdEcho(measureEnabled ? 'Measure off.' : 'Measure on — click two points.');
        remember();
        break;
      case 'u': case 'undo':
        measureUndoRef.current?.();
        setCmdEcho('Last pick removed.');
        remember();
        break;
      case 'z': case 'ze': case 'zoom': case 'fit': case 'zoomextents':
        handleResetView();
        setCmdEcho('Zoom extents.');
        remember();
        break;
      case 'la': case 'layer': case 'layers':
        setShowLayers(s => !s);
        setCmdEcho('Layer panel toggled.');
        remember();
        break;
      case 'off': case 'clear':
        setMeasureFixedDist(null);
        setMeasureFixedInput('');
        measureResetRef.current?.();
        setCmdEcho('Measurement cleared.');
        remember();
        break;
      case '?': case 'help':
        setCmdEcho(DXF_CMD_HELP);
        break;
      default: {
        const editCmd = DXF_EDIT_COMMANDS[cmd];
        if (editCmd) setCmdEcho(`${editCmd} is a drawing command — Preview is a read-only viewer. Measuring: DI, DIM, H, V (? for help)`);
        else setCmdEcho(`Unknown command "${cmd.toUpperCase()}" — try DI, DIM, H, V, Z, LA (? for help)`);
      }
    }
  };

  // AutoCAD keyboard feel: any printable key typed while this panel's
  // window is active (and no other field is focused) lands in the
  // command input. Focusing during keydown is enough — the browser
  // delivers the character to the newly focused input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1 || e.key === ' ') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const root = rootRef.current;
      if (!root) return;
      const myModal = root.closest('[data-modal-id]') as HTMLElement | null;
      if (myModal && getActiveModalId() !== myModal.dataset.modalId) return;
      cmdInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // AutoCAD Esc cascade. The shell closes the topmost window on Escape
  // (capture phase, so neither the command input nor a window-level
  // listener can get there first) — intercept it while there's something
  // to cancel: command-input text first, then the measure tool. A further
  // Esc falls through and closes the window as usual.
  const cmdValueRef = useRef(cmdValue);
  const measureEnabledRef = useRef(measureEnabled);
  useEffect(() => { cmdValueRef.current = cmdValue; }, [cmdValue]);
  useEffect(() => { measureEnabledRef.current = measureEnabled; }, [measureEnabled]);
  useEffect(() => {
    return registerModalEscapeInterceptor(() => {
      const root = rootRef.current;
      if (!root) return false;
      const myModal = root.closest('[data-modal-id]') as HTMLElement | null;
      if (!myModal || getActiveModalId() !== myModal.dataset.modalId) return false;
      if (cmdValueRef.current) {
        setCmdValue('');
        setCmdEcho('*Cancel*');
        return true;
      }
      if (measureEnabledRef.current) {
        setMeasureEnabled(false);
        setCmdEcho('Measure off.');
        return true;
      }
      return false;
    });
  }, []);

  const btn = 'px-2 py-1 rounded hover:bg-gray-200 transition-colors text-gray-600 flex items-center gap-1';
  const colorHex = (n?: number) => {
    if (typeof n !== 'number') return '#999';
    return '#' + n.toString(16).padStart(6, '0');
  };

  return (
    <div ref={rootRef} className="flex flex-col h-full">
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
          title={measureEnabled ? 'Stop measuring (Esc)' : 'Measure distance — click two points on the drawing, or type DI / DIM below'}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.25l6-6 6 6 4.5-4.5M9.75 8.25v3M12.75 11.25v3M15.75 14.25v3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75h19.5" />
          </svg>
          Measure
        </button>
        {measureEnabled && (
          <>
            <div className="flex items-stretch h-7 rounded border border-gray-200 overflow-hidden text-[11px] font-semibold">
              <button
                onClick={() => setMeasureMode('auto')}
                className={`px-2 transition-colors ${measureMode === 'auto' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                title="Auto — AutoCAD DIMLINEAR: measures ΔX or ΔY, whichever is larger between the two picks"
              >
                Auto
              </button>
              <button
                onClick={() => setMeasureMode('horizontal')}
                className={`px-2 transition-colors ${measureMode === 'horizontal' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                title="Horizontal — distance along the X axis between two picks (AutoCAD DIMLINEAR horizontal)"
              >
                H
              </button>
              <button
                onClick={() => setMeasureMode('vertical')}
                className={`px-2 transition-colors ${measureMode === 'vertical' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                title="Vertical — distance along the Y axis between two picks (AutoCAD DIMLINEAR vertical)"
              >
                V
              </button>
              <button
                onClick={() => setMeasureMode('point')}
                className={`px-2 transition-colors ${measureMode === 'point' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                title="Point — straight-line (Euclidean) distance between two picks (AutoCAD DIST)"
              >
                Point
              </button>
            </div>
            {/* Fixed-distance input — locks the second pick's axis-aligned
                coord to (first pick's coord ± entered value). The
                displayed measurement becomes the perpendicular distance.
                Only useful in H or V mode. Sign of the offset follows
                whichever side of the first pick the user clicks on. */}
            {(measureMode === 'horizontal' || measureMode === 'vertical') && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={measureFixedInput}
                  placeholder={measureMode === 'horizontal' ? 'fix Δx' : 'fix Δy'}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setMeasureFixedInput(raw);
                    if (raw.trim() === '') setMeasureFixedDist(null);
                    else {
                      const n = parseFloat(raw);
                      setMeasureFixedDist(Number.isFinite(n) && n !== 0 ? n : null);
                    }
                  }}
                  className="h-7 w-20 px-1.5 text-[11px] font-mono rounded border border-gray-200 bg-white text-gray-700 focus:outline-none focus:border-orange-400"
                  title="Lock the second pick's axis coord to first pick + this value (mm). The reported measurement becomes the perpendicular distance."
                />
                {measureFixedDist !== null && (
                  <button
                    onClick={() => { setMeasureFixedDist(null); setMeasureFixedInput(''); }}
                    className="text-gray-400 hover:text-gray-600 text-[11px] px-1"
                    title="Clear fixed distance"
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {measureEnabled && measureDistance !== null && (
          <div
            className="px-2 py-1 text-[11px] font-mono font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded whitespace-nowrap"
            title={
              measureResolved === 'horizontal' ? `Horizontal distance (Δx) between the two picked points${measureMode === 'auto' ? ' — Auto resolved to the X axis' : ''}`
              : measureResolved === 'vertical' ? `Vertical distance (Δy) between the two picked points${measureMode === 'auto' ? ' — Auto resolved to the Y axis' : ''}`
              : 'Straight-line distance between the two picked points'
            }
          >
            {formatMeasureDistance(measureDistance)}
            {measureResolved === 'horizontal' ? ' ↔'
              : measureResolved === 'vertical' ? ' ↕'
              : ''}
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
            <span className="text-white/40">•</span>
            <span>Type <span className="font-mono font-semibold">DI</span> / <span className="font-mono font-semibold">DIM</span> to measure</span>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-gray-500">Loading drawing…</div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 px-6 text-center">{error}</div>
        )}
      </div>

      {/* AutoCAD-style command bar. Typing over the drawing focuses the
       *  input automatically; Enter/Space runs, Enter on empty repeats,
       *  Esc cancels the input then the measure tool. */}
      <div className="shrink-0 border-t border-gray-200 bg-gray-50">
        {cmdEcho && (
          <div className="px-2.5 pt-1 text-[11px] font-mono text-gray-500 truncate" title={cmdEcho}>{cmdEcho}</div>
        )}
        <div className="flex items-center gap-1.5 px-2.5 h-7">
          <span className="text-[11px] font-mono font-semibold text-gray-400 select-none">&gt;</span>
          <input
            ref={cmdInputRef}
            value={cmdValue}
            onChange={(e) => setCmdValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                runCommand(cmdValue);
              } else if (e.key === 'Escape') {
                if (cmdValue) {
                  // Esc with text: cancel the input only — don't let the
                  // window-level handler kill the measure tool too.
                  e.stopPropagation();
                  setCmdValue('');
                  setCmdEcho('*Cancel*');
                } else {
                  (e.target as HTMLInputElement).blur();
                }
              }
            }}
            placeholder="Type a command — DI, DIM, H, V, Z, LA (? for help)"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-gray-700 focus:outline-none placeholder:text-gray-300"
          />
        </div>
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
  // Two decimals to match AutoCAD's dimension readout (e.g. 18.56 mm) —
  // one decimal loses real precision on machined parts.
  if (mm >= 1000) return `${(mm / 1000).toFixed(3)} m`;
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

      // OV's GenerateEdgeModel walks every mesh in mainModel — including
      // the stencil helpers we add as children of the originals when
      // section view is on. That produces duplicate edge LineSegments
      // (one per helper, on top of the originals) and the new
      // LineBasicMaterials don't carry our clipping plane, so the edges
      // render past the cut. Strip the helper-derived edges and reapply
      // clipping to what's left.
      const s = sectionRef.current;
      if (s) {
        const helperEdges: any[] = [];
        v.viewer.mainModel?.EnumerateEdges?.((edge: any) => {
          if (edge.userData?.__sectionHelper) helperEdges.push(edge);
        });
        for (const e of helperEdges) {
          e.parent?.remove(e);
          e.geometry?.dispose?.();
          e.material?.dispose?.();
        }
        const plane = s.plane;
        const applyMatClip = (mat: any) => {
          if (!mat || s.materialState.has(mat)) return;
          s.materialState.set(mat, { clippingPlanes: mat.clippingPlanes, clipShadows: mat.clipShadows });
          mat.clippingPlanes = [plane];
          mat.clipShadows = true;
          mat.needsUpdate = true;
        };
        v.viewer.mainModel?.EnumerateEdges?.((edge: any) => {
          const mat = edge.material;
          if (Array.isArray(mat)) for (const m of mat) applyMatClip(m);
          else applyMatClip(mat);
        });
      }

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
      // Each axis rotates around the NEXT axis cyclically (X→Y, Y→Z, Z→X)
      // so all three options sweep in genuinely different planes:
      //   X  →  rotates around Y, sweeping in the X-Z plane
      //   Y  →  rotates around Z, sweeping in the Y-X plane
      //   Z  →  rotates around X, sweeping in the Z-Y plane
      // Earlier attempts kept two axes in the same Y-Z plane (just swapped
      // sin/cos), which collapsed two of the three options to a 90° offset
      // of each other.
      if (sectionAxis === 'x')      { nx = sign * cosθ; nz = sign * sinθ; }
      else if (sectionAxis === 'y') { ny = sign * cosθ; nx = sign * sinθ; }
      else                          { nz = sign * cosθ; ny = sign * sinθ; }

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
  // instance. For raycasting we go through OV's own
  // `viewer.GetMeshIntersectionUnderMouse` rather than constructing our
  // own `THREE.Raycaster` from `import('three')` — the top-level `three`
  // hoisted in node_modules is a different version than the one OV
  // bundles, and a Raycaster from one bundle silently fails to intersect
  // meshes from the other.
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current;
    if (!v?.viewer || loading || !containerRef.current) return;

    const renderer = v.viewer.renderer;
    const scene = v.viewer.scene;
    // NB: don't cache `v.viewer.camera` here. SetProjectionMode (orthographic
    // toggle, called from the projection-default effect right after load)
    // rebuilds the THREE camera and replaces v.viewer.camera with a fresh
    // instance. A captured reference goes stale and the raycaster picks
    // ghost positions. We re-read v.viewer.camera inside doMeasurePick.
    const canvas: HTMLCanvasElement | undefined = renderer?.domElement;
    if (!renderer || !scene || !canvas) return;

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

    // OV renders edges as THREE.LineSegments; pluck its constructor + a
    // line material from the scene so our measurement line uses the same
    // bundled THREE that built the rest of the scene.
    let LineSegmentsCtor: any = null;
    let LineBasicMaterialCtor: any = null;
    scene.traverse((obj: any) => {
      if (LineSegmentsCtor && LineBasicMaterialCtor) return;
      if (!obj?.isLineSegments) return;
      LineSegmentsCtor = obj.constructor;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (mat?.constructor) LineBasicMaterialCtor = mat.constructor;
    });

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

    // OV exposes `IntersectionMode.MeshOnly` and a viewer-level
    // `GetMeshIntersectionUnderMouse(mode, {x,y})` that runs the raycast
    // through its bundled THREE — which is what we want, since the loaded
    // model meshes were instantiated from that same bundle.
    const OV = ovRef.current;
    const intersectionMode = OV?.IntersectionMode?.MeshOnly ?? 1;

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
      // LineSegments draws one segment per pair of vertices — with two
      // points that's exactly the line we want. Falls back to the mesh
      // constructor if no edge meshes happened to be in the scene
      // (extremely unlikely for STEP files, which always have edges).
      const LineCtor = LineSegmentsCtor ?? MeshCtor;
      const LineMatCtor = LineBasicMaterialCtor ?? MaterialCtor;
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
      // Park off-screen on creation so the label never flashes at (0,0)
      // before updateLabel() positions it.
      el.style.left = '-9999px';
      el.style.top = '-9999px';
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
      // Read camera fresh — see comment in doMeasurePick.
      const camera = v.viewer.camera;
      if (!camera) return;
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
      // Hide if behind the camera (z > 1) OR if the midpoint projects
      // outside the canvas — otherwise transform:translate(-50%,-50%)
      // leaves the label's right edge stuck at the top-left corner
      // showing "…mm" after the user orbits the measurement off-screen.
      const offScreen = x < 0 || y < 0 || x > rect.width || y > rect.height;
      s.label.style.opacity = (projected.z > 1 || offScreen) ? '0' : '1';
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
      // Read camera fresh — SetProjectionMode rebuilds it under the hood,
      // see the comment near the start of this effect.
      if (!v.viewer.camera) return;
      const rect = canvas.getBoundingClientRect();
      const mouseCoords = {
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
      };
      const hit = v.viewer.GetMeshIntersectionUnderMouse?.(intersectionMode, mouseCoords);
      if (!hit) return;

      const s = measureRef.current!;
      const point = new Vector3Ctor(hit.point.x, hit.point.y, hit.point.z);
      const normal = worldNormalFromHit(hit);

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
        const highlight = buildFaceHighlight(hit.object, hit);
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

  // Fetch into a blob URL before triggering the anchor download.
  // The bare-anchor approach (`a.href = url; a.download = …; a.click()`)
  // can fall through to navigation when the server's response headers
  // don't cleanly opt into the download — the browser then loads the
  // image URL into the SPA frame, which clears the Preview state and
  // leaves the user with the empty "Drop a file here…" placeholder.
  // Going through fetch → Blob → object URL means the anchor target
  // is always a controlled blob: URL the browser will always save.
  const handleDefaultDownload = async () => {
    // For same-document blob: URLs we can skip the round-trip entirely.
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      return;
    }
    const tryFetch = async (init: RequestInit) => {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    };
    try {
      let blob: Blob;
      try {
        blob = await tryFetch({ credentials: 'include' });
      } catch {
        // Some media servers reject credentialed requests with an opaque
        // network failure — retry once without cookies before giving up.
        blob = await tryFetch({ credentials: 'omit' });
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      // Defer revoke so the browser has a tick to start the download.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      toast.error("Download failed — couldn't reach the file.");
    }
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
