/**
 * Spreadsheet staging — the tiny consumer-facing surface of the Spreadsheets
 * app. Lives apart from Spreadsheet.tsx so importing `setSpreadsheetPreview`
 * (from `react-os-shell/apps` or shell internals like openPreviewFile) never
 * drags the grid implementation into a host's startup bundle. The Spreadsheet
 * window component stays behind its React.lazy dynamic import and drains the
 * stage on mount via the @internal peek/claim helpers below.
 */

export interface SpreadsheetPreviewData {
  /** CSV text (comma- or tab-separated). */
  csv: string;
  /** Display name; the title strips a trailing `.csv`/`.tsv`/`.txt`. */
  filename: string;
  /** When provided, the toolbar shows an Email button that calls back with the
   *  sheet serialized as CSV at click time (edits included) and a filename
   *  derived from the current title. */
  onEmail?: (csv: string, filename: string) => void;
}

/** Handle returned by `setSpreadsheetPreview`. Holds the identity of the
 *  staged payload so a later `.update()` only targets the window that picked
 *  it up — opening a second Spreadsheet never clobbers the first. */
export interface SpreadsheetPreviewHandle {
  /** Replace the data shown in the window that consumed this staging.
   *  No-op if no window ever consumed it, or if that window has been closed. */
  update(next: SpreadsheetPreviewData): void;
}

/** @internal Event carrying `.update()` payloads to the claiming window. */
export const SPREADSHEET_PREVIEW_UPDATE_EVENT = 'react-os-shell:spreadsheet-preview-update';

/** @internal Staged payload awaiting the next Spreadsheet window mount. */
export interface PendingSpreadsheetStage {
  token: number;
  data: SpreadsheetPreviewData;
}

let pendingSpreadsheet: PendingSpreadsheetStage | null = null;
let nextSpreadsheetToken = 0;

/** Stage CSV content for the next Spreadsheet window mount. The returned
 *  handle's `update()` method swaps content in *that* specific window only. */
export function setSpreadsheetPreview(data: SpreadsheetPreviewData): SpreadsheetPreviewHandle {
  const token = ++nextSpreadsheetToken;
  pendingSpreadsheet = { token, data };
  return {
    update(next: SpreadsheetPreviewData) {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent(SPREADSHEET_PREVIEW_UPDATE_EVENT, { detail: { token, data: next } }));
    },
  };
}

/** @internal Render-phase peek — see Spreadsheet.tsx for the drain protocol. */
export function peekSpreadsheetPreviewStage(): PendingSpreadsheetStage | null {
  return pendingSpreadsheet;
}

/** @internal Commit-phase claim. The identity check keeps a payload staged
 *  *after* the claimant's render-phase peek available for the window it
 *  belongs to. */
export function claimSpreadsheetPreviewStage(stage: PendingSpreadsheetStage): void {
  if (pendingSpreadsheet === stage) pendingSpreadsheet = null;
}
