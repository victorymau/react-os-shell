/**
 * SearchableSelect — combobox-style form control. Looks like a normal form
 * `<input>` (so it drops in alongside other form fields), but typing filters
 * the options list in a frosted-glass dropdown. Promoted from the EFFICIENT
 * admin portal, where it fronts every entity picker.
 *
 * Use it when the option list is small enough to load all at once; for
 * server-backed lists, wire `onSearchChange` to a debounced query and keep
 * feeding the latest page through `options` — the component keeps working
 * as a dumb view over whatever options it's given.
 */
import { useState, useRef, useMemo, useLayoutEffect, type ReactNode, type RefObject } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import { glassStyle } from '../utils/glass';
import { INPUT_BASE } from '../forms/styles';

export interface SearchableOption {
  value: string;
  label: string;
  /** Optional secondary text rendered greyed-out on the right of the
   *  option (e.g. an order date next to a proforma number). */
  sublabel?: string;
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  /** Placeholder shown when no value is selected and the field is empty. */
  placeholder?: string;
  /** Fallback placeholder text when no `placeholder` is provided and
   *  nothing is selected. Clearing the selection is done via the hover
   *  "×" on the input itself. */
  emptyOptionLabel?: string;
  /** Extra Tailwind classes appended to the input (error rings, custom
   *  widths…). The base form-input styling is built in. */
  className?: string;
  disabled?: boolean;
  /** Optional id for label-for wiring. */
  id?: string;
  /** When true, the user can submit a value that isn't in `options` —
   *  pressing Enter or clicking outside with non-empty search text
   *  fires `onChange` with the typed string. The trigger then displays
   *  that free-text value as-is. Default false: only listed options
   *  can be picked, typing only filters. */
  allowFreeText?: boolean;
  /** Optional notifier fired whenever the user-typed search text changes
   *  (including resets to ''). Lets a parent debounce the value and feed
   *  a server-side query, so this component can still front a list that
   *  is too large to load up-front. */
  onSearchChange?: (text: string) => void;
  /** Optional content rendered inside the trigger's right edge — to the
   *  left of the clear button — when the dropdown is closed. Use for
   *  compact status pills that should read alongside the selected label.
   *  Hidden while the user is typing so the search text stays legible. */
  rightAdornment?: ReactNode;
}

/** Flip the dropdown to right-anchored when its max width wouldn't fit
 *  between the trigger's left edge and the viewport's right edge. */
function useDropdownAlignment(triggerRef: RefObject<HTMLElement | null>, open: boolean, maxWidth: number): boolean {
  const [alignRight, setAlignRight] = useState(false);
  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAlignRight(window.innerWidth - rect.left < maxWidth);
  }, [open, maxWidth, triggerRef]);
  return alignRight;
}

/** Hover-revealed × that clears the selection. The parent is `relative
 *  group`, so the button fades in on field hover only. mousedown (not
 *  click) so the input's focus/open handlers never fire. */
function ClearButton({ onClear, ariaLabel = 'Clear selection' }: { onClear: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClear(); }}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-base leading-none"
    >
      &times;
    </button>
  );
}

// Trigger input styling is shared with the other form controls — see
// `src/forms/styles.ts` (INPUT_BASE), which also picks up the dark-theme
// input remaps from styles.css.

