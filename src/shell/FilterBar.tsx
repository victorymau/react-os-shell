import { useState, useRef, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { glassStyle as getGlassStyle } from '../utils/glass';
import useClickOutside from '../hooks/useClickOutside';

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
 * FilterBar — a horizontal row of filter controls. Each filter renders a native
 * `<select>` or, for long lists, a glass-styled searchable dropdown; a "Clear
 * filters" button appears when any filter is active. Pair with `useFilters`.
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
          <select
            key={f.field}
            value={values[f.field] || ''}
            onChange={e => onChange(f.field, e.target.value)}
            className={`border rounded-lg px-2.5 py-1.5 text-sm ${values[f.field] ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'}`}
          >
            <option value="">{f.label}</option>
            {f.options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
