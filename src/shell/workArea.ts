/**
 * Work-area geometry — the rectangle a maximized window occupies.
 *
 * Layout owns the chrome (taskbar, sidebar strip) and publishes its sizes as
 * CSS custom properties on <html>; everything here derives from those, so the
 * maths has a single input and no React dependency. Modal reads them live
 * rather than through context, which is what lets an open window react to a
 * preference change without remounting.
 */

/** Width of the persistent left strip that sidebar layout mode reserves. */
export const SIDEBAR_STRIP_W = 280;

export interface Box { x: number; y: number; w: number; h: number }

/** The viewport minus the taskbar, and minus the sidebar strip when one is reserved. */
export function computeMaximizedBox(): Box {
  const cs = getComputedStyle(document.documentElement);
  const taskbarH = parseInt(cs.getPropertyValue('--taskbar-height')) || 0;
  const taskbarW = parseInt(cs.getPropertyValue('--taskbar-width')) || 0;
  const tbPos = cs.getPropertyValue('--taskbar-position')?.trim() || 'bottom';
  const sidebarW = parseInt(cs.getPropertyValue('--sidebar-width')) || 0;
  return {
    x: (tbPos === 'left' ? taskbarW : 0) + sidebarW,
    y: tbPos === 'top' ? taskbarH : 0,
    w: window.innerWidth - (tbPos === 'left' || tbPos === 'right' ? taskbarW : 0) - sidebarW,
    h: window.innerHeight - (tbPos === 'top' || tbPos === 'bottom' ? taskbarH : 0),
  };
}

/**
 * Is this saved box really "the whole work area" — i.e. was it saved by a
 * maximized window rather than chosen by the user?
 *
 * Both axes must fill, which is what separates a maximized box from the
 * dangerous near-misses: a half-screen snap fills the height only, a short
 * full-width window fills the width only. The tolerance absorbs sub-pixel
 * rects and browser zoom, where an exact match would miss the real boxes.
 *
 * Widths are matched against the work area both with and without the sidebar
 * strip, because a box saved in sidebar mode has to be recognised from classic
 * mode — and vice versa, since the caller may run either side of Layout
 * releasing the strip.
 */
export function boxFillsWorkArea(box: Box, workArea: Box, sidebarReserved: boolean): boolean {
  const TOL = 4;
  const otherW = sidebarReserved ? workArea.w + SIDEBAR_STRIP_W : workArea.w - SIDEBAR_STRIP_W;
  const fillsWidth = Math.abs(box.w - workArea.w) <= TOL || Math.abs(box.w - otherW) <= TOL;
  return Math.abs(box.h - workArea.h) <= TOL && fillsWidth;
}

/** Whether sidebar layout mode currently reserves its left strip. */
export function isSidebarStripReserved(): boolean {
  return (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 0) > 0;
}

/**
 * Sidebar layout mode locks every non-widget window to the maximized box.
 * Published by Layout as `--layout-mode` on <html>.
 */
export function readAlwaysMaximizedFlag(): boolean {
  if (typeof document === 'undefined') return false;
  return getComputedStyle(document.documentElement).getPropertyValue('--layout-mode')?.trim() === 'sidebar';
}
