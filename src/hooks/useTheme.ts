import { useEffect, useSyncExternalStore } from 'react';
import { useShellPrefs } from '../shell/ShellPrefs';

export type Theme = 'system' | 'light' | 'dark' | 'pink' | 'green' | 'grey' | 'blue';

/** Subscribe to OS dark-mode changes */
function subscribeMediaQuery(cb: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function getSystemIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Derive lighter / darker shades from a hex color via HSL */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function useTheme() {
  const { prefs } = useShellPrefs();
  const systemDark = useSyncExternalStore(subscribeMediaQuery, getSystemIsDark);
  const saved: Theme = (prefs.theme as Theme) || 'system';
  const accentColor: string | null = prefs.accent_color || null;
  const customBgColor: string | null = prefs.custom_bg_color || null;
  const customTitleColor: string | null = prefs.custom_title_color || null;
  const customWindowColor: string | null = prefs.custom_window_color || null;
  const customButtonColor: string | null = prefs.custom_button_color || null;

  // Resolve "system" to actual theme
  const resolved = saved === 'system' ? (systemDark ? 'dark' : 'light') : saved;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    return () => document.documentElement.removeAttribute('data-theme');
  }, [resolved]);

  // Custom accent color
  useEffect(() => {
    const root = document.documentElement;
    if (accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      const [h, s, l] = hexToHsl(accentColor);
      root.setAttribute('data-custom-accent', 'true');
      root.style.setProperty('--accent-600', accentColor);
      root.style.setProperty('--accent-700', hslToHex(h, s, Math.max(l - 10, 5)));
      root.style.setProperty('--accent-500', hslToHex(h, s, Math.min(l + 10, 95)));
      root.style.setProperty('--accent-400', hslToHex(h, s, Math.min(l + 20, 95)));
      root.style.setProperty('--accent-300', hslToHex(h, Math.min(s + 10, 100), Math.min(l + 30, 92)));
      root.style.setProperty('--accent-200', hslToHex(h, Math.min(s + 15, 100), Math.min(l + 38, 94)));
      root.style.setProperty('--accent-100', hslToHex(h, Math.min(s + 20, 100), Math.min(l + 42, 96)));
      root.style.setProperty('--accent-50', hslToHex(h, Math.min(s + 20, 100), Math.min(l + 46, 98)));
    } else {
      root.removeAttribute('data-custom-accent');
      ['--accent-600', '--accent-700', '--accent-500', '--accent-400', '--accent-300', '--accent-200', '--accent-100', '--accent-50'].forEach(p => root.style.removeProperty(p));
    }
  }, [accentColor]);

  // Custom theme colors (bg, title, window, button)
  useEffect(() => {
    const root = document.documentElement;
    if (accentColor) {
      // Helper to convert hex to "r g b" for rgba usage
      const hexToRgb = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r} ${g} ${b}`;
      };
      if (customBgColor) root.style.setProperty('--custom-bg-color', customBgColor);
      if (customTitleColor) {
        root.style.setProperty('--window-header-rgb', hexToRgb(customTitleColor));
        root.style.setProperty('--window-footer-rgb', hexToRgb(customTitleColor));
      }
      if (customWindowColor) root.style.setProperty('--window-content-rgb', hexToRgb(customWindowColor));
      if (customButtonColor) {
        root.style.setProperty('--custom-button-color', customButtonColor);
        const [h, s, l] = hexToHsl(customButtonColor);
        root.style.setProperty('--custom-button-hover', hslToHex(h, s, Math.max(l - 10, 5)));
      }
    } else {
      ['--custom-bg-color', '--custom-button-color', '--custom-button-hover'].forEach(p => root.style.removeProperty(p));
    }
  }, [accentColor, customBgColor, customTitleColor, customWindowColor, customButtonColor]);

  return { theme: saved, resolved };
}
