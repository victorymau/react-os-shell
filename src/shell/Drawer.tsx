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
  /**
   * Names the drawer when it carries no visible `title`. A dialog without an
   * accessible name is announced as just "dialog", which tells a screen reader
   * user nothing about what opened — and a navigation drawer, whose content is
   * its own heading, is exactly the case that has no title to point at.
   *
   * Ignored when `title` is set: a visible label always wins over a parallel
   * invisible one, or the two drift.
   */
  'aria-label'?: string;
  className?: string;
}

// Px, applied inline. `w-[28rem]` is an arbitrary value and produces no style
// in the compiled stylesheet the design-sync previews use — the same reason
// Avatar and Skeleton size themselves this way.
const SIZE_PX: Record<DrawerSize, number> = { sm: 320, md: 448, lg: 640 };

const SIDE_POSITION: Record<DrawerSide, string> = {
  right: 'inset-y-0 right-0',
  left: 'inset-y-0 left-0',
  bottom: 'inset-x-0 bottom-0',
};

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l8 8M14 6l-8 8" />
      </svg>
    </button>
  );
}

export default function Drawer({
  open, onClose, side = 'right', size = 'md', title, footer, children,
  blocking = false, initialFocus, 'aria-label': ariaLabel, className = '',
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const titleId = useId();

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
  const panelStyle = isBottom
    ? { maxHeight: '85vh' }
    : { width: SIZE_PX[size], maxWidth: '100vw' };

  return (
    <div className="fixed inset-0 z-[9999]" role="presentation">
      <div className="fixed inset-0 bg-black/30" onClick={blocking ? undefined : onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        // Points at the rendered heading rather than re-deriving the name from
        // the prop: `title` is a ReactNode, so an element title — an icon beside
        // a word, a count in a badge — used to fall through the string check and
        // leave the drawer with no name at all.
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        // Same reasoning as Dialog: the body is the description, and a screen
        // reader only reads it on open if the panel says so.
        aria-describedby={children ? bodyId : undefined}
        style={panelStyle}
        className={[
          'fixed flex flex-col bg-white shadow-xl',
          SIDE_POSITION[side],
          isBottom ? 'rounded-t-xl' : '',
          className,
        ].filter(Boolean).join(' ')}
      >
        {/* With a title the close button shares a header row with it. WITHOUT
            one there is nothing to put in that row, and reserving it anyway
            costs a bordered 48px strip of nothing at the top of the panel —
            visible on a phone, where a navigation drawer has no title bar by
            design and its own content is the heading. So the button floats
            over the body instead. */}
        {title ? (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-4 py-3">
            <h2 id={titleId} className="text-base font-semibold text-gray-900">{title}</h2>
            {!blocking && <CloseButton onClose={onClose} />}
          </div>
        ) : (
          !blocking && (
            <div className="absolute right-2 top-2 z-10">
              <CloseButton onClose={onClose} />
            </div>
          )
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
