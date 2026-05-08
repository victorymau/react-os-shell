/**
 * Sidebar — persistent left strip used when `prefs.layout_mode === 'sidebar'`.
 *
 * Same configuration surface as <StartMenu> (navSections, navIcons,
 * sectionIcons, categories) but rendered inline:
 *   - No flyouts. Sections expand/collapse accordion-style below their
 *     header, indented one step.
 *   - No taskbar-anchored positioning — fixed full-height left strip,
 *     width pulled from `--sidebar-width`.
 *   - Right edge `rounded-r-2xl` so it matches windowed cards on the
 *     right (which use `rounded-2xl`).
 *
 * Designed for small-screen layouts where flyouts would clip and where
 * keeping the menu always-visible saves a tap to switch apps.
 */

import { useEffect, useMemo, useRef, useState, isValidElement, cloneElement, type ReactElement, type ReactNode } from 'react';
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

interface SidebarProps {
  width: number;
  openPage: (path: string) => void;
  profile: any;
  user: any;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  navSections?: (NavSection | NavItem)[];
  navIcons?: Record<string, ReactNode>;
  sectionIcons?: Record<string, ReactNode>;
  categories?: StartMenuCategories;
  productName?: string;
  productIcon?: string;
}

export default function Sidebar({
  width,
  openPage,
  profile,
  user,
  onLogout,
  onNavigate,
  navSections = defaultNavSections,
  navIcons = defaultNavIcons,
  sectionIcons = defaultSectionIcons,
  categories = defaultCategories,
  productName,
  productIcon,
}: SidebarProps) {
  const { hasAnyPerm } = useAuth();
  const erpLabels = new Set(categories.erp);
  const systemLabels = new Set(categories.system);
  const virtualSections = categories.virtual ?? [];

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleExpanded = (label: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Top-level items vs sections, mirroring StartMenu's split.
  const topItems = navSections.filter(item => !isSection(item)) as NavItem[];
  const erpSections = navSections.filter(item => isSection(item) && erpLabels.has((item as NavSection).label)) as NavSection[];
  const systemSections = navSections.filter(item => isSection(item) && systemLabels.has((item as NavSection).label)) as NavSection[];

  const getVisibleItems = (section: { items: NavItem[]; perms?: string[] }) => {
    if (section.perms && !hasAnyPerm(section.perms)) return [];
    return section.items.filter(it => !it.perms || hasAnyPerm(it.perms));
  };

  // Search across all items + sections (same flat list StartMenu uses).
  const searchResults = useMemo(() => {
    if (search.length < 2) return [] as NavItem[];
    const q = search.toLowerCase();
    return navSections.flatMap((entry) => {
      if (isSection(entry)) {
        return getVisibleItems(entry).filter(it => it.label.toLowerCase().includes(q));
      }
      return entry.label.toLowerCase().includes(q) ? [entry] : [];
    });
  }, [search, navSections, hasAnyPerm]);

  // Esc collapses any expanded section + clears search; '/' focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(new Set());
        setSearch('');
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleClick = (path: string) => {
    onNavigate(path);
    onPageOpenedReset();
  };

  // Reset search after navigating so the next visit starts clean.
  const onPageOpenedReset = () => {
    setSearch('');
  };

  const itemCls = 'w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm';
  const menuGlass = glassStyle();

  // Helper that returns the (possibly recolored) per-route icon.
  const iconEl = (to: string) => {
    const icon = navIcons[to];
    if (icon && isValidElement(icon)) {
      return cloneElement(icon as ReactElement<{ className?: string }>, {
        className: 'h-4 w-4 shrink-0 text-gray-500',
      });
    }
    return <span className="h-4 w-4 shrink-0" />;
  };

  const secIcon = (label: string) => {
    const icon = sectionIcons[label];
    if (icon && isValidElement(icon)) {
      return cloneElement(icon as ReactElement<{ className?: string }>, {
        className: 'h-4 w-4 shrink-0 text-gray-500',
      });
    }
    return <span className="h-4 w-4 shrink-0" />;
  };

  const renderItem = (item: NavItem) => (
    <div key={item.to}>
      <button
        onClick={() => handleClick(item.to)}
        className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}
      >
        {iconEl(item.to)}
        <span className="truncate">{item.label}</span>
      </button>
      {item.dividerAfter && <div className="border-t border-white/20 my-1.5 mx-2" />}
    </div>
  );

  const renderSectionAccordion = (section: NavSection | VirtualSection, isErp: boolean) => {
    const items = 'perms' in section
      ? getVisibleItems(section as NavSection)
      : (section as VirtualSection).items;
    if (items.length === 0) return null;
    const isOpen = expanded.has(section.label);
    return (
      <div key={section.label}>
        <button
          onClick={() => toggleExpanded(section.label)}
          aria-expanded={isOpen}
          className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}
        >
          {'icon' in section && section.icon
            ? section.icon
            : secIcon(section.label)}
          <span className={`truncate ${isErp ? 'font-medium' : ''}`}>{section.label}</span>
          <svg
            className={`h-3.5 w-3.5 ml-auto text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        {isOpen && (
          <div className="pl-4 mt-0.5 mb-1 space-y-0.5">
            {items.map(it => (
              <button
                key={it.to}
                onClick={() => handleClick(it.to)}
                className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}
              >
                {iconEl(it.to)}
                <span className="truncate">{it.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed top-0 left-0 bottom-0 z-[260] flex flex-col rounded-r-2xl overflow-hidden"
      style={{ width, ...menuGlass }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/15 shrink-0">
        {productIcon && <img src={productIcon} alt="" className="h-5 w-5 shrink-0 opacity-80" />}
        <span className="text-sm font-semibold text-gray-800 truncate">{productName ?? 'Apps'}</span>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className={`flex items-center gap-2 ${GLASS_INPUT_BG} rounded-lg px-2.5 py-1.5`}>
          <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-xs outline-none placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 text-xs">×</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-1 pb-1">
        {search.length >= 2 ? (
          // Search results take over the body.
          <div>
            {searchResults.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-400">No matches</div>
            ) : (
              searchResults.map(r => (
                <button
                  key={r.to}
                  onClick={() => handleClick(r.to)}
                  className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}
                >
                  {iconEl(r.to)}
                  <span className="truncate">{r.label}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Top-level apps */}
            {topItems.map(renderItem)}

            {/* Notifications row (mirrors StartMenu) */}
            <button
              onClick={() => handleClick('/notifications')}
              className={`${itemCls} text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors`}
            >
              <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <span>Notifications</span>
            </button>

            <div className="border-t border-white/15 my-1.5 mx-2" />

            {/* ERP sections then system sections — same order as StartMenu's vertical layout. */}
            {erpSections.map(s => renderSectionAccordion(s, true))}
            {systemSections.map(s => renderSectionAccordion(s, false))}
            {virtualSections.map(v => renderSectionAccordion(v, false))}
          </>
        )}
      </div>

      {/* Profile + Sign out at the bottom — mirrors StartMenu's user row. */}
      <div className="border-t border-white/15 p-1 shrink-0">
        <div
          onClick={() => handleClick('/profile')}
          className="rounded-lg px-2 py-1.5 flex items-center gap-2.5 hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer"
        >
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
          <button
            onClick={e => { e.stopPropagation(); onLogout(); }}
            title="Sign Out"
            className="shrink-0 p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
