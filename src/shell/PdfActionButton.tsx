import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { PopupMenu, PopupMenuItem, PopupMenuDivider } from './PopupMenu';
import { useWindowManager } from './WindowManager';
import { setPdfPreview } from '../apps/Preview';
import toast from './toast';

export interface PdfActionButtonProps {
  /**
   * Resolves the PDF bytes. The consumer owns the transport (axios/fetch/etc.)
   * and any error reporting; returning `null` aborts the action without the
   * shell surfacing a toast (the consumer is expected to have explained the
   * failure already).
   */
  fetchPdf: () => Promise<Blob | null>;
  /** Filename used for download and shown in the Preview window (e.g. "Invoice_CI#1234.pdf"). */
  filename: string;
  /** Button label. */
  label?: string;
  /** Override the default button styling. */
  className?: string;
  /** Disabled state. */
  disabled?: boolean;
  /**
   * Optional email handler. When supplied, a "Send by Email" item (with a
   * divider above it) is added to the menu and an Email button is wired into
   * the Preview window — both invoked with the already-fetched blob so the
   * consumer can hand it to its own composer. Omit it to hide email entirely.
   */
  onEmail?: (blob: Blob) => void;
  /**
   * Optional notification fired after a Preview window has been opened with the
   * resolved PDF (e.g. to drop a Recent Documents shortcut). Receives the
   * filename so the consumer can label the entry.
   */
  onPreviewOpened?: (filename: string) => void;
  /** Optional leading icon override for the button (defaults to a document glyph). */
  icon?: ReactNode;
}

const DEFAULT_BUTTON_CLASS =
  'inline-flex items-center gap-1.5 bg-white text-gray-700 border border-gray-300 px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50';

const DocumentIcon = (
  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
);

/**
 * A dropdown PDF button that can Preview the document in the shell's Preview
 * window, Download it, or (when `onEmail` is supplied) hand the bytes to a
 * consumer-provided email composer.
 *
 * The shell is transport-agnostic: it never fetches the PDF itself. The
 * consumer injects a `fetchPdf()` resolver (typically wrapping its own HTTP
 * client) and the shell handles object-URL lifecycle, download, the loading
 * placeholder in Preview, and success toasts. App concerns (email composer,
 * recent-documents logging) are lifted to the optional `onEmail` /
 * `onPreviewOpened` callbacks.
 */
export default function PdfActionButton({
  fetchPdf,
  filename,
  label = 'PDF',
  className,
  disabled,
  onEmail,
  onPreviewOpened,
  icon,
}: PdfActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const { openPage } = useWindowManager();

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ left: rect.left, top: rect.bottom + 4 });
    }
  }, [open]);

  // Wrap the consumer's resolver so the spinner reflects in-flight fetches no
  // matter which action triggered them.
  const resolvePdf = async (): Promise<Blob | null> => {
    setLoading(true);
    try {
      return await fetchPdf();
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setOpen(false);
    const blob = await resolvePdf();
    if (!blob) return;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success(`${filename} downloaded.`);
  };

  const handlePreview = async () => {
    setOpen(false);
    // Open the viewer immediately with a loading placeholder, then swap in the
    // resolved PDF once the blob arrives (only updates this very window).
    const handle = setPdfPreview({ filename, converting: true, convertingMessage: 'LOADING PDF' });
    openPage('/preview');
    const blob = await resolvePdf();
    if (!blob) {
      handle.update({ filename, converting: false, convertingMessage: 'Failed to load PDF.' });
      return;
    }
    const url = window.URL.createObjectURL(blob);
    // Wire the Preview window's Email button to the same already-fetched blob.
    handle.update({ url, filename, ...(onEmail ? { onEmail: () => onEmail(blob) } : {}) });
    onPreviewOpened?.(filename);
  };

  const handleEmail = async () => {
    setOpen(false);
    const blob = await resolvePdf();
    if (!blob || !onEmail) return;
    onEmail(blob);
  };

  const btnCls = className || DEFAULT_BUTTON_CLASS;

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(!open)} disabled={disabled || loading} className={btnCls} data-menu-toggle>
        {icon ?? DocumentIcon}
        {loading ? 'Loading...' : label}
        <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>

      {open && createPortal(
        <PopupMenu style={menuPos} onClose={() => setOpen(false)} minWidth={180}>
          <PopupMenuItem onClick={handlePreview}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Preview
          </PopupMenuItem>
          <PopupMenuItem onClick={handleDownload}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            Download
          </PopupMenuItem>
          {onEmail && (
            <>
              <PopupMenuDivider />
              <PopupMenuItem onClick={handleEmail}>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                Send by Email
              </PopupMenuItem>
            </>
          )}
        </PopupMenu>,
        document.body
      )}
    </>
  );
}
