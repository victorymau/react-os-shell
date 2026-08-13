/**
 * TimePicker — a time of day, chosen from a list or typed.
 *
 * The kit had no time control at all, so a portal needing one reached for
 * `<input type="time">`. That works, and it is why this is not simply another
 * wrapper around it: the native control renders the browser's own widget, which
 * on desktop Chrome is a spinner with a tiny clock glyph and on Safari is
 * something else again. Beside a `DatePicker` drawing the kit's calendar, a
 * date and a time on the same row looked like two different products.
 *
 * So: a text field the user can type into, plus a listbox of the times they are
 * most likely to want. Typing is the fast path for "09:15"; the list is the
 * fast path for "some time in the afternoon".
 *
 * ── Values are strings, never Dates ──
 * A time with no date attached is not a moment, and modelling it as a `Date`
 * forces an arbitrary day on it — which then drifts across a timezone or a DST
 * boundary and comes back an hour out. The value here is `HH:mm` on a 24-hour
 * clock, which is what a server wants and what sorts correctly as a string.
 * The 12-hour clock, where asked for, is a display concern only.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { inputClasses, type InputSize } from './styles';

export interface TimePickerProps {
  /** `HH:mm`, 24-hour, or null. */
  value?: string | null;
  onChange?: (value: string | null) => void;
  /** Minutes between the offered times. Defaults to 30. */
  step?: number;
  /** Earliest offered/allowed time, `HH:mm`. */
  min?: string | null;
  /** Latest offered/allowed time, `HH:mm`. */
  max?: string | null;
  /** Show and accept a 12-hour clock. The value stays 24-hour either way. */
  hour12?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Error state — red border + ring, matching Input. */
  invalid?: boolean;
  size?: InputSize;
  /** Names the field. Required in practice: the control has no visible label. */
  'aria-label'?: string;
  id?: string;
  name?: string;
  className?: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Minutes since midnight, or null for anything that is not a `HH:mm`. */
export function toMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = HHMM.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const fromMinutes = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** `14:30` → `2:30 PM`. Display only — the stored value never changes shape. */
export function formatTime(value: string, hour12: boolean): string {
  const mins = toMinutes(value);
  if (mins === null) return value;
  const [h, m] = [Math.floor(mins / 60), mins % 60];
  if (!hour12) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${pad(m)} ${suffix}`;
}

/**
 * Read what a person actually types. `9`, `930`, `9:30`, `9.30`, `9:30 pm`,
 * `0930` all mean something obvious, and rejecting them because they are not
 * `HH:mm` makes the field feel broken. Returns `HH:mm`, or null.
 */
export function parseTime(input: string, hour12: boolean): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const meridiem = /(am|pm)\s*$/.exec(text)?.[1];
  const digits = text.replace(/\s*(am|pm)\s*$/, '').replace(/[.\s]/g, ':');

  let h: number;
  let m = 0;
  if (digits.includes(':')) {
    const [hs, ms = '0'] = digits.split(':');
    h = Number(hs);
    m = Number(ms.length === 1 ? `${ms}0` : ms);
  } else if (/^\d{3,4}$/.test(digits)) {
    // 930 and 0930 are both half past nine.
    h = Number(digits.slice(0, digits.length - 2));
    m = Number(digits.slice(-2));
  } else if (/^\d{1,2}$/.test(digits)) {
    h = Number(digits);
  } else {
    return null;
  }

  if (!Number.isInteger(h) || !Number.isInteger(m) || m > 59 || m < 0) return null;

  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = meridiem === 'pm' ? (h % 12) + 12 : h % 12;
  } else if (hour12 && h === 12) {
    // On a 12-hour clock a bare "12" is midday, not midnight — the reading a
    // person means when they have been typing 1 through 11 all along.
    h = 12;
  }

  if (h > 23 || h < 0) return null;
  return `${pad(h)}:${pad(m)}`;
}

export default function TimePicker({
  value, onChange, step = 30, min, max, hour12 = false,
  placeholder, disabled, invalid, size, 'aria-label': ariaLabel, id, name, className = '',
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => (value ? formatTime(value, hour12) : ''));
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listId = `${generatedId}-list`;

  // The field follows the value while the user is not editing it. Two guards,
  // both load-bearing:
  //
  //  - `open`, or a controlled parent overwrites what is being typed.
  //  - `value !== undefined`, or an UNCONTROLLED picker wipes itself: the
  //    commit sets the text, this effect runs with no value to read, and the
  //    field a user just filled in goes blank in front of them.
  useEffect(() => {
    if (!open && value !== undefined) setText(value ? formatTime(value, hour12) : '');
  }, [value, hour12, open]);

  const options = useMemo(() => {
    const from = toMinutes(min) ?? 0;
    const to = toMinutes(max) ?? 24 * 60 - 1;
    const out: string[] = [];
    // A step of 0 or less would spin forever; treat it as the default rather
    // than hanging the tab.
    const stride = step > 0 ? step : 30;
    for (let mins = Math.ceil(from / stride) * stride; mins <= to; mins += stride) out.push(fromMinutes(mins));
    return out;
  }, [step, min, max]);

  const inBounds = (v: string) => {
    const mins = toMinutes(v);
    if (mins === null) return false;
    const lo = toMinutes(min);
    const hi = toMinutes(max);
    return (lo === null || mins >= lo) && (hi === null || mins <= hi);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) commitAndClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  });

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const openList = () => {
    const at = value ? options.indexOf(value) : -1;
    setActive(at >= 0 ? at : 0);
    setOpen(true);
  };

  const choose = (v: string) => {
    setText(formatTime(v, hour12));
    setOpen(false);
    onChange?.(v);
  };

  /**
   * Leaving the field commits what was typed. A time that cannot be read, or
   * one outside min/max, reverts to the last good value rather than being
   * silently stored or silently dropped — the user sees their entry rejected.
   */
  const commitAndClose = () => {
    setOpen(false);
    const parsed = parseTime(text, hour12);
    if (parsed && inBounds(parsed)) {
      setText(formatTime(parsed, hour12));
      if (parsed !== value) onChange?.(parsed);
      return;
    }
    if (text.trim() === '') {
      setText('');
      if (value) onChange?.(null);
      return;
    }
    setText(value ? formatTime(value, hour12) : '');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      setActive(i => (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && options[active]) choose(options[active]);
      else commitAndClose();
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      setText(value ? formatTime(value, hour12) : '');
    } else if (e.key === 'Tab') {
      commitAndClose();
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`.trim()}>
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        placeholder={placeholder ?? (hour12 ? 'h:mm AM' : 'HH:mm')}
        value={text}
        onChange={e => { setText(e.target.value); if (!open) setOpen(true); }}
        onFocus={openList}
        onBlur={commitAndClose}
        onKeyDown={onKeyDown}
        className={inputClasses({ invalid, size })}
      />

      {open && options.length > 0 && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel ? `${ariaLabel} options` : 'Times'}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((option, i) => (
            <div
              key={option}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={option === value}
              data-active={i === active}
              // onMouseDown, not onClick: the input's blur fires first and
              // would commit and close before a click ever landed.
              onMouseDown={e => { e.preventDefault(); choose(option); }}
              onMouseEnter={() => setActive(i)}
              className={[
                'cursor-pointer px-3 py-1.5 text-sm',
                option === value ? 'bg-blue-600 font-medium text-white'
                  : i === active ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-700',
              ].join(' ')}
            >
              {formatTime(option, hour12)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
