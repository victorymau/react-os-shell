/**
 * FilePicker — choose files and list them. It does NOT upload.
 *
 * That is the entire design. An uploader that owns transport has to own retry,
 * progress, cancellation, auth and the endpoint, and every consumer ends up
 * fighting a piece of it. This hands the caller a `File[]` and stops; the form
 * submits them however it already submits everything else.
 *
 * Rejections are reported, never silent. A file dropped for being too large or
 * the wrong type is the case where a user is most certain they did the thing
 * and most confused that nothing happened — so the reasons are announced
 * (`role="alert"`), and `accept` is enforced on a drop exactly as the native
 * dialog enforces it on a pick. Intake is `useFileIntake`, shared with every
 * other upload primitive in the kit.
 *
 * The zone is ONE control: a button that opens the dialog on click, Enter or
 * Space and takes a drop. The native input behind it is never a tab stop, so a
 * keyboard user meets the field once (harness UI-15).
 */
import { forwardRef, useId, useState, type ReactNode } from 'react';
import FormField from './FormField';
import { CloseGlyph, FOCUS_RING, dropzoneClass } from './mediaShared';
import { FileIntakeAlert, humanSize, useFileIntake } from './useFileIntake';

export interface FilePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  /** `accept` — enforced on the native picker AND on a drop, e.g. "image/*,.pdf". */
  accept?: string;
  /** Short kind hint, e.g. "PDF · JPG", shown under the CTA and in a type rejection. */
  acceptHint?: ReactNode;
  multiple?: boolean;
  /** Rejected above this, with the reason shown. */
  maxSizeBytes?: number;
  /** Rejected beyond this many files total. */
  maxFiles?: number;
  disabled?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

const FilePicker = forwardRef<HTMLButtonElement, FilePickerProps>(function FilePicker({
  files, onChange, accept, acceptHint, multiple = true, maxSizeBytes, maxFiles,
  disabled = false, label, hint, error, required, className = '',
}, ref) {
  const zoneId = useId();
  const [focused, setFocused] = useState(false);

  const intake = useFileIntake({
    accept, acceptHint, maxSizeBytes, maxFiles, multiple, disabled,
    currentCount: files.length,
    onAccept: accepted => onChange(multiple ? [...files, ...accepted] : accepted.slice(0, 1)),
  });

  const describedBy = error ? `${zoneId}-error` : hint ? `${zoneId}-hint` : undefined;

  return (
    <FormField label={label} htmlFor={zoneId} hint={hint} error={error} required={required} className={className}>
      <button
        ref={ref}
        type="button"
        id={zoneId}
        disabled={disabled}
        onClick={intake.open}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        {...intake.zoneProps}
        className={dropzoneClass(intake.dragOver, disabled, 'px-4 py-6')}
        style={{ outline: 'none', boxShadow: focused && !disabled ? FOCUS_RING : undefined }}
      >
        <span>
          <span className="text-sm font-medium text-blue-600">Choose {multiple ? 'files' : 'a file'}</span>
          <span className="text-sm text-gray-500"> or drag {multiple ? 'them' : 'it'} here</span>
        </span>
        {acceptHint && <span className="text-xs text-gray-400">{acceptHint}</span>}
      </button>
      <input {...intake.inputProps} />

      {files.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800" title={file.name}>{file.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">{humanSize(file.size)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => { intake.clearRejections(); onChange(files.filter((_, j) => j !== i)); }}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 text-gray-400 hover:text-gray-600"
              >
                <CloseGlyph />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FileIntakeAlert rejections={intake.rejections} />
    </FormField>
  );
});

export default FilePicker;
