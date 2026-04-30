/**
 * Mobile shell — the phone/tablet-portrait replacement for the desktop
 * <Layout> chrome (taskbar / start menu sidebar / windowed apps).
 *
 * State machine driven by mobileShellStore:
 *   home     — full-screen icon grid (folders + apps)
 *   switcher — Chrome-tab-style snapshot grid of open apps
 *   app      — current Modal renders fullscreen; we just paint the bottom nav
 *
 * MobileShell does NOT render the apps themselves — those continue to be
 * rendered by WindowManagerProvider as Modals. On mobile, Modal's own
 * fullscreen path takes over. We only render the chrome (home / switcher / nav)
 * on top of whatever Modal is showing.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useWindowManager } from './WindowManager';
import { activateModal } from './Modal';
import { getMobileMode, setMobileMode, subscribeMobileMode } from './mobileShellStore';
import MobileHome from './MobileHome';
import MobileSwitcher from './MobileSwitcher';
import type { NavItem, NavSection } from './nav-types';

interface MobileShellProps {
  productName?: string;
  productIcon?: string;
  navSections: (NavSection | NavItem)[];
  navIcons: Record<string, ReactNode>;
  sectionIcons: Record<string, ReactNode>;
  /** Wallpaper / background style computed by Layout — applied to the home
   *  overlay so the user's chosen wallpaper carries onto mobile. */
  wallpaperStyle?: React.CSSProperties;
  onOpenStartMenu: () => void;
}

export default function MobileShell({
  productName,
  productIcon,
  navSections,
  navIcons,
  sectionIcons,
  wallpaperStyle,
  onOpenStartMenu,
}: MobileShellProps) {
  const { openWindows, openPage, closeEntity } = useWindowManager();
  const mode = useSyncExternalStore(subscribeMobileMode, getMobileMode);

  const switcherWindows = openWindows;

  // If the active app gets closed externally and we were in 'app' mode, fall
  // back to home so the user isn't staring at an empty fullscreen.
  useEffect(() => {
    if (mode === 'app' && openWindows.length === 0) {
      setMobileMode('home');
    }
  }, [mode, openWindows.length]);

  const activateWindowById = (windowId: string) => {
    // Same DOM lookup the desktop taskbar uses — translate openWindows.id to
    // the modal-internal id and bring it forward.
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

  return (
    <>
      {/* Home overlay — wallpaper underneath, content scrolls over it */}
      {mode === 'home' && (
        <div
          className="fixed inset-0 z-[200]"
          style={{
            ...wallpaperStyle,
            paddingBottom: 'var(--mobile-bottom-nav, 56px)',
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

      {/* Switcher overlay */}
      {mode === 'switcher' && (
        <div className="fixed inset-0 z-[200] bg-gray-900/95 backdrop-blur-sm" style={{ paddingBottom: 'var(--mobile-bottom-nav, 56px)' }}>
          <MobileSwitcher
            windows={switcherWindows}
            onActivate={handleActivateWindow}
            onClose={(id) => closeEntity(id)}
          />
        </div>
      )}

      {/* Bottom nav — always visible, sits above modals AND overlays */}
      <MobileBottomNav
        mode={mode}
        openCount={switcherWindows.length}
        onHome={() => setMobileMode('home')}
        onSwitcher={() => setMobileMode('switcher')}
        onMenu={onOpenStartMenu}
      />
    </>
  );
}

interface MobileBottomNavProps {
  mode: 'home' | 'switcher' | 'app';
  openCount: number;
  onHome: () => void;
  onSwitcher: () => void;
  onMenu: () => void;
}

function MobileBottomNav({ mode, openCount, onHome, onSwitcher, onMenu }: MobileBottomNavProps) {
  const btnClass = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
      active ? 'text-blue-600' : 'text-gray-500 active:text-gray-700'
    }`;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-[300] flex items-stretch bg-white/95 backdrop-blur border-t border-gray-200"
      style={{ height: 'var(--mobile-bottom-nav, 56px)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <button onClick={onHome} className={btnClass(mode === 'home')} aria-label="Home">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        <span className="text-[10px] font-medium">Home</span>
      </button>
      <button onClick={onSwitcher} className={btnClass(mode === 'switcher')} aria-label="App switcher">
        <span className="relative">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.25" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.25" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.25" />
          </svg>
          {openCount > 0 && (
            <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-4 text-center">
              {openCount}
            </span>
          )}
        </span>
        <span className="text-[10px] font-medium">Apps</span>
      </button>
      <button onClick={onMenu} className={btnClass(false)} aria-label="Start menu">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
        <span className="text-[10px] font-medium">Menu</span>
      </button>
    </nav>
  );
}
