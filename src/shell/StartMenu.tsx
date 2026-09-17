import { useState, useEffect, useLayoutEffect, useRef, isValidElement, cloneElement, type ReactElement, type ReactNode } from 'react';
import {
  navSections as defaultNavSections,
  navIcons as defaultNavIcons,
  sectionIcons as defaultSectionIcons,
  startMenuCategories as defaultCategories,
  isSection,
  type NavSection,
  type NavItem,
  type StartMenuCategories,
  type VirtualSection,
} from '../shell-config/nav';
import { visibleChildren as navVisibleChildren, isReachable, navVisible } from './nav-types';
import {
  openMenuLevel, closeMenuBelow, resolveMenuLevels, clampMenuTop, menuPanelLeft,
  type MenuAnchor,
} from './menuPath';
import { markMenuOpen } from './perfEvents';
import { useAuth } from '../contexts/AuthContext';
import { glassStyle, GLASS_INPUT_BG } from '../utils/glass';
import { useIsMobile } from './useIsMobile';

interface StartMenuProps {
  open: boolean; onClose: () => void; openPage: (path: string) => void;
  openWindows: { route?: string; label: string }[];
  profile: any; user: any; onLogout: () => void; onNavigate: (path: string) => void;
  taskbarPosition: 'top' | 'bottom' | 'left' | 'right'; taskbarH: number; taskbarW?: number;
  /** Gap (px) between the menu and the taskbar edge; set per taskbar size by Layout. */
  taskbarGap?: number;
  size?: 'small' | 'medium' | 'large';
  /** Override the default nav sections (sections + top-level items). */
  navSections?: (NavSection | NavItem)[];
  /** Per-route icon map for items in the menu. */
  navIcons?: Record<string, ReactNode>;
  /** Per-section header icon map. */
  sectionIcons?: Record<string, ReactNode>;
  /** Section grouping + virtual flyouts (Utilities-style trays). */
  categories?: StartMenuCategories;
}

const ITEM_H = 36; // approximate height per menu item in px

/** Gap between a panel and the one it opened from. */
const PANEL_GAP = 4;
/** Grace period before a submenu closes, so the pointer can cut the corner
 *  across sibling rows and the gap on its way into the panel. */
const CLOSE_DELAY = 200;

type MenuLabelled = { label: string; menuLabel?: string };

const visibleMenuLabel = (entry: MenuLabelled) => entry.menuLabel ?? entry.label;

const isAbbreviated = (entry: MenuLabelled) =>
  Boolean(entry.menuLabel && entry.menuLabel !== entry.label);

/** An abbreviated row is named "<compact>, <full>", in that order: the
 *  accessible name has to START with the text on screen or voice control
 *  ("click AP") stops matching the row the user can actually see — WCAG 2.5.3.
 *  A row showing its own full label needs no override at all; its text content
 *  already IS the name, and CSS truncation does not change that. */
const menuAriaLabel = (entry: MenuLabelled) =>
  isAbbreviated(entry) ? `${entry.menuLabel}, ${entry.label}` : undefined;

/**
 * A row's visible name, with a native tooltip ONLY where what you can read is
 * not the whole name: an explicit compact `menuLabel`, or a label this row had
 * to clip. Titling every row instead hangs a tooltip off ordinary short labels
 * — and hovering a row is also what opens its flyout, so the two fight. The
 * measurement runs on enter, so it costs nothing until someone hovers.
 */
function MenuLabel({ entry, className }: { entry: MenuLabelled; className: string }) {
  const abbreviated = isAbbreviated(entry);
  const [titled, setTitled] = useState(abbreviated);
  return (
    <span
      className={className}
      title={titled ? entry.label : undefined}
      data-menu-label
      onMouseEnter={e => setTitled(abbreviated || e.currentTarget.scrollWidth > e.currentTarget.clientWidth)}
    >
      {visibleMenuLabel(entry)}
    </span>
  );
}

