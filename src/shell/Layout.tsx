import { useState, useEffect, useCallback, useRef, isValidElement, cloneElement, type ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';
import GlobalSearch, { type SearchConfig } from './GlobalSearch';
import ShortcutHelp from './ShortcutHelp';
import NotificationBell, { type NotificationsConfig } from './NotificationBell';
import { useWindowManager } from './WindowManager';
import Modal from './Modal';
import { useTheme } from '../hooks/useTheme';
import Desktop from './Desktop';
import GoogleConnectModal from './GoogleConnectModal';
import useGoogleAuth from '../hooks/useGoogleAuth';
import { useEmailUnreadCount } from '../hooks/useEmailUnread';
import useClickOutside from '../hooks/useClickOutside';
import { playStartup } from '../utils/sounds';
import { glassStyle as getGlassStyle } from '../utils/glass';
import { reportBug } from '../utils/reportBug';
import { useBugReport } from './BugReportDialog';
import StartupAnimation from './StartupAnimation';
import LogoutAnimation from './LogoutAnimation';
import StartMenu from './StartMenu';
import { PopupMenu, PopupMenuItem, PopupMenuDivider } from './PopupMenu';
import {
  navIcons as defaultNavIcons,
  sectionIcons as defaultSectionIcons,
  navSections as defaultNavSections,
  startMenuCategories as defaultCategories,
  isSection,
  type NavItem,
  type NavSection,
  type StartMenuCategories,
} from '../shell-config/nav';
import type { ReactNode } from 'react';

// Transitional re-exports — go away after each consumer migrates to importing
// nav data from their own shell-config rather than from <Layout>.
export {
  defaultNavIcons as navIcons,
  defaultSectionIcons as sectionIcons,
  defaultNavSections as navSections,
  isSection,
};
export type { NavItem, NavSection };

export interface LayoutProps {
  /** Brand label rendered on the start-menu button. */
  productName?: string;
  /** Icon URL rendered next to the brand label. Defaults to `/favicon.svg`. */
  productIcon?: string;
  /** Wallpaper image URLs for the desktop background. When omitted, the
   *  desktop renders with no image (just the dark fallback). */
  wallpapers?: string[];
  /** Override the default nav sections shown in the start menu. */
  navSections?: (NavSection | NavItem)[];
  /** Override the per-route icon map used by start menu and favorites. */
  navIcons?: Record<string, ReactNode>;
  /** Override the per-section header icon map used by start menu. */
  sectionIcons?: Record<string, ReactNode>;
  /** Override the start menu's section grouping + virtual flyouts. */
  categories?: StartMenuCategories;
  /** Notification system config — when omitted, the bell isn't rendered. */
  notifications?: NotificationsConfig;
  /** Universal search config — when omitted, Cmd-K opens the picker but no
   *  results ever come back. */
  search?: SearchConfig;
}


function ProfileMenu({ profile, user, onLogout, onNavigate }: { profile: any; user: any; onLogout: () => void; onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  useClickOutside(ref, useCallback(() => { if (open) setOpen(false); }, [open]));

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const taskbarPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
      // Center popup over button, clamp to viewport
      const popupW = 256; // w-64
      let left = rect.left + rect.width / 2 - popupW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - popupW - 8));
      if (taskbarPos === 'top') {
        setPos({ left, top: rect.bottom + 4 });
      } else {
        setPos({ left, bottom: window.innerHeight - rect.top + 4 });
      }
    }
  }, [open]);

  const groupNames: any[] = profile?.group_names ?? [];

  return (
    <div ref={ref} className="relative">
      <button ref={buttonRef} onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-200 transition-colors text-left shrink-0">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover border border-gray-300" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-bold text-gray-600">
            {(profile?.first_name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase()}
          </div>
        )}
        <span className="text-xs font-medium text-gray-700 hidden sm:inline">{profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email}</span>
      </button>

      {open && pos && (
        <PopupMenu minWidth={256} style={{ left: pos.left, ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }) }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200/60">
            <div className="flex items-center gap-3">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover border border-gray-300" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700">
                  {(profile?.first_name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            {groupNames.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {groupNames.map((g: any) => (
                  <span key={typeof g === 'string' ? g : g.name} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">
                    {typeof g === 'string' ? g : g.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Menu items */}
          <PopupMenuItem onClick={() => { setOpen(false); onNavigate('/profile'); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
            My Profile
          </PopupMenuItem>
          <PopupMenuItem onClick={() => { setOpen(false); onNavigate('/notifications'); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
            Notifications
          </PopupMenuItem>
          <PopupMenuItem onClick={() => { setOpen(false); onNavigate('/settings/favorites'); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
            Favorites
          </PopupMenuItem>
          <PopupMenuItem onClick={() => { setOpen(false); onNavigate('/settings/customization'); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg>
            Customization
          </PopupMenuItem>

          {/* Logout */}
          <PopupMenuDivider />
          <PopupMenuItem danger onClick={async () => {
            setOpen(false);
            const { confirm } = await import('./ConfirmDialog');
            const ok = await confirm({
              title: 'Sign Out',
              message: 'Do you want to log out? All windows will reopen when you log back in.',
              confirmLabel: 'Sign Out',
              cancelLabel: 'Cancel',
              variant: 'warning',
            });
            if (ok) onLogout();
          }}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
            Sign Out
          </PopupMenuItem>
        </PopupMenu>
      )}

    </div>
  );
}

const NAV_CATEGORIES = [
  { label: 'Clients', items: [
    { path: '/orders', label: 'Sales Orders' }, { path: '/invoices', label: 'Sales Invoices' },
    { path: '/warranty-claims', label: 'Warranty Claims' }, { path: '/clients', label: 'Clients' },
    { path: '/price-sheets', label: 'Price Sheets' },
  ]},
  { label: 'Vendors', items: [
    { path: '/vendor-orders', label: 'Purchase Orders' }, { path: '/qc-reports', label: 'QC Reports' },
    { path: '/production-progress', label: 'Production Progress' }, { path: '/vendor-shipments', label: 'Goods Receipt' },
    { path: '/vendor-invoices', label: 'Vendor Invoices' }, { path: '/vendor-payments', label: 'Vendor Payments' },
    { path: '/manufacturers', label: 'Vendors' }, { path: '/vendor-price-sheets', label: 'Vendor Price Sheets' },
  ]},
  { label: 'Inventory', items: [
    { path: '/goods-issue', label: 'Goods Issue' }, { path: '/stock-on-hand', label: 'Stock on Hand' },
    { path: '/warehouses', label: 'Warehouses' },
  ]},
  { label: 'Products', items: [
    { path: '/products', label: 'Part Numbers' }, { path: '/brands', label: 'Brands' },
    { path: '/designs', label: 'Designs' }, { path: '/wheel-finishes', label: 'Wheel Finishes' },
  ]},
  { label: 'R&D', items: [
    { path: '/projects', label: 'Projects' }, { path: '/proposals', label: 'Proposals' },
    { path: '/moulds', label: 'Moulds' }, { path: '/dfm-logs', label: 'DFM Logs' },
    { path: '/weight-logs', label: 'Weight Logs' },
  ]},
  { label: 'Finance', items: [
    { path: '/payments', label: 'Receipts' }, { path: '/bank-accounts', label: 'Bank Accounts' },
  ]},
];

function useFavorites(wallpapers?: string[]) {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ['my-profile-sidebar'],
    queryFn: () => apiClient.get('/auth/me/').then(r => r.data),
  });
  const favorites: string[] = (profile?.preferences || {}).favorite_pages || [];

  const toggle = useCallback((path: string) => {
    const current: string[] = (profile?.preferences || {}).favorite_pages || [];
    const next = current.includes(path) ? current.filter((p: string) => p !== path) : [...current, path];
    apiClient.patch('/auth/me/', {
      preferences: { ...(profile?.preferences || {}), favorite_pages: next },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    });
  }, [profile, queryClient]);

  const wallpaperPool = wallpapers && wallpapers.length > 0 ? wallpapers : [];
  const randomPickRef = useRef(wallpaperPool.length > 0 ? wallpaperPool[Math.floor(Math.random() * wallpaperPool.length)] : 'none');
  const rawBg: string = (profile?.preferences || {}).desktop_bg || (wallpaperPool.length > 0 ? 'random' : 'none');
  const desktopBg: string = rawBg === 'random' ? randomPickRef.current : rawBg;

  const setDesktopBg = useCallback((bg: string) => {
    apiClient.patch('/auth/me/', {
      preferences: { ...(profile?.preferences || {}), desktop_bg: bg },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
    });
  }, [profile, queryClient]);

  return { favorites, toggle, isFavorite: (path: string) => favorites.includes(path), desktopBg, setDesktopBg };
}

export { useFavorites };

/** Star button for list page titles — toggles favorite status */
export function FavoriteStar({ path }: { path?: string }) {
  const location = useLocation();
  const { isFavorite, toggle } = useFavorites();
  const currentPath = path || location.pathname;
  const fav = isFavorite(currentPath);
  return (
    <button onClick={() => toggle(currentPath)} title={fav ? 'Remove from favorites' : 'Add to favorites'}
      className={`shrink-0 transition-colors ${fav ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-yellow-400'}`}>
      <svg className="h-5 w-5" fill={fav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </button>
  );
}

export const ALL_TIMEZONES = [
  { tz: 'Pacific/Auckland', label: 'Auckland' }, { tz: 'Australia/Sydney', label: 'Sydney' },
  { tz: 'Australia/Adelaide', label: 'Adelaide' }, { tz: 'Australia/Brisbane', label: 'Brisbane' },
  { tz: 'Australia/Perth', label: 'Perth' }, { tz: 'Asia/Tokyo', label: 'Tokyo' },
  { tz: 'Asia/Seoul', label: 'Seoul' }, { tz: 'Asia/Shanghai', label: 'Shanghai' },
  { tz: 'Asia/Hong_Kong', label: 'Hong Kong' }, { tz: 'Asia/Singapore', label: 'Singapore' },
  { tz: 'Asia/Bangkok', label: 'Bangkok' }, { tz: 'Asia/Kolkata', label: 'Mumbai' },
  { tz: 'Asia/Dubai', label: 'Dubai' }, { tz: 'Europe/Moscow', label: 'Moscow' },
  { tz: 'Europe/Istanbul', label: 'Istanbul' }, { tz: 'Europe/Berlin', label: 'Berlin' },
  { tz: 'Europe/Paris', label: 'Paris' }, { tz: 'Europe/London', label: 'London' },
  { tz: 'America/Sao_Paulo', label: 'Sao Paulo' }, { tz: 'America/New_York', label: 'New York' },
  { tz: 'America/Chicago', label: 'Chicago' }, { tz: 'America/Denver', label: 'Denver' },
  { tz: 'America/Los_Angeles', label: 'Los Angeles' }, { tz: 'Pacific/Honolulu', label: 'Honolulu' },
  { tz: 'UTC', label: 'UTC' },
];

export function ClockContent({ localTz, worldClocks, now, fmtTime, fmtDate, fmtOffset, removeClock, adding, setAdding, addClock, availableToAdd, showAdd }: {
  localTz: string; worldClocks: string[]; now: Date;
  fmtTime: (tz: string) => string; fmtDate: (tz: string) => string; fmtOffset: (tz: string) => string;
  removeClock: (tz: string) => void; adding: boolean; setAdding: (v: boolean) => void; addClock: (tz: string) => void;
  availableToAdd: { tz: string; label: string }[]; showAdd: boolean;
}) {
  return (
    <>
      {/* Local time header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Local Time</p>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl font-semibold text-gray-900 tabular-nums">{fmtTime(localTz)}</span>
          <span className="text-xs text-gray-400">{fmtOffset(localTz)}</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{fmtDate(localTz)} &middot; {localTz.replace(/_/g, ' ')}</p>
      </div>

      {/* World clocks */}
      <div className="max-h-60 overflow-y-auto">
        {worldClocks.map(tz => {
          const info = ALL_TIMEZONES.find(t => t.tz === tz);
          const label = info?.label || tz.split('/').pop()?.replace(/_/g, ' ') || tz;
          return (
            <div key={tz} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 group">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-[10px] text-gray-400">{fmtDate(tz)} &middot; {fmtOffset(tz)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700 tabular-nums">{fmtTime(tz)}</span>
                <button onClick={() => removeClock(tz)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all" title="Remove">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          );
        })}
        {worldClocks.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No world clocks added</p>
        )}
      </div>

      {/* Add timezone — only shown when not pinned */}
      {showAdd && (
        <div className="border-t border-gray-200 p-2">
          {adding ? (
            <select autoFocus onChange={e => { if (e.target.value) addClock(e.target.value); }} onBlur={() => setAdding(false)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-blue-500">
              <option value="">Select timezone...</option>
              {availableToAdd.map(t => (
                <option key={t.tz} value={t.tz}>{t.label} ({fmtOffset(t.tz)})</option>
              ))}
            </select>
          ) : (
            <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add World Clock
            </button>
          )}
        </div>
      )}
    </>
  );
}

function TaskbarClock() {
  const [now, setNow] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['my-profile-sidebar'],
    queryFn: () => apiClient.get('/auth/me/').then(r => r.data),
  });
  const worldClocks: string[] = (profile?.preferences || {}).world_clocks || ['Europe/London', 'Asia/Shanghai', 'America/Los_Angeles', 'America/New_York'];

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  useClickOutside(ref, useCallback(() => { if (open && !pinned) { setOpen(false); setAdding(false); } }, [open, pinned]));

  const fmtTime = (tz: string) => now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const fmtDate = (tz: string) => now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
  const fmtOffset = (tz: string) => {
    const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
  };

  const saveClocks = (clocks: string[]) => {
    apiClient.patch('/auth/me/', { preferences: { world_clocks: clocks } }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
    });
  };

  const addClock = (tz: string) => {
    if (!worldClocks.includes(tz)) saveClocks([...worldClocks, tz]);
    setAdding(false);
  };

  const removeClock = (tz: string) => {
    saveClocks(worldClocks.filter(t => t !== tz));
  };

  const localTz = localStorage.getItem('user_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const availableToAdd = ALL_TIMEZONES.filter(t => t.tz !== localTz && !worldClocks.includes(t.tz));

  return (
    <div ref={ref} className="relative shrink-0">
      <button ref={buttonRef} onClick={() => setOpen(!open)} className="text-right leading-tight cursor-pointer hover:bg-gray-200/50 rounded px-1.5 py-0.5 transition-colors">
        <p className="text-[11px] font-medium text-gray-800">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>
        <p className="text-[10px] text-gray-700">{now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </button>

      {/* Clock popup — inline or pinned as widget */}
      {open && !pinned && (() => {
        const taskbarPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
        const rect = buttonRef.current?.getBoundingClientRect();
        const right = rect ? window.innerWidth - rect.right : 0;
        const posStyle = taskbarPos === 'top'
          ? { right, top: (rect?.bottom ?? 0) + 4 }
          : { right, bottom: window.innerHeight - (rect?.top ?? 0) + 4 };

        return (
          <div className="fixed z-[300] w-72 rounded-lg border border-gray-200 bg-white shadow-xl" style={posStyle}>
            {/* Pin button */}
            <button onClick={() => { setPinned(true); }} title="Pin as widget"
              className="absolute top-2 right-2 text-gray-300 hover:text-gray-600 transition-colors z-10">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 3.75L8.25 10.5m0 0l-3-1.5L3 12.75l5.25 5.25 3.75-2.25-1.5-3L17.25 6M8.25 10.5l-3 3M17.25 6l3 3" /></svg>
            </button>
            <ClockContent localTz={localTz} worldClocks={worldClocks} now={now} fmtTime={fmtTime} fmtDate={fmtDate} fmtOffset={fmtOffset}
              removeClock={removeClock} adding={adding} setAdding={setAdding} addClock={addClock} availableToAdd={availableToAdd} showAdd />
          </div>
        );
      })()}

      {/* Pinned widget — rendered as a draggable Modal */}
      {pinned && (
        <Modal open={true} onClose={() => { setPinned(false); setOpen(false); }}
          title={<span className="flex items-center gap-1.5"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>World Clock</span>}
          size="sm" allowPinOnTop initialPosition="top-right" widget>
          <ClockContent localTz={localTz} worldClocks={worldClocks} now={now} fmtTime={fmtTime} fmtDate={fmtDate} fmtOffset={fmtOffset}
            removeClock={removeClock} adding={adding} setAdding={setAdding} addClock={addClock} availableToAdd={availableToAdd} showAdd={false} />
        </Modal>
      )}
    </div>
  );
}

function TaskbarContextMenu({ x, y, position, size, onChangePosition, onChangeSize, onClose, onReportBug }: {
  x: number; y: number; position: string; size: string;
  onChangePosition: (v: string) => void; onChangeSize: (v: string) => void; onClose: () => void;
  onReportBug?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  const posStyle: React.CSSProperties =
    position === 'top' ? { left: Math.min(x, window.innerWidth - 200), top: y + 4 } :
    position === 'left' ? { left: x + 4, top: Math.min(y, window.innerHeight - 300) } :
    position === 'right' ? { right: window.innerWidth - x + 4, top: Math.min(y, window.innerHeight - 300) } :
    { left: Math.min(x, window.innerWidth - 200), bottom: window.innerHeight - y + 4 };

  const check = (active: boolean) => active
    ? <svg className="h-3.5 w-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
    : <span className="w-3.5" />;

  return (
    <div ref={ref} className="fixed z-[400] rounded-2xl py-1 min-w-[180px]" style={{ ...posStyle, ...getGlassStyle() }}>
      <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Position</p>
      {(['bottom', 'top', 'left', 'right'] as const).map(pos => (
        <button key={pos} onClick={() => onChangePosition(pos)}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors rounded-lg mx-1 flex items-center gap-2" style={{ width: 'calc(100% - 8px)' }}>
          {check(position === pos)}
          {pos.charAt(0).toUpperCase() + pos.slice(1)}
        </button>
      ))}
      <div className="border-t border-white/20 my-1 mx-3" />
      <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Size</p>
      {(['small', 'medium', 'large'] as const).map(s => (
        <button key={s} onClick={() => onChangeSize(s)}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors rounded-lg mx-1 flex items-center gap-2" style={{ width: 'calc(100% - 8px)' }}>
          {check(size === s)}
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </button>
      ))}
      {onReportBug && <>
        <div className="border-t border-white/20 my-1 mx-3" />
        <button onClick={() => { onClose(); onReportBug(); }}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors rounded-lg mx-1 flex items-center gap-2" style={{ width: 'calc(100% - 8px)' }}>
          <span className="w-3.5 shrink-0" />
          Report Bug
        </button>
      </>}
    </div>
  );
}

export default function Layout({
  productName = 'react-os-shell',
  productIcon = '/favicon.svg',
  wallpapers,
  navSections = defaultNavSections,
  navIcons = defaultNavIcons,
  sectionIcons = defaultSectionIcons,
  categories = defaultCategories,
  notifications,
  search,
}: LayoutProps = {}) {
  const bugReport = useBugReport();
  const { user, logout, hasAnyPerm } = useAuth();
  const { openPage, openEntity, openWindows } = useWindowManager();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const emailUnreadCount = useEmailUnreadCount();

  const { data: profile } = useQuery({
    queryKey: ['my-profile-sidebar'],
    queryFn: () => apiClient.get('/auth/me/').then(r => r.data),
    enabled: !!user,
  });

  useTheme();
  const { favorites, toggle: toggleFavorite, isFavorite, desktopBg, setDesktopBg } = useFavorites(wallpapers);

  // Preferences
  const prefs = profile?.preferences || {};

  // Taskbar layout
  const taskbarPosition: string = prefs.taskbar_position || 'bottom';
  const taskbarSize: string = prefs.taskbar_size || 'medium';
  const desktopDblClick: string = prefs.desktop_dblclick || 'deactivate';

  const isVerticalTaskbar = taskbarPosition === 'left' || taskbarPosition === 'right';
  const taskbarH = isVerticalTaskbar ? 0 : (taskbarSize === 'small' ? 40 : taskbarSize === 'large' ? 72 : 56);
  const taskbarW = isVerticalTaskbar ? (taskbarSize === 'small' ? 180 : taskbarSize === 'large' ? 260 : 220) : 0;
  const taskbarHClass = taskbarSize === 'small' ? 'h-10' : taskbarSize === 'large' ? 'h-[72px]' : 'h-14';
  const taskbarWClass = taskbarSize === 'small' ? 'w-[180px]' : taskbarSize === 'large' ? 'w-[260px]' : 'w-[220px]';
  // Transparency preferences → CSS custom properties for Modal.tsx to read
  const taskbarOpacity = (prefs.transparency_taskbar ?? 70) / 100;
  const menuOpacity = (prefs.transparency_start_menu ?? 95) / 100;
  const inactiveHeaderOpacity = (prefs.transparency_inactive_header ?? 70) / 100;
  const inactiveContentOpacity = (prefs.transparency_inactive_content ?? 80) / 100;
  const activeHeaderOpacity = (prefs.transparency_active_header ?? 80) / 100;
  const activeContentOpacity = (prefs.transparency_active_content ?? 90) / 100;
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--inactive-header-opacity', String(inactiveHeaderOpacity));
    root.style.setProperty('--inactive-content-opacity', String(inactiveContentOpacity));
    root.style.setProperty('--active-header-opacity', String(activeHeaderOpacity));
    root.style.setProperty('--active-content-opacity', String(activeContentOpacity));
    root.style.setProperty('--menu-opacity', String(menuOpacity));
    root.style.setProperty('--taskbar-height', String(taskbarH));
    root.style.setProperty('--taskbar-width', String(taskbarW));
    root.style.setProperty('--taskbar-position', taskbarPosition);
    root.style.setProperty('--default-window-size', prefs.default_window_size || 'large');
    root.style.setProperty('--window-position', prefs.window_position || 'cascade');
    root.style.setProperty('--menu-density', prefs.menu_density || 'normal');
    // Menu size — affects font size and item padding across PopupMenu (context menus, dropdowns, notification popup, etc.)
    // Also drives the taskbar window-tab width so it stays proportional.
    const menuSize = prefs.start_menu_size || 'medium';
    const sizeVars: Record<string, { font: string; px: string; py: string; tabW: string; tabFont: string }> = {
      small:  { font: '12px', px: '0.75rem',  py: '0.25rem',  tabW: '150px', tabFont: '11px' },
      medium: { font: '14px', px: '1rem',     py: '0.5rem',   tabW: '200px', tabFont: '12px' },
      large:  { font: '15px', px: '1.125rem', py: '0.625rem', tabW: '240px', tabFont: '13px' },
    };
    const sv = sizeVars[menuSize] || sizeVars.medium;
    root.style.setProperty('--menu-font-size', sv.font);
    root.style.setProperty('--menu-padding-x', sv.px);
    root.style.setProperty('--menu-padding-y', sv.py);
    root.style.setProperty('--window-tab-width', sv.tabW);
    root.style.setProperty('--window-tab-font-size', sv.tabFont);
  }, [inactiveHeaderOpacity, inactiveContentOpacity, activeHeaderOpacity, activeContentOpacity, taskbarH, taskbarPosition, prefs.default_window_size, prefs.window_position, prefs.menu_density, prefs.start_menu_size]);
  const [balloonDismissed, setBalloonDismissed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [taskbarMenu, setTaskbarMenu] = useState<{ x: number; y: number } | null>(null);
  const [googleConnectOpen, setGoogleConnectOpen] = useState(false);
  const { isConnected: googleConnected } = useGoogleAuth();
  const [showLogout, setShowLogout] = useState(false);

  // Allow child pages to open Google Connection Center
  useEffect(() => {
    const handler = () => setGoogleConnectOpen(true);
    window.addEventListener('open-google-connect', handler);
    return () => window.removeEventListener('open-google-connect', handler);
  }, []);

  const savePref = useCallback((key: string, value: any) => {
    apiClient.patch('/auth/me/', { preferences: { [key]: value } }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
    });
  }, [queryClient]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      // Release keyboard lock before exiting
      if ((navigator as any).keyboard?.unlock) (navigator as any).keyboard.unlock();
      document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
      // Lock Escape key so it goes to our app instead of exiting fullscreen
      if ((navigator as any).keyboard?.lock) {
        try { await (navigator as any).keyboard.lock(['Escape']); } catch { /* not supported or denied */ }
      }
    }
  }, []);

  // Sync fullscreen state with browser
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Release keyboard lock when exiting fullscreen
      if (!document.fullscreenElement && (navigator as any).keyboard?.unlock) {
        (navigator as any).keyboard.unlock();
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Auto-fullscreen on login
  const autoFullscreenDone = useRef(false);
  useEffect(() => {
    if (autoFullscreenDone.current) return;
    if (prefs.auto_fullscreen && !document.fullscreenElement) {
      autoFullscreenDone.current = true;
      // Needs a user gesture — use a one-time click listener
      const handler = async () => {
        if (!document.fullscreenElement) {
          try {
            await document.documentElement.requestFullscreen();
            if ((navigator as any).keyboard?.lock) (navigator as any).keyboard.lock(['Escape']).catch(() => {});
          } catch {}
        }
        document.removeEventListener('click', handler);
      };
      document.addEventListener('click', handler, { once: true });
    }
  }, [prefs.auto_fullscreen]);

  // Startup animation + sound
  const [showStartup, setShowStartup] = useState(false);
  const startupChecked = useRef(false);
  useEffect(() => {
    if (startupChecked.current) return;
    startupChecked.current = true;
    const key = 'erp_startup_shown';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      setShowStartup(true);
    }
  }, []);

  const startupSoundDone = useRef(false);
  useEffect(() => {
    if (startupSoundDone.current || !showStartup) return;
    startupSoundDone.current = true;
    setTimeout(() => playStartup(), 500);
  }, [showStartup]);

  // Hotkey: Ctrl+. / Cmd+. to toggle menu, F11 to toggle fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        setMenuOpen(prev => !prev);
      }
      if (e.ctrlKey && e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
      if (e.key === 'Escape' && document.fullscreenElement) {
        // Only exit fullscreen if no modals are open (let modals handle Escape first)
        const hasOpenModals = document.querySelectorAll('[data-modal-panel]').length > 0;
        if (!hasOpenModals) {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); };
  }, [toggleFullscreen]);

  return (
    <div className="flex flex-col h-screen">
      {showStartup && <StartupAnimation onComplete={() => setShowStartup(false)} ready={!!profile} />}
      {showLogout && <LogoutAnimation onComplete={() => { sessionStorage.removeItem('erp_startup_shown'); logout(); }} />}
      {/* Start Menu */}
      {(
        <StartMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          openPage={(path) => { openPage(path); setMenuOpen(false); }}
          openWindows={openWindows}
          profile={profile}
          user={user}
          onLogout={() => setShowLogout(true)}
          onNavigate={(path) => { openPage(path); setMenuOpen(false); }}
          taskbarPosition={taskbarPosition as 'top' | 'bottom' | 'left' | 'right'}
          taskbarH={taskbarH}
          taskbarW={taskbarW}
          size={(prefs.start_menu_size || 'medium') as 'small' | 'medium' | 'large'}
          navSections={navSections}
          navIcons={navIcons}
          sectionIcons={sectionIcons}
          categories={categories}
        />
      )}

      <div className="flex flex-1 min-h-0">
      <main
        className="flex-1 flex flex-col overflow-hidden cursor-default"
        onDoubleClick={() => {
          if (desktopDblClick === 'deactivate') { setMenuOpen(false); window.dispatchEvent(new CustomEvent('deactivate-all-modals')); }
        }}
        style={{
          backgroundColor: desktopBg?.startsWith('#') ? desktopBg : desktopBg === 'none' ? (() => {
            const customBg = getComputedStyle(document.documentElement).getPropertyValue('--custom-bg-color')?.trim();
            if (customBg) return customBg;
            const t = document.documentElement.getAttribute('data-theme') || 'light';
            const map: Record<string, string> = { light: '#f3f4f6', dark: '#1e1e2e', pink: '#fdf2f8', green: '#f0fdf4', grey: '#d1d5db', blue: '#eff6ff' };
            return map[t] || '#f3f4f6';
          })() : '#1a1a2e',
          backgroundImage: desktopBg && desktopBg !== 'none' && !desktopBg.startsWith('#') ? `url(${desktopBg})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Desktop with shortcuts, folders, and context menu */}
        <Desktop profile={profile} />
      </main>
      </div>

      {/* Taskbar — overlays content for transparency */}
      <div className={`flex backdrop-blur-sm border-gray-200 z-[250] fixed ${
        isVerticalTaskbar
          ? `flex-col items-center ${taskbarWClass} py-3 gap-2 top-0 bottom-0 ${taskbarPosition === 'left' ? 'left-0 border-r' : 'right-0 border-l'}`
          : `items-center ${taskbarHClass} px-3 gap-2 left-0 right-0 ${taskbarPosition === 'top' ? 'top-0 border-b' : 'bottom-0 border-t'}`
      }`}
        style={{ backgroundColor: `rgb(var(--taskbar-bg-rgb, 243 244 246) / ${taskbarOpacity})` }}
        onContextMenu={e => { e.preventDefault(); setTaskbarMenu({ x: e.clientX, y: e.clientY }); }}>
        {/* ERP button — toggles Start Menu */}
        <div className="relative shrink-0">
          {openWindows.length === 0 && !menuOpen && !balloonDismissed && (
            <div className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-white text-[10px] font-medium pl-3 pr-2 py-1 rounded-full shadow-lg animate-bounce flex items-center gap-1 ${taskbarPosition === 'top' ? 'top-full mt-2' : '-top-8'}`}
              style={{ backgroundColor: 'var(--accent-600, #7c3aed)' }}>
              Click here to start
              <button onClick={(e) => { e.stopPropagation(); setBalloonDismissed(true); }} className="text-white/60 hover:text-white ml-1.5">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className={`absolute left-1/2 -translate-x-1/2 border-[6px] border-transparent ${taskbarPosition === 'top' ? 'bottom-full border-b-[var(--accent-color,#7c3aed)]' : 'top-full border-t-[var(--accent-color,#7c3aed)]'}`}
                style={taskbarPosition === 'top' ? { borderBottomColor: 'var(--accent-600, #7c3aed)' } : { borderTopColor: 'var(--accent-600, #7c3aed)' }} />
            </div>
          )}
          <button data-menu-toggle onClick={() => setMenuOpen(prev => !prev)} title={menuOpen ? 'Close menu' : 'Open menu'}
            className={`group/erp relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium border overflow-hidden transition-all ${isVerticalTaskbar ? 'w-full' : 'min-w-[140px]'} ${menuOpen ? 'bg-gray-200/40 border-gray-300/40 text-gray-800' : 'bg-gray-50/40 border-gray-200/40 text-gray-600 hover:text-gray-800'}`}
            style={{ transition: 'box-shadow 0.3s, border-color 0.3s' }}
            onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`); }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 15px rgba(255,255,255,0.2), 0 0 30px rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = ''; }}>
            <span className="absolute inset-0 opacity-0 group-hover/erp:opacity-100 transition-opacity duration-200 pointer-events-none"
              style={{ background: 'radial-gradient(circle 60px at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.25) 0%, transparent 100%)' }} />
            {productIcon && <img src={productIcon} alt="" className="relative z-10 h-3.5 w-3.5 shrink-0 opacity-60" />}
            <span className="relative z-10 truncate">{productName}</span>
          </button>
        </div>

        {/* Separator */}
        <div className={isVerticalTaskbar ? 'h-px w-6 bg-gray-300 my-1' : 'w-px h-6 bg-gray-300 mx-1'} />

        {/* Window tabs rendered here by WindowManagerProvider */}
        <div id="taskbar-windows" className={`flex-1 flex ${isVerticalTaskbar ? 'flex-col items-center gap-1 min-h-0 overflow-y-auto w-full' : 'items-center gap-1.5 min-w-0 overflow-x-auto'}`} />

        {/* Separator */}
        <div className={isVerticalTaskbar ? 'h-px w-6 bg-gray-300 my-1' : 'w-px h-6 bg-gray-300 mx-1'} />

        {/* System tray */}
        {isVerticalTaskbar ? (
          /* Vertical: clock + bell + google evenly spaced in a row */
          <div className="w-full px-2">
            <div className={`flex items-center justify-center gap-2 ${taskbarPosition === 'right' ? 'flex-row-reverse' : ''}`}>
              <TaskbarClock />
              <button onClick={() => setGoogleConnectOpen(true)} title={googleConnected ? 'Google Connected' : 'Connect Google'}
                className={`shrink-0 rounded-md p-1.5 transition-colors ${googleConnected ? 'hover:bg-green-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill={googleConnected ? '#16a34a' : '#9ca3af'} />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={googleConnected ? '#16a34a' : '#9ca3af'} />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={googleConnected ? '#16a34a' : '#9ca3af'} />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={googleConnected ? '#16a34a' : '#9ca3af'} />
                </svg>
              </button>
              {notifications && <NotificationBell {...notifications} popDirection={taskbarPosition === 'right' ? 'left' : 'right'} />}
            </div>
          </div>
        ) : (
          /* Horizontal: icons then clock */
          <>
            {notifications && <NotificationBell {...notifications} />}
            <button onClick={() => setGoogleConnectOpen(true)} title={googleConnected ? 'Google Connected' : 'Connect Google'}
              className={`shrink-0 rounded-md p-2 transition-colors ${googleConnected ? 'hover:bg-green-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill={googleConnected ? '#16a34a' : '#9ca3af'} />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={googleConnected ? '#16a34a' : '#9ca3af'} />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={googleConnected ? '#16a34a' : '#9ca3af'} />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={googleConnected ? '#16a34a' : '#9ca3af'} />
              </svg>
            </button>
            <TaskbarClock />
          </>
        )}
      </div>

      {/* Taskbar context menu */}
      {taskbarMenu && (
        <TaskbarContextMenu
          x={taskbarMenu.x} y={taskbarMenu.y}
          position={taskbarPosition}
          size={taskbarSize}
          onChangePosition={v => { savePref('taskbar_position', v); setTaskbarMenu(null); }}
          onChangeSize={v => { savePref('taskbar_size', v); setTaskbarMenu(null); }}
          onClose={() => setTaskbarMenu(null)}
          onReportBug={bugReport ? () => reportBug(bugReport.submit) : undefined}
        />
      )}

      <GlobalSearch {...search} />
      <ShortcutHelp />
      <GoogleConnectModal open={googleConnectOpen} onClose={() => setGoogleConnectOpen(false)} />
    </div>
  );
}
