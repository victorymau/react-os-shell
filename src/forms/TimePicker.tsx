/**
 * TimePicker — one time of day, on the platform's own time input.
 *
 * The same bargain as DatePicker: a native `<input type="time">` wearing the
 * kit's field styling, so the browser supplies the wheel, the locale's
 * 12/24-hour convention and the keyboard behaviour, and there is nothing here
 * to keep in step with any of them.
 *
 * The value is an `HH:MM` (or `HH:MM:SS`) wall-clock string, and `onChange`
 * hands back the same — never a Date. A time of day names no calendar day, so
 * building a Date from one means inventing a date, which is the same class of
 * bug DatePicker's header warns about, one step earlier. A caller who has a
 * Date may still pass it as `value`; its LOCAL hours and minutes are read
 * (never `toISOString`, which is UTC).
 */
import { forwardRef, type InputHTMLAttributes } from 'react';

import { inputClasses, type InputSize } from './styles';

/** What a native time input speaks, and what this component stores. */
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

const pad = (n: number) => String(n).padStart(2, '0');

export interface TimePickerProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size' | 'type' | 'value' | 'onChange' | 'min' | 'max'> {
  /** An `HH:MM` / `HH:MM:SS` string, a Date (local wall-clock time is read), or nothing. */
  value?: Date | string | null;
  /**
   * The chosen time as `HH:MM` (`HH:MM:SS` when `step` asks for seconds), or
   * `null` when the field is empty or mid-entry — same contract as DatePicker.
   */
  onChange?: (value: string | null) => void;
  /** Earliest selectable time. */
  min?: Date | string | null;
  /** Latest selectable time. */
  max?: Date | string | null;
  /** Error state — red border + ring, matching Input. */
  invalid?: boolean;
  /** `touch` gives a 56px field for a finger. Defaults to the desktop size. */
  size?: InputSize;
  className?: string;
}

function toInputValue(value: Date | string | null | undefined, withSeconds: boolean): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const base = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
    return withSeconds ? `${base}:${pad(value.getSeconds())}` : base;
  }
  return TIME.test(value) ? value : '';
}

const TimePicker = forwardRef<HTMLInputElement, TimePickerProps>(function TimePicker(
  { value, onChange, min, max, invalid, size, className = '', step, ...rest },
  ref,
) {
  // A sub-minute step makes the native control show (and report) seconds.
  const withSeconds = step != null && Number(step) < 60;
  return (
    <input
      ref={ref}
      type="time"
      step={step}
      aria-invalid={invalid || undefined}
      value={toInputValue(value, withSeconds)}
      min={toInputValue(min, withSeconds) || undefined}
      max={toInputValue(max, withSeconds) || undefined}
      onChange={event => onChange?.(TIME.test(event.target.value) ? event.target.value : null)}
      className={inputClasses({ invalid, size, className })}
      {...rest}
    />
  );
});

export default TimePicker;
