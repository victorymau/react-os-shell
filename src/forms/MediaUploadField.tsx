/**
 * MediaUploadField — the kit's standard "choose a media asset" control, and the
 * server-wide pattern for image / video slots across the EFFICIENT portals.
 *
 * Empty state: a dashed dropzone with an upload glyph, a dim prompt line, and a
 * link-style CTA ("Choose from library or upload"). Filled state: a preview
 * (image or video) with an optional filename badge and Replace / Remove actions.
 * Both states accept a dragged file.
 *
 * Presentational and controlled the kit way (`value` URL + `onChange(url)`), it
 * owns NO picker modal and NO upload/fetch — each portal has its own media
 * library and upload endpoint. Inject that via `onPick`: it fires on click and
 * on drop (with the dropped File, so the consumer can seed an immediate upload),
 * and the consumer resolves the selection back through `onChange`. With `onFile`
 * instead, the field owns the gesture — click opens the native dialog, a drop
 * lands on the zone — and hands the consumer the chosen `File` to upload
 * however it uploads everything else (harness PAT-10). With neither, the field
 * falls back to emitting an object-URL — handy for demos and staged-then-submit
 * forms (the field owns that blob URL's lifetime and revokes it on replace /
 * remove / unmount).
 *
 * Every gesture goes through `useFileIntake`, so `accept` and `maxSizeBytes`
 * are enforced on a drop exactly as the dialog enforces `accept` on a pick, and
 * a rejected file is announced.
 *
 * This is deliberately the SINGLE-slot field. Thumbnail grids, reorderable
 * zones, and attachment lists change for different reasons (SRP) and belong to a
 * sibling gallery primitive, not here.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Button from './Button';
import FormField from './FormField';
import {
  BusyOverlay, FilenameBadge, FOCUS_RING, dropzoneClass, isVideoUrl, mediaFileName, mediaPromptLine, Spinner, UploadGlyph,
} from './mediaShared';
import { FileIntakeAlert, useFileIntake } from './useFileIntake';

export interface MediaUploadFieldProps {
  /** The current media URL. Empty string (or null/undefined) = the CTA state. */
  value?: string | null;
  /** Controlled channel — the newly-chosen URL, or `''` when cleared (Remove). */
  onChange: (url: string) => void;
  /**
   * Open the consumer's library/upload picker. Fires on click and on drop; the
   * dropped File (if any) is passed so the consumer can seed an immediate
   * upload. The consumer resolves the selection back through `onChange`.
   * Omit to fall back to a hidden native `<input type=file>` that emits an
   * object-URL (demos, staged-then-submit forms).
   */
  onPick?: (droppedFile?: File) => void;
  /**
   * Receive the chosen or dropped File — the field owns the gesture (native
   * dialog on click, drop on the zone) and the consumer owns the upload. Ignored
   * when `onPick` is set.
   */
  onFile?: (file: File) => void;

  // ── Field chrome (delegates to the shell FormField) ──
  /** Label rendered above the control. */
  label?: ReactNode;
  /** Greyed helper line below the control. */
  hint?: ReactNode;
  /** Red error line — overrides `hint`. */
  error?: ReactNode;
  /** Append a red asterisk to the label. */
  required?: boolean;
  className?: string;

  // ── Media ──
  /**
   * Native `accept` string. Drives the preview kind (image vs video), the
   * fallback file dialog, and the default empty-state copy. Default `image/*`.
   */
  accept?: string;
  /** Rejected above this many bytes, with the reason announced. */
  maxSizeBytes?: number;
  /** `object-fit` for the preview. Default `cover`; use `contain` for logos/SVG. */
  fit?: 'cover' | 'contain';
  /** Preview / dropzone height in px (applied via inline style). Default 112. */
  height?: number;

  // ── Empty-state copy (the target design's three lines) ──
  /** Dim prompt line, e.g. "Upload a background video". Default derived from `accept`. */
  placeholder?: ReactNode;
  /** The link-style CTA line. Default "Choose from library or upload". */
  cta?: ReactNode;
  /** Small kind hint under the CTA, e.g. "PNG · JPG · WEBP". */
  acceptHint?: ReactNode;

  // ── Filled-state controls ──
  /** Overlay the derived filename on the preview. Default true. */
  showFilename?: boolean;
  /** Show the Replace button when filled. Default true. */
  allowReplace?: boolean;
  /** Show the Remove button when filled. Default true. */
  allowRemove?: boolean;
  /** Relabel Replace, e.g. "Change". Default "Replace". */
  replaceLabel?: ReactNode;
  /** Relabel Remove, e.g. "Clear". Default "Remove". */
  removeLabel?: ReactNode;

  // ── State ──
  /** Busy: disable controls and show a spinner while the caller's upload runs. */
  busy?: boolean;
  /** Busy label. Default "Uploading…". */
  busyLabel?: ReactNode;
  /** Fully disable the control (no click, no drop, no actions). */
  disabled?: boolean;
}

/** Re-exported from the shared media helpers so `import { mediaFileName }` from
 *  this module (and the package root) keeps working. */
