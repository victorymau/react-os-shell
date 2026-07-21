/**
 * Select — a form control for short, fixed option lists. Follows the kit's
 * controlled idiom (`value` + `onChange(value)`, not the raw event, matching
 * SearchableSelect).
 *
 * On DESKTOP this renders a custom listbox: a trigger button plus a
 * body-portaled option list (same portal/positioning reasoning as
 * SearchableSelect and PopupMenu). A native `<select>` on desktop opens an OS
 * popup that grabs every key event while it is open — so page/window hotkeys
 * die until it closes (BG#00421). The custom listbox keeps key events flowing
 * to the app, so hotkeys keep working, and adds full keyboard support
 * (Arrow/Home/End/Enter/Space/typeahead) with combobox/listbox ARIA.
 *
 * On MOBILE (touch) this renders the native `<select>` — the OS wheel/sheet
 * picker is the better touch affordance and hotkeys are irrelevant there. The
 * native element is also where the forwarded `HTMLSelectElement` ref and any
 * spread native attributes land, so `NativeSelect` is exported for callers that
 * need a raw native control on every viewport.
 *
 * Use SearchableSelect instead when the list is long or needs type-to-filter /
 * free-text entry; use Select for a handful of known options.
 */
import {
  forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { inputClasses } from './styles';
import { firstEnabledIndex, lastEnabledIndex, matchTypeahead, nextEnabledIndex } from './selectNav';
import { glassStyle } from '../utils/glass';
import { useIsMobile } from '../shell/useIsMobile';
import { registerModalEscapeInterceptor } from '../shell/Modal';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'className'> {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown as a disabled first option when no value is selected. */
  placeholder?: string;
  invalid?: boolean;
  className?: string;
}

/** Gap between the trigger and the popup, and the viewport safety margin. */
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;
const MENU_MAX_HEIGHT = 240;

/**
 * Raw native `<select>` styled to match the kit's inputs. This is the original
 * Select — kept as the mobile rendering and exported for callers that need a
 * real `HTMLSelectElement` (form posts, native attribute spread, focus).
 */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectProps>(function NativeSelect(
  { value, onChange, options, placeholder, invalid, className = '', ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={inputClasses({ invalid, className: `pr-8 ${className}`.trim() })}
      {...rest}
    >
      {placeholder !== undefined && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
});

/**
 * Track the popup's fixed-viewport position from the trigger rect while open,
 * re-running on scroll (capture, so nested form-scroll containers count),
 * resize, and every animation frame the trigger moves (a shell window drag
 * moves it via an ancestor transform, which fires neither scroll nor resize).
 * Anchors below the trigger, flips above when below is cramped. Mirrors
 * SearchableSelect's `useDropdownPosition`.
 */
interface MenuPos { left: number; top?: number; bottom?: number; minWidth: number; maxHeight: number }
function useAnchoredPosition(triggerRef: React.RefObject<HTMLElement | null>, open: boolean): MenuPos | null {
  const [pos, setPos] = useState<MenuPos | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    let lastLeft = NaN, lastTop = NaN, lastBottom = NaN;
    const compute = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      lastLeft = rect.left; lastTop = rect.top; lastBottom = rect.bottom;
      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
      const placeAbove = spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(MENU_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow));
      const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - rect.width - VIEWPORT_MARGIN));
      const next: MenuPos = { left, minWidth: rect.width, maxHeight };
      if (placeAbove) next.bottom = window.innerHeight - rect.top + MENU_GAP;
      else next.top = rect.bottom + MENU_GAP;
      setPos(next);
    };
    compute();
    let raf = requestAnimationFrame(function tick() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect && (rect.left !== lastLeft || rect.top !== lastTop || rect.bottom !== lastBottom)) compute();
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

/** Desktop custom listbox. Keeps DOM focus on the trigger and tracks the active
 *  option with `aria-activedescendant` (the standard combobox pattern). */
