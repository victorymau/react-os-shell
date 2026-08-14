/**
 * Drawer — a panel that slides in from an edge, over the page.
 *
 * The same modal contract as `Dialog` — focus trapped, page behind locked,
 * Escape claimed through the shell's interceptor — with a different shape. Use
 * a Drawer when the content is a LIST or a long form that wants height, and a
 * Dialog when it is a question that wants to be answered and dismissed. A
 * drawer holding one sentence and two buttons is a dialog wearing the wrong
 * clothes; a dialog holding twenty fields is a scroll trap.
 *
 * Imports nothing but React and its two sibling modules, so it belongs to
 * `react-os-shell/ui` alongside `Dialog`.
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { useFocusTrap, useScrollLock } from './focusTrap';
import { registerModalEscapeInterceptor } from './escapeInterceptors';

export type DrawerSide = 'right' | 'left' | 'bottom';
export type DrawerSize = 'sm' | 'md' | 'lg';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  size?: DrawerSize;
  title?: ReactNode;
  /** Action row pinned to the bottom edge, outside the scrolling body. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Escape and the scrim do nothing. See Dialog's note before reaching for it. */
  blocking?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

// Px, applied inline. `w-[28rem]` is an arbitrary value and produces no style
// in the compiled stylesheet the design-sync previews use — the same reason
// Avatar and Skeleton size themselves this way.
const SIZE_PX: Record<DrawerSize, number> = { sm: 320, md: 448, lg: 640 };

/**
 * The same widths as classes, written out rather than interpolated: Tailwind
 * emits a utility only when it has SEEN the literal string in a scanned file,
 * so `sm:w-[${n}px]` produces no rule at all and every drawer would silently
 * stay full width.
 */
const SIZE_CLASS: Record<DrawerSize, string> = {
  sm: 'sm:w-[320px]',
  md: 'sm:w-[448px]',
  lg: 'sm:w-[640px]',
};

const SIDE_POSITION: Record<DrawerSide, string> = {
  right: 'inset-y-0 right-0',
  left: 'inset-y-0 left-0',
  bottom: 'inset-x-0 bottom-0',
};

export default function Drawer({
  open, onClose, side = 'right', size = 'md', title, footer, children,
  blocking = false, initialFocus, className = '',
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();

  useFocusTrap(panelRef, open, initialFocus);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    return registerModalEscapeInterceptor(() => {
      if (blocking) return true;
      onClose();
      return true;
    });
  }, [open, blocking, onClose]);

  if (!open) return null;

  const isBottom = side === 'bottom';
  // A side drawer's width is a CLASS, not an inline style: an inline width
  // beats every `sm:` variant, so the responsive step could never take.
  const panelStyle = isBottom ? { maxHeight: '85vh' } : undefined;

  return (
    <div className="fixed inset-0 z-[9999]" role="presentation">
      <div className="fixed inset-0 bg-black/30" onClick={blocking ? undefined : onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        // Same reasoning as Dialog: the body is the description, and a screen
        // reader only reads it on open if the panel says so.
        aria-describedby={children ? bodyId : undefined}
        style={panelStyle}
        className={[
          'fixed flex flex-col bg-white shadow-xl',
          // Full width on a phone, the asked-for width from `sm` up. A 320px
          // drawer on a 375px screen leaves a 55px strip of scrim: too narrow
          // to aim at, too wide to read as an edge, and it makes the panel look
          // like a desktop rail that was squeezed rather than a sheet built for
          // the screen it is on.
          isBottom ? '' : `w-full max-w-full ${SIZE_CLASS[size]}`,
          SIDE_POSITION[side],
          isBottom ? 'rounded-t-xl' : '',
          className,
        ].filter(Boolean).join(' ')}
      >
        {(title || !blocking) && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-4 py-3">
            {title ? <h2 className="text-base font-semibold text-gray-900">{title}</h2> : <span />}
            {!blocking && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l8 8M14 6l-8 8" />
                </svg>
              </button>
            )}
          </div>
        )}
        {/* Only the body scrolls, so the header and actions stay reachable in a
            long form — the thing a drawer is usually chosen for. */}
        <div id={bodyId} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
