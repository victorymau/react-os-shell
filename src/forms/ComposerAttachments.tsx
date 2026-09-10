/**
 * ComposerAttachments — files attached to a message being written.
 *
 * A composer is a text area with a send action: a chat reply, a mail compose
 * form, a feedback thread. Files reach it three ways — the "Attach files"
 * button, a drop anywhere on the composer, and a paste into the text area —
 * and before this each portal composer wired those itself: five drop zones in
 * five highlight styles, four copies of the same 25 MB / 10-file guard, and
 * three composers that took a pasted screenshot but no dropped one. This is
 * the one primitive (harness UI-15 / PAT-10), built on `useFileIntake` so the
 * checks and the rejection sentences are the ones every other upload surface
 * uses.
 *
 * It holds pending `File[]` and stops. It never uploads — the composer's send
 * puts the files in the request however it sends everything else.
 *
 * Three parts, exported separately for a composer with a layout of its own
 * (an icon rail, a footer with its own send button):
 *
 *   `AttachmentDropZone` — wraps the composer; the drop target, the paste
 *     target (paste bubbles up from the text area inside it), the hidden native
 *     input, and the "Drop files to attach" overlay.
 *   `AttachmentList` — the pending files as chips: thumbnail for an image, a
 *     glyph otherwise, name, size, and a remove ×.
 *   `AttachButton` — the paperclip. A labelled secondary button, or icon-only
 *     for a rail, with the pending count on it.
 *
 * `ComposerAttachments` assembles them in the standard order — text area,
 * chips, trigger row, rejections — for the composer that has no reason to
 * differ.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import Button from './Button';
import IconButton from './IconButton';
import { CloseGlyph } from './mediaShared';
import {
  FileIntakeAlert, humanSize, useFileIntake,
  type FileIntakeLimits, type FileRejection,
} from './useFileIntake';

/** What `useFileIntake` hands back; the three parts take it as `intake`. */
export type FileIntake = ReturnType<typeof useFileIntake>;

/** Paperclip, in the kit's line-icon style. */
export function PaperclipGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
    >
      <path d="M21 11.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.5 3.5 0 0 1 5 5l-9 9a1.5 1.5 0 0 1-2.1-2.1l8-8" />
    </svg>
  );
}

/** A generic document, for a chip whose file has no thumbnail. */
function FileGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

// ── AttachmentDropZone ──────────────────────────────────────────────────────

export interface AttachmentDropZoneProps {
  intake: FileIntake;
  /** The overlay's words while a file drag is over the composer. Default "Drop files to attach". */
  dropLabel?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The composer's drop and paste target. Spread the intake's zone and paste
 * handlers on one wrapper: a paste in the text area bubbles up to it, so the
 * text area needs no wiring of its own, and a paste of text is left alone.
 */
export function AttachmentDropZone({ intake, dropLabel = 'Drop files to attach', className = '', children }: AttachmentDropZoneProps) {
  return (
    <div {...intake.zoneProps} {...intake.pasteProps} className={`relative ${className}`}>
      {children}
      <input {...intake.inputProps} />
      {intake.dragOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-50/80 text-sm font-medium text-blue-600"
        >
          {dropLabel}
        </div>
      )}
    </div>
  );
}

// ── AttachmentList ──────────────────────────────────────────────────────────

export interface AttachmentListProps {
  files: File[];
  /** Remove the file at this index. Omit for a read-only list. */
  onRemove?: (index: number) => void;
  disabled?: boolean;
  className?: string;
}

const canPreview = () => typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

/**
 * Pending files as chips. An image gets a thumbnail from an object URL the
 * list owns — minted once per File, revoked when the file leaves the list or
 * the list unmounts, so a long composing session does not leak them.
 */
