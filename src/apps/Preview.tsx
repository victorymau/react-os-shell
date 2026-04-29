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

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
        <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
        No PDF loaded
      </div>
    );
  }

  if (data.converting || !data.url) {
    return <ConvertingPanel filename={data.filename} message={data.convertingMessage} />;
  }

  return <PdfPanel key={data.url} url={data.url} filename={data.filename} onDownload={data.onDownload} onEmail={data.onEmail} />;
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
