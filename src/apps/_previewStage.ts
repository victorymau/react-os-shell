/**
 * PDF Preview staging — the tiny consumer-facing surface of the Preview app.
 *
 * Lives apart from Preview.tsx so importing `setPdfPreview` (from
 * `react-os-shell/apps` or shell internals like PdfActionButton /
 * openPreviewFile) never drags the viewer implementation — and its static
 * pdfjs-dist import — into a host's startup bundle. The Preview window
 * component stays behind its React.lazy dynamic import and drains the stage
 * on mount via the @internal peek/claim helpers below.
 */

export interface PdfPreviewData {
  /** Object URL or remote URL of the PDF. Blob URLs are revoked when the window unmounts.
   *  Leave blank when staging a `converting: true` placeholder; call `handle.update({...})`
   *  on the handle returned by `setPdfPreview` once conversion finishes. */
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

/** Handle returned by `setPdfPreview`. Holds the identity of the staged
 *  payload so a later `.update()` only targets the window that picked it up
 *  (not every open Preview, which would clobber unrelated windows). */
export interface PdfPreviewHandle {
  /** Replace the data shown in the window that consumed this staging. Safe to
   *  call before that window exists — an update that lands while the payload
   *  is still staged replaces the staged payload, so the window opens on the
   *  resolved file instead of the placeholder it was staged with.
   *  No-op only once the window that consumed the staging has been closed. */
  update(next: PdfPreviewData): void;
}

/** @internal Event carrying `.update()` payloads to the claiming window. */
export const PDF_PREVIEW_UPDATE_EVENT = 'react-os-shell:pdf-preview-update';

/** @internal Staged payload awaiting the next Preview window mount.
 *
 *  `data` is MUTABLE and deliberately so: `update()` rewrites it in place
 *  while the stage is still unclaimed. Restaging a fresh object instead would
 *  break the identity that `claimPdfPreviewStage` and the claimant's own
 *  `consumedRef` are holding. */
export interface PendingPdfStage {
  token: number;
  data: PdfPreviewData;
}

let pending: PendingPdfStage | null = null;
let nextToken = 0;

/** Stage a PDF for the next Preview window mount. The returned handle's
 *  `update()` method swaps content in *that* specific window only — use it
 *  to replace a `converting: true` placeholder with the resolved file. */
export function setPdfPreview(data: PdfPreviewData): PdfPreviewHandle {
  const token = ++nextToken;
  const stage: PendingPdfStage = { token, data };
  pending = stage;
  return {
    update(next: PdfPreviewData) {
      // The window is opened by `openPage('/preview')` and Preview is a lazy
      // chunk, so a consumer that resolves quickly — a cached PDF, a fast
      // endpoint, a second preview in the same session — can call this before
      // any window has mounted to listen. The event is fire-and-forget, so on
      // its own it would be dropped and the window would open on the
      // placeholder and sit there for ever. Rewrite the stage as well while it
      // is still ours: whoever drains it next gets the current payload.
      //
      // `pending === stage` is exactly "no window has claimed this yet".
      // Claiming and binding the listener happen in the same commit (see
      // Preview.tsx), so there is no third state where both paths miss.
      if (pending === stage) stage.data = next;
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent(PDF_PREVIEW_UPDATE_EVENT, { detail: { token, data: next } }));
    },
  };
}

/** @internal Render-phase peek — see Preview.tsx for the drain protocol. */
export function peekPdfPreviewStage(): PendingPdfStage | null {
  return pending;
}

/** @internal Commit-phase claim. The identity check keeps a payload staged
 *  *after* the claimant's render-phase peek available for the window it
 *  belongs to. */
export function claimPdfPreviewStage(stage: PendingPdfStage): void {
  if (pending === stage) pending = null;
}
