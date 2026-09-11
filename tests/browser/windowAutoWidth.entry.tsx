/**
 * Real-browser mount for fit-to-width (Modal `autoWidth`).
 *
 * Everything the check asserts is layout — whether a scroller still scrolls
 * and how wide the panel ended up — so it needs a real engine and the real
 * compiled stylesheet. jsdom reports every `scrollWidth` as 0.
 *
 * `?case=` picks the window's content, one route per case so saved boxes never
 * leak between them:
 *   fluid   a 1400px strip in an overflow-x-auto wrapper that fills the body
 *   late    the same strip, rendered 1s after open (rows arriving from a fetch)
 *   saved   the strip in a directly-mounted <Modal> whose content is there on
 *           the FIRST layout (a reopened detail: chunk loaded, data cached),
 *           over a narrow box saved by an earlier session. A lazy page can't
 *           stand in: it suspends first, so the fit lands frames after the
 *           saved-box restore and the race between them never happens.
 *   resized `late`, but the user resizes the window before the rows arrive
 *   rigid   the strip inside a FIXED 300px scroller — widening cannot help
 *   optout  `fluid` with `autoWidth: false`
 *   cap     a 5000px strip — more than the screen has
 */
import { lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider } from '../../src/shell/ConfirmDialog';
import Modal from '../../src/shell/Modal';
import { WindowManagerProvider, useWindowManager } from '../../src/shell/WindowManager';
import { setShellWindowRegistry } from '../../src/windowRegistry/types';

const kase = new URLSearchParams(location.search).get('case') ?? 'fluid';
const ROUTE = `/auto-width-${kase}`;

function Strip({ width, scrollerWidth }: { width: number; scrollerWidth?: number }) {
  return (
    <div data-testid="scroller" style={{ overflowX: 'auto', width: scrollerWidth }}>
      <div style={{ width, height: 40, background: 'linear-gradient(90deg, #ddd, #999)' }} />
    </div>
  );
}

function LateStrip() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1000);
    return () => clearTimeout(t);
  }, []);
  return ready ? <Strip width={1400} /> : <p>Loading…</p>;
}

function Page() {
  if (kase === 'late' || kase === 'resized') return <LateStrip />;
  if (kase === 'rigid') return <Strip width={1400} scrollerWidth={300} />;
  if (kase === 'cap') return <Strip width={5000} />;
  return <Strip width={1400} />;
}

setShellWindowRegistry({
  [ROUTE]: {
    label: `Auto width ${kase}`,
    size: 'lg',
    component: lazy(() => Promise.resolve({ default: Page })),
    ...(kase === 'optout' ? { autoWidth: false } : {}),
  },
});

function Opener() {
  const { openPage } = useWindowManager();
  useEffect(() => { if (kase !== 'saved') openPage(ROUTE); }, [openPage]);
  if (kase !== 'saved') return null;
  return (
    <Modal open onClose={() => {}} title="Auto width saved" size="lg" windowKey={`page:${ROUTE}`}>
      <Strip width={1400} />
    </Modal>
  );
}

localStorage.setItem('access_token', 'browser-window-auto-width-test');
localStorage.setItem('erp_open_windows', '[]');

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <ConfirmProvider>
      <WindowManagerProvider>
        <Opener />
      </WindowManagerProvider>
    </ConfirmProvider>
  </MemoryRouter>,
);
