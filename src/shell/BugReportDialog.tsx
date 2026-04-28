import { useState, useRef, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';

/**
 * Bug report review dialog — shows the captured screenshot and lets the user
 * add a quick description before sending.
 *
 * Triggered imperatively from utils/reportBug.ts via openBugReportDialog().
 * The Provider is mounted once at the App root.
 */

export interface BugReportSubmission {
  description: string;
}

/** Generic bug-report record shape consumed by the shell's list/detail UI. */
export interface BugReport {
  id: string;
  report_code?: string;
  reporter_name?: string | null;
  screenshot_url?: string | null;
  url?: string;
  user_agent?: string;
  viewport?: string;
  description?: string;
  is_resolved: boolean;
  resolution_note?: string;
  created_at: string;
  // Allow consumer-specific fields without blocking compilation
  [k: string]: unknown;
}

/** Payload that <reportBug> sends to the consumer's `submit` callback. */
export interface BugReportSubmitPayload {
  description?: string;
  screenshot?: Blob;
  url: string;
  userAgent: string;
  viewport: string;
}

/** Config bundle for the bug-report subsystem. Consumer-supplied; the shell
 *  never calls a hardcoded URL. */
export interface BugReportConfig {
  submit: (p: BugReportSubmitPayload) => Promise<unknown>;
  /** Fetcher for the admin Bug Reports list. Receives query-string-shaped
   *  params (e.g. `is_resolved=false`); paginated response. When omitted the
   *  Bug Reports list page is unavailable. */
  list?: (params?: Record<string, string>) => Promise<{ results: BugReport[]; count?: number; next?: string | null; previous?: string | null }>;
  /** Mark a report resolved or reopened, with an optional admin note. */
  resolve?: (id: string, is_resolved: boolean, resolution_note?: string) => Promise<BugReport>;
}

const BugReportContext = createContext<BugReportConfig | null>(null);

export function BugReportConfigProvider({ value, children }: { value: BugReportConfig; children: ReactNode }) {
  return <BugReportContext.Provider value={value}>{children}</BugReportContext.Provider>;
}

/** Returns the consumer-supplied bug-report config, or null when no provider
 *  is mounted. Click handlers should hide their menu item if this is null. */
export function useBugReport(): BugReportConfig | null {
  return useContext(BugReportContext);
}

type OpenFn = (screenshot: Blob | null) => Promise<BugReportSubmission | null>;

let globalOpen: OpenFn = () => Promise.resolve(null);
export const openBugReportDialog: OpenFn = (screenshot) => globalOpen(screenshot);

export function BugReportProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const resolveRef = useRef<(value: BugReportSubmission | null) => void>();

  const openFn: OpenFn = useCallback((s) => {
    setScreenshot(s);
    setDescription('');
    setOpen(true);
    return new Promise<BugReportSubmission | null>(resolve => {
      resolveRef.current = resolve;
    });
  }, []);

  useEffect(() => { globalOpen = openFn; }, [openFn]);

  // Manage object URL lifetime for the preview
  useEffect(() => {
    if (!screenshot) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(screenshot);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  const handleSubmit = () => {
    setOpen(false);
    resolveRef.current?.({ description: description.trim() });
  };

  const handleCancel = () => {
    setOpen(false);
    resolveRef.current?.(null);
  };

  return (
    <>
      {children}
      <Dialog open={open} onClose={handleCancel} className="relative z-[9999]">
        <DialogBackdrop className="fixed inset-0 bg-black/40" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
            <DialogTitle className="text-base font-semibold text-gray-900">Report a bug</DialogTitle>
            <p className="mt-1 text-xs text-gray-500">A screenshot of your current view will be sent to the admin team.</p>

            {previewUrl && (
              <div className="mt-4 rounded-md border border-gray-200 overflow-hidden bg-gray-50 max-h-64">
                <img src={previewUrl} alt="Screenshot preview" className="w-full h-auto max-h-64 object-contain" />
              </div>
            )}
            {!previewUrl && (
              <div className="mt-4 rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                Screenshot capture failed — your description will still be sent.
              </div>
            )}

            <label className="mt-4 block text-sm font-medium text-gray-700">
              What went wrong?
              <span className="font-normal text-gray-400 ml-1">(optional)</span>
            </label>
            <textarea
              autoFocus
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
              placeholder="Briefly describe the issue, what you were doing, what you expected to happen…"
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={handleCancel}
                className="bg-white text-gray-700 border border-gray-300 px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={handleSubmit}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium rounded-lg">
                Send Report
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