const ListboxSelect = forwardRef<HTMLSelectElement, SelectProps>(function ListboxSelect(
  { value, onChange, options, placeholder, invalid, className = '', id, disabled, ...rest },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const typeahead = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({ buffer: '', timer: null });

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const menuPos = useAnchoredPosition(triggerRef, open);
  const selectedIndex = options.findIndex(o => o.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : undefined;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActive(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  const commit = useCallback((i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    close();
  }, [options, onChange, close]);

  // Esc closes the listbox first, WITHOUT closing any parent modal/window.
  // Modal's Escape handler runs on window in the CAPTURE phase, so it beats the
  // trigger's own (bubble-phase) onKeyDown — the only way to close the listbox
  // ahead of the modal is the shell's own interceptor seam, which the modal
  // consults before closing. The local onKeyDown below still handles Esc when
  // there is no modal in play (a plain page).
  useEffect(() => {
    if (!open) return;
    const unregister = registerModalEscapeInterceptor(e => {
      if (e.key !== 'Escape' || !openRef.current) return false;
      close();
      return true;
    });
    return unregister;
  }, [open, close]);

  // Close on outside pointer-down. The list is portaled to <body> (outside
  // wrapRef), so a click inside EITHER the trigger wrap or the portaled list
  // counts as inside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open, close]);

  // Keep the active option scrolled into view as it moves.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' });
  });

  const runTypeahead = useCallback((char: string) => {
    const ta = typeahead.current;
    if (ta.timer) clearTimeout(ta.timer);
    ta.buffer += char;
    ta.timer = setTimeout(() => { ta.buffer = ''; ta.timer = null; }, 500);
    const from = open ? active : selectedIndex;
    const hit = matchTypeahead(options, ta.buffer, from);
    if (hit < 0) return;
    if (open) setActive(hit);
    else commit(hit);
  }, [open, active, selectedIndex, options, commit]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActive(a => nextEnabledIndex(options, a, 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList();
        else setActive(a => nextEnabledIndex(options, a, -1));
        return;
      case 'Home':
        if (open) { e.preventDefault(); setActive(firstEnabledIndex(options)); }
        return;
      case 'End':
        if (open) { e.preventDefault(); setActive(lastEnabledIndex(options)); }
        return;
      case 'Enter':
        if (open) { e.preventDefault(); commit(active); }
        return;
      case ' ':
        // Space opens the list, or selects the active option once open.
        e.preventDefault();
        if (!open) openList();
        else commit(active);
        return;
      case 'Escape':
        if (open) { e.preventDefault(); e.stopPropagation(); close(); }
        return;
      case 'Tab':
        if (open) close(false); // no preventDefault — let focus advance
        return;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          runTypeahead(e.key);
        }
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={inputClasses({ invalid, className: `pr-8 text-left ${className}`.trim() })}
      >
        <span className={`block truncate ${selectedLabel === undefined ? 'text-gray-400' : ''}`}>
          {selectedLabel ?? placeholder ?? ' '}
        </span>
      </button>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9l3.75-3.75L15.75 9M8.25 15l3.75 3.75L15.75 15" />
      </svg>

      {/* Hidden native <select> carries the forwarded HTMLSelectElement ref and
          any spread native attributes (name, required, form posts…) so the
          public API stays honoured; it is not a tab stop and is hidden from AT. */}
      <select
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        {...rest}
      >
        {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>

      {open && createPortal(
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="fixed z-[400] overflow-y-auto rounded-2xl py-1"
          style={{
            left: menuPos?.left,
            top: menuPos?.top,
            bottom: menuPos?.bottom,
            minWidth: menuPos?.minWidth,
            maxHeight: menuPos?.maxHeight ?? MENU_MAX_HEIGHT,
            visibility: menuPos ? undefined : 'hidden',
            ...glassStyle(),
          }}
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              id={optionId(i)}
              role="option"
              aria-selected={value === o.value}
              aria-disabled={o.disabled || undefined}
              onPointerEnter={() => { if (!o.disabled) setActive(i); }}
              onClick={() => commit(i)}
              className={`mx-1 cursor-pointer truncate rounded-lg px-3 py-1.5 text-sm
                ${o.disabled ? 'cursor-not-allowed text-gray-400'
                  : i === active ? 'bg-blue-50 text-blue-700'
                  : value === o.value ? 'font-medium text-blue-600'
                  : 'text-gray-700'}`}
            >
              {o.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
});

/** Smart Select: native `<select>` on touch, custom listbox on desktop. */
const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(props, ref) {
  const isMobile = useIsMobile();
  return isMobile ? <NativeSelect ref={ref} {...props} /> : <ListboxSelect ref={ref} {...props} />;
});

export default Select;
