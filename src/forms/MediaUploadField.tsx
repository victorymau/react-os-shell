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
 * and the consumer resolves the selection back through `onChange`. With `onPick`
 * omitted the field falls back to a hidden native `<input type=file>` and emits
 * an object-URL — handy for demos and staged-then-submit forms (the field owns
 * that blob URL's lifetime and revokes it on replace / remove / unmount).
 *
 * This is deliberately the SINGLE-slot field. Thumbnail grids, reorderable
 * zones, and attachment lists change for different reasons (SRP) and belong to a
 * sibling gallery primitive, not here.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import Button from './Button';
import FormField from './FormField';
import { isVideoUrl, mediaFileName, Spinner, UploadGlyph } from './mediaShared';

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
  label,
  hint,
  error,
  required,
  className,
  accept = 'image/*',
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // Own focus ring drawn inline: the kit's shipped stylesheet doesn't include
  // the Tailwind `focus:ring` machinery, so `focus:ring-*` classes paint
  // nothing. An inline box-shadow on focus is the reliable, theme-safe way to
  // keep the dropzone's focus visible (WCAG 2.4.7).
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
  const acceptsVideo = accept.includes('video');
  const acceptsImage = accept.includes('image') || accept === '*' || accept === '';
  // Extension first; then the MIME captured for an extensionless blob; then the
  // accept-kind heuristic. The blob check is what makes video preview correct in
  // the native fallback where the URL carries no extension.
  const isVideo = !!value && (isVideoUrl(value, accept) || value === videoBlobUrl);
  const kindWord = acceptsVideo && !acceptsImage ? 'video' : acceptsImage && !acceptsVideo ? 'image' : 'file';
  const dimLine = placeholder ?? `Upload ${kindWord === 'image' ? 'an image' : `a ${kindWord}`}`;

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

  /** Open the injected picker, or fall back to the native file dialog / dropped file. */
  const pick = (file?: File | null) => {
    if (locked) return;
    if (onPick) {
      onPick(file ?? undefined);
      return;
    }
    if (file) {
      emitObjectUrl(file);
      return;
    }
    inputRef.current?.click();
  };

  const onNativeFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) emitObjectUrl(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  // Drag-drop handlers, shared by the empty dropzone AND the filled preview so
  // drag-to-replace works. A drop with no file (dragged text/URL) is a no-op —
  // it never falls through to opening the native dialog.
  const dropHandlers = locked
    ? {}
    : {
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          setDragOver(true);
        },
        onDragLeave: () => setDragOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) pick(file);
        },
      };

  const previewName = value ? mediaFileName(value) : '';

  const filled = (
    <div>
      <div
        {...dropHandlers}
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
        {showFilename && value && (
          <span
            className="absolute inset-x-1 bottom-1 truncate rounded px-1.5 py-0.5 text-xs text-white"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          >
            {previewName}
          </span>
        )}
        {busy && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center gap-2"
            style={{ background: 'rgba(255,255,255,0.6)' }}
          >
            <Spinner />
            <span className="text-xs font-medium text-gray-600">{busyLabel}</span>
          </div>
        )}
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
      {...dropHandlers}
      className={[
        'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center transition-colors',
        locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100',
      ].join(' ')}
      style={{
        minHeight: height,
        outline: 'none',
        boxShadow: focused && !locked ? '0 0 0 2px rgba(59,130,246,0.45)' : undefined,
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
      {!onPick && (
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onNativeFile} />
      )}
    </FormField>
  );
}
