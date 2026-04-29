/**
 * Preview — windowed PDF viewer app.
 *
 * Consumers stage a PDF via `setPdfPreview({ url, filename, ... })` and then
 * call `openPage('/preview')`. If the window is already open, it swaps to the
 * new PDF in-place via a custom event.
 */
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import toast from '../shell/toast';
import { WindowTitle } from '../shell/Modal';

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
  const [isDragging, setIsDragging] = useState(false);
  const handlePick = () => fileRef.current?.click();
  const ingestFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const kind: 'pdf' | 'image' | 'dxf' | '3d' | undefined =
      ext === 'pdf' ? 'pdf'
      : ext === 'dxf' ? 'dxf'
      : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext) ? 'image'
      : ['stp', 'step', 'stl', 'obj', 'gltf', 'glb', '3mf', 'iges', 'igs', 'ply', 'fbx'].includes(ext) ? '3d'
      : undefined;
    if (!kind) {
      URL.revokeObjectURL(url);
      if (ext === 'dwg') toast.error('DWG files need server-side conversion. Convert to PDF or DXF first.');
      else toast.error(`Unsupported file type: .${ext || 'unknown'}`);
      return;
    }
    setPdfPreview({ url, filename: file.name, kind });
  };
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) ingestFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
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
      onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
      onDragLeave={(e) => {
        // Only clear when leaving the outer container, not transitioning between children.
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <WindowTitle title={`${titleName} - Preview`} />
      {Toolbar}
      <div className="flex-1 min-h-0">{body}</div>
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
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0 text-xs">
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <span className="text-gray-600 font-medium tabular-nums">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-30">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setScale(s => Math.max(0.3, Math.round((s - 0.25) * 100) / 100))} className={btn}>−</button>
          <span className="text-gray-500 w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(4, Math.round((s + 0.25) * 100) / 100))} className={btn}>+</button>
          <button onClick={fitWidth} className={btn}>Fit</button>
        </div>

        <div className="flex items-center gap-1">
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
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 flex justify-center p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading PDF...</div>
        ) : (
          <canvas ref={canvasRef} className="shadow-lg rounded" />
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
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0 text-xs">
        <div className="flex items-center gap-1">
          <span className="font-medium text-gray-600">DXF</span>
          <span className="text-gray-400 truncate max-w-xs">{filename}</span>
        </div>
        <div className="flex items-center gap-1 relative">
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
        </div>
      </div>
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

  // Sidebar visibility.
  const [showMeshes, setShowMeshes] = useState(true);
  const [showSettings, setShowSettings] = useState(true);

  // Section view (capped clipping plane).
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<'x' | 'y' | 'z'>('z');
  const [sectionFlip, setSectionFlip] = useState(false);
  const [sectionPosition, setSectionPosition] = useState(0.5); // 0–1 within bbox
  const [sectionCapColor, setSectionCapColor] = useState('#9aa6b3');

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
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load 3D model.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
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

  // Section view — set up / tear down on enable.
  // Uses the standard three.js stencil-cap technique: every mesh gets a
  // clippingPlane + two stencil-only "helper" children that count interior
  // intersections with the plane, and a single cap quad in the scene draws
  // the cut surface where the stencil count is non-zero.
  useEffect(() => {
    const v = viewerRef.current;
    if (!v?.viewer || loading) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;

    (async () => {
      const THREE: any = await import('three' as any);
      if (cancelled) return;
      const renderer = v.viewer.renderer;
      const scene = v.viewer.scene;
      if (!renderer || !scene) return;

      // Tear down any previous section state.
      if (sectionRef.current) {
        const s = sectionRef.current;
        for (const [mat, prev] of s.materialState.entries()) {
          mat.clippingPlanes = prev.clippingPlanes;
          mat.clipShadows = prev.clipShadows;
          mat.needsUpdate = true;
        }
        for (const helper of s.helpers) {
          helper.parent?.remove(helper);
          helper.geometry?.dispose?.();
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

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
      const helpers: any[] = [];
      const materialState = new Map<any, { clippingPlanes: any; clipShadows: any }>();

      const applyToMaterial = (mat: any) => {
        if (!mat || materialState.has(mat)) return;
        materialState.set(mat, {
          clippingPlanes: mat.clippingPlanes,
          clipShadows: mat.clipShadows,
        });
        mat.clippingPlanes = [plane];
        mat.clipShadows = true;
        mat.needsUpdate = true;
      };

      // Snapshot the mesh list FIRST. EnumerateMeshes is a live scene
      // traversal — if we add helper meshes to each visited mesh inside the
      // callback, the traversal then visits those helpers (which are also
      // THREE.Mesh instances) and recursively adds more helpers to them,
      // exploding into a stack overflow.
      const targets: any[] = [];
      v.viewer.mainModel?.EnumerateMeshes?.((mesh: any) => {
        if (mesh.userData?.__sectionHelper) return;
        targets.push(mesh);
      });

      for (const mesh of targets) {
        const mat = mesh.material;
        if (Array.isArray(mat)) for (const m of mat) applyToMaterial(m);
        else applyToMaterial(mat);

        // Two stencil-only helpers: back faces increment, front faces decrement.
        // Where the result is non-zero on the cap plane, we are inside the solid.
        const makeStencil = (side: number, op: number) => {
          const m = new THREE.MeshBasicMaterial({
            depthWrite: false,
            depthTest: false,
            colorWrite: false,
            stencilWrite: true,
            stencilFunc: THREE.AlwaysStencilFunc,
            stencilFail: op,
            stencilZFail: op,
            stencilZPass: op,
            side,
            clippingPlanes: [plane],
          });
          const helper = new THREE.Mesh(mesh.geometry, m);
          helper.matrixAutoUpdate = false;
          helper.renderOrder = 1;
          helper.userData.__sectionHelper = true;
          mesh.add(helper);
          helpers.push(helper);
        };
        makeStencil(THREE.BackSide, THREE.IncrementWrapStencilOp);
        makeStencil(THREE.FrontSide, THREE.DecrementWrapStencilOp);
      }

      // Cap quad — sized to the bounding box diagonal so it always covers the cut.
      const dx = bbox.max.x - bbox.min.x;
      const dy = bbox.max.y - bbox.min.y;
      const dz = bbox.max.z - bbox.min.z;
      const capSize = Math.max(dx, dy, dz) * 2 || 1;
      const capGeom = new THREE.PlaneGeometry(capSize, capSize);
      const capMat = new THREE.MeshPhongMaterial({
        color: 0x9aa6b3,
        side: THREE.DoubleSide,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      });
      const capMesh = new THREE.Mesh(capGeom, capMat);
      capMesh.renderOrder = 2;
      capMesh.userData.__sectionHelper = true;
      scene.add(capMesh);

      renderer.localClippingEnabled = true;
      sectionRef.current = { plane, capMesh, helpers, materialState, bbox };
      v.viewer.Render?.();

      teardown = () => {
        // No-op here — handled at the start of the effect on next run.
      };
    })();

    return () => {
      cancelled = true;
      if (teardown) teardown();
    };
  }, [sectionEnabled, loading, tree]);

  // Section view — update plane orientation/position on axis/flip/slider change.
  useEffect(() => {
    const v = viewerRef.current;
    const s = sectionRef.current;
    if (!v?.viewer || !s || !sectionEnabled) return;
    try {
      const bbox = s.bbox;
      const axisIdx = sectionAxis === 'x' ? 0 : sectionAxis === 'y' ? 1 : 2;
      const min = [bbox.min.x, bbox.min.y, bbox.min.z][axisIdx];
      const max = [bbox.max.x, bbox.max.y, bbox.max.z][axisIdx];
      const value = min + (max - min) * sectionPosition;

      // Three.js clips fragments where (normal · p) + constant < 0.
      // Default direction (not flipped): keep "axis < value", clip "axis > value".
      const dir = sectionFlip ? 1 : -1;
      const nx = sectionAxis === 'x' ? dir : 0;
      const ny = sectionAxis === 'y' ? dir : 0;
      const nz = sectionAxis === 'z' ? dir : 0;
      s.plane.normal.set(nx, ny, nz);
      s.plane.constant = -dir * value;

      // Cap mesh: position at the plane, oriented so its visible face points
      // toward the kept side (i.e. opposite the plane normal direction we
      // clip against — same as plane.normal for our convention).
      const cx = (bbox.min.x + bbox.max.x) / 2;
      const cy = (bbox.min.y + bbox.max.y) / 2;
      const cz = (bbox.min.z + bbox.max.z) / 2;
      const center: any = { x: cx, y: cy, z: cz };
      // Plane equation: n.p + c = 0 → distance from center = n·c + c_const.
      const dist = nx * center.x + ny * center.y + nz * center.z + s.plane.constant;
      const px = center.x - nx * dist;
      const py = center.y - ny * dist;
      const pz = center.z - nz * dist;
      s.capMesh.position.set(px, py, pz);
      s.capMesh.lookAt(px + nx, py + ny, pz + nz);

      // Cap color
      try {
        const m = /^#?([0-9a-f]{6})$/i.exec(sectionCapColor);
        const n = m ? parseInt(m[1], 16) : 0x9aa6b3;
        s.capMesh.material.color.setHex(n);
      } catch {}

      v.viewer.Render?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Preview] section update failed', err);
    }
  }, [sectionEnabled, sectionAxis, sectionFlip, sectionPosition, sectionCapColor]);

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
      const sphere = v?.GetBoundingSphere?.(() => true);
      if (sphere) v.viewer.FitSphereToWindow(sphere, true);
      v?.viewer?.Render?.();
    } catch {}
  };

  // Camera presets — eye/center/up around the model's bounding sphere.
  const setCameraPreset = (preset: 'top' | 'front' | 'side' | 'iso') => {
    const OV = ovRef.current;
    const v = viewerRef.current;
    if (!OV || !v?.viewer) return;
    try {
      const sphere = v.GetBoundingSphere?.(() => true);
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
    setSectionAxis('z');
    setSectionFlip(false);
    setSectionPosition(0.5);
    setSectionCapColor('#9aa6b3');
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
          className="group flex items-center gap-1 px-1.5 py-1 hover:bg-slate-700/50 cursor-default text-[12px] text-slate-200"
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpanded(node.id)}
              className="h-4 w-4 shrink-0 flex items-center justify-center text-slate-400 hover:text-slate-100"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={isExpanded ? 'M19.5 8.25l-7.5 7.5-7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
              </svg>
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0 flex items-center justify-center">
              <span className="h-1 w-1 rounded-full bg-slate-500" />
            </span>
          )}
          <span className={`flex-1 truncate ${isVisible ? '' : 'opacity-40'}`} title={node.name}>{node.name}</span>
          <button
            onClick={() => fitNode(node)}
            className="h-4 w-4 shrink-0 text-slate-500 hover:text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Fit to view"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
          <button
            onClick={() => toggleNodeVisible(node)}
            className="h-4 w-4 shrink-0 text-slate-400 hover:text-slate-100"
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

  const tBtn = 'h-8 w-8 shrink-0 flex items-center justify-center rounded text-slate-300 hover:bg-slate-700 hover:text-white transition-colors';
  const tBtnActive = 'h-8 w-8 shrink-0 flex items-center justify-center rounded bg-slate-700 text-white';
  const tBtnSep = 'h-5 w-px bg-slate-700 mx-1';

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Top toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-800 border-b border-slate-700 shrink-0">
        <span className="text-[11px] font-semibold tracking-wide text-slate-300 px-2 truncate max-w-xs" title={filename}>{filename}</span>
        <div className={tBtnSep} />
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
        <div className="flex-1" />
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
      </div>

      {/* Body: meshes | viewport | settings */}
      <div className="flex-1 flex min-h-0">
        {showMeshes && (
          <div className="w-60 shrink-0 bg-slate-800 border-r border-slate-700 flex flex-col">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-700">Meshes</div>
            <div className="flex-1 overflow-y-auto py-1">
              {tree ? renderTreeNode(tree) : (
                <div className="px-3 py-3 text-[11px] text-slate-500 italic">{loading ? 'Reading model…' : 'No structure available'}</div>
              )}
            </div>
            {tree && (
              <div className="px-3 py-1.5 text-[10px] text-slate-500 border-t border-slate-700">
                {hidden.size === 0 ? 'All visible' : `${hidden.size} hidden`}
              </div>
            )}
          </div>
        )}

        <div className="relative flex-1 min-w-0" style={{ background: bgColor }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

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
        </div>

        {showSettings && (
          <div className="w-60 shrink-0 bg-slate-800 border-l border-slate-700 flex flex-col">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-700">Model Display</div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-[12px] text-slate-200">
              <label className="flex items-center justify-between gap-2">
                <span>Background Color</span>
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-6 w-10 rounded border border-slate-600 bg-transparent" />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Show Edges</span>
                <button
                  onClick={() => setShowEdges(s => !s)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${showEdges ? 'bg-blue-500' : 'bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${showEdges ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className={showEdges ? '' : 'opacity-40'}>Edge Color</span>
                <input
                  type="color"
                  value={edgeColor}
                  onChange={(e) => setEdgeColor(e.target.value)}
                  disabled={!showEdges}
                  className="h-6 w-10 rounded border border-slate-600 bg-transparent disabled:opacity-40"
                />
              </label>
              <div className={showEdges ? '' : 'opacity-40 pointer-events-none'}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span>Edge Threshold</span>
                  <span className="text-slate-400 tabular-nums">{edgeThreshold}°</span>
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

              <div className="border-t border-slate-700 -mx-3 px-3 pt-3 mt-1">
                <label className="flex items-center justify-between gap-2">
                  <span className="font-medium">Section View</span>
                  <button
                    onClick={() => setSectionEnabled(s => !s)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${sectionEnabled ? 'bg-blue-500' : 'bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${sectionEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>

                <div className={sectionEnabled ? 'mt-2 space-y-2' : 'mt-2 space-y-2 opacity-40 pointer-events-none'}>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span>Axis</span>
                      <button
                        onClick={() => setSectionFlip(f => !f)}
                        className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600"
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
                          className={`py-1 rounded text-[11px] font-semibold ${sectionAxis === ax ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        >
                          {ax.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span>Position</span>
                      <span className="text-slate-400 tabular-nums">{Math.round(sectionPosition * 100)}%</span>
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

                  <label className="flex items-center justify-between gap-2">
                    <span>Cap Color</span>
                    <input
                      type="color"
                      value={sectionCapColor}
                      onChange={(e) => setSectionCapColor(e.target.value)}
                      className="h-6 w-10 rounded border border-slate-600 bg-transparent"
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="px-3 py-2 border-t border-slate-700">
              <button
                onClick={handleResetDisplay}
                className="w-full text-[11px] text-slate-300 bg-slate-700 hover:bg-slate-600 rounded py-1.5 transition-colors"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
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

  const handleDefaultDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const btn = 'px-2 py-1 rounded hover:bg-gray-200 transition-colors text-gray-600 flex items-center gap-1';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0 text-xs">
        <div className="flex items-center gap-1">
          <span className="font-medium text-gray-600">Image</span>
          <span className="text-gray-400 truncate max-w-xs">{filename}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.1, Math.round((z - 0.25) * 100) / 100))} className={btn}>−</button>
          <span className="text-gray-500 w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(8, Math.round((z + 0.25) * 100) / 100))} className={btn}>+</button>
          <button onClick={() => setZoom(1)} className={btn}>1:1</button>
        </div>
        <div className="flex items-center gap-1">
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
        </div>
      </div>
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
    </div>
  );
}
