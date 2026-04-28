/**
 * react-os-shell demo — minimal Vite app showcasing the shell + bundled apps.
 *
 * Wires only what the package needs out of the box:
 *   - localStorage prefs (no backend)
 *   - bundled apps as the entire window registry (no consumer entities)
 *   - a fake user identity so the profile menu has something to render
 *   - permissive `hasAnyPerm` (no permission-gated nav items in this demo)
 *
 * Open the start menu (bottom-left "DEMO") and pick any app from the
 * Utilities / Games trays to see the windowing system in action. Cmd-K
 * opens the global search.
 */
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
  setShellAuthBridge,
  setShellWindowRegistry,
  createWindowRegistry,
  useLocalStoragePrefs,
} from 'react-os-shell';
import { bundledApps, utilityApps, gameApps, googleApps } from 'react-os-shell/apps';

// Register the consumer's window registry once at module load.
setShellWindowRegistry(createWindowRegistry(bundledApps));

// Demo "user" — purely local, no auth flow involved.
setShellAuthBridge({
  user: { first_name: 'Demo', last_name: 'User', email: 'demo@example.com' },
  logout: () => alert('logout (no-op in demo)'),
});

const queryClient = new QueryClient();

const NAV_SECTIONS = [
  {
    label: 'Utilities',
    items: Object.entries(utilityApps).map(([to, e]) => ({ to, label: (e as any).label })),
  },
  {
    label: 'Games',
    items: Object.entries(gameApps).map(([to, e]) => ({ to, label: (e as any).label })),
  },
  {
    label: 'Google',
    items: Object.entries(googleApps).map(([to, e]) => ({ to, label: (e as any).label })),
  },
];

const START_MENU_CATEGORIES = {
  erp: [],
  system: ['Utilities', 'Games', 'Google'],
};

export default function App() {
  const prefs = useLocalStoragePrefs('react-os-shell-demo');

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <BrowserRouter>
          <ShellAuthProvider value={{ hasAnyPerm: () => true }}>
            <ShellPrefsProvider value={prefs}>
              <ShellEntityFetcherProvider value={() => Promise.resolve({})}>
                <StatusBadgeProvider groups={{}}>
                  <WindowManagerProvider>
                    <Routes>
                      <Route
                        path="*"
                        element={
                          <Layout
                            navSections={NAV_SECTIONS as any}
                            navIcons={{}}
                            sectionIcons={{}}
                            categories={START_MENU_CATEGORIES}
                          />
                        }
                      />
                    </Routes>
                  </WindowManagerProvider>
                </StatusBadgeProvider>
              </ShellEntityFetcherProvider>
            </ShellPrefsProvider>
          </ShellAuthProvider>
        </BrowserRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
