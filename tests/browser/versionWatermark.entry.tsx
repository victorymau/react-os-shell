/**
 * Real-browser mount for the desktop version watermark (BG#00623).
 *
 * Everything this spec asserts is layout — which element wins a click at a
 * given pixel, and whether the label clears the taskbar — so it needs a real
 * engine and the real compiled stylesheet. jsdom does no layout and never
 * loads Tailwind, which is why `tests/whatsNewFillsWindow.test.tsx` can drive
 * the same button with `.click()` and see nothing wrong.
 *
 * The taskbar size comes from `?taskbar=small|medium|large` so one entry can
 * be mounted three times: the collision the report describes depends on it,
 * because the Trash's default position is measured up from the taskbar and the
 * watermark's was not.
 */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '../../src/shell/Layout';
import { DesktopHostProvider } from '../../src/shell/Desktop';
import { ShellPrefsProvider } from '../../src/shell/ShellPrefs';
import { ShellAuthProvider } from '../../src/shell/ShellAuth';
import { WindowManagerProvider } from '../../src/shell/WindowManager';
import { ConfirmProvider } from '../../src/shell/ConfirmDialog';

const VERSION = '48.42.2';

const params = new URLSearchParams(location.search);
const taskbarSize = params.get('taskbar') ?? 'medium';

// Everything else is left at its default, deliberately: the report is about a
// desktop nobody has customised. In particular `desktop_trash_position` is
// unset, so the Trash lands on the default the shell computes from the
// taskbar — the position the collision is measured against.
const prefs = {
  prefs: {
    show_desktop_version: true,
    taskbar_size: taskbarSize,
    taskbar_position: 'bottom',
  },
  save: () => {},
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

localStorage.setItem('erp_open_windows', '[]');

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <ConfirmProvider>
      <MemoryRouter>
        <ShellAuthProvider value={{ hasAnyPerm: () => true }}>
          <ShellPrefsProvider value={prefs}>
            <DesktopHostProvider value={{
              productName: 'EFFICIENT',
              productVersion: VERSION,
              productChangelog: [
                { version: VERSION, date: '2026-09-05', changes: ['The version number opens this window again.'] },
                { version: '48.42.1', date: '2026-09-05', changes: ['An earlier release.'] },
              ],
            }}>
              <WindowManagerProvider>
                <Routes>
                  <Route path="*" element={<Layout productName="EFFICIENT" />} />
                </Routes>
              </WindowManagerProvider>
            </DesktopHostProvider>
          </ShellPrefsProvider>
        </ShellAuthProvider>
      </MemoryRouter>
    </ConfirmProvider>
  </QueryClientProvider>,
);
