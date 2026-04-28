/**
 * INTERNAL stub — package-side compatibility for files that legacy-imported
 * default nav data from `shell-config/nav`. The package never ships nav
 * DATA; consumers always supply `navSections` / `navIcons` / `sectionIcons` /
 * `categories` as Layout props.
 *
 * Empty defaults exported here so the copied files compile during the
 * extraction transition. Each consumer-facing field is also re-exported as
 * a TYPE alias for code that only needed the shape.
 */
import type { ReactNode } from 'react';
import type { NavItem, NavSection, StartMenuCategories, VirtualSection } from '../shell/nav-types';

// Live proxy: WindowManager reads window-title icons from this module-level
// map. Consumers register their full icon set once at app startup so the
// title bars show the same glyphs as the start menu.
const _navIcons: Record<string, ReactNode> = {};
export const navIcons: Record<string, ReactNode> = new Proxy(_navIcons, {
  get(_t, k: string) { return _navIcons[k]; },
  has(_t, k: string) { return k in _navIcons; },
  ownKeys() { return Object.keys(_navIcons); },
  getOwnPropertyDescriptor(_t, k: string) {
    if (k in _navIcons) return { configurable: true, enumerable: true, value: _navIcons[k] };
    return undefined;
  },
});
export function setShellNavIcons(icons: Record<string, ReactNode>): void {
  for (const k of Object.keys(_navIcons)) delete _navIcons[k];
  Object.assign(_navIcons, icons);
}

export const sectionIcons: Record<string, ReactNode> = {};
export const navSections: (NavSection | NavItem)[] = [];
export const startMenuCategories: StartMenuCategories = { erp: [], system: [], virtual: [] };

export { isSection } from '../shell/nav-types';
export type { NavItem, NavSection, StartMenuCategories, VirtualSection };
