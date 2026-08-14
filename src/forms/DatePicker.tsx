/**
 * DatePicker — one calendar date.
 *
 * It used to be a native `<input type="date">` wearing the kit's field styling,
 * on the reasoning that the browser supplies the calendar, the locale, the
 * keyboard behaviour and the mobile date wheel for free. All of that is true.
 * What it also supplies is its own widget: a Chrome date field renders one
 * thing, Safari another, and neither is the calendar `DateRangePicker` draws.
 * Two date fields on one row — the common case, a from and a to — looked like
 * two different products, which is the specific complaint that changed this.
 *
 * So the popover is the kit's own {@link Calendar} now, which is also where the
 * keyboard model and the ARIA live. The native control is still one prop away:
 * a phone gets a much better date entry from the platform than any popover, and
 * a consumer that is mostly mobile should say so with `native`.
 *
 * ── Every date bug in this file is the same bug ──
 * `new Date('2026-08-11')` is UTC midnight, which is the 10th anywhere west of
 * Greenwich; `toISOString()` on a locally-built Date is the previous day
 * anywhere east of it. So this component never crosses that boundary: a bare
 * `YYYY-MM-DD` string is passed through untouched, a Date is serialised through
 * `toISODate` (which reads local calendar fields, and says so at length), and
 * the Date handed back to `onChange` is built from the three integers with the
 * local constructor. `Calendar` and `DateRangePicker` follow the same rule.
 */
import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

import Calendar from './Calendar';
import { useDropdownPosition } from './dropdownPosition';
import { toISODate } from './DateRangePicker';
import { inputClasses, type InputSize } from './styles';
import { registerModalEscapeInterceptor } from '../shell/escapeInterceptors';

/** What a native date input speaks, and what this component stores. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface DatePickerProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size' | 'type' | 'value' | 'onChange' | 'min' | 'max'> {
  /** A Date, a `YYYY-MM-DD` string, or nothing. */
  value?: Date | string | null;
  /**
   * The chosen date at local midnight, or `null` when the field is empty.
   *
   * A partly typed date is not yet a date, and a cleared field has none. Both
   * arrive here as `null`: "no date yet" and "cleared" are the same thing to a
   * caller storing a value.
   */
  onChange?: (value: Date | null) => void;
  /** Earliest selectable date. */
  min?: Date | string | null;
  /** Latest selectable date. */
  max?: Date | string | null;
  /** Error state — red border + ring, matching Input. */
  invalid?: boolean;
  /** `touch` gives a 56px field for a finger. Defaults to the desktop size. */
  size?: InputSize;
  /**
   * Use the platform's own date input instead of the kit's calendar. Worth it
   * on a mobile-first surface, where the OS date wheel beats any popover; the
   * cost is that the field then looks like the browser rather than the kit.
   */
  native?: boolean;
  /** 0 = Sunday, 1 = Monday. Passed through to the calendar. */
  weekStartsOn?: 0 | 1;
  className?: string;
}

/**
 * Normalise anything the caller holds into `YYYY-MM-DD`.
 *
 * The `ISO_DATE` short-circuit is load-bearing rather than an optimisation: it
 * is what stops a string that is already correct from being round-tripped
 * through `new Date(...)` and coming back a day early.
 */
