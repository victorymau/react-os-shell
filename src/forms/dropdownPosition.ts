/**
 * Fixed-viewport dropdown positioning, shared by the combobox-style form
 * controls (SearchableSelect, TagInput). Promoted out of SearchableSelect
 * verbatim when TagInput needed the identical logic — the flip/track/clamp
 * behaviour is the kind of thing that drifts when copied.
 */
import { useLayoutEffect, useState, type RefObject } from 'react';

/** `max-w-[28rem]` on the menu, as a number for the fit math. */
export const POPUP_MAX_WIDTH = 448;
/** Menu's own max height (former `max-h-60` = 15rem). Capped smaller when the
 *  viewport is tight. */
export const MENU_MAX_HEIGHT = 240;
/** Gap between the trigger and the menu, and the viewport safety margin. */
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

export interface MenuPos {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  minWidth: number;
  maxHeight: number;
}

/**
 * Compute the menu's fixed-viewport position from the trigger rect while the
 * dropdown is open, re-running on scroll (capture, so nested form-scroll
 * containers count), resize, and every animation frame the trigger moves so it
 * tracks a moving trigger. Anchors below the trigger by default, flips above
 * when below is cramped and above has more room, and flips to right-aligned
 * when the max width wouldn't fit to the right of the trigger's left edge.
 */
export function useDropdownPosition(triggerRef: RefObject<HTMLElement | null>, open: boolean): MenuPos | null {
  const [pos, setPos] = useState<MenuPos | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    // Remember the last trigger rect the rAF poll acted on, so the idle loop
    // recomputes only when the trigger has actually moved.
    let lastLeft = NaN, lastTop = NaN, lastRight = NaN, lastBottom = NaN;
    const compute = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      lastLeft = rect.left; lastTop = rect.top; lastRight = rect.right; lastBottom = rect.bottom;
      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
      const placeAbove = spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(MENU_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow));
      const next: MenuPos = { minWidth: rect.width, maxHeight };
      if (window.innerWidth - rect.left < POPUP_MAX_WIDTH) {
        next.right = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right);
      } else {
        next.left = Math.max(VIEWPORT_MARGIN, rect.left);
      }
      if (placeAbove) next.bottom = window.innerHeight - rect.top + MENU_GAP;
      else next.top = rect.bottom + MENU_GAP;
      setPos(next);
    };
    compute();
    // Dragging a shell window moves the trigger via a CSS transform on an
    // ancestor — that fires neither scroll nor resize, so the listeners below
    // never see it and the menu would hang at its open-time spot while the
    // window slides out from under it. Poll the trigger rect each animation
    // frame and recompute when it shifts, so the menu tracks the window
    // through a drag (and any other transform-/animation-driven move). The
    // rect dirty-check keeps the idle loop cheap when nothing is moving.
    let raf = requestAnimationFrame(function tick() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect && (rect.left !== lastLeft || rect.top !== lastTop || rect.right !== lastRight || rect.bottom !== lastBottom)) {
        compute();
      }
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
