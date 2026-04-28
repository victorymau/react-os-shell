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
import { useEffect, useState } from 'react';
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
  setShellAuthBridge,
  setShellWindowRegistry,
  createWindowRegistry,
  useLocalStoragePrefs,
} from 'react-os-shell';
import { bundledApps, utilityApps, gameApps, googleApps } from 'react-os-shell/apps';

setShellWindowRegistry(createWindowRegistry(bundledApps));

// Logout dispatches a CustomEvent the App listens for (the auth bridge is
// set once at module-load and can't close over React state).
setShellAuthBridge({
  user: { first_name: 'Demo', last_name: 'User', email: 'demo@example.com' },
  logout: () => window.dispatchEvent(new CustomEvent('demo-logout')),
});

const queryClient = new QueryClient();

const NAV_SECTIONS = [
  { label: 'Utilities', items: Object.entries(utilityApps).map(([to, e]) => ({ to, label: (e as any).label })) },
  { label: 'Games', items: Object.entries(gameApps).map(([to, e]) => ({ to, label: (e as any).label })) },
  { label: 'Google', items: Object.entries(googleApps).map(([to, e]) => ({ to, label: (e as any).label })) },
];

const START_MENU_CATEGORIES = { erp: [], system: ['Utilities', 'Games', 'Google'] };

const PRODUCT_ICON = `${import.meta.env.BASE_URL}favicon.svg`;

function LoginSplash({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)' }}
    >
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
    </div>
  );
}

export default function App() {
  const prefs = useLocalStoragePrefs('react-os-shell-demo');
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
                  }}>
                    <WindowManagerProvider>
                      <Routes>
                        <Route
                          path="*"
                          element={
                            <Layout
                              productName="react-os-shell"
                              productIcon={PRODUCT_ICON}
                              navSections={NAV_SECTIONS as any}
                              navIcons={{}}
                              sectionIcons={{}}
                              categories={START_MENU_CATEGORIES}
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
