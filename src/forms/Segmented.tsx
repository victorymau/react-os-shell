/**
 * Segmented — a row of mutually exclusive options, all visible at once.
 *
 * It covers two things that look identical and behave differently, and the
 * difference is `name`:
 *
 *   without `name` — a button group. A view toggle, a filter. The choice is a
 *                    UI mode, not data, and nothing submits it.
 *   with `name`    — real `<input type="radio">` elements in a `radiogroup`.
 *                    Use this inside a form: it submits, it restores on back,
 *                    a password manager and a screen reader both understand it,
 *                    and arrow keys move between options the way a radio group
 *                    is expected to.
 *
 * Shipping one component rather than two is deliberate — the pair are visually
 * identical, and having two of them is how a form ends up with a button group
 * in it that submits nothing.
 */
import { useId, type ReactNode } from 'react';

export type SegmentedSize = 'sm' | 'md' | 'touch';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Present as a real radio group under this field name. See the docstring. */
  name?: string;
  size?: SegmentedSize;
  /** Stretch to fill the container, each option an equal share. */
  block?: boolean;
  /** Accessible name for the group. */
  label?: string;
  className?: string;
}

const SIZE: Record<SegmentedSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
  touch: 'h-14 px-5 text-base',
};

const SELECTED = 'bg-white text-gray-900 shadow-sm';
const UNSELECTED = 'text-gray-500 hover:text-gray-700';

export default function Segmented<T extends string = string>({
  value, onChange, options, name, size = 'md', block = false, label, className = '',
}: SegmentedProps<T>) {
  const groupId = useId();
  // `max-w-full` + a scrolling track, and items that never wrap. Without both,
  // a two-word option on a phone broke the control visibly: the label wrapped
  // to a second line while the pill kept its fixed `h-9`, so the selected
  // segment was shorter than its own text and the track sat crooked around it.
  // Scrolling is the right failure for a segmented control — the alternative,
  // letting it grow, pushes whatever is beside it off the screen.
  // The scrollbar is hidden, not the overflow: a segmented control with a
  // scrollbar under it reads as broken, and the track rounds to a pixel or two
  // wider than its content often enough that one appears when nothing is
  // actually clipped. Scrolling still works by touch and by wheel.
  const track = `inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${block ? 'w-full' : ''} ${className}`.trim();
  const itemBase = `inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors ${block ? 'flex-1' : ''}`;

  if (name) {
    return (
      <div role="radiogroup" aria-label={label} className={track}>
        {options.map(opt => {
          const id = `${groupId}-${opt.value}`;
          const on = opt.value === value;
          return (
            // The input is visually hidden rather than removed: it stays in the
            // tab order and keeps the label association, so the control behaves
            // like the radio group it actually is.
            <label
              key={opt.value}
              htmlFor={id}
              className={[
                itemBase, SIZE[size], on ? SELECTED : UNSELECTED,
                opt.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
              ].join(' ')}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={opt.value}
                checked={on}
                disabled={opt.disabled}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              {opt.icon}
              {opt.label}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div role="group" aria-label={label} className={track}>
      {options.map(opt => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={[itemBase, SIZE[size], on ? SELECTED : UNSELECTED, 'disabled:cursor-not-allowed disabled:opacity-40'].join(' ')}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
