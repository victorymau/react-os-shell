/**
 * Tooltip — a frosted hover/focus bubble around its trigger, using the shared
 * glassStyle() so it matches the kit's menus and follows dark mode. Static
 * previews show only the trigger (the bubble appears on interaction), like
 * ShortcutHelp.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { glassStyle } from '../utils/glass';

export interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Hover delay before showing, in ms. */
  delay?: number;
  children: ReactNode;
}

const SIDE_POS: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

export default function Tooltip({ content, side = 'top', delay = 200, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  const open = () => { timer.current = window.setTimeout(() => setShow(true), delay); };
  const close = () => { window.clearTimeout(timer.current); setShow(false); };
  // Cancel a pending open if the trigger unmounts mid-delay.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span
      className="relative inline-flex"
      aria-describedby={show ? id : undefined}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {show && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute z-[300] whitespace-nowrap rounded-md px-2 py-1 text-xs text-gray-800 ${SIDE_POS[side]}`}
          style={glassStyle()}
        >
          {content}
        </span>
      )}
    </span>
  );
}
