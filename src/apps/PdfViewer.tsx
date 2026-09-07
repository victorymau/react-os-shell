/**
 * PdfViewer — the pdf.js reader, on its own so it can be embedded.
 *
 * It was the Preview window's private `PdfPanel` until a consumer needed a PDF
 * inside a dialog rather than in a window of its own. The two consumers that
 * needed one had each reached for `<iframe src={blobUrl}>`, which hands the
 * page to the BROWSER's built-in plugin: its own toolbar, a ~250px thumbnail
 * rail, and its own idea of the zoom — roughly a third of an already small
 * pane spent on chrome nobody asked for, and a portrait page cropped at the
 * fold. Nothing about that is themeable or testable, and it is not this
 * package's viewer.
 *
 * Import it lazily (`react-os-shell/apps` exports it wrapped in `lazy`, like
 * the other document apps) and render it inside a `<Suspense>`: the static
 * `pdfjs-dist` import below must not reach a host's startup bundle. Give it a
 * parent with a resolved height — it fills its container and scrolls inside.
 */
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import toast from '../shell/toast';
import { hasWasmPreamble, wasmBytesError } from './_wasmBytes';
import { PanelActions } from './_panelActions';

// Default the worker to the matching unpkg build (mirrors the consumer's
// installed npm version exactly). Consumers can override by setting
// pdfjsLib.GlobalWorkerOptions.workerSrc themselves before this module loads.
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

// pdf.js does not ship its JBIG2 and JPEG 2000 decoders as JavaScript any
// more: both are WebAssembly modules it loads at decode time, and it will only
// load them from a location the caller supplies. With neither `wasmUrl` nor a
// `BinaryDataFactory` configured — this package's state until now — the
// decoder asks for one, pdf.js's own base factory throws "Ensure that the
// `wasmUrl` API parameter is provided", and the worker swallows that as a
// `warn()`. The page still renders; the scanned or JPEG-2000 image on it is
// just missing. Nothing reaches the user, which is why it went unnoticed.
//
// The fix follows the mechanism the admin portal already uses for the pdf
// WORKER (`import ... from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`, which
// Vite emits as /assets/pdf.worker.min-<hash>.mjs): let the CONSUMER'S bundler
// emit the file and hand pdf.js the URL it produced. `new URL(spec,
// import.meta.url)` is the bundler-neutral spelling of that — Vite resolves
// the bare specifier and emits the binary as its own hashed asset (verified on
// Vite 5 and 7), and a bundler that does not understand the form leaves it
// alone and lands back on today's warn-and-degrade rather than on an error.
//
// The specifier points at the CONSUMER'S installed `pdfjs-dist`, not at a copy
// vendored into this package. That is deliberate: these binaries are built
// alongside the worker that instantiates them, and a vendored copy would pin
// them to THIS package's devDependency instead of to the peer they actually
// run against.
const PDF_WASM_MODULES: Record<string, string> = {
  'jbig2.wasm': new URL('pdfjs-dist/wasm/jbig2.wasm', import.meta.url).href,
  'openjpeg.wasm': new URL('pdfjs-dist/wasm/openjpeg.wasm', import.meta.url).href,
};

/** pdf.js instantiates this itself (it is passed to `getDocument` as a class,
 *  not an instance) and calls `fetch` once per binary it needs.
 *
 *  Only the `wasmUrl` kind is served. cMap and standard-font data are the other
 *  two kinds pdf.js can ask for, and this package has never configured a URL
 *  for either — so those keep the exact message pdf.js's own base factory
 *  raises for an unconfigured URL, and behave as they always have. */
class BundledPdfWasmFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    if (kind !== 'wasmUrl') {
      throw new Error(`Ensure that the \`${kind}\` API parameter is provided.`);
    }
    const href = PDF_WASM_MODULES[filename];
    if (!href) {
      throw new Error(`No bundled pdf.js wasm module for "${filename}".`);
    }
    const res = await fetch(href);
    if (!res.ok) {
      throw new Error(`Unable to load wasm data at: ${href}`);
    }
    // A 200 is not proof the bundler emitted the binary — see _wasmBytes.ts.
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!hasWasmPreamble(bytes)) {
      throw wasmBytesError(href, filename, bytes);
    }
    return bytes;
  }
}

/** The `getDocument` parameters that give pdf.js somewhere to load its wasm
 *  decoders from.
 *
 *  A consumer that serves the whole `pdfjs-dist/wasm/` directory itself (copied
 *  into `public/`, say, or on an air-gapped host) points us at it with
 *  `window.__REACT_OS_SHELL_PDF_WASM__` — same escape hatch as
 *  `__REACT_OS_SHELL_O3DV_LIBS__` below. pdf.js requires a trailing slash on
 *  that value and throws "Invalid factory url" without one, so add it here
 *  rather than making every consumer remember. Everyone else gets the
 *  bundler-emitted modules and configures nothing. */
