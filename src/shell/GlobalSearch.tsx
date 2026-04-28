import { useState, useEffect, useRef, useCallback } from 'react';
import { useWindowManager } from './WindowManager';
import { glassStyle as getGlassStyle } from '../utils/glass';

export interface SearchResult {
  /** Category label, e.g. "Sales Order". */
  type: string;
  /** Primary text shown in the result row. */
  label: string;
  /** Optional secondary line. */
  sub?: string;
  /** Window-registry key passed to openEntity. */
  entity_type: string;
  entity_id: string;
}

/** A search provider — given a query, returns matching results. The shell
 *  calls every provider in parallel and concatenates the responses. */
export type SearchProvider = (query: string) => Promise<SearchResult[]>;

/** Bundle of search-related consumer config. */
export interface SearchConfig {
  providers: SearchProvider[];
  /** Per-result-type icon (SVG path `d` attribute). Unmatched types fall
   *  back to a generic magnifier glyph. */
  typeIcons?: Record<string, string>;
  placeholder?: string;
}

interface GlobalSearchProps extends Partial<SearchConfig> {}

const DEFAULT_MAGNIFIER = 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z';

export default function GlobalSearch({ providers, typeIcons, placeholder = 'Search...' }: GlobalSearchProps = {}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { openEntity } = useWindowManager();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Hotkey: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // Debounced search across all providers
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    if (!providers || providers.length === 0) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const responses = await Promise.all(providers.map(p => p(query).catch(() => [] as SearchResult[])));
        setResults(responses.flat());
        setActiveIdx(0);
      } catch { setResults([]); }
      setLoading(false);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, providers]);

  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false);
    openEntity(result.entity_type, result.entity_id, null, result.label);
  }, [openEntity]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) { handleSelect(results[activeIdx]); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-xl rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()} style={getGlassStyle()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <svg className="h-5 w-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={DEFAULT_MAGNIFIER} />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 text-sm bg-transparent border-0 outline-none placeholder-gray-400"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-gray-300 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">Searching...</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No results found.</div>
          )}
          {!loading && results.length > 0 && (
            <ul className="py-2">
              {results.map((r, i) => (
                <li key={`${r.type}-${r.label}-${i}`}>
                  <button
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                      i === activeIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={typeIcons?.[r.type] || DEFAULT_MAGNIFIER} />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.label}</p>
                      {r.sub && <p className="text-xs text-gray-400 truncate">{r.sub}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{r.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && query.length < 2 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">Type at least 2 characters to search...</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="rounded border border-gray-300 px-1 py-0.5 font-medium">&uarr;</kbd><kbd className="rounded border border-gray-300 px-1 py-0.5 font-medium">&darr;</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="rounded border border-gray-300 px-1 py-0.5 font-medium">Enter</kbd> open</span>
          </div>
          <span className="flex items-center gap-1"><kbd className="rounded border border-gray-300 px-1 py-0.5 font-medium">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
