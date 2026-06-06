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
import { useAuth } from '../contexts/AuthContext';
import { glassStyle, GLASS_INPUT_BG } from '../utils/glass';
import { useIsMobile } from './useIsMobile';

interface StartMenuProps {
  open: boolean; onClose: () => void; openPage: (path: string) => void;
  openWindows: { route?: string; label: string }[];
  profile: any; user: any; onLogout: () => void; onNavigate: (path: string) => void;
  taskbarPosition: 'top' | 'bottom' | 'left' | 'right'; taskbarH: number; taskbarW?: number;
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

export default function StartMenu({
  open, onClose, openPage, profile, user, onLogout,
  taskbarPosition, taskbarH, taskbarW = 0, size = 'medium',
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
  const footerItems = (categories.footerItems ?? []).filter(item => !item.perms || hasAnyPerm(item.perms));
  const isMobile = useIsMobile();
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [hoveredY, setHoveredY] = useState(0);
  // 3rd-level flyout: when the user hovers a NavItem (inside a section flyout)
  // that has `children`, we open a sub-flyout anchored next to that item.
  const [hoveredChild, setHoveredChild] = useState<string | null>(null);
  const [hoveredChildY, setHoveredChildY] = useState(0);
  const [search, setSearch] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const subFlyoutRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();
  const childHoverTimeout = useRef<ReturnType<typeof setTimeout>>();
  // Measured heights — used to refine the estimate-based top position so the
  // flyout fits its content without needing a scrollbar.
  const [measuredFlyoutH, setMeasuredFlyoutH] = useState<number | null>(null);
  const [measuredSubH, setMeasuredSubH] = useState<number | null>(null);

  useEffect(() => { if (!open) { setSearch(''); setHoveredSection(null); setHoveredChild(null); setSearchIdx(0); } }, [open]);

  // Clear the 3rd-level flyout whenever the level-2 flyout changes target.
  useEffect(() => { setHoveredChild(null); }, [hoveredSection]);

  // Reset measured heights when the target changes so the next pass uses the
  // estimate first, then refines from the new DOM measurement.
  useEffect(() => { setMeasuredFlyoutH(null); }, [hoveredSection]);
  useEffect(() => { setMeasuredSubH(null); }, [hoveredChild]);

  // Capture the flyout's intrinsic (rendered) height after layout. Setting
  // state here triggers a synchronous re-render before paint, so the user
  // only ever sees the corrected position.
  useLayoutEffect(() => {
    if (!flyoutRef.current || !hoveredSection || search.length >= 2) return;
    const h = flyoutRef.current.offsetHeight;
    if (h !== measuredFlyoutH) setMeasuredFlyoutH(h);
  }, [hoveredSection, search, measuredFlyoutH]);
  useLayoutEffect(() => {
    if (!subFlyoutRef.current || !hoveredChild || search.length >= 2) return;
    const h = subFlyoutRef.current.offsetHeight;
    if (h !== measuredSubH) setMeasuredSubH(h);
  }, [hoveredChild, search, measuredSubH]);

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

  // Mobile: render as full-screen slide-up sheet with search + flat list.
  // Folders live on MobileHome; this sheet is the quick-launch / search UI
  // surfaced from the bottom-nav "Menu" button.
  if (isMobile) {
    const allItems: { item: NavItem; sectionLabel?: string }[] = [];
    // Recursively flatten — 3rd-level children show up as their own rows so
    // they can be searched/tapped from the mobile sheet too.
    const pushItem = (it: NavItem, sectionLabel?: string) => {
      if (it.perms && !hasAnyPerm(it.perms)) return;
      allItems.push({ item: it, sectionLabel });
      if (it.children) {
        for (const c of it.children) pushItem(c, it.label);
      }
    };
    for (const entry of navSections) {
      if (isSection(entry)) {
        const sec = entry as NavSection;
        if (sec.perms && !hasAnyPerm(sec.perms)) continue;
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

        {/* Flat list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No matching apps</p>
          ) : (
            filtered.map(({ item, sectionLabel }, i) => {
              const icon = navIcons[item.to];
              return (
                <button
                  key={`${item.to}-${i}`}
                  onClick={() => handleClick(item.to)}
                  className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-100 border-b border-gray-100 text-left"
                >
                  <span className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                    {icon && isValidElement(icon)
                      ? cloneElement(icon as ReactElement, { className: 'h-5 w-5' })
                      : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.label}</div>
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
  const topItems = navSections.filter(item => !isSection(item)) as NavItem[];
  const erpSections = navSections.filter(item => isSection(item) && erpLabels.has((item as NavSection).label));
  const systemSections = navSections.filter(item => isSection(item) && systemLabels.has((item as NavSection).label));
  const footerSections = navSections.filter(item => isSection(item) && footerLabels.has((item as NavSection).label));

  const getVisibleItems = (section: NavSection) =>
    section.items.filter(item => !item.perms || hasAnyPerm(item.perms));

  // Search — walks 3rd-level children too. Section column shows the parent
  // item label for children so users can tell nested entries apart.
  const matchTree = (it: NavItem, sectionLabel: string): (NavItem & { section: string })[] => {
    if (it.perms && !hasAnyPerm(it.perms)) return [];
    const hits: (NavItem & { section: string })[] = [];
    if (it.label.toLowerCase().includes(search.toLowerCase())) {
      hits.push({ ...it, section: sectionLabel });
    }
    if (it.children) {
      for (const c of it.children) hits.push(...matchTree(c, it.label));
    }
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
    taskbarPosition === 'top' ? { top: taskbarH + 8, left: 8 } :
    taskbarPosition === 'left' ? { top: 8, left: taskbarW + 8 } :
    taskbarPosition === 'right' ? { top: 8, right: taskbarW + 8 } :
    { bottom: taskbarH + 8, left: 8 };

  const iconEl = (path: string) => {
    const icon = navIcons[path];
    if (icon && isValidElement(icon)) return cloneElement(icon as ReactElement, { className: 'h-4 w-4' });
    return null;
  };

  const secIcon = (label: string) => {
    const icon = sectionIcons[label];
    if (icon && isValidElement(icon)) return cloneElement(icon as ReactElement, { className: 'h-4 w-4' });
    return null;
  };

  // Flyout data — either a real section or a configured virtual section
  const hoveredVirtual = hoveredSection ? virtualByLabel[hoveredSection] : undefined;
  const hoveredData = hoveredVirtual
    ? null
    : (hoveredSection ? [...erpSections, ...systemSections, ...footerSections].find(s => (s as NavSection).label === hoveredSection) as NavSection | undefined : null);
  const flyoutItems = hoveredVirtual
    ? hoveredVirtual.items
    : (hoveredData ? getVisibleItems(hoveredData) : []);

  // Density from CSS variable
  const menuDensity = typeof document !== 'undefined' ? (getComputedStyle(document.documentElement).getPropertyValue('--menu-density')?.trim() || 'normal') : 'normal';
  const tight = menuDensity === 'tight';

  // Size-dependent styles (adjusted for density)
  const sizeConfig = tight
    ? { small: { w: 'w-52', fw: 'w-44', text: 'text-xs', py: 'py-1', px: 'px-3', mw: 208, itemH: 24 }, medium: { w: 'w-56', fw: 'w-48', text: 'text-xs', py: 'py-1', px: 'px-3', mw: 224, itemH: 26 }, large: { w: 'w-64', fw: 'w-52', text: 'text-sm', py: 'py-1.5', px: 'px-3', mw: 256, itemH: 30 } }[size]
    : { small: { w: 'w-56', fw: 'w-48', text: 'text-xs', py: 'py-1.5', px: 'px-3', mw: 224, itemH: 30 }, medium: { w: 'w-64', fw: 'w-56', text: 'text-sm', py: 'py-2', px: 'px-4', mw: 256, itemH: 36 }, large: { w: 'w-72', fw: 'w-60', text: 'text-sm', py: 'py-2.5', px: 'px-4', mw: 288, itemH: 40 } }[size];
  const menuGlass = glassStyle();
  const itemCls = `w-full flex items-center gap-2 rounded-lg ${sizeConfig.px} ${sizeConfig.py} ${sizeConfig.text}`;

  // Calculate flyout vertical position — center on hovered item, clamp so it
  // stays within the main menu's visible span (so it can't drift below the
  // menu bottom and overlap the taskbar). The first render uses a rough
  // estimate (`flyoutEstH`); a `useLayoutEffect` then captures the actual
  // rendered height in `measuredFlyoutH`, and the next paint repositions the
  // flyout using that measured value — so it never needs a scrollbar even
  // when labels wrap or dividers nudge the height past the estimate.
  const flyoutEstH = flyoutItems.length * sizeConfig.itemH + 12;
  const flyoutH = measuredFlyoutH ?? flyoutEstH;
  const menuWidth = sizeConfig.mw;
  const menuRect = menuRef.current?.getBoundingClientRect();
  const minTop = menuRect ? menuRect.top : (taskbarPosition === 'top' ? taskbarH + 4 : 4);
  const maxBottom = menuRect ? menuRect.bottom : (taskbarPosition === 'bottom' ? window.innerHeight - taskbarH - 4 : window.innerHeight - 4);
  let flyoutTop = hoveredY - flyoutH / 2;
  if (flyoutTop < minTop) flyoutTop = minTop;
  if (flyoutTop + flyoutH > maxBottom) flyoutTop = Math.max(minTop, maxBottom - flyoutH);

  const handleSectionHover = (label: string, e: React.MouseEvent) => {
    clearTimeout(hoverTimeout.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoveredY(rect.top + rect.height / 2);
    setHoveredSection(label);
  };

  const renderSection = (section: NavSection, isErp: boolean) => {
    if (section.perms && !hasAnyPerm(section.perms)) return null;
    const items = getVisibleItems(section);
    if (items.length === 0) return null;
    const isHovered = hoveredSection === section.label;
    return (
      <div key={section.label}
        onMouseEnter={e => handleSectionHover(section.label, e)}
        onMouseLeave={() => { hoverTimeout.current = setTimeout(() => setHoveredSection(null), 200); }}>
        <button className={`${itemCls} transition-colors ${isHovered ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>
          {secIcon(section.label)}
          <span className={isErp ? 'font-medium' : ''}>{section.label}</span>
          <svg className="h-3.5 w-3.5 ml-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>
    );
  };

  const renderVirtualSection = (v: VirtualSection) => {
    if (v.items.length === 0) return null;
    const isHovered = hoveredSection === v.label;
    return (
      <div key={v.label}
        onMouseEnter={e => handleSectionHover(v.label, e)}
        onMouseLeave={() => { hoverTimeout.current = setTimeout(() => setHoveredSection(null), 200); }}>
        <button className={`${itemCls} transition-colors ${isHovered ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>
          {v.icon}
          <span>{v.label}</span>
          <svg className="h-3.5 w-3.5 ml-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>
    );
  };

  return (
    <div ref={menuRef} className="fixed z-[260]" style={posStyle}>
      <div className="flex">
        {/* Main menu */}
        <div className={`${sizeConfig.w} rounded-2xl flex ${isVertical ? 'flex-col-reverse' : 'flex-col'} overflow-hidden`}
          style={{ animation: 'menu-in 0.15s ease-out', ...menuGlass }}>

          {/* Search — at top for horizontal, at bottom for vertical */}
          <div className={`px-3 ${isVertical ? 'pb-3 pt-2 border-t border-white/20' : 'pt-3 pb-2'}`}>
            <div className={`flex items-center gap-2 ${GLASS_INPUT_BG} rounded-lg px-2.5 py-1.5`}>
              <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              <input value={search} onChange={e => { setSearch(e.target.value); setHoveredSection(null); setSearchIdx(0); }}
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
            <div className="flex-1 overflow-y-auto px-1 pb-2 max-h-[400px]">
              {searchResults.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No results</p>
              ) : searchResults.map((r, i) => (
                <button key={i} onClick={() => handleClick(r.to)}
                  onMouseEnter={() => setSearchIdx(i)}
                  className={`${itemCls} transition-colors ${i === searchIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                  {iconEl(r.to)}
                  <span>{r.label}</span>
                  {r.section && <span className="text-[10px] text-gray-400 ml-auto">{r.section}</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-1 pb-1 flex flex-col">
              {isVertical && (<>
                {/* Reversed column → profile sits at the top, so footer items +
                    sections render first to stay pinned next to it. */}
                {footerItems.map(item => (
                  <button key={item.to} onClick={() => handleClick(item.to)}
                    className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                    {iconEl(item.to)}
                    <span>{item.label}</span>
                  </button>
                ))}
                {footerSections.map(s => renderSection(s as NavSection, false))}
                {(footerSections.length > 0 || footerItems.length > 0) && <div className="border-t border-white/20 my-1.5 mx-2" />}
                {/* Vertical layout: ERP sections first */}
                {erpSections.map(s => renderSection(s as NavSection, true))}
                <div className="border-t border-white/20 my-1.5 mx-2" />
                {/* Then top-level items + system */}
                {topItems.map(item => (
                  <div key={item.to}>
                    <button onClick={() => handleClick(item.to)}
                      className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                      {iconEl(item.to)}
                      <span>{item.label}</span>
                    </button>
                    {item.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
                  </div>
                ))}
                <button onClick={() => handleClick('/notifications')} className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                  <span>Notifications</span>
                </button>
{systemSections.map(s => renderSection(s as NavSection, false))}
                {virtualSections.map(v => renderVirtualSection(v))}
              </>)}

              {!isVertical && (<>
                {/* Horizontal layout: top-level items first, ERP after divider */}
                {topItems.map(item => (
                  <div key={item.to}>
                    <button onClick={() => handleClick(item.to)}
                      className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                      {iconEl(item.to)}
                      <span>{item.label}</span>
                    </button>
                    {item.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
                  </div>
                ))}
                <button onClick={() => handleClick('/notifications')} className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                  <span>Notifications</span>
                </button>
{systemSections.map(s => renderSection(s as NavSection, false))}
                {virtualSections.map(v => renderVirtualSection(v))}
                <div className="border-t border-white/20 my-1.5 mx-2" />
                {erpSections.map(s => renderSection(s as NavSection, true))}
                {/* Footer items + sections: pinned just above the profile, divided from ERP. */}
                {(footerSections.length > 0 || footerItems.length > 0) && <div className="border-t border-white/20 my-1.5 mx-2" />}
                {footerSections.map(s => renderSection(s as NavSection, false))}
                {footerItems.map(item => (
                  <button key={item.to} onClick={() => handleClick(item.to)}
                    className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                    {iconEl(item.to)}
                    <span>{item.label}</span>
                  </button>
                ))}
              </>)}
            </div>
          )}

          {/* User profile — name + sign out on same row */}
          <div className={`${isVertical ? 'border-b' : 'border-t'} border-white/20 p-1`}>
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

        {/* Flyout submenu — positioned vertically centered on hovered item.
            Height is left intrinsic; the useLayoutEffect above measures the
            rendered offsetHeight and `flyoutTop` clamps using that measured
            value, so the flyout shifts up to fit without ever scrolling. */}
        {hoveredSection && flyoutItems.length > 0 && search.length < 2 && (
          <div ref={flyoutRef} className={`fixed ${sizeConfig.fw} rounded-2xl overflow-hidden`}
            style={{ left: menuRef.current ? menuRef.current.getBoundingClientRect().right + 4 : menuWidth + 12, top: flyoutTop, animation: 'submenu-in 0.1s ease-out', ...menuGlass }}
            onMouseEnter={() => clearTimeout(hoverTimeout.current)}
            onMouseLeave={() => { hoverTimeout.current = setTimeout(() => { setHoveredSection(null); setHoveredChild(null); }, 200); }}>
            <div className="py-1 px-1">
              {flyoutItems.map(item => {
                const hasChildren = !!item.children && item.children.length > 0;
                const isChildHovered = hoveredChild === item.to;
                return (
                  <div key={item.to}
                    onMouseEnter={hasChildren ? (e) => {
                      clearTimeout(childHoverTimeout.current);
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setHoveredChildY(rect.top + rect.height / 2);
                      setHoveredChild(item.to);
                    } : () => {
                      // Hovering a leaf inside the flyout cancels any pending
                      // sub-flyout from a sibling that had children.
                      childHoverTimeout.current = setTimeout(() => setHoveredChild(null), 200);
                    }}>
                    <button onClick={() => handleClick(item.to)}
                      className={`${itemCls} transition-colors ${isChildHovered ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                      {iconEl(item.to)}
                      <span>{item.label}</span>
                      {hasChildren && (
                        <svg className="h-3.5 w-3.5 ml-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      )}
                    </button>
                    {item.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3rd-level flyout — anchored to the right of the level-2 flyout. */}
        {(() => {
          if (search.length >= 2 || !hoveredChild) return null;
          const parent = flyoutItems.find(it => it.to === hoveredChild);
          const kids = (parent?.children ?? []).filter(c => !c.perms || hasAnyPerm(c.perms));
          if (!parent || kids.length === 0) return null;
          const flyoutRect = flyoutRef.current?.getBoundingClientRect();
          const subLeft = flyoutRect ? flyoutRect.right + 4 : 0;
          const subEstH = kids.length * sizeConfig.itemH + 12;
          const subH = measuredSubH ?? subEstH;
          let subTop = hoveredChildY - subH / 2;
          if (subTop < minTop) subTop = minTop;
          if (subTop + subH > maxBottom) subTop = Math.max(minTop, maxBottom - subH);
          return (
            <div ref={subFlyoutRef} className={`fixed ${sizeConfig.fw} rounded-2xl overflow-hidden`}
              style={{ left: subLeft, top: subTop, animation: 'submenu-in 0.1s ease-out', ...menuGlass }}
              onMouseEnter={() => { clearTimeout(hoverTimeout.current); clearTimeout(childHoverTimeout.current); }}
              onMouseLeave={() => { childHoverTimeout.current = setTimeout(() => setHoveredChild(null), 200); }}>
              <div className="py-1 px-1">
                {kids.map(child => (
                  <div key={child.to}>
                    <button onClick={() => handleClick(child.to)}
                      className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}>
                      {iconEl(child.to)}
                      <span>{child.label}</span>
                    </button>
                    {child.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      <style>{`
        @keyframes menu-in { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes submenu-in { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
