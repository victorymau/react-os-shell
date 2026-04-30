/**
 * Mobile shell — phone/tablet-portrait replacement for the desktop <Layout>
 * chrome (taskbar / start-menu sidebar / windowed apps).
 *
 * Modes (mobileShellStore):
 *   home     — full-screen icon grid (folders + apps)
 *   switcher — Chrome-tab-style snapshot grid of open apps
 *   app      — current Modal renders fullscreen; we just paint the bottom nav
 *
 * The bottom nav surfaces four entry points: Home, Apps switcher,
 * Notifications (sheet), Profile (sheet). Notifications and Profile sheets
 * live as MobileShell-owned state so they don't pollute the global mode
 * machine.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useWindowManager } from './WindowManager';
import { activateModal } from './Modal';
import { getMobileMode, setMobileMode, subscribeMobileMode } from './mobileShellStore';
import { WINDOW_REGISTRY, isPageEntry, type PageRegistryEntry } from '../windowRegistry/types';
import MobileHome from './MobileHome';
import MobileSwitcher from './MobileSwitcher';
import MobileNotificationSheet from './MobileNotificationSheet';
import MobileProfileSheet from './MobileProfileSheet';
import type { NavItem, NavSection } from './nav-types';
import type { NotificationsConfig } from './NotificationBell';

interface MobileShellProps {
  productName?: string;
  productIcon?: string;
  navSections: (NavSection | NavItem)[];
  navIcons: Record<string, ReactNode>;
  sectionIcons: Record<string, ReactNode>;
  /** Wallpaper / background style computed by Layout — applied to the home
   *  overlay so the user's chosen wallpaper carries onto mobile. */
  wallpaperStyle?: React.CSSProperties;
  /** Notification system config — when omitted, the bell button is hidden. */
  notifications?: NotificationsConfig;
  /** User profile (`first_name`, `last_name`, `avatar_url`, `group_names`). */
  profile?: any;
  /** Auth user (`email`). */
  user?: any;
  /** Open a route in the shell — used by the profile sheet. */
  onNavigate?: (path: string) => void;
  /** Logout handler — wired to Layout's logout-animation trigger. */
  onLogout?: () => void;
}

