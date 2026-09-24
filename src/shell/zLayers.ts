/**
 * The shell's z-index scale — one map instead of literals scattered across the
 * components that stack against each other. A leaf that imports nothing, like
 * `escapeInterceptors.ts`, because the kit's popups read it.
 *
 * The numbers are the ones those components already used; collecting them
 * changed the order of exactly one thing, the ⌘K search palette. It sat at 200,
 * which is below the window stack once a dozen windows are open
 * (`window + index * windowStep`), below every pinned window, and below every
 * dialog — so it now sits on the overlay layer with `Dialog` and `Drawer`, and
 * is portalled to `<body>` so no window's stacking context can hold it down.
 *
 * Applied as inline `zIndex`, never as a Tailwind `z-[…]` class built from
 * these numbers: an interpolated class name is invisible to the consumer's
 * Tailwind scan and would generate no rule at all.
 *
 * Bottom to top:
 *
 *   window        50   base of the window stack; each window above adds
 *   windowStep    10   (`Modal`'s activation order)
 *   menu         400   context menus and flyouts that stay in their layer
 *                      (`PopupMenu`)
 *   pinnedWindow 999   an always-on-top window
 *   overlay     9999   full-screen surfaces that interrupt: the search palette,
 *                      `Dialog`, `Drawer`, the shortcut sheet
 *   popup      10000   portalled popups (listboxes, calendars, the server
 *                      status card) — above the overlay layer, so one opened
 *                      from inside a dialog or the palette is not drawn behind
 *                      it. Popups close when an overlay opens (`overlayEvents`),
 *                      which is what stops one from floating over an overlay
 *                      that was opened on top of it.
 */
export const Z_LAYERS = {
  window: 50,
  windowStep: 10,
  menu: 400,
  pinnedWindow: 999,
  overlay: 9999,
  popup: 10000,
} as const;

export type ZLayer = keyof typeof Z_LAYERS;