export default function SearchableSelect({
  value, onChange, options, placeholder, emptyOptionLabel = '— None —', className = '',
  disabled, id, allowFreeText = false, onSearchChange, rightAdornment,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearchState] = useState('');
  // Wrap setSearch so every change also notifies the parent (when wired up).
  // Keeps the in-memory filtering working while letting a parent that wants
  // server-side search debounce + react to the same value.
  const setSearch = (next: string) => {
    setSearchState(next);
    onSearchChange?.(next);
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLInputElement>(null);
  const adornRef = useRef<HTMLDivElement>(null);

  // Reserve input padding for the right adornment so long labels truncate
  // in front of it instead of running underneath. Measured (adornment width
  // varies — a pill, an icon row…) and re-checked per render; the state
  // setter bails when the number is unchanged.
  const [adornPad, setAdornPad] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!rightAdornment || open) { setAdornPad(null); return; }
    const w = adornRef.current?.offsetWidth ?? 0;
    // adornment width + its right offset (8px, or 32px when the clear ×
    // also reserves space) + a 6px gap to the text.
    setAdornPad(w ? w + (value && !disabled ? 32 : 8) + 6 : null);
  });

  // Flip popup alignment if `max-w-[28rem]` (below) wouldn't fit to the
  // right of the trigger — keep the constant in sync with the class.
  const POPUP_MAX_WIDTH = 448;
  const alignRight = useDropdownAlignment(triggerRef, open, POPUP_MAX_WIDTH);

  // Cached lookup so the closed-state display can show the current
  // selection's label without scanning options on every keystroke. In
  // free-text mode, fall back to the raw `value` so user-typed entries
  // round-trip visibly.
  const selectedLabel = useMemo(() => {
    const match = options.find(o => o.value === value);
    if (match) return match.label;
    return allowFreeText ? value : '';
  }, [options, value, allowFreeText]);

  useClickOutside(wrapRef, () => {
    if (allowFreeText && search.trim() && search.trim() !== value) {
      onChange(search.trim());
    }
    setOpen(false);
    setSearch('');
  });

  // Dedupe by `value` — call sites occasionally feed option lists that
  // contain the same id twice (a server returning a row twice across pages,
  // two cache writers landing on the same key, …). First-wins keeps the
  // earliest entry so duplicate React keys never happen downstream.
  const dedupedOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: SearchableOption[] = [];
    for (const o of options) {
      if (seen.has(o.value)) continue;
      seen.add(o.value);
      out.push(o);
    }
    return out;
  }, [options]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dedupedOptions;
    return dedupedOptions.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel?.toLowerCase().includes(q) ?? false)
    );
  }, [dedupedOptions, search]);

  return (
    <div ref={wrapRef} className="relative group">
      {/* Combobox-style trigger: shows the selected label when closed,
          and becomes the search field when focused — typing filters
          the option list directly, no separate search box. */}
      <input
        id={id}
        ref={triggerRef}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        value={open ? search : selectedLabel}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { if (!disabled) { setSearch(''); setOpen(true); } }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered.length === 1) {
              onChange(filtered[0].value);
              setOpen(false);
              setSearch('');
            } else if (allowFreeText && search.trim()) {
              onChange(search.trim());
              setOpen(false);
              setSearch('');
              triggerRef.current?.blur();
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
            setSearch('');
            triggerRef.current?.blur();
          }
        }}
        placeholder={placeholder || (emptyOptionLabel || 'Select…')}
        className={`${INPUT_BASE} ${className} ${value ? 'pr-8' : ''} ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''} truncate`}
        style={adornPad ? { paddingRight: adornPad } : undefined}
        disabled={disabled}
      />
      {value && !disabled && (
        <ClearButton onClear={() => { onChange(''); setOpen(false); setSearch(''); }} />
      )}
      {rightAdornment && !open && (
        <div ref={adornRef} className={`absolute top-1/2 -translate-y-1/2 ${value && !disabled ? 'right-8' : 'right-2'} flex items-center gap-1 flex-nowrap justify-end pointer-events-none`}>
          {rightAdornment}
        </div>
      )}
      {open && (
        <div
          className={`absolute z-[200] mt-1 rounded-2xl overflow-hidden ${alignRight ? 'right-0' : 'left-0'} min-w-full max-w-[28rem] w-max`}
          style={glassStyle()}
        >
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">No matches</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onMouseDown={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between gap-2 whitespace-nowrap ${value === o.value ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-gray-700'}`}
                >
                  <span>{o.label}</span>
                  {o.sublabel && <span className="text-xs text-gray-400 shrink-0">{o.sublabel}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
