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
 *
 * The panel is placed against whatever box CLIPS it rather than against a fixed
 * edge — see `clipBounds` below and the alignment effect in the component.
 */
import { useState, useRef, useCallback, useLayoutEffect } from 'react';

import Calendar from './Calendar';
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


/** The year grid pages in 12s so it reuses the month grid's 3x4 shape. */
/** `YYYY-MM` for Calendar's controlled view. */
const monthKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const pad = (n: number) => String(n).padStart(2, '0');

/** Clear space kept between the panel and the edge it stops at. */
const EDGE_MARGIN = 8;

/**
 * The box the open panel has to stay inside.
 *
 * The nearest ancestor that clips horizontally, falling back to the viewport
 * when nothing on the way up does. The distinction matters: a shell window's
 * body is `overflow-hidden`, so a panel that hangs past its edge is not merely
 * off to one side, it is *gone* — there is nothing to scroll and resizing the
 * window does not bring it back, because the trigger moves with the edge.
 *
 * jsdom, and a container the browser has not laid out yet, both report a rect
 * of zeros; that says nothing about where the panel may go, so keep walking.
 */
function clipBounds(el: HTMLElement): { left: number; right: number } {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    // jsdom does not expand the `overflow` shorthand into `overflow-x`, and
    // `overflow-hidden` is how every clipping surface in the shell spells it.
    // A browser always resolves `overflowX`, so the fallback is inert there.
    const overflowX = style.overflowX || style.overflow;
    if (overflowX && overflowX !== 'visible') {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0) return { left: rect.left, right: rect.right };
    }
  }
  return { left: 0, right: window.innerWidth };
}

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
  const panelRef = useRef<HTMLDivElement>(null);
  // Which edge of the trigger the panel hangs from.
  const [align, setAlign] = useState<'left' | 'right'>('left');

  const now = new Date();
  // The grid, the month/year panels, the paging and the keyboard all live in
  // `Calendar` now. What is left here is which month it is showing, so a preset
  // can move it — and the range state, which is this component's actual job.
  const [viewMonth, setViewMonth] = useState(() => monthKeyOf(from ? parseDate(from) : now));

  const displayDate = (s: string) => (s ? formatDisplay(s) : '');

  useClickOutside(ref, useCallback(() => { if (open) setOpen(false); }, [open]));

  /**
   * Hang the panel off whichever edge of the trigger leaves it on screen.
   *
   * It used to be pinned to `right: 0`, which suits a trigger sitting at the
   * right of a list toolbar and ruins one sitting at the left: the panel grows
   * leftward, past the edge of the shell window, and the From box, the
   * month/year header and the previous-month arrow are simply not there. So
   * left-align by default, since a filter bar reads left to right and its first
   * control has the whole width to open into, and keep the old right-alignment
   * for the case it was protecting — a trigger with no room to its right.
   *
   * The width is measured, not assumed: the presets column is `min-w-[130px]`,
   * a MINIMUM, so the real width follows the longest preset label at whatever
   * font size the reader has. Ancestor clipping does not affect an element's
   * own rect, so this reads true even while the panel is being cut off.
   *
   * Runs in a layout effect, so the correction lands in the same paint as the
   * open and nothing flashes. Re-measuring on resize is what makes maximising
   * the window do something, which is the first thing anyone tries.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = ref.current, panel = panelRef.current;
      if (!anchor || !panel) return;
      const trigger = anchor.getBoundingClientRect();
      const width = panel.getBoundingClientRect().width;
      const bounds = clipBounds(anchor);
      const fitsLeftAligned = trigger.left + width <= bounds.right - EDGE_MARGIN;
      const fitsRightAligned = trigger.right - width >= bounds.left + EDGE_MARGIN;
      // When neither fits — a container narrower than the panel itself — left
      // wins, because the half worth keeping is the one with the dates in it.
      setAlign(fitsLeftAligned || !fitsRightAligned ? 'left' : 'right');
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  const handleOpen = () => {
    setTempFrom(from);
    setTempTo(to);
    setActivePreset(null);
    setViewMonth(monthKeyOf(from ? parseDate(from) : now));
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
    setViewMonth(monthKeyOf(start));
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
        <div ref={panelRef} role="dialog" aria-label="Date range" className="absolute z-50 mt-1 rounded-2xl p-4"
          style={{ ...(align === 'right' ? { right: 0 } : { left: 0 }), ...glassStyle() }}>
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
            {/* The grid, its keyboard model and its ARIA all come from Calendar,
                which is also what DatePicker draws — so a range and a single
                date look and behave like the same control. This used to be 95
                lines of hand-built cells here with no arrow keys and a day
                whose accessible name was its number. */}
            <div className="w-64">
              <Calendar
                mode="range"
                value={tempFrom || null}
                endValue={tempTo || null}
                month={viewMonth}
                onMonthChange={setViewMonth}
                onSelect={handleCalendarSelect}
                aria-label="Date range"
              />
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