export function AttachmentList({ files, onRemove, disabled = false, className = '' }: AttachmentListProps) {
  const urls = useRef(new Map<File, string>());

  useEffect(() => {
    const live = new Set(files);
    for (const [file, url] of urls.current) {
      if (!live.has(file)) {
        URL.revokeObjectURL(url);
        urls.current.delete(file);
      }
    }
  }, [files]);
  useEffect(() => () => {
    for (const url of urls.current.values()) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);

  const thumbFor = (file: File): string | null => {
    if (!file.type.startsWith('image/') || !canPreview()) return null;
    let url = urls.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      urls.current.set(file, url);
    }
    return url;
  };

  if (files.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {files.map((file, i) => {
        const thumb = thumbFor(file);
        return (
          <li
            key={`${file.name}-${file.size}-${i}`}
            className="flex max-w-full items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 py-1 pl-1.5 pr-1 text-xs text-gray-700"
          >
            {thumb ? (
              <img src={thumb} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
            ) : (
              <span className="text-gray-400"><FileGlyph /></span>
            )}
            <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
            <span className="shrink-0 tabular-nums text-gray-400">{humanSize(file.size)}</span>
            {onRemove && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(i)}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:cursor-not-allowed"
              >
                <CloseGlyph className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── AttachButton ────────────────────────────────────────────────────────────

export interface AttachButtonProps {
  /** Open the dialog — `intake.open`. */
  onClick: () => void;
  /** Pending files, shown on the button so a rail with a hidden list still tells the count. */
  count?: number;
  /** `button` is the labelled secondary button; `icon` is the paperclip alone, for a rail. Default `button`. */
  variant?: 'button' | 'icon';
  /** Default "Attach files". */
  label?: string;
  disabled?: boolean;
}

/** The paperclip. One label everywhere: "Attach files". */
export function AttachButton({ onClick, count = 0, variant = 'button', label = 'Attach files', disabled = false }: AttachButtonProps) {
  const counted = count > 0 ? `${label} (${count})` : label;
  if (variant === 'icon') {
    return (
      <span className="relative inline-flex">
        <IconButton aria-label={counted} onClick={onClick} disabled={disabled} size="sm">
          <PaperclipGlyph />
        </IconButton>
        {count > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-blue-600 px-1 text-center text-[10px] font-semibold leading-4 text-white"
          >
            {count}
          </span>
        )}
      </span>
    );
  }
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick} disabled={disabled} leftIcon={<PaperclipGlyph />}>
      {counted}
    </Button>
  );
}

// ── ComposerAttachments ─────────────────────────────────────────────────────

export interface ComposerAttachmentsProps extends FileIntakeLimits {
  /** The pending files. */
  files: File[];
  onChange: (files: File[]) => void;
  /** Short kind hint, e.g. "PNG · JPG · PDF", used in a type rejection. */
  acceptHint?: ReactNode;
  disabled?: boolean;
  /** The overlay's words while a file drag is over the composer. */
  dropLabel?: ReactNode;
  /** The trigger's words. Default "Attach files". */
  attachLabel?: string;
  /** `button` (default) or `icon`. */
  trigger?: 'button' | 'icon';
  /** More controls on the trigger row — a screenshot capture, a voice note. */
  actions?: ReactNode;
  /** Called with every rejection batch, for a composer that toasts as well. */
  onReject?: (rejections: FileRejection[]) => void;
  className?: string;
  /** The text area (and anything else the message is written in). */
  children: ReactNode;
}

/**
 * The standard composer: text area, then the chips, then the trigger row, then
 * the rejections. Wrap it around the text area and hand it the pending list.
 */
export default function ComposerAttachments({
  files, onChange, accept, maxSizeBytes, maxFiles, acceptHint, disabled = false,
  dropLabel, attachLabel, trigger = 'button', actions, onReject, className = '', children,
}: ComposerAttachmentsProps) {
  const intake = useFileIntake({
    accept, maxSizeBytes, maxFiles, acceptHint, disabled, multiple: true,
    currentCount: files.length,
    onAccept: added => onChange([...files, ...added]),
  });

  const rejectedRef = useRef<FileRejection[]>([]);
  useEffect(() => {
    if (onReject && intake.rejections.length > 0 && intake.rejections !== rejectedRef.current) {
      rejectedRef.current = intake.rejections;
      onReject(intake.rejections);
    }
  }, [intake.rejections, onReject]);

  return (
    <AttachmentDropZone intake={intake} dropLabel={dropLabel} className={className}>
      {children}
      <AttachmentList
        files={files}
        disabled={disabled}
        onRemove={i => { intake.clearRejections(); onChange(files.filter((_, j) => j !== i)); }}
        className="mt-2"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <AttachButton onClick={intake.open} count={files.length} variant={trigger} label={attachLabel} disabled={disabled} />
        {actions}
      </div>
      <FileIntakeAlert rejections={intake.rejections} />
    </AttachmentDropZone>
  );
}
