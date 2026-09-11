/**
 * useFileIntake — the one way a file gets INTO a kit primitive.
 *
 * Every upload surface in the kit (`FilePicker`, `MediaUploadField`,
 * `MediaUploadGrid`, `BrandAssetEditor`, `BulkImportGrid`) takes files through
 * this hook, so the three gestures — the native file dialog, a drop onto the
 * zone, a paste into a composer — share ONE intake path and ONE set of checks.
 *
 * Before this each primitive owned its own hidden `<input type=file>`, its own
 * drag-over state and its own idea of what to check: `accept` reached the
 * native dialog only, so a file dropped onto the zone bypassed it entirely;
 * a multi-file drop onto a gallery kept the first file and lost the rest
 * without a word; and a rejected file was listed in plain red text that no
 * screen reader announced. The portals then copied the hidden-input block
 * nineteen more times. This hook is the fix at the narrowest layer that can
 * hold it (harness UI-15 / PAT-10).
 *
 * The hook validates and hands back `File[]`. It never uploads — transport
 * belongs to the consumer, for the reasons `FilePicker`'s header gives.
 */
import {
  useCallback, useRef, useState,
  type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode,
} from 'react';

export type FileRejectionReason = 'type' | 'size' | 'count';

export interface FileRejection {
  file: File;
  reason: FileRejectionReason;
  /** Human sentence naming the file and the rule it broke. */
  message: string;
}

export interface FileIntakeLimits {
  /**
   * Native `accept` string — `image/*`, `.pdf,application/pdf`, … Enforced on
   * EVERY gesture, not only the dialog: a dropped or pasted file that fails it
   * is rejected with a reason. Empty or `*` accepts anything.
   */
  accept?: string;
  /** Rejected above this many bytes, with the reason shown. */
  maxSizeBytes?: number;
  /** Rejected once this many files are held in total (see `currentCount`). */
  maxFiles?: number;
}

export interface FileIntakeOptions extends FileIntakeLimits {
  /** Receives the files that passed every check. Never called with an empty list. */
  onAccept: (files: File[]) => void;
  /** `false` takes the first candidate only — a single slot. Default `true`. */
  multiple?: boolean;
  /** Files the surface already holds, so `maxFiles` counts the total. Default 0. */
  currentCount?: number;
  /** Short kind hint for the type-rejection sentence, e.g. "PNG · JPG". */
  acceptHint?: ReactNode;
  disabled?: boolean;
}

/**
 * Does `file` satisfy a native `accept` string? Extension rules match the
 * name, `type/*` rules match the MIME prefix, anything else is an exact MIME.
 * A browser reports several media types for one `.ico` file and sometimes
 * none at all, which is why an extension rule exists at all.
 */
export function acceptsFile(file: File, accept?: string): boolean {
  const rules = (accept ?? '').split(',').map(rule => rule.trim().toLocaleLowerCase()).filter(Boolean);
  if (rules.length === 0 || rules.includes('*') || rules.includes('*/*')) return true;
  const fileName = file.name.toLocaleLowerCase();
  const fileType = file.type.toLocaleLowerCase();
  return rules.some(rule => {
    if (rule.startsWith('.')) return fileName.endsWith(rule);
    if (rule.endsWith('/*')) return fileType.startsWith(rule.slice(0, -1));
    return fileType === rule;
  });
}

