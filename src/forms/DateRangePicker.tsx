/**
 * DateRangePicker — a from/to calendar filter in a single popover trigger.
 *
 * Replaces the two-native-`<input type="date">` pattern the portals had grown
 * independently: a pair of bare boxes states no relationship between the two
 * dates, offers no presets, and (on the platforms these tenants use) opens an
 * OS picker that is itself a month-at-a-time stepper.
 *
 * Navigation drills UP rather than stepping: the header's month and year are
 * separate buttons opening a 12-month and a 12-year grid, so a date years back
 * is a few clicks instead of one click per intervening month.
 *
 * The component is deliberately free of app-level dependencies — date DISPLAY
 * is injected via `formatDisplay` so each portal can honour its own user
 * date-format preference, and the value contract is the plain `YYYY-MM-DD` the
 * API filters on.
 */
import { useState, useRef, useCallback } from 'react';
import { glassStyle } from '../utils/glass';
import useClickOutside from '../hooks/useClickOutside';

export interface DateRangePickerProps {
  /** Start of the range as `YYYY-MM-DD`, or '' when unset. */
  from: string;
  /** End of the range as `YYYY-MM-DD`, or '' when unset. */
  to: string;
  /** Called with the applied range. Both values are '' when cleared. */
  onChange: (from: string, to: string) => void;
  /**
   * Render a `YYYY-MM-DD` for display. Defaults to `DD/MM/YYYY`; portals pass
   * their own so the picker agrees with every other date on screen.
   */
  formatDisplay?: (iso: string) => string;
  /**
   * Offer the Clear affordances. Pass `false` where a range is REQUIRED — an
   * accounting report seeded with a period has nothing sensible to show for an
   * empty one, so it should not offer to empty it.
   */
  clearable?: boolean;
  /** Trigger text when no range is set. */
  placeholder?: string;
}

