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
      <div
        className="fixed inset-0 bg-black/30"
        onClick={blocking ? undefined : onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
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
          {title && <h2 id={titleId} className="text-base font-semibold text-gray-900">{title}</h2>}
          {children && <div id={bodyId} className="mt-2 text-sm text-gray-600">{children}</div>}
          {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
