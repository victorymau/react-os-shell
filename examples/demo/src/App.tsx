/**
 * react-os-shell demo — minimal Vite app showcasing the shell + bundled apps.
 *
 * Wires only what the package needs out of the box:
 *   - localStorage prefs (no backend)
 *   - bundled apps as the entire window registry (no consumer entities)
 *   - a fake user identity so the profile menu has something to render
 *   - permissive `hasAnyPerm` (no permission-gated nav items in this demo)
 *
 * Open the start menu (bottom-left "react-os-shell") and pick any app from
 * the Utilities / Games trays to see the windowing system in action. Cmd-K
 * opens the global search. Logout returns you to the demo's login splash.
 */
import { lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Layout,
  WindowManagerProvider,
  ConfirmProvider,
  ShellAuthProvider,
  ShellPrefsProvider,
  ShellEntityFetcherProvider,
  StatusBadgeProvider,
  DesktopHostProvider,
  Modal,
  setShellAuthBridge,
  setShellWindowRegistry,
  setShellNavIcons,
  createWindowRegistry,
  useLocalStoragePrefs,
  useWindowManager,
  VERSION,
  type NotificationsConfig,
} from 'react-os-shell';
import { bundledApps, utilityApps, gameApps, googleApps } from 'react-os-shell/apps';

// Settings → Customization page (theme picker, wallpaper picker, hotkeys, etc.)
const Customization = lazy(() => import('react-os-shell').then(m => ({ default: m.Customization })));
// Demo profile page wired to the shell's start-menu profile row.
const ProfilePage = lazy(() => import('./ProfilePage'));

setShellWindowRegistry(createWindowRegistry(bundledApps, {
  '/settings/customization': {
    component: Customization,
    label: 'Customization',
    size: 'lg',
  },
  '/profile': {
    component: ProfilePage,
    label: 'Profile',
    size: 'md',
  },
}));

// Logout dispatches a CustomEvent the App listens for (the auth bridge is
// set once at module-load and can't close over React state).
setShellAuthBridge({
  user: {
    first_name: 'Demo',
    last_name: 'User',
    email: 'demo@example.com',
    avatar_url: `${import.meta.env.BASE_URL}demo-avatar.webp`,
  },
  logout: () => window.dispatchEvent(new CustomEvent('demo-logout')),
});

const queryClient = new QueryClient();

// Top-level flat items shown directly in the main start menu (alongside the
// built-in Notifications entry). The remaining utility/game apps stay in their
// category sub-trays below.
const TOP_LEVEL_ROUTES = new Set(['/spreadsheet', '/notepad', '/email', '/gemini']);
const lookupLabel = (to: string) =>
  (utilityApps as any)[to]?.label ?? (gameApps as any)[to]?.label ?? (googleApps as any)[to]?.label ?? to;

const NAV_SECTIONS = [
  ...Array.from(TOP_LEVEL_ROUTES).map(to => ({ to, label: lookupLabel(to) })),
  {
    label: 'Utilities',
    items: Object.entries(utilityApps)
      .filter(([to]) => !TOP_LEVEL_ROUTES.has(to))
      .map(([to, e]) => ({ to, label: (e as any).label })),
  },
  { label: 'Games', items: Object.entries(gameApps).map(([to, e]) => ({ to, label: (e as any).label })) },
  { label: 'Settings', items: [{ to: '/settings/customization', label: 'Customization' }] },
];

const START_MENU_CATEGORIES = { erp: [], system: ['Utilities', 'Games', 'Settings'] };

// Per-route icons rendered next to each start-menu item. Keep paths tight —
// they re-render at h-4 w-4 inside the menu.
const path = (d: string) => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const NAV_ICONS: Record<string, JSX.Element> = {
  '/spreadsheet': path('M3.75 6.75h16.5v10.5H3.75zM3.75 11.25h16.5M9 6.75v10.5'),
  '/notepad': path('M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125'),
  '/email': path('M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75'),
  '/gemini': path('M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z'),
  '/calculator': path('M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 4.5h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM4.5 9.75h15v9a2.25 2.25 0 01-2.25 2.25h-10.5A2.25 2.25 0 014.5 18.75v-9zM4.5 9.75V7.5a2.25 2.25 0 012.25-2.25h10.5A2.25 2.25 0 0119.5 7.5v2.25h-15z'),
  '/weather': path('M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z'),
  '/currency': path('M12 7.5v9m3.75-9.75H9.375a2.625 2.625 0 100 5.25h2.25a2.625 2.625 0 010 5.25H8.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z'),
  '/pomodoro': path('M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'),
  '/chess': path('M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0116.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-2.27.853m0 0h.008v.008h-.008v-.008z'),
  '/checkers': path('M21 12a9 9 0 11-18 0 9 9 0 0118 0zM12 9a3 3 0 100 6 3 3 0 000-6z'),
  '/sudoku': path('M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15'),
  '/tetris': path('M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z'),
  '/2048': path('M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z'),
  '/minesweeper': path('M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z'),
  '/settings/customization': path('M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z'),
  '/profile': path('M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z'),
};

setShellNavIcons(NAV_ICONS);

// Section header icons (matched by section label).
const SECTION_ICONS: Record<string, JSX.Element> = {
  Utilities: path('M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437L12 10.5'),
  Games: path('M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3'),
  Settings: path('M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z'),
};

