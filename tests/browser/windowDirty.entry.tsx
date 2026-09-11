import { lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider } from '../../src/shell/ConfirmDialog';
import { WindowManagerProvider, useWindowDirty, useWindowManager } from '../../src/shell/WindowManager';
import { setShellWindowRegistry } from '../../src/windowRegistry/types';

const ROUTE = '/browser-window-dirty-test';
const WINDOW_ID = `page:${ROUTE}`;

function BrowserDirtyPage() {
  const [dirty, setDirty] = useState(true);
  useWindowDirty(dirty);
  return (
    <button type="button" data-testid="mark-clean" onClick={() => setDirty(false)}>
      Mark clean
    </button>
  );
}

setShellWindowRegistry({
  [ROUTE]: {
    label: 'Browser dirty test',
    component: lazy(() => Promise.resolve({ default: BrowserDirtyPage })),
  },
});

function BrowserControls() {
  const { openPage, closeEntity } = useWindowManager();
  useEffect(() => { openPage(ROUTE); }, [openPage]);
  return (
    <>
      {/* Above the window chrome. This page is served WITH the package's real
          stylesheet, so the window is really positioned and its top-left
          resize handle really sits over this corner of the document — an
          unstyled page hid that, and the click "worked" by accident. */}
      <div style={{ position: 'relative', zIndex: 100 }}>
        <button type="button" data-testid="public-close" onClick={() => closeEntity(WINDOW_ID)}>
          Public close
        </button>
      </div>
      <div id="taskbar-windows" />
    </>
  );
}

localStorage.setItem('access_token', 'browser-window-dirty-test');
localStorage.setItem('erp_open_windows', '[]');

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <ConfirmProvider>
      <WindowManagerProvider>
        <BrowserControls />
      </WindowManagerProvider>
    </ConfirmProvider>
  </MemoryRouter>,
);
