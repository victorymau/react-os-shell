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
  /** Optional 3rd-level sub-items. Hovering the parent in <StartMenu> opens
   *  a nested flyout; in <Sidebar> the parent becomes an inline sub-accordion. */
  children?: NavItem[];
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
  /** Optional section labels pinned to the bottom of the menu, next to the user
   *  profile, separated from the ERP group by a divider. */
  footer?: string[];
  /** Optional flat top-level items pinned to the bottom of the menu, next to
   *  the user profile, separated from the ERP group by a divider. Unlike
   *  `footer` (section labels rendered as flyouts), these render as direct
   *  clickable rows — use for standalone destinations like System Preferences
   *  or a bug-report link. */
  footerItems?: NavItem[];
}

export function isSection(item: NavSection | NavItem): item is NavSection {
  return 'items' in item;
}