export default function MobileShell({
  navSections,
  navIcons,
  sectionIcons,
  wallpaperStyle,
  notifications,
  profile,
  user,
  onNavigate,
  onLogout,
}: MobileShellProps) {
  const { openWindows, openPage, closeEntity } = useWindowManager();
  const mode = useSyncExternalStore(subscribeMobileMode, getMobileMode);
  const [sheet, setSheet] = useState<'notifications' | 'profile' | null>(null);
  const unreadCount = notifications?.useUnreadCount() ?? 0;

  // The Apps switcher and the open-app count badge ignore widget windows —
  // widgets render directly on the home screen, so they shouldn't pollute the
  // "running apps" view.
  const switcherWindows = useMemo(() => {
    return openWindows.filter(w => {
      if (!w.route) return true;
      const entry = WINDOW_REGISTRY[w.route];
      if (!entry || !isPageEntry(entry)) return true;
      return !(entry as PageRegistryEntry).widget;
    });
  }, [openWindows]);

  // When the user closes an app, go back to home — even if other apps are
  // still open. Mirrors phone-OS expectations (close = back to launcher).
  const prevOpenCountRef = useRef(openWindows.length);
  useEffect(() => {
    if (openWindows.length < prevOpenCountRef.current && mode === 'app') {
      setMobileMode('home');
    }
    prevOpenCountRef.current = openWindows.length;
  }, [openWindows.length, mode]);

  const activateWindowById = (windowId: string) => {
    const panel = document.querySelector(`[data-modal-panel][data-window-key="${windowId}"]`);
    const mid = panel?.getAttribute('data-modal-id');
    if (mid) activateModal(mid);
  };

  const handleOpenApp = (path: string) => {
    openPage(path);
    setMobileMode('app');
  };

  const handleActivateWindow = (id: string) => {
    activateWindowById(id);
    setMobileMode('app');
  };

  const closeSheet = () => setSheet(null);

  return (
    <>
      {/* Home overlay — wallpaper underneath, content scrolls over it */}
      {mode === 'home' && (
        <div
          className="fixed inset-0 z-[200]"
          style={{
            ...wallpaperStyle,
            paddingBottom: 'var(--mobile-bottom-nav, 70px)',
          }}
        >
          <MobileHome
            navSections={navSections}
            navIcons={navIcons}
            sectionIcons={sectionIcons}
            openWindows={openWindows}
            onOpenApp={handleOpenApp}
            onActivateWindow={handleActivateWindow}
          />
        </div>
      )}

      {/* Switcher overlay — widgets are excluded so it shows only real apps. */}
      {mode === 'switcher' && (
        <div className="fixed inset-0 z-[200] bg-gray-900/95 backdrop-blur-sm" style={{ paddingBottom: 'var(--mobile-bottom-nav, 70px)' }}>
          <MobileSwitcher
            windows={switcherWindows}
            onActivate={handleActivateWindow}
            onClose={(id) => closeEntity(id)}
            onCloseAll={() => switcherWindows.forEach(w => closeEntity(w.id))}
          />
        </div>
      )}

      {/* Notification sheet */}
      {sheet === 'notifications' && notifications && (
        <MobileNotificationSheet config={notifications} onClose={closeSheet} />
      )}

      {/* Profile sheet */}
      {sheet === 'profile' && (
        <MobileProfileSheet
          profile={profile}
          user={user}
          onClose={closeSheet}
          onNavigate={(path) => { onNavigate?.(path); }}
          onLogout={() => onLogout?.()}
        />
      )}

      {/* Bottom nav — always visible, sits above modals AND overlays */}
      <MobileBottomNav
        mode={mode}
        unreadCount={unreadCount}
        showNotifications={!!notifications}
        profileAvatar={profile?.avatar_url}
        profileInitial={(profile?.first_name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase()}
        onHome={() => { closeSheet(); setMobileMode('home'); }}
        onSwitcher={() => { closeSheet(); setMobileMode('switcher'); }}
        onNotifications={() => setSheet(sheet === 'notifications' ? null : 'notifications')}
        onProfile={() => setSheet(sheet === 'profile' ? null : 'profile')}
      />
    </>
  );
}

interface MobileBottomNavProps {
  mode: 'home' | 'switcher' | 'app';
  unreadCount: number;
  showNotifications: boolean;
  profileAvatar?: string;
  profileInitial: string;
  onHome: () => void;
  onSwitcher: () => void;
  onNotifications: () => void;
  onProfile: () => void;
}

function MobileBottomNav({
  mode, unreadCount, showNotifications,
  profileAvatar, profileInitial,
  onHome, onSwitcher, onNotifications, onProfile,
}: MobileBottomNavProps) {
  const btnClass = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors select-none ${
      active ? 'text-blue-600' : 'text-gray-700 active:text-gray-900'
    }`;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-[300] flex items-stretch border-t border-white/40"
      style={{
        height: 'var(--mobile-bottom-nav, 70px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
        backdropFilter: 'blur(28px) saturate(1.8)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.55) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 -2px 12px rgba(0,0,0,0.08)',
      }}
    >
      <button onClick={onHome} className={btnClass(mode === 'home')} aria-label="Home">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        <span className="text-[11px] font-medium">Home</span>
      </button>

      <button onClick={onSwitcher} className={btnClass(mode === 'switcher')} aria-label="App switcher">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.25" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.25" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.25" />
        </svg>
        <span className="text-[11px] font-medium">Apps</span>
      </button>

      {showNotifications && (
        <button onClick={onNotifications} className={btnClass(false)} aria-label="Notifications">
          <span className="relative">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
          <span className="text-[11px] font-medium">Alerts</span>
        </button>
      )}

      <button onClick={onProfile} className={btnClass(false)} aria-label="Profile">
        {profileAvatar ? (
          <img src={profileAvatar} alt="" className="h-8 w-8 rounded-full object-cover border border-gray-200" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
            {profileInitial}
          </div>
        )}
        <span className="text-[11px] font-medium">Profile</span>
      </button>
    </nav>
  );
}