function toInputValue(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : toISODate(value);
  if (ISO_DATE.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : toISODate(parsed);
}

/** `YYYY-MM-DD` → local midnight. Built from the parts, never parsed as a string. */
function fromInputValue(raw: string): Date | null {
  if (!ISO_DATE.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects 2026-02-31, which the constructor would happily roll into March.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** `2026-08-11` → `11 August 2026`. What the trigger shows. */
function display(key: string): string {
  const d = fromInputValue(key);
  return d ? `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` : '';
}

const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { value, onChange, min, max, invalid, size, native, weekStartsOn, className = '',
    'aria-label': ariaLabel, 'aria-describedby': describedBy, id, name, disabled, placeholder, ...rest },
  ref,
) {
  const current = toInputValue(value);
  const lo = toInputValue(min);
  const hi = toInputValue(max);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // The kit's shared placement rather than a local `absolute left-0`: it flips
  // above when there is no room below, right-aligns when the panel would run
  // off the right edge, and tracks a trigger that moves. A calendar is 288px
  // wide and a date field is often the last control in a filter row, which is
  // exactly where a left-anchored popover leaves half the month off screen.
  const pos = useDropdownPosition(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      // BOTH, because the panel is portalled to <body> and is therefore not
      // inside the wrapper. Checking the wrapper alone made every click on a
      // DAY read as a click outside: the panel closed on pointerdown and the
      // cell was gone before its own click event, so the calendar could be
      // opened and never used.
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  // Escape, on the shell's interceptor seam rather than a listener of our own.
  //
  // A `document` listener cannot win, in either phase. `Modal` listens on
  // `window` in the CAPTURE phase, and capture runs window BEFORE document —
  // so Modal took the key first, closed the whole window, and called
  // stopPropagation(). A user with a form open in a window who pressed Escape
  // to dismiss the calendar lost the window and their unsaved edits instead.
  //
  // The seam is the one place Modal consults before closing, and since 4.27.0
  // it drains itself where no shell is mounted, so a routed page and a till are
  // covered by the same registration. `Select` and `FilterBar` have always been
  // on it; `Tooltip` moved to it in 4.30.1 and `DropdownMenu` in 4.54.0 — this
  // is the same rule, and the focus-restore below is the one this file already
  // credited DropdownMenu for.
  useEffect(() => {
    if (!open) return;
    return registerModalEscapeInterceptor(event => {
      if (event.key !== 'Escape') return false;
      setOpen(false);
      // Focus goes back to the trigger. Closing without it unmounts the focused
      // cell, focus falls to <body>, and the next Tab restarts from the top of
      // the document.
      triggerRef.current?.focus();
      return true;
    });
  }, [open]);

  if (native) {
    return (
      <input
        ref={ref}
        type="date"
        id={id}
        name={name}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        value={current}
        min={lo || undefined}
        max={hi || undefined}
        onChange={event => onChange?.(fromInputValue(event.target.value))}
        className={inputClasses({ invalid, size, className })}
        {...rest}
      />
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* The value also rides a hidden native input, so the control still posts
          in a plain <form> and is still found by `name` the way it was. */}
      <input ref={ref} type="hidden" name={name} value={current} />
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        // The chosen date, spoken. A trigger reading "11/08/2026" is ambiguous
        // between two continents; "11 August 2026" is not.
        aria-label={ariaLabel ? `${ariaLabel}${current ? `, ${display(current)}` : ''}` : undefined}
        onClick={() => setOpen(o => !o)}
        className={`${inputClasses({ invalid, size, className })} flex items-center justify-between text-left`}
      >
        <span className={current ? 'text-gray-900' : 'text-gray-400'}>
          {current ? display(current) : (placeholder ?? 'Select a date')}
        </span>
        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 7h14a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={ariaLabel ?? 'Choose a date'}
          className="fixed z-[400] w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
          style={{
            left: pos?.left, right: pos?.right, top: pos?.top, bottom: pos?.bottom,
            // Hidden for the first paint until the layout effect measures the
            // trigger, so the panel never flashes at (0,0).
            visibility: pos ? undefined : 'hidden',
          }}
        >
          <Calendar
            value={current || null}
            min={lo || null}
            max={hi || null}
            weekStartsOn={weekStartsOn}
            onSelect={key => {
              setOpen(false);
              triggerRef.current?.focus();
              onChange?.(fromInputValue(key));
            }}
          />
          <div className="mt-2 flex justify-between border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={() => { setOpen(false); triggerRef.current?.focus(); onChange?.(null); }}
              className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); triggerRef.current?.focus(); onChange?.(new Date()); }}
              className="rounded-md px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              Today
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});

export default DatePicker;
