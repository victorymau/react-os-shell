/**
 * Module-level mobile-shell state — mirrors the activationOrder pattern in
 * Modal.tsx so any component (including Modal, which portals outside the
 * React tree) can read/write the current mode without prop drilling.
 *
 *   home     — full-screen home grid is shown
 *   switcher — Chrome-tab-style snapshot grid of open apps
 *   app      — current modal renders fullscreen; only the bottom nav overlays it
 */

export type MobileMode = 'home' | 'switcher' | 'app';

let _mode: MobileMode = 'home';
const listeners = new Set<() => void>();

export function getMobileMode(): MobileMode {
  return _mode;
}

export function setMobileMode(mode: MobileMode): void {
  if (_mode === mode) return;
  _mode = mode;
  listeners.forEach(fn => fn());
}

export function subscribeMobileMode(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
