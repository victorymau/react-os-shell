/**
 * Nav data types used by <Layout> + <StartMenu>. The actual sections, icons,
 * and categories are consumer-supplied via Layout props — the package never
 * ships nav DATA, only the shape it expects.
 */
import type { ReactNode } from 'react';

export interface NavItem {
  to: string;
  label: string;
  perms?: string[];
  dividerAfter?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
  perms?: string[];
  /** Optional landing route for clicks on the section title itself
   *  (e.g. R&D's `/rd` dashboard). */
  to?: string;
}

export interface VirtualSection {
  label: string;
  items: NavItem[];
  icon?: ReactNode;
}

export interface StartMenuCategories {
  /** Section labels rendered in the "ERP" group (bold, with section icon). */
  erp: string[];
  /** Section labels rendered in the "system" group. */
  system: string[];
  /** Optional virtual flyouts (e.g. a "Utilities" tray). */
  virtual?: VirtualSection[];
}

export function isSection(item: NavSection | NavItem): item is NavSection {
  return 'items' in item;
}