const PRODUCT_ICON = `${import.meta.env.BASE_URL}favicon.svg`;
const WALLPAPER_OPTIONS = [
  { src: `${import.meta.env.BASE_URL}wallpaper-yosemite.jpg`, label: 'Yosemite' },
  { src: `${import.meta.env.BASE_URL}wallpaper-winter.jpg`, label: 'Winter' },
  { src: `${import.meta.env.BASE_URL}wallpaper-mojave.jpg`, label: 'Mojave' },
  { src: `${import.meta.env.BASE_URL}wallpaper-wanaka.jpg`, label: 'Wanaka' },
  { src: `${import.meta.env.BASE_URL}wallpaper-lake.jpg`, label: 'Lake' },
];
const WALLPAPER_URLS = WALLPAPER_OPTIONS.map(w => w.src);

// Demo notification config — purely in-memory.
const DEMO_NOTIFICATIONS: NotificationsConfig = {
  useUnreadCount: () => 0,
  list: async () => ({ results: [] }),
  markRead: async () => {},
  markAllRead: async () => {},
  onItemClick: () => {},
};

// Pick a wallpaper once per page load; reused across renders.
const LOGIN_WALLPAPER = WALLPAPER_URLS[Math.floor(Math.random() * WALLPAPER_URLS.length)];

const CHANGELOG_URL = 'https://raw.githubusercontent.com/victorymau/react-os-shell/main/CHANGELOG.md';

function VersionBadge() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || text) return;
    setError(null);
    fetch(CHANGELOG_URL)
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setText)
      .catch(err => setError(err.message || 'Failed to load changelog'));
  }, [open, text]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View changelog"
        className="fixed right-3 text-[11px] font-mono text-white/60 hover:text-white select-none drop-shadow z-10 transition-colors cursor-pointer"
        style={{ bottom: 'calc(var(--taskbar-height, 56px) * 1px + 8px)' }}
      >
        v{VERSION || '0.0.0'}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={`Changelog · v${VERSION}`} size="lg">
          {error ? (
            <div className="p-6 text-sm text-red-600">
              Could not load changelog: {error}.{' '}
              <a className="text-blue-600 hover:underline" href="https://github.com/victorymau/react-os-shell/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">
                Open on GitHub
              </a>
            </div>
          ) : !text ? (
            <div className="p-6 text-sm text-gray-500">Loading…</div>
          ) : (
            <pre className="p-6 text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed">{text}</pre>
          )}
        </Modal>
      )}
    </>
  );
}

// Opens the default widgets once when the desktop first mounts after sign-in.
function DefaultWindows() {
  const { openPage } = useWindowManager();
  useEffect(() => {
    openPage('/weather');
    openPage('/currency');
  }, [openPage]);
  return null;
}

function LoginSplash({ onSignIn }: { onSignIn: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-10"
      style={{
        backgroundImage: `url(${LOGIN_WALLPAPER})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#1e1b4b',
      }}
    >
      <div className="text-center">
        <p className="text-7xl font-light text-white tracking-tight tabular-nums">{time}</p>
        <p className="mt-2 text-sm text-white/60 tracking-wide">{date}</p>
      </div>

      <div className="w-80 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl p-8 text-center">
        <img src={PRODUCT_ICON} alt="" className="h-16 w-16 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-white tracking-wide">react-os-shell</h1>
        <p className="mt-1 text-xs text-white/60">Desktop UI shell for React</p>
        <button
          onClick={onSignIn}
          className="mt-6 w-full rounded-lg bg-white/90 hover:bg-white text-gray-900 text-sm font-medium py-2.5 transition-colors"
        >
          Continue as Demo User
        </button>
        <p className="mt-4 text-[11px] text-white/40">No real auth — local-only demo.</p>
      </div>

      <p className="absolute bottom-4 right-4 text-[10px] font-mono text-white/40 select-none">v{VERSION || '0.0.0'}</p>
    </div>
  );
}

export default function App() {
  // Hide the bundled desktop version watermark — the demo renders its own
  // VersionBadge that opens the in-app changelog modal.
  const prefs = useLocalStoragePrefs('react-os-shell-demo', { show_desktop_version: false });
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const handleLogout = () => setSignedIn(false);
    window.addEventListener('demo-logout', handleLogout);
    return () => window.removeEventListener('demo-logout', handleLogout);
  }, []);

  if (!signedIn) return <LoginSplash onSignIn={() => setSignedIn(true)} />;

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <BrowserRouter>
          <ShellAuthProvider value={{ hasAnyPerm: () => true }}>
            <ShellPrefsProvider value={prefs}>
              <ShellEntityFetcherProvider value={() => Promise.resolve({})}>
                <StatusBadgeProvider groups={{}}>
                  <DesktopHostProvider value={{
                    productName: 'react-os-shell',
                    productTagline: 'Desktop UI shell for React',
                    productIcon: PRODUCT_ICON,
                    wallpapers: WALLPAPER_OPTIONS,
                  }}>
                    <WindowManagerProvider>
                      <DefaultWindows />
                      <VersionBadge />
                      <Routes>
                        <Route
                          path="*"
                          element={
                            <Layout
                              productName="react-os-shell"
                              productIcon={PRODUCT_ICON}
                              wallpapers={WALLPAPER_URLS}
                              navSections={NAV_SECTIONS as any}
                              navIcons={NAV_ICONS}
                              sectionIcons={SECTION_ICONS}
                              categories={START_MENU_CATEGORIES}
                              notifications={DEMO_NOTIFICATIONS}
                            />
                          }
                        />
                      </Routes>
                    </WindowManagerProvider>
                  </DesktopHostProvider>
                </StatusBadgeProvider>
              </ShellEntityFetcherProvider>
            </ShellPrefsProvider>
          </ShellAuthProvider>
        </BrowserRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
