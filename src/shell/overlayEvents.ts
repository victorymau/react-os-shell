/**
 * The overlay-open seam — deliberately a leaf that imports NOTHING, for the same
 * reason as `escapeInterceptors.ts`: every popup in `react-os-shell/ui` reaches
 * it, so any edge added here lands in every consumer's bundle.
 *
 * ── Why popups need telling ──
 * A popup (a listbox, a calendar, a context menu) is portalled to `<body>` and
 * layered above the modal layer, so it can escape the window or dialog that
 * owns it. It closes on an outside pointer-down, on its own keys, and on a
 * pick. None of those happen when a keyboard shortcut opens a full-screen
 * overlay: ⌘K raised the search palette over an open `SearchableSelect`, and
 * the list stayed open, painted crisp ABOVE the palette's blurred backdrop.
 * Raising the palette cannot fix that — a popup opened INSIDE the palette or a
 * dialog must still paint above it, so the popup layer has to stay on top.
 *
 * So an overlay announces itself as it opens, and every open popup closes.
 * An overlay dispatches BEFORE its own content subscribes (a popup subscribes
 * only while open, in a passive effect), so a popup inside the overlay being
 * opened is never the one dismissed.
 *
 * Consumers with an overlay of their own call `dismissPopups()` when it opens;
 * consumers with a popup of their own listen for `OVERLAY_OPEN_EVENT` on
 * `window`.
 */

/** Dispatched on `window` when a full-screen overlay (the search palette, a
 *  `Dialog`, a `Drawer`, the shortcut sheet) opens. Open popups close on it. */
export const OVERLAY_OPEN_EVENT = 'react-os-shell:overlay-open';

/** Close every open popup — call it as an overlay opens. A no-op on a server. */
export function dismissPopups(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OVERLAY_OPEN_EVENT));
}

/** Subscribe to `OVERLAY_OPEN_EVENT`; returns the unsubscribe. Internal to the
 *  kit's popups, which call it from the effect that runs while they are open. */
export function onOverlayOpen(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(OVERLAY_OPEN_EVENT, handler);
  return () => window.removeEventListener(OVERLAY_OPEN_EVENT, handler);
}
