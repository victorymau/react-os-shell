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
   *  renders an `<img>` for raster screenshots / photos. */
  kind?: 'pdf' | 'dxf' | 'image';
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
    const kind: 'pdf' | 'image' | 'dxf' | undefined =
      ext === 'pdf' ? 'pdf'
      : ext === 'dxf' ? 'dxf'
      : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext) ? 'image'
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
        accept=".pdf,.dxf,.jpg,.jpeg,.png,.gif,.webp,.svg,.avif,.bmp"
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
      <span className="text-[10px] text-gray-400 ml-1">PDF · DXF · Images</span>
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
            <li><span className="font-mono text-gray-700">.dxf</span> — vector CAD drawings (requires the optional <span className="font-mono">dxf-viewer</span> peer dep)</li>
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

function DxfPanel({ url, filename, onDownload, onEmail }: DxfPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let viewer: any = null;
    setLoading(true);
    setError(null);

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
        // dxf-viewer expects clearColor to be a THREE.Color instance (it
        // calls .getHex() on it). dxf-viewer re-exports three internally,
        // so reuse whichever copy ships with the consumer's bundle.
        let three: any = null;
        try { three = await import(/* @vite-ignore */ 'three' as any); } catch {}
        const ClearColor = three?.Color ?? null;
        const viewerOpts: any = {
          autoResize: true,
          colorCorrection: true,
        };
        if (ClearColor) viewerOpts.clearColor = new ClearColor(0xffffff);
        viewer = new DxfViewer(containerRef.current, viewerOpts);
        viewerRef.current = viewer;
        await viewer.Load({ url, fonts: [], workerFactory: null });
        if (cancelled) return;
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

  const handleDefaultDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const handleResetView = () => {
    try { viewerRef.current?.FitView?.(); } catch {}
  };

  const btn = 'px-2 py-1 rounded hover:bg-gray-200 transition-colors text-gray-600 flex items-center gap-1';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0 text-xs">
        <div className="flex items-center gap-1">
          <span className="font-medium text-gray-600">DXF</span>
          <span className="text-gray-400 truncate max-w-xs">{filename}</span>
        </div>
        <div className="flex items-center gap-1">
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
      <div className="relative flex-1 bg-white">
        <div ref={containerRef} className="absolute inset-0" />
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
