import type { CSSProperties } from 'react';

/** Read the system menu opacity from CSS custom property set by Layout */
function getMenuOpacity(): number {
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--menu-opacity')?.trim();
    if (val) return parseFloat(val);
  } catch {}
  return 0.95;
}

function isDarkTheme(): boolean {
  try {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  } catch {
    return false;
  }
}

/** Whether the "Reduce transparency" preference is active (root class set by
 *  Layout). When on, glass surfaces render solid + blur-free — the blur is the
 *  GPU-expensive part, and dropping it is the point of the setting. */
function reduceTransparency(): boolean {
  try {
    return document.documentElement.classList.contains('rosh-reduce-transparency');
  } catch {
    return false;
  }
}

/** Frosted glass style — shared across all menus, popups, and glass UI elements.
 * Reads --menu-opacity CSS variable set by the theme system, and adapts the
 * base tint to dark mode so menus don't stay light-cream when text is light. */
export function glassStyle(opacity?: number): CSSProperties {
  const o = opacity ?? getMenuOpacity();
  if (reduceTransparency()) {
    // Reduce-transparency: a fully opaque, blur-free surface. No
    // backdrop-filter (the expensive part on low-end GPUs) and a solid
    // background so menus/popups stay legible over any wallpaper. The global
    // stylesheet rule also strips backdrop-filter, but returning a solid
    // background here is what keeps the surface from reading as washed-out
    // translucent glass with the blur gone.
    return isDarkTheme()
      ? {
          background: '#1e1e2e',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }
      : {
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.12)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        };
  }
  if (isDarkTheme()) {
    // Dark frosted glass — Catppuccin-aligned base (#1e1e2e / 30,30,46) with
    // a subtle gradient and lighter inner highlight.
    return {
      background: `linear-gradient(135deg, rgba(30,30,46,${o * 0.85}) 0%, rgba(24,24,37,${o * 0.75}) 50%, rgba(30,30,46,${o * 0.85}) 100%)`,
      backdropFilter: 'blur(40px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
    };
  }
  return {
    background: `linear-gradient(135deg, rgba(255,255,255,${o * 0.85}) 0%, rgba(255,255,255,${o * 0.65}) 50%, rgba(255,255,255,${o * 0.75}) 100%)`,
    backdropFilter: 'blur(40px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.35)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
  };
}

/** Glass divider border color */
export const GLASS_DIVIDER = 'border-white/20';

/** Glass input/search bar background — declared in styles.css so it can adapt
 *  to dark mode (a flat `bg-white/15` reads as a too-bright tile on the dark
 *  glass gradient). */
export const GLASS_INPUT_BG = 'glass-input-bg';