export const humanSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Is this drag carrying files (as opposed to text, a URL, or an in-page reorder)? */
export const isFileDrag = (e: DragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Files on a clipboard event, if the paste carried any. */
export function pastedFiles(e: ClipboardEvent): File[] {
  const data = e.clipboardData;
  if (!data) return [];
  if (data.files && data.files.length > 0) return Array.from(data.files);
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  return out;
}

export function useFileIntake({
  onAccept, accept, maxSizeBytes, maxFiles, multiple = true, currentCount = 0,
  acceptHint, disabled = false,
}: FileIntakeOptions) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rejections, setRejections] = useState<FileRejection[]>([]);
  // A drag passes over every child of the zone, firing leave/enter pairs; a
  // depth counter is what keeps the highlight steady across them.
  const depthRef = useRef(0);

  const hintText = typeof acceptHint === 'string' ? acceptHint : '';

  /** Run every candidate through the checks; deliver the survivors. */
  const take = useCallback((incoming: FileList | File[] | null | undefined) => {
    if (disabled || !incoming) return;
    const candidates = Array.from(incoming);
    if (candidates.length === 0) return;
    const accepted: File[] = [];
    const rejected: FileRejection[] = [];
    for (const file of multiple ? candidates : candidates.slice(0, 1)) {
      if (!acceptsFile(file, accept)) {
        rejected.push({
          file, reason: 'type',
          message: `${file.name} is not an accepted file type${hintText ? ` (${hintText})` : ''}`,
        });
        continue;
      }
      if (maxSizeBytes != null && file.size > maxSizeBytes) {
        rejected.push({
          file, reason: 'size',
          message: `${file.name} is ${humanSize(file.size)} — the limit is ${humanSize(maxSizeBytes)}`,
        });
        continue;
      }
      if (multiple && maxFiles != null && currentCount + accepted.length >= maxFiles) {
        rejected.push({
          file, reason: 'count',
          message: `${file.name} was not added — ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'} is the limit`,
        });
        continue;
      }
      accepted.push(file);
    }
    setRejections(rejected);
    if (accepted.length) onAccept(accepted);
    // Reset the native input so re-picking the SAME file fires change again —
    // without this, removing a file and re-adding it appears to do nothing.
    if (inputRef.current) inputRef.current.value = '';
  }, [disabled, multiple, accept, hintText, maxSizeBytes, maxFiles, currentCount, onAccept]);

  const open = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const clearRejections = useCallback(() => setRejections([]), []);

  /** Spread onto the hidden native input. It is never a tab stop and never the visible control. */
  const inputProps = {
    ref: inputRef,
    type: 'file' as const,
    accept: accept || undefined,
    multiple,
    disabled,
    tabIndex: -1,
    'aria-hidden': true as const,
    className: 'hidden',
    onChange: (e: ChangeEvent<HTMLInputElement>) => take(e.target.files),
  };

  /** Spread onto the drop target. Only a drag carrying files lights it up. */
  const zoneProps = disabled
    ? {}
    : {
        onDragEnter: (e: DragEvent) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          depthRef.current += 1;
          setDragOver(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (!isFileDrag(e)) return;
          depthRef.current = Math.max(0, depthRef.current - 1);
          if (depthRef.current === 0) setDragOver(false);
        },
        onDrop: (e: DragEvent) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          depthRef.current = 0;
          setDragOver(false);
          take(e.dataTransfer.files);
        },
      };

  /** Spread onto a composer's text area: a paste that carries files is taken, one of text is left alone. */
  const pasteProps = disabled
    ? {}
    : {
        onPaste: (e: ClipboardEvent) => {
          const files = pastedFiles(e);
          if (files.length === 0) return;
          e.preventDefault();
          take(files);
        },
      };

  return { inputRef, inputProps, zoneProps, pasteProps, open, take, dragOver, rejections, clearRejections };
}

/**
 * The rejection list, announced. `role="alert"` is what tells a screen-reader
 * user why the drop did nothing; the sighted user sees the same sentences.
 * Renders nothing while there is nothing to say.
 */
export function FileIntakeAlert({ rejections, className = 'mt-2' }: { rejections: FileRejection[]; className?: string }) {
  if (rejections.length === 0) return null;
  return (
    <ul role="alert" className={`${className} flex flex-col gap-0.5`}>
      {rejections.map(({ file, message }, i) => (
        <li key={`${file.name}-${i}`} className="text-xs text-red-600">{message}</li>
      ))}
    </ul>
  );
}
