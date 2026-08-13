/**
 * DateTimePicker — one calendar date plus a wall-clock time, on the platform's
 * own `datetime-local` input. DatePicker's sibling: the browser supplies the
 * calendar and the time wheel, the kit supplies the field styling.
 *
 * The DatePicker header's rule applies here with one more field to get wrong:
 * `datetime-local` speaks LOCAL `YYYY-MM-DDTHH:MM`, so nothing in this file
 * may pass through `toISOString()` or the string Date constructor — a Date is
 * serialised from its local calendar and clock fields, and the Date handed to
 * `onChange` is built from the parsed integers with the local constructor.
 */
import { forwardRef, type InputHTMLAttributes } from 'react';

import { inputClasses, type InputSize } from './styles';

/** What a native datetime-local input speaks, and what this component stores. */
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const pad = (n: number) => String(n).padStart(2, '0');

export interface DateTimePickerProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size' | 'type' | 'value' | 'onChange' | 'min' | 'max'> {
  /** A Date, a local `YYYY-MM-DDTHH:MM` string, or nothing. */
  value?: Date | string | null;
  /**
   * The chosen moment as a local Date, or `null` when the field is empty or
   * mid-entry — same contract as DatePicker.
   */
  onChange?: (value: Date | null) => void;
  /** Earliest selectable moment. */
  min?: Date | string | null;
  /** Latest selectable moment. */
  max?: Date | string | null;
  /** Error state — red border + ring, matching Input. */
  invalid?: boolean;
  /** `touch` gives a 56px field for a finger. Defaults to the desktop size. */
  size?: InputSize;
  className?: string;
}

/** Local calendar + clock fields, never toISOString — see the header. */
function serialise(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toInputValue(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : serialise(value);
  if (ISO_LOCAL.test(value)) return value;
  return '';
}

/** Local `YYYY-MM-DDTHH:MM[:SS]` → a local Date, built from the parts. */
function fromInputValue(raw: string): Date | null {
  if (!ISO_LOCAL.test(raw)) return null;
  const [datePart, timePart] = raw.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds = 0] = timePart.split(':').map(Number);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  // Rejects 2026-02-31T10:00, which the constructor would roll into March.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

const DateTimePicker = forwardRef<HTMLInputElement, DateTimePickerProps>(function DateTimePicker(
  { value, onChange, min, max, invalid, size, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="datetime-local"
      aria-invalid={invalid || undefined}
      value={toInputValue(value)}
      min={toInputValue(min) || undefined}
      max={toInputValue(max) || undefined}
      onChange={event => onChange?.(fromInputValue(event.target.value))}
      className={inputClasses({ invalid, size, className })}
      {...rest}
    />
  );
});

export default DateTimePicker;