export { mediaFileName } from './mediaShared';

export default function MediaUploadField({
  value,
  onChange,
  onPick,
  onFile,
  label,
  hint,
  error,
  required,
  className,
  accept = 'image/*',
  maxSizeBytes,
  fit = 'cover',
  height = 112,
  placeholder,
  cta = 'Choose from library or upload',
  acceptHint,
  showFilename = true,
  allowReplace = true,
  allowRemove = true,
  replaceLabel = 'Replace',
  removeLabel = 'Remove',
  busy = false,
  busyLabel = 'Uploading…',
  disabled = false,
}: MediaUploadFieldProps) {
  const [focused, setFocused] = useState(false);
  const fieldId = useId();

  // The blob URL the native fallback minted (if any) and whether it is a video.
  // We own its lifetime: revoke the previous one whenever we replace it, and on
  // unmount, so the fallback path doesn't leak object URLs.
  const objectUrlRef = useRef<string | null>(null);
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const locked = disabled || busy;
  // Extension first; then the MIME captured for an extensionless blob; then the
  // accept-kind heuristic. The blob check is what makes video preview correct in
  // the native fallback where the URL carries no extension.
  const isVideo = !!value && (isVideoUrl(value, accept) || value === videoBlobUrl);
  const dimLine = placeholder ?? mediaPromptLine(accept);

  /** Mint an object URL for the fallback path, revoking the previous one. */
  const emitObjectUrl = (file: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setVideoBlobUrl(file.type.startsWith('video/') ? url : null);
    onChange(url);
  };

  const clearValue = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setVideoBlobUrl(null);
    onChange('');
  };

  /** A file that passed every check: the injected picker, the consumer's uploader, or the object-URL fallback. */
  const deliver = (file: File) => {
    if (onPick) onPick(file);
    else if (onFile) onFile(file);
    else emitObjectUrl(file);
  };

  // One intake for the dialog and the drop. The drop handlers are shared by the
  // empty dropzone AND the filled preview so drag-to-replace works; a drop
  // carrying no file (dragged text/URL) is a no-op and never opens the dialog.
  const intake = useFileIntake({
    accept, maxSizeBytes, acceptHint, multiple: false, disabled: locked,
    onAccept: ([file]) => deliver(file),
  });
  const { dragOver } = intake;

  /** Click: the injected picker, or the native dialog. */
  const pick = () => {
    if (locked) return;
    if (onPick) onPick();
    else intake.open();
  };

  const previewName = value ? mediaFileName(value) : '';

  const filled = (
    <div>
      <div
        {...intake.zoneProps}
        className={[
          'relative overflow-hidden rounded-md border bg-gray-100 transition-colors',
          dragOver ? 'border-blue-500' : 'border-gray-200',
        ].join(' ')}
        style={{ height }}
      >
        {isVideo ? (
          <video
            src={value ?? undefined}
            muted
            playsInline
            preload="metadata"
            aria-label={previewName || undefined}
            className="h-full w-full"
            style={{ objectFit: fit }}
          />
        ) : (
          <img src={value ?? undefined} alt={previewName} className="h-full w-full" style={{ objectFit: fit }} />
        )}
        {showFilename && value && <FilenameBadge>{previewName}</FilenameBadge>}
        {busy && <BusyOverlay label={busyLabel} rounded="rounded-md" />}
      </div>
      {!disabled && (allowReplace || allowRemove) && (
        <div className="mt-2 flex gap-2">
          {allowReplace && (
            <Button id={fieldId} variant="secondary" size="sm" onClick={() => pick()} disabled={busy}>
              {replaceLabel}
            </Button>
          )}
          {allowRemove && (
            <Button variant="ghost" size="sm" onClick={clearValue} disabled={busy}>
              {removeLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const empty = (
    <button
      type="button"
      id={fieldId}
      onClick={() => pick()}
      disabled={locked}
      aria-label={typeof dimLine === 'string' ? dimLine : 'Upload media'}
      aria-busy={busy || undefined}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
      aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...intake.zoneProps}
      className={dropzoneClass(dragOver, locked)}
      style={{
        minHeight: height,
        outline: 'none',
        boxShadow: focused && !locked ? FOCUS_RING : undefined,
      }}
    >
      {busy ? (
        <span role="status" className="flex flex-col items-center gap-1.5">
          <Spinner />
          <span className="text-xs font-medium text-gray-500">{busyLabel}</span>
        </span>
      ) : (
        <>
          <span className="text-gray-400">
            <UploadGlyph />
          </span>
          <span className="px-3 text-xs text-gray-500">{dimLine}</span>
          <span className="text-sm font-medium text-blue-600">{cta}</span>
          {acceptHint && <span className="text-xs text-gray-400">{acceptHint}</span>}
        </>
      )}
    </button>
  );

  return (
    <FormField label={label} htmlFor={fieldId} hint={hint} error={error} required={required} className={className}>
      {value ? filled : empty}
      {!onPick && <input {...intake.inputProps} />}
      <FileIntakeAlert rejections={intake.rejections} />
    </FormField>
  );
}
