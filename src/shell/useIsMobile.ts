/**
 * Mobile breakpoint hook — single source of truth for "is this a phone/tablet
 * portrait viewport?" Drives whether <Layout> renders the desktop chrome
 * (windows / taskbar / start menu sidebar) or <MobileShell> (home / fullscreen
 * apps / bottom-nav switcher).
 *
 * Locked at 768 px so iPad portrait gets the mobile shell. Also OR's with
 * `pointer: coarse` so touch-only devices that happen to be wider (e.g. an
 * Android tablet in landscape) still get touch-appropriate UI.
 */
import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px), (pointer: coarse)';

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  // Older Safari uses addListener; modern browsers use addEventListener.
  if (mql.addEventListener) {
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  }
  mql.addListener(cb);
  return () => mql.removeListener(cb);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
