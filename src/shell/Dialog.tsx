/**
 * Dialog — a modal sheet that is NOT a shell window.
 *
 * The distinction matters. `Modal` is a window: it has a title bar, it can be
 * minimised, dragged, stacked and restored, and it lives in the window manager's
 * activation order. This is the other thing — an overlay that interrupts, is
 * answered, and goes away. A till has no desktop to put a window on, and a
 * routed portal page has no window manager either, so both need this one.
 *
 * It imports nothing but React, which is the point: it is what lets
 * `ConfirmDialog` — and every consumer of `react-os-shell/ui` — stop depending
 * on Headless UI and Heroicons. Focus containment and scroll locking come from
 * `./focusTrap` rather than a library.
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { useFocusTrap, useScrollLock } from './focusTrap';
import { registerModalEscapeInterceptor } from './escapeInterceptors';

export type DialogSize = 'sm' | 'md' | 'lg';

export interface DialogProps {
  open: boolean;
  /** Called for Escape, a backdrop click, and the close control. */
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  /** Action row, right-aligned below the body. */
  footer?: ReactNode;
  /**
   * Escape and backdrop clicks do nothing — the only way out is an action in
   * the footer. For a state the user must actually resolve rather than dismiss,
   * such as a sale whose outcome is unknown. Use it sparingly: a dialog that
   * cannot be dismissed is a dead end if its actions ever fail to render.
   */
  blocking?: boolean;
  size?: DialogSize;
  /**
   * Element to focus on open. Defaults to the first focusable thing in the
   * dialog — which for a destructive confirm should be Cancel, not the button
   * that does the irreversible thing.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * Names the dialog when it carries no visible `title`. Without a name it is
   * announced as just "dialog", which tells a screen reader user nothing about
   * what opened. Ignored when `title` is set — a visible label always wins over
   * a parallel invisible one, or the two drift.
   */
  'aria-label'?: string;
  className?: string;
}

const SIZES: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function Dialog({
  open, onClose, title, children, footer, blocking = false, size = 'md', initialFocus,
  'aria-label': ariaLabel, className = '',
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  // One source of truth for the close control: the button and the title's
  // gutter are the same decision, and computing it twice is how they drift.
  const showClose = !blocking && !footer;
  const titleId = useId();

  useFocusTrap(panelRef, open, initialFocus);
  useScrollLock(open);

  // Escape goes through the shell's interceptor rather than a local listener.
  // A dialog floats above every shell window but is absent from the window
  // activation order, so an unclaimed Escape reaches the frontmost Modal and
  // closes the WINDOW BEHIND the dialog. Claiming it here means the dialog
  // closes and the window does not. With no shell present nothing else is
  // listening and this is simply where Escape is handled.
  useEffect(() => {
    if (!open) return;
    return registerModalEscapeInterceptor(() => {
      if (blocking) return true;  // claimed, but deliberately does nothing
      onClose();
      return true;
    });
  }, [open, blocking, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]" role="presentation">
      {/* No handler here. The dismissal layer below is also `fixed inset-0`
          and sits on top of this, so a click in this region never reaches the
          scrim — an onClick here would be unreachable in every case, and two
          dismissal paths where only one can fire is how the next reader loses
          an afternoon. */}
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      {/* The scrim above covers the viewport, and so does this — which sits on
          top of it. A click "outside the dialog" therefore landed HERE and
          never reached the scrim's handler, so clicking away never dismissed
          anything and a dialog with no buttons could only be left with Escape.
          The dismissal lives on this layer as well, gated on the target being
          the layer itself so a click inside the panel does not bubble into it. */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        onClick={blocking ? undefined : (e => { if (e.target === e.currentTarget) onClose(); })}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          // Points at the rendered heading rather than re-deriving the name
          // from the prop: `title` is a ReactNode, so an element title — an
          // icon beside a word, a count in a badge — used to fall through the
          // string check and leave the dialog with no name at all.
          aria-labelledby={title ? titleId : undefined}
          aria-label={title ? undefined : ariaLabel}
          // The body is the dialog's description, and saying so is what makes a
          // screen reader read the question along with the title when focus
          // lands here. Without it the user hears "Cancel order, dialog" and
          // has to go looking for what cancelling actually does.
          aria-describedby={children ? bodyId : undefined}
          className={`relative w-full ${SIZES[size]} rounded-lg bg-white p-6 shadow-xl ${className}`.trim()}
        >
          {/* `id` for the accessible name, and a right gutter ONLY when the
              close button is actually there to need it — a dialog with a
              footer draws no cross, and reserving 2rem beside its title just
              indents the heading away from the edge for nothing. */}
          {title && (
            <h2 id={titleId} className={`${showClose ? 'pr-8 ' : ''}text-base font-semibold text-gray-900`}>
              {title}
            </h2>
          )}
          {children && <div id={bodyId} className="mt-2 text-sm text-gray-600">{children}</div>}
          {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
          {/* A way out that is visible, for a dialog that offers none of its
              own. Escape and the backdrop both work, but neither is on screen,
              so a dialog whose body is just an image could be left only by a
              keyboard shortcut nothing announces.

              NOT when there is a footer. A confirm already offers two labelled
              choices, and an unlabelled cross beside "Discard" and "Keep
              Editing" is a third exit that says nothing about which one it
              means — worse on the decision where it matters most. It also put
              a stop in the middle of that dialog's Tab cycle, which is the
              thing the browser test guards.

              LAST in the DOM though drawn top-right: first, it became the
              dialog's first tab stop and the first button a focus trap finds. */}
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l8 8M14 6l-8 8" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
