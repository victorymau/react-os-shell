/**
 * Fetch a file from the user's file-server and route it into the right
 * preview window. Shared by the Files app and the desktop Documents
 * folder's shortcut click-through.
 *
 * On success, dispatches `react-os-shell:preview-opened` so Desktop can
 * record the file as a shortcut without this util needing access to the
 * prefs adapter.
 */
import toast from '../shell/toast';
import { setPdfPreview } from '../apps/Preview';
import { setSpreadsheetPreview } from '../apps/Spreadsheet';

export type PreviewFileKind = 'pdf' | 'dxf' | '3d' | 'image' | 'csv';

export interface OpenPreviewFileOpts {
  /** Server-relative path, e.g. "/reports/Q1.pdf". */
  filePath: string;
  /** Display name (also used as the download filename). */
  filename: string;
  /** Which viewer to route into. CSV opens in Spreadsheet; the rest open in Preview. */
  kind: PreviewFileKind;
  /** Optional callback invoked after staging the preview, with the route to
   *  open (e.g. '/preview' or '/spreadsheet'). The caller is responsible
   *  for actually opening the page since the window manager hook is
   *  React-scoped. */
  onStaged?: (route: '/preview' | '/spreadsheet') => void;
}

export const PREVIEW_OPENED_EVENT = 'react-os-shell:preview-opened';

export interface PreviewOpenedDetail {
  filePath: string;
  filename: string;
  kind: PreviewFileKind;
}

function getServer() {
  const override = (typeof window !== 'undefined' && (window as any).__REACT_OS_SHELL_FILE_SERVER__) as string | undefined;
  return (override || 'http://localhost:4000').replace(/\/$/, '');
}

export async function openPreviewFile(opts: OpenPreviewFileOpts): Promise<boolean> {
  const { filePath, filename, kind, onStaged } = opts;
  try {
    const res = await fetch(
      `${getServer()}/api/file?path=${encodeURIComponent(filePath)}`,
      { credentials: 'include' },
    );
    if (!res.ok) {
      toast.error(`Download failed (${res.status})`);
      return false;
    }
    const blob = await res.blob();
    if (kind === 'csv') {
      const text = await blob.text();
      setSpreadsheetPreview({ csv: text, filename });
      onStaged?.('/spreadsheet');
    } else {
      const url = URL.createObjectURL(blob);
      setPdfPreview({ url, filename, kind });
      onStaged?.('/preview');
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<PreviewOpenedDetail>(PREVIEW_OPENED_EVENT, {
        detail: { filePath, filename, kind },
      }));
    }
    return true;
  } catch (e: any) {
    toast.error(e?.message || 'Open failed');
    return false;
  }
}