/**
 * One flyout panel — the same component at every depth.
 *
 * It positions itself in a layout effect rather than from state. The `top` in
 * the style prop is only an estimate from the item count; the effect replaces
 * it with one measured off the rendered panel, before the browser paints. That
 * ordering is the point: a panel repositioned from state moves AFTER paint,
 * which slides its rows out from under a pointer that hasn't moved — and a row
 * that moves away from the pointer never gets its `mouseenter`, so the next
 * level opens late or not at all.
 */
function MenuPanel({ left, anchorY, estHeight, minTop, maxBottom, flipped, className, style, onMouseEnter, onMouseLeave, children }: {
  left: number;
  anchorY: number;
  estHeight: number;
  minTop: number;
  maxBottom: number;
  /** Opened to the LEFT of its parent — slide in from that side too. */
  flipped?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // No dep array: any re-render can change the content's height, and the
  // correction costs one property write against the DOM node React just wrote.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.top = `${clampMenuTop(anchorY, el.offsetHeight, minTop, maxBottom)}px`;
  });
  return (
    <div
      ref={ref}
      data-menu-panel
      className={`fixed rounded-2xl overflow-hidden ${className ?? ''}`}
      style={{ left, top: clampMenuTop(anchorY, estHeight, minTop, maxBottom), animation: `${flipped ? 'submenu-in-left' : 'submenu-in'} 0.1s ease-out`, ...style }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}

export default function StartMenu({
  open, onClose, openPage, profile, user, onLogout,
  taskbarPosition, taskbarH, taskbarW = 0, taskbarGap = 4, size = 'medium',
  navSections = defaultNavSections,
  navIcons = defaultNavIcons,
  sectionIcons = defaultSectionIcons,
  categories = defaultCategories,
}: StartMenuProps) {
  const erpLabels = new Set(categories.erp);
  const systemLabels = new Set(categories.system);
  const footerLabels = new Set(categories.footer ?? []);
  const virtualSections = categories.virtual ?? [];
  const virtualByLabel: Record<string, VirtualSection> = Object.fromEntries(
    virtualSections.map(v => [v.label, v]),
  );
  const { hasAnyPerm } = useAuth();
  // Flat rows pinned to the footer (next to the profile), e.g. System
  // Preferences. Rendered directly — no flyout — unlike `categories.footer`.
  const footerItems = (categories.footerItems ?? []).filter(item => navVisible(item, hasAnyPerm));
  const isMobile = useIsMobile();
  // Which flyouts are open, outermost first — one entry per panel, any depth.
  // `openPath[0]` is the section row hovered in the menu itself, `openPath[1]`
  // the row hovered inside the panel that opened, and so on. See `menuPath.ts`
  // for the rules; every level goes through them, so there is no such thing
  // here as "the 3rd-level case".
  const [openPath, setOpenPath] = useState<MenuAnchor[]>([]);
  const [search, setSearch] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  // ONE close timer for the whole menu. Every handler that could close
  // something clears it before doing anything else, so a pending close from a
  // row the pointer merely passed over can never fire after a submenu has
  // opened and shut it under the cursor.
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { if (!open) { setSearch(''); setOpenPath([]); setSearchIdx(0); } }, [open]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // ── Perf marks ──
  // Each layer is a fresh frosted-glass surface measured, positioned and
  // animated in over everything already on screen, which makes opening one the
  // most expensive thing this menu does — and, on a slow machine, the moment
  // people notice. Marked from an effect rather than from the hover handlers so
  // every route in (pointer, keyboard, a section cleared and re-entered) is
  // counted once, and only when the layer actually renders.
  const deepestOpen = openPath.length > 0 ? openPath[openPath.length - 1].key : null;
  useEffect(() => { if (open) markMenuOpen('menu', 'start'); }, [open]);
  useEffect(() => { if (deepestOpen) markMenuOpen('submenu', deepestOpen); }, [deepestOpen]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const click = (e: PointerEvent | MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-menu-toggle]')) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('pointerdown', click);
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('pointerdown', click); };
  }, [open, onClose]);

  if (!open) return null;

  const handleClick = (path: string) => { openPage(path); onClose(); };

  // Coarse-pointer / narrow viewport: render as a full-screen slide-up sheet
  // with search + a flat, tappable list instead of the dense desktop columns.
  if (isMobile) {
    const allItems: { item: NavItem; sectionLabel?: string }[] = [];
    // Recursively flatten — nested children at any depth show up as their own
    // rows so they can be searched/tapped from the mobile sheet too.
    const pushItem = (it: NavItem, sectionLabel?: string) => {
      if (!navVisible(it, hasAnyPerm)) return;
      // Same reachability rule as the desktop flyout — an empty group is not a
      // tap target, so don't list one.
      if (!isReachable(it, hasAnyPerm)) return;
      allItems.push({ item: it, sectionLabel });
      for (const c of navVisibleChildren(it, hasAnyPerm)) pushItem(c, it.label);
    };
    for (const entry of navSections) {
      if (isSection(entry)) {
        const sec = entry as NavSection;
        if (!navVisible(sec, hasAnyPerm)) continue;
        for (const it of sec.items) pushItem(it, sec.label);
      } else {
        pushItem(entry as NavItem);
      }
    }
    for (const it of footerItems) pushItem(it);
    const filtered = search.length >= 1
      ? allItems.filter(({ item }) => item.label.toLowerCase().includes(search.toLowerCase()))
      : allItems;

    return (
      <div
        ref={menuRef}
        className="fixed inset-0 z-[260] flex flex-col bg-white"
        style={{ paddingBottom: 'var(--mobile-bottom-nav, 56px)' }}
      >
        {/* Sheet handle + header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
          <button onClick={onClose} className="p-2 -ml-1 rounded-full active:bg-gray-200 text-gray-700" aria-label="Close menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className={`flex-1 flex items-center gap-2 ${GLASS_INPUT_BG} rounded-lg px-3 py-2`}>
            <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps..."
              className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
              autoFocus
            />
          </div>
        </div>

        {/* Mobile rows follow the same one-line naming contract as desktop.
            Both axes are still named deliberately: `overflow-y-auto` on its own
            computes the other axis to `auto` too, and one nav label with no
            break opportunity in it — 110px past a 174px flyout, measured — then
            hangs a horizontal scrollbar on a panel of fixed width. The label
            used to WRAP (`wrap-anywhere`) to stay inside that pinned axis; now
            every row is one line and each label truncates instead, so the axis
            still has to be pinned shut but nothing needs to wrap. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No matching apps</p>
          ) : (
            filtered.map(({ item, sectionLabel }, i) => {
              const icon = navIcons[item.to];
              return (
                <button
                  key={`${item.to}-${i}`}
                  onClick={() => handleClick(item.to)}
                  aria-label={menuAriaLabel(item)}
                  className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-100 border-b border-gray-100 text-left"
                >
                  <span className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                    {icon && isValidElement(icon)
                      ? cloneElement(icon as ReactElement, { className: 'h-5 w-5' })
                      : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <MenuLabel entry={item} className="block truncate text-sm font-medium text-gray-900" />
                    {sectionLabel && <div className="text-[11px] text-gray-500 truncate">{sectionLabel}</div>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Use the "vertical" (sidebar-style) layout for top, left, right taskbar positions.
  // Only the bottom taskbar uses the original layout (top items first, ERP after divider).
  const isVertical = taskbarPosition !== 'bottom';
  // Top-level rows pass the same permission + reachability test as the rows in
  // a section. Read raw, a row gated on `perms`/`allPerms` showed to users who
  // could not open it — only the mobile sheet above checked — and still counted
  // toward `hasAppsGroup`, so a hidden row kept its divider.
  const topItems = (navSections.filter(item => !isSection(item)) as NavItem[])
    .filter(item => navVisible(item, hasAnyPerm) && isReachable(item, hasAnyPerm));
  const erpSections = navSections.filter(item => isSection(item) && erpLabels.has((item as NavSection).label));
  const systemSections = navSections.filter(item => isSection(item) && systemLabels.has((item as NavSection).label));
  const footerSections = navSections.filter(item => isSection(item) && footerLabels.has((item as NavSection).label));
  // The "apps" group = top-level items + system + virtual sections. Gates the
  // ERP↔apps divider so it only renders when both sides have content.
  const hasAppsGroup = topItems.length > 0 || systemSections.length > 0 || virtualSections.length > 0;

  const getVisibleItems = (section: NavSection) =>
    section.items.filter(item => navVisible(item, hasAnyPerm));

  const visibleChildren = (item: NavItem) => navVisibleChildren(item, hasAnyPerm);

  /** The sub-items a row opens — nothing for a leaf, and nothing for a group
   *  whose every branch dead-ends in permission-hidden items. Same list the
   *  chevron is drawn from, at every depth. */
  const submenuItems = (item: NavItem) =>
    visibleChildren(item).filter(child => isReachable(child, hasAnyPerm));

  // Search — walks nested children to any depth. Section column shows the
  // parent item label for children so users can tell nested entries apart.
  const matchTree = (it: NavItem, sectionLabel: string): (NavItem & { section: string })[] => {
    if (!navVisible(it, hasAnyPerm)) return [];
    // Same rule as the flyout: a group whose children are all hidden isn't a
    // reachable destination, so it shouldn't surface as a result either.
    if (!isReachable(it, hasAnyPerm)) return [];
    const kids = visibleChildren(it);
    const hits: (NavItem & { section: string })[] = [];
    if (it.label.toLowerCase().includes(search.toLowerCase())) {
      hits.push({ ...it, section: sectionLabel });
    }
    for (const c of kids) hits.push(...matchTree(c, it.label));
    return hits;
  };
  const searchResults = search.length >= 2 ? [
    ...navSections.flatMap(item => {
      if (isSection(item)) {
        const sec = item as NavSection;
        return sec.items.flatMap(i => matchTree(i, sec.label));
      }
      return matchTree(item as NavItem, '');
    }),
    ...footerItems.flatMap(item => matchTree(item, '')),
  ] : [];

  const posStyle: React.CSSProperties =
    taskbarPosition === 'top' ? { top: taskbarH + taskbarGap, left: 8 } :
    taskbarPosition === 'left' ? { top: 8, left: taskbarW + taskbarGap } :
    taskbarPosition === 'right' ? { top: 8, right: taskbarW + taskbarGap } :
    { bottom: taskbarH + taskbarGap, left: 8 };

  const iconEl = (path: string) => {
    const icon = navIcons[path];
    if (icon && isValidElement(icon)) return cloneElement(icon as ReactElement, { className: 'h-4 w-4 shrink-0' });
    return null;
  };

  const secIcon = (label: string) => {
    const icon = sectionIcons[label];
    if (icon && isValidElement(icon)) return cloneElement(icon as ReactElement, { className: 'h-4 w-4 shrink-0' });
    return null;
  };

  // Flyout data — either a real section or a configured virtual section
  const hoveredSection = openPath.length > 0 ? openPath[0].key : null;
  const hoveredVirtual = hoveredSection ? virtualByLabel[hoveredSection] : undefined;
  const hoveredData = hoveredVirtual
    ? null
    : (hoveredSection ? [...erpSections, ...systemSections, ...footerSections].find(s => (s as NavSection).label === hoveredSection) as NavSection | undefined : null);
  const flyoutItems = (hoveredVirtual
    ? hoveredVirtual.items
    : (hoveredData ? getVisibleItems(hoveredData) : [])
  ).filter(item => isReachable(item, hasAnyPerm));

  // Density from CSS variable — three tiers controlling the vertical gap between
  // rows: tight < normal < large. `normal` is the default and sits a little
  // tighter than `large`.
  const menuDensity = typeof document !== 'undefined' ? (getComputedStyle(document.documentElement).getPropertyValue('--menu-density')?.trim() || 'normal') : 'normal';
  const density: 'tight' | 'normal' | 'large' = menuDensity === 'tight' || menuDensity === 'large' ? menuDensity : 'normal';

  // Size-dependent styles, adjusted for density. `fwPx` is `fw` in pixels —
  // panels are placed before they render, so the flip-to-the-left decision
  // can't wait for a measurement.
  const sizeConfigByDensity = {
    tight:  { small: { w: 'w-52', fw: 'w-44', fwPx: 176, text: 'text-xs', py: 'py-1',   px: 'px-3', mw: 208, itemH: 24 }, medium: { w: 'w-56', fw: 'w-48', fwPx: 192, text: 'text-xs', py: 'py-1',   px: 'px-3', mw: 224, itemH: 26 }, large: { w: 'w-64', fw: 'w-52', fwPx: 208, text: 'text-sm', py: 'py-1.5', px: 'px-3', mw: 256, itemH: 30 } },
    normal: { small: { w: 'w-56', fw: 'w-48', fwPx: 192, text: 'text-xs', py: 'py-1.5', px: 'px-3', mw: 224, itemH: 30 }, medium: { w: 'w-64', fw: 'w-56', fwPx: 224, text: 'text-sm', py: 'py-1.5', px: 'px-4', mw: 256, itemH: 32 }, large: { w: 'w-72', fw: 'w-60', fwPx: 240, text: 'text-sm', py: 'py-2',   px: 'px-4', mw: 288, itemH: 36 } },
    large:  { small: { w: 'w-56', fw: 'w-48', fwPx: 192, text: 'text-xs', py: 'py-2', px: 'px-3', mw: 224, itemH: 32 }, medium: { w: 'w-64', fw: 'w-56', fwPx: 224, text: 'text-sm', py: 'py-2', px: 'px-4', mw: 256, itemH: 36 }, large: { w: 'w-72', fw: 'w-60', fwPx: 240, text: 'text-sm', py: 'py-2', px: 'px-4', mw: 288, itemH: 36 } },
  };
  const sizeConfig = sizeConfigByDensity[density][size];
  const menuGlass = glassStyle();
  const itemCls = `w-full min-w-0 overflow-hidden whitespace-nowrap flex items-center gap-2 rounded-lg ${sizeConfig.px} ${sizeConfig.py} ${sizeConfig.text}`;
  const itemLabelCls = 'min-w-0 flex-1 truncate text-left';

  // The usable vertical span for a panel: the screen minus the taskbar edge and
  // an 8px gutter, so a flyout can never sit over the taskbar or run off the
  // bottom. The span is the viewport, NOT the main menu's rect: a submenu can
  // legitimately be taller than the menu that opened it (e.g. "System" with far
  // more items than the menu has rows). A panel taller than the span is capped
  // at `availH` and scrolls — see `maxHeight` below.
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const minTop = (taskbarPosition === 'top' ? taskbarH : 0) + 8;
  const maxBottom = viewportH - (taskbarPosition === 'bottom' ? taskbarH : 0) - 8;
  const availH = Math.max(0, maxBottom - minTop);

  // Every open flyout's items, outermost first.
  const levels = resolveMenuLevels(flyoutItems, openPath, submenuItems);

  const cancelClose = () => clearTimeout(closeTimer.current);

  /**
   * Where the panel opened from a row in panel `depth` starts horizontally.
   *
   * Panel 0 is the main menu, so it gets measured. Deeper panels are ours: we
   * put them where `openPath` says, and `offsetWidth` is the untransformed
   * layout width — neither reading is disturbed by the `submenu-in` animation
   * still running on the panel the pointer is in, which a `getBoundingClientRect`
   * would pick up and shift the next panel by.
   */
  const nextPanelLeft = (depth: number, row: HTMLElement) => {
    const owner = row.closest('[data-menu-panel]') as HTMLElement | null;
    if (!owner) return { left: 0, flipped: false };
    const ownerLeft = depth === 0 ? owner.getBoundingClientRect().left : (openPath[depth - 1]?.left ?? 0);
    const ownerRight = depth === 0 ? owner.getBoundingClientRect().right : ownerLeft + owner.offsetWidth;
    const preferLeft = depth > 0 && (openPath[depth - 1]?.flipped ?? false);
    return menuPanelLeft(ownerLeft, ownerRight, sizeConfig.fwPx, viewportW, PANEL_GAP, preferLeft);
  };

  /** Hovering a row in panel `depth` that has a submenu — open it now. */
  const openSubmenu = (depth: number, key: string, e: React.MouseEvent) => {
    cancelClose();
    const row = e.currentTarget as HTMLElement;
    const rect = row.getBoundingClientRect();
    const anchor: MenuAnchor = { key, y: rect.top + rect.height / 2, ...nextPanelLeft(depth, row) };
    setOpenPath(prev => openMenuLevel(prev, depth, anchor));
  };

  /**
   * Nothing under panel `depth` is wanted any more — the pointer is on a row
   * with no submenu, or has left a panel entirely. Deferred by `CLOSE_DELAY`
   * because the pointer may simply be cutting the corner on its way into the
   * panel it just opened, and immediate by cancellation because whatever the
   * pointer lands on next re-states the intent.
   */
  const scheduleClose = (depth: number) => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenPath(prev => closeMenuBelow(prev, depth)), CLOSE_DELAY);
  };

  const chevron = (
    <svg className="h-3.5 w-3.5 shrink-0 ml-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
  );

  const renderSection = (section: NavSection, isErp: boolean) => {
    if (!navVisible(section, hasAnyPerm)) return null;
    const items = getVisibleItems(section);
    if (items.length === 0) return null;
    const isHovered = hoveredSection === section.label;
    return (
      <div key={section.label} onMouseEnter={e => openSubmenu(0, section.label, e)}>
        <button
          aria-label={menuAriaLabel(section)}
          className={`${itemCls} transition-colors ${isHovered ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}
        >
          {secIcon(section.label)}
          <MenuLabel entry={section} className={`${itemLabelCls} ${isErp ? 'font-medium' : ''}`} />
          {chevron}
        </button>
        {section.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
      </div>
    );
  };

  const renderVirtualSection = (v: VirtualSection) => {
    if (v.items.length === 0) return null;
    const isHovered = hoveredSection === v.label;
    return (
      <div key={v.label} onMouseEnter={e => openSubmenu(0, v.label, e)}>
        <button
          aria-label={menuAriaLabel(v)}
          className={`${itemCls} transition-colors ${isHovered ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}
        >
          <span className="shrink-0">{v.icon}</span>
          <MenuLabel entry={v} className={itemLabelCls} />
          {chevron}
        </button>
      </div>
    );
  };

  return (
    /* z-[1100]: sit above the entire window stack — normal windows climb to
       50 + idx*10 + 1 and pinned-on-top windows render at 999 (see Modal.tsx),
       which previously painted over the open Start menu (BG#00259). 1100 clears
       both. Deliberately kept BELOW Exposé / mission-control (zIndex 2000–9999
       in Modal.tsx) and the transient full-screen overlay tier (toasts,
       startup, logout — z-[9999]), which should still cover the menu. */
    <div ref={menuRef} className="fixed z-[1100]" style={posStyle}>
      <div className="flex">
        {/* Main menu — panel 0. Entering or leaving it schedules the flyouts
            shut; whichever row the pointer settles on says otherwise, either by
            opening its own submenu or by scheduling the same close again. */}
        <div data-menu-panel className={`${sizeConfig.w} rounded-2xl flex ${isVertical ? 'flex-col-reverse' : 'flex-col'} overflow-hidden`}
          style={{ animation: 'menu-in 0.15s ease-out', ...menuGlass }}
          onMouseEnter={() => scheduleClose(0)}
          onMouseLeave={() => scheduleClose(0)}>

          {/* Search — at top for horizontal, at bottom for vertical */}
          <div className={`px-3 ${isVertical ? 'pb-3 pt-2 border-t border-white/20' : 'pt-3 pb-2'}`}
            onMouseEnter={() => scheduleClose(0)}>
            <div className={`flex items-center gap-2 ${GLASS_INPUT_BG} rounded-lg px-2.5 py-1.5`}>
              <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setOpenPath([]); setSearchIdx(0); }}
                onKeyDown={e => {
                  if (search.length >= 2 && searchResults.length > 0) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIdx(i => Math.min(i + 1, searchResults.length - 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchIdx(i => Math.max(i - 1, 0)); }
                    else if (e.key === 'Enter') { e.preventDefault(); handleClick(searchResults[searchIdx].to); }
                  }
                }}
                placeholder="Search..."
                className="flex-1 bg-transparent text-xs outline-none placeholder-gray-400" autoFocus />
            </div>
          </div>

          {search.length >= 2 ? (
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2 max-h-[400px]">
              {searchResults.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No results</p>
              ) : searchResults.map((r, i) => (
                <button key={i} onClick={() => handleClick(r.to)}
                  onMouseEnter={() => setSearchIdx(i)}
                  aria-label={menuAriaLabel(r)}
                  className={`${itemCls} transition-colors ${i === searchIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                  {iconEl(r.to)}
                  <MenuLabel entry={r} className={itemLabelCls} />
                  {r.section && <span className="max-w-[40%] shrink-0 truncate text-[10px] text-gray-400 ml-auto">{r.section}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 pb-1 flex flex-col">
              {isVertical && (<>
                {/* Reversed column → profile sits at the top, so footer items +
                    sections render first to stay pinned next to it. */}
                {footerItems.map(item => (
                  <button key={item.to} onClick={() => handleClick(item.to)}
                    onMouseEnter={() => scheduleClose(0)}
                    aria-label={menuAriaLabel(item)}
                    className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                    {iconEl(item.to)}
                    <MenuLabel entry={item} className={itemLabelCls} />
                  </button>
                ))}
                {footerSections.map(s => renderSection(s as NavSection, false))}
                {(footerSections.length > 0 || footerItems.length > 0) && <div className="border-t border-white/20 my-1.5 mx-2" />}
                {/* Vertical layout: ERP sections first */}
                {erpSections.map(s => renderSection(s as NavSection, true))}
                {erpSections.length > 0 && hasAppsGroup && <div className="border-t border-white/20 my-1.5 mx-2" />}
                {/* Then top-level items + system */}
                {topItems.map(item => (
                  <div key={item.to} onMouseEnter={() => scheduleClose(0)}>
                    <button onClick={() => handleClick(item.to)}
                      aria-label={menuAriaLabel(item)}
                      className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                      {iconEl(item.to)}
                      <MenuLabel entry={item} className={itemLabelCls} />
                    </button>
                    {item.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
                  </div>
                ))}{systemSections.map(s => renderSection(s as NavSection, false))}
                {virtualSections.map(v => renderVirtualSection(v))}
              </>)}

              {!isVertical && (<>
                {/* Horizontal layout: top-level items first, ERP after divider */}
                {topItems.map(item => (
                  <div key={item.to} onMouseEnter={() => scheduleClose(0)}>
                    <button onClick={() => handleClick(item.to)}
                      aria-label={menuAriaLabel(item)}
                      className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                      {iconEl(item.to)}
                      <MenuLabel entry={item} className={itemLabelCls} />
                    </button>
                    {item.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
                  </div>
                ))}{systemSections.map(s => renderSection(s as NavSection, false))}
                {virtualSections.map(v => renderVirtualSection(v))}
                {hasAppsGroup && erpSections.length > 0 && <div className="border-t border-white/20 my-1.5 mx-2" />}
                {erpSections.map(s => renderSection(s as NavSection, true))}
                {/* Footer items + sections: pinned just above the profile, divided from ERP. */}
                {(footerSections.length > 0 || footerItems.length > 0) && <div className="border-t border-white/20 my-1.5 mx-2" />}
                {footerSections.map(s => renderSection(s as NavSection, false))}
                {footerItems.map(item => (
                  <button key={item.to} onClick={() => handleClick(item.to)}
                    onMouseEnter={() => scheduleClose(0)}
                    aria-label={menuAriaLabel(item)}
                    className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                    {iconEl(item.to)}
                    <MenuLabel entry={item} className={itemLabelCls} />
                  </button>
                ))}
              </>)}
            </div>
          )}

          {/* User profile — name + sign out on same row */}
          <div className={`${isVertical ? 'border-b' : 'border-t'} border-white/20 p-1`} onMouseEnter={() => scheduleClose(0)}>
            <div onClick={() => handleClick('/profile')}
              className="rounded-lg px-2 py-1.5 flex items-center gap-2.5 hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover border border-white/20 shrink-0" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                  {(profile?.first_name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase()}
                </div>
              )}
              <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email}
              </p>
              <button onClick={e => { e.stopPropagation(); onClose(); onLogout(); }} title="Sign Out"
                className="shrink-0 p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Flyouts — one panel per open level, centred on the row that opened
            it and clamped into the usable viewport span. Every level renders
            from this one loop: the section flyout is `levels[0]` and is built
            exactly like the one six levels down, so there is no depth at which
            the menu starts behaving differently. */}
        {search.length < 2 && levels.map((items, i) => (
          <MenuPanel
            key={`${i}:${openPath[i].key}`}
            left={openPath[i].left}
            anchorY={openPath[i].y}
            estHeight={items.length * sizeConfig.itemH + 12}
            minTop={minTop}
            maxBottom={maxBottom}
            flipped={openPath[i].flipped}
            className={sizeConfig.fw}
            style={menuGlass}
            /* Landing anywhere in this panel — a row, a divider, the padding —
               retires the branch below it. A row that has its own submenu
               cancels that on the way past, because React fires the panel's
               `mouseenter` before the row's. */
            onMouseEnter={() => scheduleClose(i + 1)}
            onMouseLeave={() => scheduleClose(i)}
          >
            <div className="py-1 px-1 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ maxHeight: availH }}>
              {items.map(item => {
                const kids = submenuItems(item);
                const isOpen = openPath[i + 1]?.key === item.to;
                return (
                  <div key={item.to}
                    onMouseEnter={kids.length > 0 ? e => openSubmenu(i + 1, item.to, e) : () => scheduleClose(i + 1)}>
                    <button
                      /* A group's `to` is a synthetic key by convention, so
                         clicking one navigates nowhere — it opens its submenu,
                         the same thing hovering it does, instead of closing the
                         menu on a route that does not exist. */
                      onClick={kids.length > 0 ? e => openSubmenu(i + 1, item.to, e) : () => handleClick(item.to)}
                      aria-label={menuAriaLabel(item)}
                      className={`${itemCls} transition-colors ${isOpen ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                      {iconEl(item.to)}
                      <MenuLabel entry={item} className={itemLabelCls} />
                      {kids.length > 0 && chevron}
                    </button>
                    {item.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
                  </div>
                );
              })}
            </div>
          </MenuPanel>
        ))}
      </div>

      <style>{`
        @keyframes menu-in { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes submenu-in { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes submenu-in-left { from { opacity: 0; transform: translateX(4px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
