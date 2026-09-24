import { useEffect, useLayoutEffect } from 'react';
import { dismissPopups } from './overlayEvents';

/**
 * A layout effect in the browser, a passive one on a server — where a layout
 * effect never runs anyway and React 18 warns for calling one.
 */
const useBrowserLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * For an overlay: close every open popup as `open` turns true.
 *
 * A LAYOUT effect, not a passive one, so the popups close in the same frame the
 * overlay first paints. A state update made from a passive effect is scheduled
 * as a later task, and the browser lane caught the gap: the palette was on
 * screen with the list still open over it, for a frame or more, one run in
 * three.
 *
 * It runs before any popup inside the overlay can have subscribed — those
 * subscribe from a passive effect, and only once open — so the overlay never
 * dismisses its own content (see `overlayEvents.ts`).
 */
export function useDismissPopupsOnOpen(open: boolean): void {
  useBrowserLayoutEffect(() => {
    if (open) dismissPopups();
  }, [open]);
}
