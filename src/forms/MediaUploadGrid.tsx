/**
 * MediaUploadGrid — the kit's standard MULTI-image / video gallery uploader, and
 * the sibling of {@link MediaUploadField}. Where the field owns one slot, the
 * grid owns a list: a thumbnail grid with an "＋ Add" tile, per-thumb remove,
 * optional drag-to-reorder, and an optional "cover" badge on the first item.
 * Empty, it shows the same dashed dropzone as the single field.
 *
 * Presentational and controlled: it renders the `items` you pass and reports
 * intent through callbacks — it owns NO picker modal, NO upload, and NO ordering
 * logic. Adding is INJECTED via `onPick(droppedFile?)` (fires on click of the
 * Add tile / empty dropzone, and on a file drop onto the zone); removing via
 * `onRemove(id)`; reordering via `onReorder(from, to)`. The consumer resolves
 * each into its own state / API. Shares `mediaFileName` and the dropzone look
 * with {@link MediaUploadField} (DRY / SSoT).
 */
import { useId, useState, type DragEvent, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import FormField from './FormField';
import { isVideoUrl, mediaFileName, Spinner, UploadGlyph } from './mediaShared';

export interface MediaUploadGridItem {
  /** Stable key — used for React keys, remove, and reorder. */
  id: string;
  /** Preview URL. */
  url: string;
  /** `image` | `video`. Inferred from the URL when omitted. */
  kind?: 'image' | 'video';
  /** Optional label overlaid on the thumbnail (filename, dimensions, …). */
  caption?: ReactNode;
  /** Force the "cover" badge on this item (else `showCover` badges the first). */
  cover?: boolean;
}

export interface MediaUploadGridProps {
  /** The gallery contents, in display order. */
  items: MediaUploadGridItem[];
  /**
   * Open the consumer's library/upload flow. Fires on click of the Add tile /
   * empty dropzone and on a file drop onto the zone (the dropped File is passed
   * so the consumer can seed an immediate upload). Without it the gallery is
   * read-only for additions (no Add tile, no drop).
   */
  onPick?: (droppedFile?: File) => void;
  /** Remove one item. The per-thumb ✕ shows only when this is provided. */
  onRemove?: (id: string) => void;
  /**
   * Reorder within the grid. Enables drag-to-reorder when provided; called with
   * the source and target indices on drop.
   */
  onReorder?: (fromIndex: number, toIndex: number) => void;

  // ── Field chrome (delegates to the shell FormField) ──
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;

  // ── Media ──
  /** Native accept string — drives preview kind, the drop filter, and the copy. Default `image/*`. */
  accept?: string;
  /** `object-fit` for the thumbnails. Default `cover`. */
  fit?: 'cover' | 'contain';
  /** Thumbnail (and Add tile) square size in px. Default 96. */
  thumbSize?: number;

  // ── Empty-state copy (shared with MediaUploadField) ──
  /** Dim prompt line on the empty dropzone. Default derived from `accept`. */
  placeholder?: ReactNode;
  /** The link CTA on the empty dropzone. Default "Choose from library or upload". */
  cta?: ReactNode;
  /** Small kind hint under the CTA, e.g. "PNG · JPG · WEBP". */
  acceptHint?: ReactNode;

  // ── Cover badge ──
  /** Badge the first item (or the one with `cover`) as the gallery cover. Default false. */
  showCover?: boolean;
  /** Cover badge text. Default "Cover". */
  coverLabel?: ReactNode;

  // ── State ──
  /** Busy: dim the zone and show a spinner while the caller's upload runs. */
  busy?: boolean;
  /** Busy label. Default "Uploading…". */
  busyLabel?: ReactNode;
  /** Disable all interaction. */
  disabled?: boolean;
  /** View only — thumbnails without Add / remove / reorder affordances. */
  readOnly?: boolean;
}

const REMOVE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className="h-3 w-3">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export default function MediaUploadGrid({
  items,
  onPick,
  onRemove,
  onReorder,
  label,
  hint,
  error,
  required,
  className,
  accept = 'image/*',
  fit = 'cover',
  thumbSize = 96,
  placeholder,
  cta = 'Choose from library or upload',
  acceptHint,
  showCover = false,
  coverLabel = 'Cover',
  busy = false,
  busyLabel = 'Uploading…',
  disabled = false,
  readOnly = false,
}: MediaUploadGridProps) {
  const gridId = useId();
  const [zoneDragOver, setZoneDragOver] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  // Which focusable control holds focus, so we can draw an inline focus ring —
  // the kit's shipped stylesheet has no Tailwind focus/ring machinery to fall
  // back on (see MediaUploadField). Keyed per control (zone/add/rm:<id>/thumb:<id>).
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const ringStyle = (key: string) => ({
    outline: 'none' as const,
    ...(focusedKey === key && !locked ? { boxShadow: '0 0 0 2px rgba(59,130,246,0.45)' } : {}),
  });
  const blurKey = (key: string) => setFocusedKey(k => (k === key ? null : k));

  const locked = disabled || busy;
  const canAdd = !!onPick && !locked && !readOnly;
  const canRemove = !!onRemove && !locked && !readOnly;
  const reorderEnabled = !!onReorder && !locked && !readOnly;

  const acceptsVideo = accept.includes('video');
  const acceptsImage = accept.includes('image') || accept === '*' || accept === '';
  const kindWord = acceptsVideo && !acceptsImage ? 'video' : acceptsImage && !acceptsVideo ? 'image' : 'file';
  const dimLine = placeholder ?? `Upload ${kindWord === 'image' ? 'an image' : `a ${kindWord}`}`;

  const pick = (file?: File | null) => {
    if (!canAdd) return;
    onPick!(file ?? undefined);
  };

  const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types || []).includes('Files');

  // Zone-level drag/drop handles EXTERNAL file drops (add). Internal reorder
  // drags are handled on the thumbnails and stop propagation, so they never
  // trigger the zone highlight or an accidental add.
  const zoneHandlers = canAdd
    ? {
        onDragOver: (e: DragEvent) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          setZoneDragOver(true);
        },
        onDragLeave: () => setZoneDragOver(false),
        onDrop: (e: DragEvent) => {
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          e.preventDefault();
          setZoneDragOver(false);
          pick(file);
        },
      }
    : {};

  const square = { width: thumbSize, height: thumbSize } as const;

  const thumb = (item: MediaUploadGridItem, index: number) => {
    const video = item.kind ? item.kind === 'video' : isVideoUrl(item.url, accept);
    const name = mediaFileName(item.url);
    const isCover = showCover && (item.cover ?? index === 0);
    return (
      <div
        key={item.id}
        draggable={reorderEnabled || undefined}
        onDragStart={
          reorderEnabled
            ? (e: DragEvent) => {
                // setData is required for Firefox to start the drag; the payload
                // is unused (we track the source via `draggingIndex`).
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
                setDraggingIndex(index);
              }
            : undefined
        }
        onDragEnd={reorderEnabled ? () => setDraggingIndex(null) : undefined}
        onDragOver={
          reorderEnabled
            ? (e: DragEvent) => {
                if (draggingIndex == null) return;
                e.preventDefault();
                e.stopPropagation();
              }
            : undefined
        }
        onDrop={
          reorderEnabled
            ? (e: DragEvent) => {
                if (draggingIndex == null) return;
                e.preventDefault();
                e.stopPropagation();
                if (draggingIndex !== index) onReorder!(draggingIndex, index);
                setDraggingIndex(null);
              }
            : undefined
        }
        tabIndex={reorderEnabled ? 0 : undefined}
        aria-label={reorderEnabled ? `${name}, item ${index + 1} of ${items.length}. Use arrow keys to reorder.` : undefined}
        onKeyDown={
          reorderEnabled
            ? (e: KeyboardEvent) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  if (index > 0) { e.preventDefault(); onReorder!(index, index - 1); }
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  if (index < items.length - 1) { e.preventDefault(); onReorder!(index, index + 1); }
                }
              }
            : undefined
        }
        onFocus={reorderEnabled ? (e: FocusEvent) => { if (e.target === e.currentTarget) setFocusedKey(`thumb:${item.id}`); } : undefined}
        onBlur={reorderEnabled ? (e: FocusEvent) => { if (e.target === e.currentTarget) blurKey(`thumb:${item.id}`); } : undefined}
        className={[
          'relative shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100',
          draggingIndex === index ? 'opacity-50' : '',
        ].join(' ')}
        style={{ ...square, cursor: reorderEnabled ? 'move' : undefined, ...ringStyle(`thumb:${item.id}`) }}
      >
        {video ? (
          <video src={item.url} muted playsInline preload="metadata" aria-label={name} className="h-full w-full" style={{ objectFit: fit }} />
        ) : (
          <img src={item.url} alt={name} className="h-full w-full" style={{ objectFit: fit }} />
        )}

        {isCover && (
          <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
            {coverLabel}
          </span>
        )}

        {item.caption != null && (
          <span
            className="absolute inset-x-1 bottom-1 truncate rounded px-1.5 py-0.5 text-xs text-white"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          >
            {item.caption}
          </span>
        )}

        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove!(item.id)}
            aria-label={`Remove ${name}`}
            onFocus={() => setFocusedKey(`rm:${item.id}`)}
            onBlur={() => blurKey(`rm:${item.id}`)}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-white"
            style={{ background: 'rgba(0,0,0,0.55)', ...ringStyle(`rm:${item.id}`) }}
          >
            {REMOVE_ICON}
          </button>
        )}
      </div>
    );
  };

  const addTile = canAdd && (
    <button
      type="button"
      onClick={() => pick()}
      aria-label="Add media"
      onFocus={() => setFocusedKey('add')}
      onBlur={() => blurKey('add')}
      className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-500"
      style={{ ...square, ...ringStyle('add') }}
    >
      <UploadGlyph className="h-5 w-5" />
      <span className="text-xs font-medium text-gray-500">Add</span>
    </button>
  );

  // Empty state: the shared dashed dropzone (only when the caller can add).
  const emptyDropzone = canAdd ? (
    <button
      type="button"
      onClick={() => pick()}
      aria-label={typeof dimLine === 'string' ? dimLine : 'Upload media'}
      onFocus={() => setFocusedKey('zone')}
      onBlur={() => blurKey('zone')}
      className={[
        'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center transition-colors cursor-pointer',
        zoneDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100',
      ].join(' ')}
      style={{ minHeight: thumbSize + 32, ...ringStyle('zone') }}
    >
      <span className="text-gray-400"><UploadGlyph /></span>
      <span className="px-3 text-xs text-gray-500">{dimLine}</span>
      <span className="text-sm font-medium text-blue-600">{cta}</span>
      {acceptHint && <span className="text-xs text-gray-400">{acceptHint}</span>}
    </button>
  ) : (
    <div
      className="flex w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs text-gray-400"
      style={{ minHeight: thumbSize + 32 }}
    >
      No media.
    </div>
  );

  return (
    <FormField label={label} labelId={label ? `${gridId}-label` : undefined} htmlFor={gridId} hint={hint} error={error} required={required} className={className}>
      <div
        id={gridId}
        role="group"
        aria-labelledby={label ? `${gridId}-label` : undefined}
        aria-describedby={error ? `${gridId}-error` : hint ? `${gridId}-hint` : undefined}
        aria-busy={busy || undefined}
        {...zoneHandlers}
        className="relative rounded-lg transition-colors"
        style={{
          ...(locked ? { opacity: 0.6 } : {}),
          // Inline box-shadow, not `ring-*` — the kit's shipped stylesheet has no
          // Tailwind ring machinery (see MediaUploadField's focus ring).
          ...(zoneDragOver ? { boxShadow: '0 0 0 2px rgba(59,130,246,0.5)' } : {}),
        }}
      >
        {items.length === 0 ? (
          emptyDropzone
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map(thumb)}
            {addTile}
          </div>
        )}

        {busy && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.6)' }}
          >
            <Spinner />
            <span className="text-xs font-medium text-gray-600">{busyLabel}</span>
          </div>
        )}
      </div>
    </FormField>
  );
}
