import { useState, useRef, useEffect, useCallback, useId } from 'react';
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { glassStyle as getGlassStyle } from '../utils/glass';
import useClickOutside from '../hooks/useClickOutside';
import { registerModalEscapeInterceptor } from './Modal';
import { firstEnabledIndex, lastEnabledIndex, matchTypeahead, nextEnabledIndex } from '../forms/selectNav';

export interface FilterOption {
  label: string;
  field: string;
  options: { value: string; label: string }[];
  searchable?: boolean; // default true if > 8 options
}

interface FilterBarProps {
  filters: FilterOption[];
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onClear: () => void;
  children?: ReactNode;
}

/**
 * FilterBar — a horizontal row of filter controls. Each filter renders a custom
 * listbox dropdown or, for long lists, a glass-styled searchable dropdown; a
 * "Clear filters" button appears when any filter is active. Pair with
 * `useFilters`.
 *
 * The short-list path used to render a native `<select>`, but a native select's
 * OS popup swallows every key event while open — so list-page hotkeys died
 * until it closed (BG#00421). PlainFilter is a custom listbox that keeps key
 * events flowing to the page.
 */
export default function FilterBar({ filters, values, onChange, onClear, children }: FilterBarProps) {
  const activeCount = Object.values(values).filter(Boolean).length;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {filters.map(f => {
        const isSearchable = f.searchable ?? f.options.length > 8;
        return isSearchable ? (
          <SearchableFilter
            key={f.field}
            filter={f}
            value={values[f.field] || ''}
            onChange={v => onChange(f.field, v)}
          />
        ) : (
          <PlainFilter
            key={f.field}
            filter={f}
            value={values[f.field] || ''}
            onChange={v => onChange(f.field, v)}
          />
        );
      })}
      {children}
      {activeCount > 0 && (
        <button onClick={onClear} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <XMarkIcon className="h-4 w-4" />
          Clear filters
        </button>
      )}
    </div>
  );
}

/**
 * PlainFilter — the short-list (<=8 option) filter control. A pill trigger plus
 * a glass listbox dropdown, styled to match SearchableFilter. Focus stays on
 * the trigger and the active option is tracked via `aria-activedescendant`
 * (combobox pattern), with full keyboard support: Arrow/Home/End move the active
 * option, Enter/Space select, letter typeahead jumps, Esc closes the listbox
 * only. The leading option clears the filter (value '').
 */
function PlainFilter({ filter, value, onChange }: { filter: FilterOption; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const typeahead = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({ buffer: '', timer: null });

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  // Index 0 is the "clear" entry (value ''), so the option list and the trigger
  // label share one array and keyboard nav can land on "All".
  const items = [{ value: '', label: filter.label }, ...filter.options];
  const selectedIndex = value ? items.findIndex(o => o.value === value) : 0;
  const selectedLabel = value ? filter.options.find(o => o.value === value)?.label : null;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActive(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(items));
    setOpen(true);
  }, [selectedIndex, items]);

  const commit = useCallback((i: number) => {
    const o = items[i];
    if (!o) return;
    onChange(o.value);
    close();
  }, [items, onChange, close]);

  useClickOutside(ref, useCallback(() => { if (open) close(false); }, [open, close]));

  // Esc closes the listbox first, without closing a parent modal/window — the
  // modal's capture-phase Esc handler beats a bubble-phase onKeyDown, so the
  // shell's interceptor seam is the only way to win the race. The local
  // onKeyDown still covers the no-modal (plain page) case.
  useEffect(() => {
    if (!open) return;
    return registerModalEscapeInterceptor(e => {
      if (e.key !== 'Escape' || !openRef.current) return false;
      close();
      return true;
    });
  }, [open, close]);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' });
  });

  const runTypeahead = (char: string) => {
    const ta = typeahead.current;
    if (ta.timer) clearTimeout(ta.timer);
    ta.buffer += char;
    ta.timer = setTimeout(() => { ta.buffer = ''; ta.timer = null; }, 500);
    const hit = matchTypeahead(items, ta.buffer, open ? active : selectedIndex);
    if (hit < 0) return;
    if (open) setActive(hit);
    else commit(hit);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList(); else setActive(a => nextEnabledIndex(items, a, 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList(); else setActive(a => nextEnabledIndex(items, a, -1));
        return;
      case 'Home':
        if (open) { e.preventDefault(); setActive(firstEnabledIndex(items)); }
        return;
      case 'End':
        if (open) { e.preventDefault(); setActive(lastEnabledIndex(items)); }
        return;
      case 'Enter':
        if (open) { e.preventDefault(); commit(active); }
        return;
      case ' ':
        e.preventDefault();
        if (!open) openList(); else commit(active);
        return;
      case 'Escape':
        if (open) { e.preventDefault(); e.stopPropagation(); close(); }
        return;
      case 'Tab':
        if (open) close(false);
        return;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          runTypeahead(e.key);
        }
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-sm transition-colors ${value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
      >
        <span className="truncate max-w-[140px]">{selectedLabel || filter.label}</span>
        {value ? (
          <button type="button" onClick={e => { e.stopPropagation(); onChange(''); }} className="text-blue-400 hover:text-blue-600">
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        )}
      </button>

      {open && (
        <div ref={listRef} id={listboxId} role="listbox" className="absolute top-full left-0 mt-1 w-56 rounded-2xl z-[400] max-h-52 overflow-y-auto py-1" style={getGlassStyle()}>
          {items.map((o, i) => (
            <div
              key={o.value || '__all__'}
              id={optionId(i)}
              role="option"
              aria-selected={i === selectedIndex}
              onPointerEnter={() => setActive(i)}
              onClick={() => commit(i)}
              className={`mx-1 cursor-pointer truncate rounded-lg px-3 py-1.5 text-sm
                ${i === active ? 'bg-blue-50 text-blue-700'
                  : i === selectedIndex ? 'font-medium text-blue-600'
                  : 'text-gray-700'}`}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchableFilter({ filter, value, onChange }: { filter: FilterOption; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = value ? filter.options.find(o => o.value === value)?.label : null;

  useClickOutside(ref, useCallback(() => { if (open) { setOpen(false); setSearch(''); } }, [open]));

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = search
    ? filter.options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : filter.options;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-sm transition-colors ${value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
      >
        <span className="truncate max-w-[140px]">{selectedLabel || filter.label}</span>
        {value ? (
          <button onClick={e => { e.stopPropagation(); onChange(''); setSearch(''); }} className="text-blue-400 hover:text-blue-600">
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-2xl z-[400] overflow-hidden" style={getGlassStyle()}>
          {/* Search input */}
          <div className="p-1.5 border-b border-gray-100">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${filter.label.replace(/^All\s*/i, '').toLowerCase()}...`}
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:ring-0 outline-none"
            />
          </div>
          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {/* "All" option */}
            <button
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${!value ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-gray-600'}`}
            >
              {filter.label}
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">No matches</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 truncate ${value === o.value ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-gray-700'}`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Local filter-state helper: tracks active filter values + derived params. */
export function useFilters() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const setFilter = (field: string, value: string) => {
    setFilterValues(prev => {
      const next = { ...prev };
      if (value) next[field] = value;
      else delete next[field];
      return next;
    });
  };

  const clearFilters = () => setFilterValues({});

  const filterParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(filterValues)) {
    if (v) filterParams[k] = v;
  }

  return { filterValues, setFilter, clearFilters, filterParams };
}