function pdfWasmParams(): { wasmUrl?: string; BinaryDataFactory?: object } {
  const dir = typeof window !== 'undefined'
    ? (window as unknown as { __REACT_OS_SHELL_PDF_WASM__?: unknown }).__REACT_OS_SHELL_PDF_WASM__
    : undefined;
  if (typeof dir === 'string' && dir) {
    return { wasmUrl: dir.endsWith('/') ? dir : `${dir}/` };
  }
  return { BinaryDataFactory: BundledPdfWasmFactory };
}

export interface PdfViewerProps {
  /** Object URL or remote URL of the PDF. */
  url: string;
  /** Display name — also the filename the built-in Download uses. */
  filename: string;
  /**
   * What the auto-fit scale tracks until the reader picks a manual zoom.
   *
   * `'width'` fills the container's width and lets a tall page scroll — right
   * for a viewer that owns a whole window, and what the Preview app uses.
   * `'page'` fits the WHOLE page, which is what an embedded preview pane
   * wants: someone checking a document before sending it needs to see that it
   * is the right document, and a page cropped at the fold reads as broken.
   */
  fit?: 'width' | 'page';
  /** Replaces the built-in "save `url` as `filename`" download. */
  onDownload?: () => void;
  /** An Email button joins the toolbar only when this is supplied. */
  onEmail?: () => void;
}

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300, 400];

/** The `p-4` gutter the page sits in, on both axes. */
const PAGE_GUTTER = 40;
const MIN_SCALE = 0.3;
const MAX_SCALE = 4;

/**
 * The scale auto-fit lands on.
 *
 * @internal Exported for the spec. The effect that calls it needs a rendered
 * document and a laid-out container to reach, and the wrong answer here does
 * not throw — it crops the page at the fold, which reads as a broken preview
 * rather than as a bug in a formula.
 */
export function fitScale(
  fit: 'width' | 'page',
  container: { width: number; height: number },
  page: { width: number; height: number },
): number {
  const byWidth = (container.width - PAGE_GUTTER) / page.width;
  // Fitting the PAGE means neither axis may overflow, so take whichever
  // constraint binds first. Width alone is what crops a portrait page in a
  // pane wider than it is tall.
  const wanted = fit === 'page'
    ? Math.min(byWidth, (container.height - PAGE_GUTTER) / page.height)
    : byWidth;
  return Math.min(Math.max(wanted, MIN_SCALE), MAX_SCALE);
}

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

export default function PdfViewer({ url, filename, fit = 'width', onDownload, onEmail }: PdfViewerProps) {
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
    // Parameter-object form, not the bare string: pdfjs-dist 6.x removed the
    // string overload ("expected either `data`, `range`, or `url` parameter"),
    // so a consumer on 6.x had every preview die on this line. The object form
    // works on 5.x too. tests/pdfjsContract.test.ts fails if it reverts.
    pdfjsLib.getDocument({ url, ...pdfWasmParams() }).promise.then(doc => {
      if (cancelled) return;
      setPdf(doc);
      setTotalPages(doc.numPages);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { toast.error('Failed to load PDF'); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [url]);

  // Auto-fit: re-compute scale from the container whenever fit mode is on, the
  // document changes, the page changes, or the container resizes. Window
  // resize and Modal drag-resize both trigger ResizeObserver. Manual zoom
  // turns this off until the user clicks Fit again.
  useEffect(() => {
    if (!pdf || !fitMode || !containerRef.current) return;
    const recompute = () => {
      const el = containerRef.current;
      if (!el) return;
      pdf.getPage(page).then(p => {
        if (!containerRef.current) return;
        const viewport = p.getViewport({ scale: 1 });
        const next = fitScale(
          fit,
          { width: el.clientWidth, height: el.clientHeight },
          { width: viewport.width, height: viewport.height },
        );
        setScale(prev => (Math.abs(prev - next) < 0.005 ? prev : next));
      });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [pdf, page, fitMode, fit]);

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
  const reFit = () => setFitMode(true);
  const fitLabel = fit === 'page' ? 'Fit page' : 'Fit width';

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
          <option value="fit">{fitLabel}</option>
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
          onClick={reFit}
          className={btn + (fitMode ? ' bg-gray-200 text-gray-900' : '')}
          title={`${fitLabel} — auto-tracks the container size until you zoom manually`}
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
