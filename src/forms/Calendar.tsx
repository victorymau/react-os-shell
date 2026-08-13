/**
 * Calendar — a month grid you can actually drive from the keyboard.
 *
 * Written because `DateRangePicker` had one inline and it was a `<div>` of 42
 * unlabelled buttons. Concretely, what that cost:
 *
 *  - No arrow keys. Reaching the 20th meant twenty presses of Tab, and Tab out
 *    of the calendar meant twenty more to get back.
 *  - Each cell's accessible name was its number. "15" — of which month, of
 *    which year? The heading was elsewhere and not associated with the grid.
 *  - No grid semantics, so a screen reader announced a list of buttons rather
 *    than a date table, and there was no way to know which one was chosen.
 *
 * It is one component rather than one per picker because the grid is the same
 * grid whether the caller wants one date or two: `DatePicker`, `TimePicker`'s
 * sibling `DateRangePicker`, and anything a portal writes later all get the
 * keyboard model and the ARIA from here, once.
 *
 * ── Dates are local, never UTC ──
 * Same rule the rest of the kit follows: `new Date('2026-08-11')` is UTC
 * midnight and therefore the 10th anywhere west of Greenwich. Nothing here
 * parses a date string with the Date constructor; a `YYYY-MM-DD` is split into
 * three integers and rebuilt with the local constructor, and serialised back by
 * reading local calendar fields.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export type CalendarMode = 'single' | 'range';

export interface CalendarProps {
  /** `YYYY-MM-DD`, or null. In range mode this is the start. */
  value?: string | null;
  /** Range end. Ignored when `mode` is `single`. */
  endValue?: string | null;
  mode?: CalendarMode;
  onSelect: (date: string) => void;
  /** Earliest selectable day, `YYYY-MM-DD`. */
  min?: string | null;
  /** Latest selectable day, `YYYY-MM-DD`. */
  max?: string | null;
  /**
   * Which month is shown, `YYYY-MM`. Supplying it makes the view CONTROLLED:
   * paging reports through `onMonthChange` and the grid stays put until the
   * caller moves it. Use {@link defaultMonth} to only set where it opens.
   */
  month?: string;
  /** Where an uncontrolled grid opens. Falls back to the selected date's month, then today's. */
  defaultMonth?: string;
  onMonthChange?: (month: string) => void;
  /**
   * 0 = Sunday, 1 = Monday. Defaults to Sunday, matching what the kit's pickers
   * showed before this existed; a consumer outside the US will want 1.
   */
  weekStartsOn?: 0 | 1;
  /**
   * Offer the month and year panels behind the heading, so a date years away is
   * two clicks rather than a hundred presses of PageUp. On by default.
   */
  quickJump?: boolean;
  /** Names the grid. Defaults to the month and year on show. */
  'aria-label'?: string;
  className?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` from local calendar fields — never `toISOString()`. */
export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local Date for a `YYYY-MM-DD`, or null. Never `new Date(string)`. */
export function fromKey(key: string | null | undefined): Date | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const YEARS_PER_PAGE = 12;
const yearPageStart = (y: number) => Math.floor(y / YEARS_PER_PAGE) * YEARS_PER_PAGE;

function monthStart(key: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date();
}

/**
 * The 42 cells of a month view: the month itself, padded to whole weeks with
 * the days either side. Always six rows, so the grid does not change height as
 * the user pages and push the controls under the cursor.
 */
function buildCells(view: Date, weekStartsOn: 0 | 1): Date[] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
  return Array.from({ length: 42 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Day arithmetic through the local constructor, so DST never shifts a date. */
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  // Clamp: stepping from the 31st into a 30-day month must not roll into the
  // next one, which is what a naive setMonth does.
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
};

export default function Calendar({
  value, endValue, mode = 'single', onSelect, min, max,
  month, defaultMonth, onMonthChange, weekStartsOn = 0, quickJump = true,
  'aria-label': ariaLabel, className = '',
}: CalendarProps) {
  const selected = fromKey(value);
  const today = new Date();
  const todayKey = toKey(today);

  const [innerMonth, setInnerMonth] = useState(() => {
    if (defaultMonth) return defaultMonth;
    if (selected) return monthKey(selected);
    // With no selection, open somewhere the user can actually pick. Today is
    // the obvious choice and the wrong one when the bounds are elsewhere: a
    // month later than `max` opens on a grid where every day is disabled, and
    // nothing on screen says which way to page.
    const here = monthKey(today);
    if (min && here < min.slice(0, 7)) return min.slice(0, 7);
    if (max && here > max.slice(0, 7)) return max.slice(0, 7);
    return here;
  });
  const viewMonth = month ?? innerMonth;
  const view = monthStart(viewMonth);

  // The cell the arrows are on. Distinct from the selection: a user moves
  // around before committing, and moving is not choosing.
  const [active, setActive] = useState<string>(() => value ?? todayKey);
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);
  // 'days' is the grid; the other two are the quick-jump panels behind the
  // heading. They replace the grid rather than sitting beside it, so the popup
  // does not change size as the user drills in.
  const [panel, setPanel] = useState<'days' | 'months' | 'years'>('days');

  const cells = useMemo(() => buildCells(view, weekStartsOn), [viewMonth, weekStartsOn]);

  const outOfRange = (key: string) => (!!min && key < min) || (!!max && key > max);

  // The active day must exist in the grid, or there is no tab stop at all.
  const activeInView = cells.some(c => toKey(c) === active);
  const fallbackActive = toKey(cells.find(c => c.getMonth() === view.getMonth()) ?? cells[0]);
  const activeKey = activeInView ? active : fallbackActive;

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.focus();
  }, [activeKey, viewMonth]);

  // The arrows step whatever is on show: a month in the grid, a year in the
  // month panel, a page of years in the year panel. An arrow that always
  // stepped one month would appear stuck while a year panel is open.
  const pageBy = (n: number) => {
    if (panel === 'years') return new Date(view.getFullYear() + n * YEARS_PER_PAGE, view.getMonth(), 1);
    if (panel === 'months') return new Date(view.getFullYear() + n, view.getMonth(), 1);
    return addMonths(view, n);
  };
  const pageBack = () => pageBy(-1);
  const pageForward = () => pageBy(1);

  const goToMonth = (next: Date) => {
    const key = monthKey(next);
    if (month === undefined) setInnerMonth(key);
    onMonthChange?.(key);
  };

  /** Move the cursor, paging the month when the target falls outside it. */
  const moveTo = (next: Date) => {
    shouldFocus.current = true;
    setActive(toKey(next));
    if (monthKey(next) !== viewMonth) goToMonth(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = fromKey(activeKey) ?? today;
    const step: Record<string, () => Date> = {
      ArrowLeft: () => addDays(current, -1),
      ArrowRight: () => addDays(current, 1),
      ArrowUp: () => addDays(current, -7),
      ArrowDown: () => addDays(current, 7),
      // Home and End are the week, not the month: the grid's rows are weeks, and
      // this is what the ARIA date-grid pattern asks for.
      Home: () => addDays(current, -((current.getDay() - weekStartsOn + 7) % 7)),
      End: () => addDays(current, 6 - ((current.getDay() - weekStartsOn + 7) % 7)),
      PageUp: () => addMonths(current, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(current, e.shiftKey ? 12 : 1),
    };

    if (step[e.key]) {
      e.preventDefault();
      moveTo(step[e.key]());
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!outOfRange(activeKey)) onSelect(activeKey);
    }
  };

  const inRange = (key: string) => {
    if (mode !== 'range' || !value || !endValue) return false;
    return key > value && key < endValue;
  };

  const label = ariaLabel ?? `${MONTH_NAMES[view.getMonth()]} ${view.getFullYear()}`;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          aria-label={panel === 'years' ? 'Previous years' : panel === 'months' ? 'Previous year' : 'Previous month'}
          onClick={() => goToMonth(pageBack())}
          className="rounded-full p-1 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {/* A live region: paging with PageUp/PageDown changes the month without
            moving focus out of the grid, so nothing else would announce it. */}
        <div aria-live="polite" className="flex items-center gap-1 text-sm font-semibold text-gray-800">
          {quickJump ? (
            <>
              {/* Month and year are separately clickable, so jumping to a far
                  year is one click rather than drilling month -> year. */}
              {panel !== 'years' && (
                <button
                  type="button"
                  aria-label={`Choose a month, currently ${MONTH_NAMES[view.getMonth()]}`}
                  onClick={() => setPanel(p => (p === 'months' ? 'days' : 'months'))}
                  className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {MONTH_NAMES[view.getMonth()]}
                </button>
              )}
              <button
                type="button"
                aria-label={`Choose a year, currently ${view.getFullYear()}`}
                onClick={() => setPanel(p => (p === 'years' ? 'days' : 'years'))}
                className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {view.getFullYear()}
              </button>
            </>
          ) : (
            <span>{MONTH_NAMES[view.getMonth()]} {view.getFullYear()}</span>
          )}
        </div>
        <button
          type="button"
          aria-label={panel === 'years' ? 'Next years' : panel === 'months' ? 'Next year' : 'Next month'}
          onClick={() => goToMonth(pageForward())}
          className="rounded-full p-1 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {panel === 'months' && (
        <div role="group" aria-label="Choose a month" className="grid grid-cols-3 gap-1 text-center text-sm">
          {MONTH_NAMES.map((name, m) => (
            <button
              key={name}
              type="button"
              aria-pressed={m === view.getMonth()}
              onClick={() => { goToMonth(new Date(view.getFullYear(), m, 1)); setPanel('days'); }}
              className={[
                'rounded-md py-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                m === view.getMonth() ? 'bg-blue-600 font-semibold text-white'
                  : m === today.getMonth() && view.getFullYear() === today.getFullYear()
                    ? 'font-medium text-blue-600 hover:bg-gray-100'
                    : 'text-gray-700 hover:bg-gray-100',
              ].join(' ')}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {panel === 'years' && (
        <div role="group" aria-label="Choose a year" className="grid grid-cols-3 gap-1 text-center text-sm">
          {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPageStart(view.getFullYear()) + i).map(y => (
            <button
              key={y}
              type="button"
              aria-pressed={y === view.getFullYear()}
              onClick={() => { goToMonth(new Date(y, view.getMonth(), 1)); setPanel('months'); }}
              className={[
                'rounded-md py-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                y === view.getFullYear() ? 'bg-blue-600 font-semibold text-white'
                  : y === today.getFullYear() ? 'font-medium text-blue-600 hover:bg-gray-100'
                  : 'text-gray-700 hover:bg-gray-100',
              ].join(' ')}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        onKeyDown={onKeyDown}
        // Hidden rather than unmounted: remounting would reset the cursor to
        // the selection every time the user glanced at the year panel.
        hidden={panel !== 'days'}
      >
        <div role="row" className="grid grid-cols-7 text-center text-xs font-medium text-gray-500">
          {Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7).map(d => (
            // abbr carries the full name: "Su" is read as a word otherwise.
            <div key={d} role="columnheader" aria-label={DAY_NAMES[d]} className="py-1">
              <abbr title={DAY_NAMES[d]} className="no-underline">{DAY_SHORT[d]}</abbr>
            </div>
          ))}
        </div>

        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} role="row" className="grid grid-cols-7 text-center text-sm">
            {cells.slice(row * 7, row * 7 + 7).map(cell => {
              const key = toKey(cell);
              const outside = cell.getMonth() !== view.getMonth();
              const isSelected = key === value || (mode === 'range' && key === endValue);
              const between = inRange(key);
              const disabled = outOfRange(key);
              return (
                <div key={key} role="gridcell" aria-selected={isSelected}>
                  <button
                    type="button"
                    data-active={key === activeKey}
                    // One tab stop for the whole grid; the arrows move within it.
                    tabIndex={key === activeKey ? 0 : -1}
                    disabled={disabled}
                    // The full date, not the bare number: "15" alone does not
                    // say which month a reader has landed in.
                    aria-label={`${cell.getDate()} ${MONTH_NAMES[cell.getMonth()]} ${cell.getFullYear()}`}
                    aria-current={key === todayKey ? 'date' : undefined}
                    onClick={() => { setActive(key); onSelect(key); }}
                    className={[
                      'w-full rounded-md py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                      disabled ? 'cursor-not-allowed text-gray-300'
                        : isSelected ? 'bg-blue-600 font-semibold text-white'
                        : between ? 'bg-blue-100 text-blue-800'
                        : outside ? 'text-gray-300 hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100',
                      key === todayKey && !isSelected ? 'font-semibold text-blue-600' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {cell.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
