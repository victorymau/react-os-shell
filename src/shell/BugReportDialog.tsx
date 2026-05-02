import { useState, useRef, useEffect, useCallback, createContext, useContext, lazy, Suspense, type ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';

/**
 * Feedback dialog — shows the captured screenshot and lets the user pick
 * Bug or Suggestion and add a quick description before sending.
 *
 * Triggered imperatively from utils/reportBug.ts via openBugReportDialog().
 * The Provider is mounted once at the App root.
 */

export type ReportType = 'bug' | 'suggestion';

export interface BugReportSubmission {
  description: string;
  reportType: ReportType;
  /** The screenshot the user actually wants to send. Reflects any in-dialog
   *  annotation: callers should upload THIS blob, not the original capture
   *  they passed into `openBugReportDialog`. May be null if the original
   *  capture failed and the user submitted without uploading a fallback. */
  screenshot: Blob | null;
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
  report_type?: ReportType;
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
  reportType: ReportType;
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
  /** Permanently delete a report. When omitted the Delete button in
   *  `<BugReportDetail>` is hidden — the consumer's permission system
   *  decides whether to expose the capability at all. */
  delete?: (id: string) => Promise<void>;
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
  const [reportType, setReportType] = useState<ReportType>('bug');
  // Annotator overlay state — opens on top of the dialog. Lazy-loaded so
  // the annotator (and its SVG/canvas weight) only enters the bundle when
  // the user actually opens it.
  const [annotating, setAnnotating] = useState(false);
  const resolveRef = useRef<(value: BugReportSubmission | null) => void>();

  const openFn: OpenFn = useCallback((s) => {
    setScreenshot(s);
    setDescription('');
    setReportType('bug');
    // Defensive: ensure we never re-open straight into the annotator if a
    // previous session somehow exited with `annotating` left at true.
    setAnnotating(false);
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
    setAnnotating(false);
    setOpen(false);
    // Pass the current screenshot (which may be the annotated blob if the
    // user marked it up before sending) rather than relying on the caller
    // to remember what they captured.
    resolveRef.current?.({ description: description.trim(), reportType, screenshot });
  };

  const handleCancel = () => {
    setAnnotating(false);
    setOpen(false);
    resolveRef.current?.(null);
  };

  const isBug = reportType === 'bug';

  return (
    <>
      {children}
      <Dialog
        open={open}
        // Suppress onClose while the annotator is up. The annotator is nested
        // inside <Dialog> (so it isn't inert and receives pointer events), but
        // it's a sibling of <DialogPanel> — and HeadlessUI treats anything
        // outside the panel as an outside-click. Without this, every click on
        // the annotator's toolbar/canvas would dismiss the bug-report dialog.
        // The annotator's own Apply / Cancel buttons drive setAnnotating(false).
        onClose={annotating ? () => {} : handleCancel}
        className="relative z-[9999]"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/40" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
            <DialogTitle className="text-base font-semibold text-gray-900">Suggestion or Bug</DialogTitle>
            <p className="mt-1 text-xs text-gray-500">A screenshot of your current view will be sent to the admin team.</p>

            <div className="mt-4 inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
              <button type="button" onClick={() => setReportType('bug')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${isBug ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                Bug
              </button>
              <button type="button" onClick={() => setReportType('suggestion')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${!isBug ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                Suggestion
              </button>
            </div>

            {previewUrl && (
              <div className="mt-4">
                <div className="relative rounded-md border border-gray-200 overflow-hidden bg-gray-50 max-h-64">
                  <img src={previewUrl} alt="Screenshot preview" className="w-full h-auto max-h-64 object-contain" />
                  <button
                    type="button"
                    onClick={() => setAnnotating(true)}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/95 backdrop-blur border border-gray-200 shadow-sm text-xs font-medium text-gray-700 hover:bg-white"
                    title="Mark up the screenshot — circle, arrow, mosaic, text…"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                    Annotate
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-400">Click Annotate to mark up the screenshot before sending.</p>
              </div>
            )}
            {!previewUrl && (
              <UploadDropZone onSelect={(blob) => setScreenshot(blob)} />
            )}

            <label className="mt-4 block text-sm font-medium text-gray-700">
              {isBug ? 'What went wrong?' : "What's your suggestion?"}
              <span className="font-normal text-gray-400 ml-1">(optional)</span>
            </label>
            <textarea
              autoFocus
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
              placeholder={isBug
                ? 'Briefly describe the issue, what you were doing, what you expected to happen…'
                : 'Briefly describe what would make this better…'}
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
                Send
              </button>
            </div>
          </DialogPanel>
        </div>

        {/* Annotator lives inside the Dialog tree on purpose: HeadlessUI marks
            DOM outside the open Dialog as inert (so pointer events don't fire
            there) AND treats clicks outside the Dialog as outside-clicks (which
            would call onClose). Nesting the annotator here sidesteps both. */}
        {annotating && previewUrl && (
          <BugReportAnnotator
            src={previewUrl}
            onApply={(blob) => { setScreenshot(blob); setAnnotating(false); }}
            onCancel={() => setAnnotating(false)}
          />
        )}
      </Dialog>
    </>
  );
}

// Lazy-import the annotator so its SVG / canvas weight only enters the bundle
// when the user actually opens the markup overlay. Wrapped in our own Suspense
// boundary with a lightweight loader so it doesn't fall through to the app's.
const LazyImageAnnotator = lazy(() => import('../apps/ImageAnnotator'));

/** Fallback when automatic screenshot capture fails (user denies the
 *  Screen Capture permission, or it's unsupported). The user can drop or
 *  pick an image file — the bytes are passed to the parent as a Blob via
 *  `onSelect`, which behaves identically to a captured screenshot
 *  downstream (annotate / send). */
function UploadDropZone({ onSelect }: { onSelect: (blob: Blob) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    onSelect(file);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        accept(e.dataTransfer.files?.[0]);
      }}
      className={`mt-4 rounded-md border border-dashed px-4 py-6 text-center text-sm cursor-pointer transition-colors ${
        hover ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
      }`}
    >
      <p className="text-gray-700 font-medium">Screenshot capture failed</p>
      <p className="mt-1 text-xs text-gray-500">
        Drop an image here, or <span className="text-blue-600 underline">click to upload</span>. Your description will be sent either way.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => accept(e.target.files?.[0])}
        className="hidden"
      />
    </div>
  );
}

function BugReportAnnotator({
  src, onApply, onCancel,
}: { src: string; onApply: (blob: Blob) => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex flex-col">
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm text-white/80">Loading editor…</div>}>
        <div className="flex-1 m-4 rounded-lg overflow-hidden bg-white shadow-2xl">
          <LazyImageAnnotator src={src} filename="screenshot.png" onApply={onApply} onCancel={onCancel} />
        </div>
      </Suspense>
    </div>
  );
}
