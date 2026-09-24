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
import { useState, useRef, useMemo, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { glassStyle } from '../utils/glass';
import { INPUT_BASE } from '../forms/styles';
import { useDropdownPosition, MENU_MAX_HEIGHT } from '../forms/dropdownPosition';
import { useShellStrings } from './strings';
import { registerModalEscapeInterceptor } from './escapeInterceptors';
import { onOverlayOpen } from './overlayEvents';
import { Z_LAYERS } from './zLayers';

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

// Menu geometry + the positioning hook live in `src/forms/dropdownPosition`,
// shared with TagInput.

/** Hover-revealed × that clears the selection. The parent is `relative
 *  group`, so the button fades in on field hover only. mousedown (not
 *  click) so the input's focus/open handlers never fire. */
function ClearButton({ onClear, ariaLabel }: { onClear: () => void; ariaLabel: string }) {
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
  value, onChange, options, placeholder, emptyOptionLabel, className = '',
  disabled, id, allowFreeText = false, onSearchChange, rightAdornment,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearchState] = useState('');
  // Catalog defaults — a caller's own labels always win (see strings.tsx).
  const strings = useShellStrings();
  const noneLabel = emptyOptionLabel ?? strings.select.none;
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
  // Read by the handlers that can run between a close and the re-render that
  // follows it — a blur the close itself caused, or an overlay opening in the
  // same commit — so a menu that has already closed is never closed twice
  // (and never commits free text on its way out after a pick).
  const openRef = useRef(open);
  openRef.current = open;
  // True for the length of a pointer press inside the portalled menu. Pressing
  // its padding, its "no matches" line or its scrollbar moves focus to <body>,
  // and that blur must not read as focus leaving the control.
  const menuPressRef = useRef(false);

  /** Close the menu. `commit` applies the free-text rule every "the user
   *  moved on" path shares — outside press, Tab, focus leaving, an overlay
   *  opening: typed text that is not the current value becomes the value. */
  const closeMenu = (commit: boolean) => {
    if (!openRef.current) return;
    openRef.current = false;
    const typed = search.trim();
    if (commit && allowFreeText && typed && typed !== value) onChange(typed);
    setOpen(false);
    setSearch('');
  };

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

  const menuPos = useDropdownPosition(triggerRef, open, { matchTriggerWidth: true });

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
  //
  // An overlay opening (⌘K's search palette, a Dialog) closes it too: the menu
  // is layered above the overlay layer, so left open it floats crisp over the
  // overlay's backdrop — see `overlayEvents.ts`.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeMenu(true);
    };
    document.addEventListener('mousedown', handler);
    const offOverlay = onOverlayOpen(() => closeMenu(true));
    return () => {
      document.removeEventListener('mousedown', handler);
      offOverlay();
    };
  }, [open, allowFreeText, search, value, onChange]);

  // Esc closes the menu first, WITHOUT closing the window or dialog around it.
  // Modal's Escape handler runs on window in the CAPTURE phase, ahead of the
  // input's own onKeyDown, so the interceptor seam is the only way to get
  // there first — the same registration `Select` makes. The onKeyDown branch
  // below still covers a plain page, where the seam's own drain calls this.
  useEffect(() => {
    if (!open) return;
    return registerModalEscapeInterceptor(e => {
      if (e.key !== 'Escape' || !openRef.current) return false;
      closeMenu(false);
      triggerRef.current?.blur();
      return true;
    });
  }, [open]);

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
    <div
      ref={wrapRef}
      className="relative group"
      // Focus leaving BOTH the field and the menu closes it — clicking into
      // another window's field, a script moving focus, anything the outside
      // press and the Tab key do not see. React's onBlur is `focusout`, and it
      // bubbles through the portal along the React tree, so a blur inside the
      // menu arrives here too.
      onBlur={e => {
        const next = e.relatedTarget as Node | null;
        if (next && (wrapRef.current?.contains(next) || menuRef.current?.contains(next))) return;
        if (menuPressRef.current) return;
        // The browser window lost focus, not the field: activeElement still
        // points at the input, and the menu should be there when the user
        // comes back.
        if (document.activeElement === triggerRef.current) return;
        closeMenu(true);
      }}
    >
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
              closeMenu(false);
            } else if (allowFreeText && search.trim()) {
              onChange(search.trim());
              closeMenu(false);
              triggerRef.current?.blur();
            }
          } else if (e.key === 'Escape') {
            closeMenu(false);
            triggerRef.current?.blur();
          } else if (e.key === 'Tab') {
            // Tab moves focus to the next field; close/clear the dropdown so the
            // body-portaled results don't linger over the neighbour (BG#00359).
            // No preventDefault — let Tab advance focus as usual (covers
            // Shift+Tab too). The free-text commit is the outside-press rule.
            closeMenu(true);
          }
        }}
        placeholder={placeholder || noneLabel}
        className={`${INPUT_BASE} ${className} ${value ? 'pr-8' : ''} ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''} truncate`}
        style={adornPad ? { paddingRight: adornPad } : undefined}
        disabled={disabled}
      />
      {value && !disabled && (
        <ClearButton ariaLabel={strings.select.clear} onClear={() => { onChange(''); closeMenu(false); }} />
      )}
      {rightAdornment && !open && (
        <div ref={adornRef} className={`absolute top-1/2 -translate-y-1/2 ${value && !disabled ? 'right-8' : 'right-2'} flex items-center gap-1 flex-nowrap justify-end pointer-events-none`}>
          {rightAdornment}
        </div>
      )}
      {open && createPortal(
        <div
          ref={menuRef}
          onMouseDownCapture={() => {
            menuPressRef.current = true;
            // Cleared after the press's default action (the focus move) has run.
            setTimeout(() => { menuPressRef.current = false; }, 0);
          }}
          // The dropdown must sit ABOVE the modal layer, not below it.
          //
          // It was z-[400], under Dialog and Drawer at z-[9999] — so a Select
          // inside a dialog, which is where form controls usually are, opened
          // its menu behind the dialog that owns it. Nothing looked broken;
          // the list simply was not there.
          //
          // Above the toasts too, deliberately: a menu is open only while the
          // user is holding it open, and a notification arriving underneath it
          // is better than one that covers what they are choosing from.
          className="fixed rounded-2xl overflow-hidden"
          style={{
            zIndex: Z_LAYERS.popup,
            left: menuPos?.left,
            right: menuPos?.right,
            top: menuPos?.top,
            bottom: menuPos?.bottom,
            minWidth: menuPos?.minWidth,
            width: menuPos?.width,
            // Hidden for the first paint until the layout effect measures the
            // trigger, so the menu never flashes at (0,0).
            visibility: menuPos ? undefined : 'hidden',
            ...glassStyle(),
          }}
        >
          <div className="overflow-y-auto" style={{ maxHeight: menuPos?.maxHeight ?? MENU_MAX_HEIGHT }}>
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">{strings.select.noMatches}</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onMouseDown={() => { onChange(o.value); closeMenu(false); }}
                  className={`w-full overflow-hidden text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between gap-2 whitespace-nowrap ${value === o.value ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-gray-700'}`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.sublabel && <span className="min-w-0 max-w-[45%] shrink-0 truncate text-xs text-gray-400">{o.sublabel}</span>}
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
