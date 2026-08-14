/**
 * TagInput — SearchableSelect's multi-value sibling. The field holds the
 * chosen values as removable chips with an inline text input after them;
 * typing filters the option list in the same portaled frosted dropdown, and
 * picking an option appends it. Assigning several categories, roles or
 * suppliers to a record is this shape, and each portal was one bad afternoon
 * away from hand-rolling it.
 *
 * Deliberate contracts, all matching SearchableSelect where the two overlap:
 *  - Controlled: `value` is the array, `onChange` gets the whole next array.
 *  - Values already chosen leave the option list; adding a value twice is a
 *    no-op, so the array is always duplicate-free.
 *  - `allowFreeText` commits the typed text on Enter / comma / Tab / outside
 *    click. Off by default: only listed options can be picked.
 *  - Backspace in an empty input removes the last chip — the convention every
 *    tag field trains, and the keyboard path to removal.
 *  - Picking from the list keeps the dropdown open (multi-add is the entire
 *    point); Escape and outside clicks close it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { glassStyle } from '../utils/glass';
import { inputClasses } from './styles';
import { MENU_MAX_HEIGHT, POPUP_MAX_WIDTH, useDropdownPosition } from './dropdownPosition';

export interface TagInputOption {
  value: string;
  label: string;
}

export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  /** The pickable list. Omit it for a pure free-text tag field (with
   *  `allowFreeText`), where the dropdown never renders. */
  options?: TagInputOption[];
  placeholder?: string;
  /** When true, Enter / comma / Tab / clicking away commits the typed text as
   *  a tag of its own. Default false: only listed options can be picked. */
  allowFreeText?: boolean;
  /** Error state — red border + ring, matching Input. */
  invalid?: boolean;
  disabled?: boolean;
  /** Optional id for label-for wiring, applied to the inner text input. */
  id?: string;
  className?: string;
}

export default function TagInput({
  value, onChange, options = [], placeholder, allowFreeText = false,
  invalid, disabled, id, className = '',
}: TagInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPos = useDropdownPosition(wrapRef, open);

  const labelFor = (v: string) => options.find(o => o.value === v)?.label ?? v;

  // Chosen values leave the list; the remainder filters on the typed text.
  // Dedupe by value first for the same reason SearchableSelect does — a list
  // fed twice must not become duplicate React keys.
  const available = useMemo(() => {
    const seen = new Set<string>(value);
    const out: TagInputOption[] = [];
    const q = search.trim().toLowerCase();
    for (const o of options) {
      if (seen.has(o.value)) continue;
      seen.add(o.value);
      if (!q || o.label.toLowerCase().includes(q)) out.push(o);
    }
    return out;
  }, [options, value, search]);

  const add = (v: string) => {
    if (!v || value.includes(v)) { setSearch(''); return; }
    onChange([...value, v]);
    setSearch('');
  };
  const remove = (v: string) => onChange(value.filter(x => x !== v));
  const commitFreeText = () => {
    const t = search.trim();
    if (allowFreeText && t) add(t);
    else setSearch('');
  };

  // Close on outside pointer-down — the menu is portaled, so "inside" means
  // the field wrap OR the menu (see SearchableSelect).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      commitFreeText();
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  });

  const hasMenu = options.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      {/* The field is the chips plus an inline input, wearing the shared form
        * styling. The focus ring is focus-within — the div itself never takes
        * focus, the inner input does (a click anywhere in the field lands it
        * there). */}
      <div
        onMouseDown={e => {
          if (disabled) return;
          // Let clicks on chip-remove buttons do their job; anything else
          // focuses the input, like clicking anywhere in a real text field.
          if ((e.target as HTMLElement).closest('button')) return;
          e.preventDefault();
          inputRef.current?.focus();
        }}
        className={inputClasses({
          invalid,
          className: `flex flex-wrap items-center gap-1 cursor-text focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/30 ${disabled ? 'bg-gray-50 cursor-not-allowed' : ''} ${className}`,
        })}
      >
        {value.map(v => (
          <span key={v} className="inline-flex max-w-full items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            <span className="truncate">{labelFor(v)}</span>
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${labelFor(v)}`}
                onClick={() => remove(v)}
                className="text-blue-400 hover:text-red-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded leading-none"
              >
                &times;
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && hasMenu}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={search}
          placeholder={value.length === 0 ? placeholder : undefined}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => { if (!disabled && hasMenu) setOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || (e.key === ',' && allowFreeText)) {
              e.preventDefault();
              const q = search.trim();
              const matches = q ? available.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : [];
              if (matches.length === 1) add(matches[0].value);
              else commitFreeText();
            } else if (e.key === 'Backspace' && search === '' && value.length > 0) {
              remove(value[value.length - 1]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              setSearch('');
              inputRef.current?.blur();
            } else if (e.key === 'Tab') {
              // No preventDefault — Tab advances focus; commit like the
              // outside-click path so the two agree (see SearchableSelect).
              commitFreeText();
              setOpen(false);
            }
          }}
          className="min-w-[8ch] flex-1 border-none bg-transparent p-0 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
        />
      </div>
      {open && hasMenu && createPortal(
        <div
          ref={menuRef}
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
          className="fixed z-[10000] rounded-2xl overflow-hidden"
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
            {available.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 text-center">
                {options.length > 0 && value.length >= options.length ? 'All options selected' : 'No matches'}
              </p>
            ) : (
              available.map(o => (
                <button
                  key={o.value}
                  type="button"
                  // mousedown, not click: the field's own mousedown refocuses
                  // the input, and by click time a re-render may have moved
                  // this row. Same choice as SearchableSelect's options.
                  onMouseDown={e => { e.preventDefault(); add(o.value); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-700 whitespace-nowrap"
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
