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
 *
 * The dropdown is portaled to `document.body` and positioned `fixed` at the
 * trigger's viewport rect. Rendering it in place would let any scrolling /
 * `overflow-hidden` ancestor (every form's scroll container, a window panel)
 * clip it — the classic "the list is cut off by the modal footer" bug. See
 * `PopupMenu`'s `portal` prop for the same reasoning.
 */
import { useState, useRef, useMemo, useEffect, useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
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

/** `max-w-[28rem]` on the menu, as a number for the fit math. */
const POPUP_MAX_WIDTH = 448;
/** Menu's own max height (former `max-h-60` = 15rem). Capped smaller when the
 *  viewport is tight. */
const MENU_MAX_HEIGHT = 240;
/** Gap between the trigger and the menu, and the viewport safety margin. */
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

interface MenuPos {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  minWidth: number;
  maxHeight: number;
}

/**
 * Compute the menu's fixed-viewport position from the trigger rect while the
 * dropdown is open, re-running on scroll (capture, so nested form-scroll
 * containers count), resize, and every animation frame the trigger moves so it
 * tracks a moving trigger. Anchors below the trigger by default, flips above
 * when below is cramped and above has more room, and flips to right-aligned
 * when the max width wouldn't fit to the right of the trigger's left edge.
 */
function useDropdownPosition(triggerRef: RefObject<HTMLElement | null>, open: boolean): MenuPos | null {
  const [pos, setPos] = useState<MenuPos | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    // Remember the last trigger rect the rAF poll acted on, so the idle loop
    // recomputes only when the trigger has actually moved.
    let lastLeft = NaN, lastTop = NaN, lastRight = NaN, lastBottom = NaN;
    const compute = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      lastLeft = rect.left; lastTop = rect.top; lastRight = rect.right; lastBottom = rect.bottom;
      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
      const placeAbove = spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(MENU_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow));
      const next: MenuPos = { minWidth: rect.width, maxHeight };
      if (window.innerWidth - rect.left < POPUP_MAX_WIDTH) {
        next.right = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right);
      } else {
        next.left = Math.max(VIEWPORT_MARGIN, rect.left);
      }
      if (placeAbove) next.bottom = window.innerHeight - rect.top + MENU_GAP;
      else next.top = rect.bottom + MENU_GAP;
      setPos(next);
    };
    compute();
    // Dragging a shell window moves the trigger via a CSS transform on an
    // ancestor — that fires neither scroll nor resize, so the listeners below
    // never see it and the menu would hang at its open-time spot while the
    // window slides out from under it. Poll the trigger rect each animation
    // frame and recompute when it shifts, so the menu tracks the window
    // through a drag (and any other transform-/animation-driven move). The
    // rect dirty-check keeps the idle loop cheap when nothing is moving.
    let raf = requestAnimationFrame(function tick() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect && (rect.left !== lastLeft || rect.top !== lastTop || rect.right !== lastRight || rect.bottom !== lastBottom)) {
        compute();
      }
      raf = requestAnimationFrame(tick);
    });
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, triggerRef]);
  return pos;
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
  const menuRef = useRef<HTMLDivElement>(null);
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

  const menuPos = useDropdownPosition(triggerRef, open);

  // Cached lookup so the closed-state display can show the current
  // selection's label without scanning options on every keystroke. In
  // free-text mode, fall back to the raw `value` so user-typed entries
  // round-trip visibly.
  const selectedLabel = useMemo(() => {
    const match = options.find(o => o.value === value);
    if (match) return match.label;
    return allowFreeText ? value : '';
  }, [options, value, allowFreeText]);

  // Close on outside pointer-down. The menu is portaled to `document.body`
  // (outside `wrapRef`), so the check has to treat clicks inside EITHER the
  // trigger wrap or the portaled menu as "inside" — otherwise scrolling the
  // menu or clicking a wide option would dismiss it.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      if (allowFreeText && search.trim() && search.trim() !== value) {
        onChange(search.trim());
      }
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, allowFreeText, search, value, onChange]);

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
    // Server-search mode (parent wired `onSearchChange`): the options ARE the
    // server's results for the typed text, so show them verbatim. Re-filtering
    // here on label/sublabel would silently hide valid matches the server made
    // on other fields (e.g. a row matched by a field that isn't the label),
    // making the search look capped.
    if (onSearchChange) return dedupedOptions;
    const q = search.trim().toLowerCase();
    if (!q) return dedupedOptions;
    return dedupedOptions.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel?.toLowerCase().includes(q) ?? false)
    );
  }, [dedupedOptions, search, onSearchChange]);

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
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[400] rounded-2xl overflow-hidden"
          style={{
            left: menuPos?.left,
            right: menuPos?.right,
            top: menuPos?.top,
            bottom: menuPos?.bottom,
            minWidth: menuPos?.minWidth,
            maxWidth: POPUP_MAX_WIDTH,
            width: 'max-content',
            // Hidden for the first paint until the layout effect measures the
            // trigger, so the menu never flashes at (0,0).
            visibility: menuPos ? undefined : 'hidden',
            ...glassStyle(),
          }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: menuPos?.maxHeight ?? MENU_MAX_HEIGHT }}>
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
        </div>,
        document.body
      )}
    </div>
  );
}
