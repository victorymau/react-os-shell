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

export const navIcons: Record<string, ReactNode> = {};
export const sectionIcons: Record<string, ReactNode> = {};
export const navSections: (NavSection | NavItem)[] = [];
export const startMenuCategories: StartMenuCategories = { erp: [], system: [], virtual: [] };

export { isSection } from '../shell/nav-types';
export type { NavItem, NavSection, StartMenuCategories, VirtualSection };
