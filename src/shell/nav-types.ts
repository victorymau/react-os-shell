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
  /** Permissions the user must hold EVERY one of, unlike `perms` which needs
   *  only one. For an entry whose page is gated on a narrower permission than
   *  the one that puts it in the menu: listing both in `perms` would widen the
   *  audience (it's an OR), so the extra one goes here instead. */
  allPerms?: string[];
  dividerAfter?: boolean;
  /** Optional 3rd-level sub-items. Hovering the parent in <StartMenu> opens
   *  a nested flyout; in <Sidebar> the parent becomes an inline sub-accordion. */
  children?: NavItem[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
  perms?: string[];
  /** Same all-of rule as `NavItem.allPerms`, for a whole section. */
  allPerms?: string[];
  /** Optional landing route for clicks on the section title itself
   *  (e.g. R&D's `/rd` dashboard). */
  to?: string;
  /** Draw a divider under this section's row, so a consumer can split one
   *  flat group into visual bands (e.g. an operator console pinned above the
   *  ERP sections). Same knob as `NavItem.dividerAfter`, and drawn INSIDE the
   *  section's wrapper so it stays below the row in the `flex-col-reverse`
   *  Start menu a side/top taskbar renders. */
  dividerAfter?: boolean;
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

/** The host app's permission predicate — `useAuth().hasAnyPerm`. */
type HasAnyPerm = (perms: string[]) => boolean;

/**
 * Whether this user may see a nav entry, honouring BOTH permission rules.
 *
 * Every visibility test in the shell goes through here. It used to be an inline
 * `!x.perms || hasAnyPerm(x.perms)` repeated at nine call sites, which made the
 * all-of rule impossible to add without missing one — and a missed site shows a
 * row that refuses on click (SG#00214: a price-blind supplier role kept the
 * Price Sheets entry, because the entry is gated on the permission that lists
 * price sheets while the page is gated on the narrower one that reveals prices).
 *
 * `perms` keeps its any-of meaning, so existing nav data is untouched.
 * `allPerms` requires every entry, and is tested one permission at a time
 * because `hasAnyPerm` is the only predicate a host supplies — asking for all
 * of them in one call would be an OR and quietly grant the row.
 */
export function navVisible(
  entry: { perms?: string[]; allPerms?: string[] },
  hasAnyPerm: HasAnyPerm,
): boolean {
  if (entry.perms?.length && !hasAnyPerm(entry.perms)) return false;
  if (entry.allPerms?.length && !entry.allPerms.every(p => hasAnyPerm([p]))) return false;
  return true;
}

/**
 * The sub-items of `item` this user may actually see.
 *
 * Every affordance for a nested group has to be derived from THIS list — the
 * chevron that advertises it, the hover handler that opens it, and the flyout
 * itself. Reading the raw `item.children` for the chevron while filtering only
 * for the flyout put an arrow on groups whose children were all
 * permission-hidden: hovering one highlighted the row and opened nothing.
 */
export function visibleChildren(item: NavItem, hasAnyPerm: HasAnyPerm): NavItem[] {
  return (item.children ?? []).filter(c => navVisible(c, hasAnyPerm));
}

/**
 * Whether a nav row leads anywhere for this user: either it's a plain
 * destination, or it's a group with at least one visible child. A group whose
 * children are all hidden has nothing to open — and by convention a group's
 * `to` is a synthetic key that never navigates, so there is nothing to fall
 * back to either. Such a row is dropped rather than rendered inert.
 */
export function isReachable(item: NavItem, hasAnyPerm: HasAnyPerm): boolean {
  return !item.children?.length || visibleChildren(item, hasAnyPerm).length > 0;
}