const PRESET_LABELS = ['Last 2 Weeks', 'Last Month', 'Last 3 Months', 'Last 6 Months', 'Last 12 Months'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The year grid pages in 12s so it reuses the month grid's 3x4 shape. */
const YEARS_PER_PAGE = 12;
const yearPageStart = (y: number) => Math.floor(y / YEARS_PER_PAGE) * YEARS_PER_PAGE;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Serialise a Date to `YYYY-MM-DD`, reading its LOCAL calendar fields.
 *
 * This must not go through `toISOString()`. Every Date this component builds is
 * constructed at local midnight — calendar cells, the preset boundaries, and
 * `new Date()` — and local midnight always falls in the *previous* UTC day for
 * any positive UTC offset. Serialising through UTC would shift the whole picker
 * back one day for every user east of Greenwich.
 */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Fallback display format. Portals override via `formatDisplay`. */
function defaultFormatDisplay(s: string): string {
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

export default function DateRangePicker({
  from,
  to,
  onChange,
  formatDisplay = defaultFormatDisplay,
  clearable = true,
  placeholder = 'Date Range',
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState(from);
  const [tempTo, setTempTo] = useState(to);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const now = new Date();
  const [month, setMonth] = useState(from ? parseDate(from).getMonth() : now.getMonth());
  const [year, setYear] = useState(from ? parseDate(from).getFullYear() : now.getFullYear());
  // Which panel the calendar column is showing. Days is the leaf; the header
  // label drills up to months, then years.
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  // Paging the year grid must not mutate `year` — backing out of the panel
  // without picking would otherwise silently move the day calendar.
  const [yearPage, setYearPage] = useState(() => yearPageStart(year));

  const displayDate = (s: string) => (s ? formatDisplay(s) : '');

  useClickOutside(ref, useCallback(() => { if (open) setOpen(false); }, [open]));

  const handleOpen = () => {
    setTempFrom(from);
    setTempTo(to);
    setActivePreset(null);
    const anchor = from ? parseDate(from) : now;
    setMonth(anchor.getMonth());
    setYear(anchor.getFullYear());
    setYearPage(yearPageStart(anchor.getFullYear()));
    setView('days');
    setOpen(true);
  };

  const handlePreset = (label: string) => {
    let start: Date, end: Date;
    switch (label) {
      case 'Last 2 Weeks':
        end = new Date();
        start = new Date();
        start.setDate(start.getDate() - 14);
        break;
      case 'Last Month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'Last 3 Months':
        start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'Last 6 Months':
        start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'Last 12 Months':
        start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default: return;
    }
    setTempFrom(toISODate(start));
    setTempTo(toISODate(end));
    setActivePreset(label);
    setMonth(start.getMonth());
    setYear(start.getFullYear());
    setYearPage(yearPageStart(start.getFullYear()));
    setView('days');
  };

  const handleCalendarSelect = (date: string) => {
    setActivePreset('Custom');
    if (!tempFrom || (tempFrom && tempTo)) {
      setTempFrom(date);
      setTempTo('');
    } else {
      if (date < tempFrom) {
        setTempTo(tempFrom);
        setTempFrom(date);
      } else {
        setTempTo(date);
      }
    }
  };

  const handleApply = () => {
    onChange(tempFrom, tempTo);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('', '');
    setOpen(false);
  };

  const changeMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  // The arrows step whatever the current panel is a grid of.
  const handleStep = (delta: number) => {
    if (view === 'days') changeMonth(delta);
    else if (view === 'months') setYear(year + delta);
    else setYearPage(yearPage + delta * YEARS_PER_PAGE);
  };

  const selectMonth = (m: number) => {
    setMonth(m);
    setView('days');
  };

  const selectYear = (y: number) => {
    setYear(y);
    setView('months');
  };

  const openYears = () => {
    setYearPage(yearPageStart(year));
    setView('years');
  };

  // Calendar cells
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long' });

  const cells: { day: number; current: boolean; date: string }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevDays - i);
    cells.push({ day: prevDays - i, current: false, date: toISODate(d) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, date: toISODate(new Date(year, month, d)) });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false, date: toISODate(new Date(year, month + 1, d)) });
  }

  const isInRange = (date: string) => {
    if (!tempFrom || !tempTo) return false;
    const s = tempFrom < tempTo ? tempFrom : tempTo;
    const e = tempFrom < tempTo ? tempTo : tempFrom;
    return date > s && date < e;
  };

  const displayText = from && to
    ? `${displayDate(from)} — ${displayDate(to)}`
    : from ? `From ${displayDate(from)}`
    : to ? `To ${displayDate(to)}`
    : '';

  return (
    <div className="relative" ref={ref}>
      {/* Trigger + clear are SIBLING buttons inside a shared bordered shell —
          a clear control nested inside the trigger button would be invalid
          nesting and unreachable by keyboard. */}
      <div
        className={`inline-flex items-center gap-2 border rounded-lg px-2.5 py-1.5 text-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 ${from || to ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-500'}`}>
        <button type="button" onClick={handleOpen} aria-haspopup="dialog" aria-expanded={open}
          className="inline-flex items-center gap-2 focus:outline-none">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {displayText || placeholder}
        </button>
        {clearable && (from || to) && (
          <button type="button" onClick={handleClear} aria-label="Clear date range"
            className="text-blue-400 hover:text-red-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded">&times;</button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 rounded-2xl p-4" style={{ right: 0, ...glassStyle() }}>
          {/* From/To display */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">From</span>
              <span className={`text-sm px-2 py-1 rounded border min-w-[90px] ${tempFrom ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                {tempFrom ? displayDate(tempFrom) : 'Start'}
              </span>
            </div>
            <span className="text-gray-300">—</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">To</span>
              <span className={`text-sm px-2 py-1 rounded border min-w-[90px] ${tempTo ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                {tempTo ? displayDate(tempTo) : 'End'}
              </span>
            </div>
          </div>

          <div className="flex gap-4">
            {/* Single Calendar */}
            <div className="w-64">
              <div className="flex items-center justify-between mb-2 px-1">
                <button type="button" onClick={() => handleStep(-1)} aria-label="Previous" className="p-1 rounded-full hover:bg-gray-100 text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                {/* Month and year are separately clickable, so jumping to a far
                    year is one click rather than drilling month -> year. */}
                <div className="flex items-center gap-1 text-sm font-semibold text-gray-800">
                  {view === 'days' && (
                    <button type="button" onClick={() => setView('months')}
                      className="px-1.5 py-0.5 rounded-md hover:bg-gray-100 transition-colors">
                      {monthName}
                    </button>
                  )}
                  {view === 'years' ? (
                    <span className="px-1.5 py-0.5">{yearPage} – {yearPage + YEARS_PER_PAGE - 1}</span>
                  ) : (
                    <button type="button" onClick={openYears}
                      className="px-1.5 py-0.5 rounded-md hover:bg-gray-100 transition-colors">
                      {year}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => handleStep(1)} aria-label="Next" className="p-1 rounded-full hover:bg-gray-100 text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              {/* Fixed height keeps the popup from resizing as panels swap. */}
              <div className="min-h-[13.75rem]">
                {view === 'days' && (
                  <>
                    <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 mb-1">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className="py-1">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 text-center text-sm">
                      {cells.map((c, i) => {
                        const isStart = c.date === tempFrom;
                        const isEnd = c.date === tempTo;
                        const isSelected = isStart || isEnd;
                        const inRange = isInRange(c.date);
                        return (
                          <button key={i} type="button" onClick={() => handleCalendarSelect(c.date)}
                            className={`py-1.5 rounded-md transition-colors ${
                              !c.current ? 'text-gray-300' :
                              isSelected ? 'bg-blue-600 text-white font-semibold' :
                              inRange ? 'bg-blue-100 text-blue-800' :
                              'text-gray-700 hover:bg-gray-100'
                            }`}>
                            {c.day}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {view === 'months' && (
                  <div className="grid grid-cols-3 gap-1 text-center text-sm">
                    {MONTH_NAMES.map((name, m) => {
                      const isCurrent = m === month;
                      const isThisMonth = m === now.getMonth() && year === now.getFullYear();
                      return (
                        <button key={name} type="button" onClick={() => selectMonth(m)}
                          className={`py-4 rounded-md transition-colors ${
                            isCurrent ? 'bg-blue-600 text-white font-semibold' :
                            isThisMonth ? 'text-blue-600 font-medium hover:bg-gray-100' :
                            'text-gray-700 hover:bg-gray-100'
                          }`}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {view === 'years' && (
                  <div className="grid grid-cols-3 gap-1 text-center text-sm">
                    {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPage + i).map(y => {
                      const isCurrent = y === year;
                      const isThisYear = y === now.getFullYear();
                      return (
                        <button key={y} type="button" onClick={() => selectYear(y)}
                          className={`py-4 rounded-md transition-colors ${
                            isCurrent ? 'bg-blue-600 text-white font-semibold' :
                            isThisYear ? 'text-blue-600 font-medium hover:bg-gray-100' :
                            'text-gray-700 hover:bg-gray-100'
                          }`}>
                          {y}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Presets */}
            <div className="border-l border-gray-200 pl-4 flex flex-col gap-1 min-w-[130px]">
              {PRESET_LABELS.map(label => (
                <button key={label} type="button" onClick={() => handlePreset(label)}
                  className={`text-left px-3 py-1.5 text-sm rounded-md transition-colors ${activePreset === label ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => setActivePreset('Custom')}
                className={`text-left px-3 py-1.5 text-sm rounded-md transition-colors ${activePreset === 'Custom' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                Custom
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
            {clearable && (
              <button type="button" onClick={handleClear} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Clear</button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleApply} disabled={!tempFrom || !tempTo}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
