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
 * picker is the better touch affordance and hotkeys are irrelevant there —
 * AT THE `touch` RUNG, not at whatever desktop rung the caller asked for. See
 * the Select doc-block below for why, and `touchSize` for how to override it.
 * The native element is also where the forwarded `HTMLSelectElement` ref and
 * any spread native attributes land, so `NativeSelect` is exported for callers
 * that need a raw native control on every viewport.
 *
 * Use SearchableSelect instead when the list is long or needs type-to-filter /
 * free-text entry; use Select for a handful of known options.
 */
import {
  forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { inputClasses, type InputSize } from './styles';
import { firstEnabledIndex, lastEnabledIndex, matchTypeahead, nextEnabledIndex } from './selectNav';
import { glassStyle } from '../utils/glass';
import { useIsMobile } from '../shell/useIsMobile';
import { registerModalEscapeInterceptor } from '../shell/escapeInterceptors';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'className' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  /**
   * Desktop rung, or `touch`. Defaults to `md`.
   *
   * On `Select` this sizes the DESKTOP branch only: the touch branch takes
   * `touchSize` instead and ignores this entirely. `NativeSelect` and
   * `ListboxSelect` are literal and use it on every viewport.
   *
   * This shadows the native `size` attribute (the number of rows a select
   * shows when it is rendered as a list box), which is omitted above rather
   * than left to collide. Nothing here has ever rendered as a list box — the
   * kit's Select is a dropdown — so no capability is lost.
   */
  size?: InputSize;
  /**
   * Rung for `Select`'s TOUCH branch. Defaults to `touch` (56px), which is the
   * point of the branch — see the Select doc-block.
   *
   * It exists because the default is not right for everyone and the previous
   * escape hatch was too expensive. `NativeSelect` sizes a select freely, but
   * it is a native `<select>` on the desktop too, which is BG#00421: the OS
   * popup swallows every key event, so shell hotkeys die while it is open.
   * That is the whole reason the desktop listbox exists, and no one should
   * have to give it up to render a 40px select on a phone.
   *
   * The case it is really for is a row of mixed controls. `Input`, `Textarea`,
   * `DatePicker`, `TimePicker`, `InputNumber` and `TagInput` all render the
   * rung they are given on every viewport, and `SearchableSelect` is pinned to
   * `INPUT_BASE` (the `md` rung) with no size axis at all — so a phone form
   * that puts a Select beside an unsized one of those now steps 56px against a
   * control a little over half that. Pass `touchSize="md"` on the Select to
   * line the row back up.
   *
   * Only `Select` reads it. `NativeSelect` and `ListboxSelect` accept it and
   * ignore it, so it never reaches the DOM as an unknown attribute.
   */
  touchSize?: InputSize;
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
 *
 * Literal about `size`: it renders the rung it is handed on every viewport,
 * which is what makes it the opt-out from `Select`'s branch entirely. Prefer
 * `Select`'s `touchSize` when you only want a different touch rung — this one
 * costs you the desktop listbox, and with it BG#00421.
 *
 * `touchSize` is pulled out and dropped: it is `Select`'s prop, and letting it
 * through `rest` would put an unknown attribute on the `<select>`.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectProps>(function NativeSelect(
  { value, onChange, options, placeholder, invalid, className = '', size, touchSize: _touchSize, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      className={inputClasses({ invalid, size, className: `pr-8 ${className}`.trim() })}
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
interface MenuPos { left: number; top?: number; bottom?: number; width: number; maxHeight: number }
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
      // The menu is the WIDTH of the field, not a minimum for it.
      //
      // It was `minWidth` with nothing capping the other end, so the list grew
      // to its longest option: in a 512px dialog, a field of 464px opened a
      // menu of 583px that hung 95px past the dialog's edge. A native <select>
      // matches its field and truncates what does not fit, and that is the
      // shape people read a select as having.
      //
      // Still clamped to the viewport, for the field that is itself near an
      // edge or wider than the room left beside it.
      const width = Math.min(rect.width, window.innerWidth - 2 * VIEWPORT_MARGIN);
      const next: MenuPos = { left, width, maxHeight };
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
  // `touchSize` is pulled out and dropped for the same reason as NativeSelect:
  // it is Select's prop, and `rest` lands on the hidden native <select>.
  { value, onChange, options, placeholder, invalid, className = '', id, disabled, size,
    touchSize: _touchSize,
    'aria-describedby': describedBy, 'aria-label': ariaLabel, 'aria-labelledby': labelledBy, ...rest },
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
        // These describe the CONTROL, and the control the user focuses is this
        // button — not the sr-only <select> behind it, which is where the
        // spread was putting them. An error message pointed at by a hidden
        // element is announced to nobody.
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={inputClasses({ invalid, size, className: `pr-8 text-left ${className}`.trim() })}
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
          className="fixed z-[10000] overflow-y-auto rounded-2xl py-1"
          style={{
            left: menuPos?.left,
            top: menuPos?.top,
            bottom: menuPos?.bottom,
            width: menuPos?.width,
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

/**
 * Smart Select: native `<select>` on touch, custom listbox on desktop.
 *
 * The touch branch takes `touchSize`, default `touch`, and DISCARDS whatever
 * desktop rung the caller asked for. That is not the component second-guessing
 * the caller — `sm`/`md`/`lg` are the desktop ladder, and this branch only ever
 * renders when there is no desktop. A rung off that ladder has nothing to say
 * about how big an OS picker should be under a finger.
 *
 * It had to be said out loud because the omission was a real defect: this
 * component already decided "this is touch, give it the native picker" and then
 * passed the desktop rung straight through, handing a finger a target under the
 * 44px WCAG 2.5.5 floor that `touchPrimitives.test.tsx` holds every Button rung
 * above. `size="lg"` was measured at 39px on a device; the default `md` is a
 * rung shorter again (`py-1.5 text-sm` against `py-2 text-base`, so 8px off the
 * box), which puts it around 31px. The dealer portal's order filters were
 * exactly that.
 *
 * Note this reads the same signal that already picks the branch
 * (`(max-width: 767px), (pointer: coarse)`), so a narrow desktop window has
 * been getting the native picker all along — it now gets a native picker at a
 * touch size rather than a desktop size, which is the smaller surprise of the
 * two.
 *
 * `Button`'s docblock says nothing picks a touch size automatically, and that
 * still holds: it is about a DESKTOP portal not growing finger-sized controls
 * by accident. This branch cannot run on a desktop pointer at a desktop width.
 *
 * ── Where this leaves a mixed row ───────────────────────────────────────────
 *
 * Select is, for now, the ONLY control in the kit that picks its own touch
 * rung. `Input`, `Textarea`, `DatePicker`, `TimePicker`, `DateTimePicker`,
 * `InputNumber` and `TagInput` all render what they are given on every
 * viewport, and `SearchableSelect` has no size axis at all — it is pinned to
 * `INPUT_BASE`. So a phone form that stacks a Select against an unsized one of
 * those steps 56px against a control a little over half that, and a field that
 * renders a Select or an Input depending on its data (a country with states
 * versus one without, say) changes height with the data.
 *
 * That is a real cost and it is not paid off here: whether the whole ladder
 * should follow a finger is a bigger question than one control's hit target,
 * and answering it in `inputClasses` would move every text field in every
 * consumer. `touchSize="md"` is the seam until it is answered — it lines a
 * Select back up with its neighbours without giving up the desktop listbox.
 *
 * `NativeSelect` remains the way out of the branch ENTIRELY, for a caller who
 * wants one raw native control on every viewport. It is the heavier door:
 * native on the desktop is BG#00421, the OS popup that swallows every key
 * event. Reach for `touchSize` first.
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { touchSize = 'touch', ...props },
  ref,
) {
  const isMobile = useIsMobile();
  // `touchSize` is destructured off on BOTH branches, so the desktop listbox
  // never sees it either — it would otherwise ride `rest` onto the hidden
  // native <select>.
  return isMobile
    ? <NativeSelect ref={ref} {...props} size={touchSize} />
    : <ListboxSelect ref={ref} {...props} />;
});

export default Select;
