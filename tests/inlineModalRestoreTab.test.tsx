/**
 * A minimized window has to be reachable again.
 *
 * Minimizing hides a window without unmounting it — that is how it keeps what
 * was typed into it. For a `WindowManager` window the taskbar tab is what
 * offers it back. An INLINE `<Modal>` (a list's create form, a review dialog)
 * appears in no taskbar, so the ─ control used to be a one-way door: the panel
 * went to `display: none` with the user's half-typed form inside it and only a
 * reload could clear it, which threw the form away. Found on the admin portal's
 * "New Contract" window (2026-09-09 HR smoketest, CON-new-window-restore).
 *
 * The pins:
 *   - an inline window that is minimized grows a restore tab carrying its
 *     title, a restore control and a close;
 *   - restoring puts the SAME mount back on screen, state intact;
 *   - a window the taskbar already lists grows no second, competing tab;
 *   - "show desktop" hides windows without turning every one of them into a
 *     tab — only a hand-minimize does that.
 */

import { act, flush, render, waitFor } from './dom';
import { lazy, useState } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '../src/shell/ConfirmDialog';
import { WindowManagerProvider, useWindowManager } from '../src/shell/WindowManager';
import Modal, { deactivateAllModals } from '../src/shell/Modal';
import { setShellWindowRegistry } from '../src/windowRegistry/types';

const TAB = '[data-modal-restore-tab]';
const PANEL = '[data-modal-panel]';

/** The inline window's own panel — the one carrying the title, not a sibling. */
function panel(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(PANEL))
    .find(p => p.textContent?.includes('Inline Window')) ?? null;
}

function isHidden(el: HTMLElement | null): boolean {
  return !!el && el.style.display === 'none';
}

/** Click a button by its rendered text, inside `root`. */
function clickButton(root: ParentNode, text: string) {
  const button = Array.from(root.querySelectorAll('button')).find(b => b.textContent?.trim() === text);
  assert.ok(button, `no button reading ${JSON.stringify(text)}`);
  act(() => { button!.click(); });
}

/** An inline dialog with state in it — the thing a stranded minimize loses. */
function InlineBody() {
  const [value, setValue] = useState('');
  return (
    <input
      data-testid="inline-input"
      value={value}
      onChange={e => setValue(e.target.value)}
    />
  );
}

function Host({ windowKey }: { windowKey?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Inline Window" windowKey={windowKey}>
      <InlineBody />
    </Modal>
  );
}

setShellWindowRegistry({});

function mount(ui: React.ReactElement) {
  localStorage.clear();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <WindowManagerProvider>{ui}</WindowManagerProvider>
        </ConfirmProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** The title-bar ─ control of the inline window. */
function minimize() {
  const p = panel();
  assert.ok(p, 'the inline window never rendered');
  clickButton(p!, '─');
}

/** Type the way a user does: the native value setter, then a real `input`
 *  event, so React's own onChange runs. */
function typeInto(value: string) {
  const input = document.querySelector<HTMLInputElement>('[data-testid="inline-input"]');
  assert.ok(input, 'the inline body never rendered');
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input!) as object, 'value')?.set;
  assert.ok(setter, 'no native value setter on the input prototype');
  act(() => {
    setter!.call(input!, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('a minimized inline window offers a restore tab that brings it back with its state', async () => {
  const mounted = mount(<Host />);
  await flush();
  await waitFor(() => panel() !== null, 'the inline window never rendered');

  typeInto('half typed');
  assert.equal(document.querySelector<HTMLInputElement>('[data-testid="inline-input"]')!.value, 'half typed');
  assert.equal(document.querySelector(TAB), null, 'a window on screen must show no restore tab');

  minimize();
  await waitFor(() => isHidden(panel()), 'the window did not hide on minimize');
  const tab = document.querySelector<HTMLElement>(TAB);
  assert.ok(tab, 'a minimized inline window showed no way back');
  assert.match(tab!.textContent ?? '', /Inline Window/, 'the tab does not name its window');
  assert.ok(
    Array.from(tab!.querySelectorAll('button')).some(b => b.getAttribute('aria-label') === 'Close'),
    'the tab has no close control',
  );

  clickButton(tab!, 'Inline Window');
  await waitFor(() => !isHidden(panel()), 'the window did not come back');
  assert.equal(document.querySelector(TAB), null, 'the tab outlived the restore');
  assert.equal(
    document.querySelector<HTMLInputElement>('[data-testid="inline-input"]')!.value,
    'half typed',
    'the restored window lost what was typed into it',
  );

  mounted.unmount();
});

test('the dedicated restore control brings it back too', async () => {
  const mounted = mount(<Host />);
  await flush();
  await waitFor(() => panel() !== null, 'the inline window never rendered');

  minimize();
  await waitFor(() => document.querySelector(TAB) !== null, 'no restore tab appeared');

  const restore = Array.from(document.querySelectorAll<HTMLElement>(`${TAB} button`))
    .find(b => b.getAttribute('aria-label') === 'Restore');
  assert.ok(restore, 'the tab has no restore control');
  act(() => { restore!.click(); });

  await waitFor(() => !isHidden(panel()), 'the restore control did not bring the window back');
  mounted.unmount();
});

test('"show desktop" hides windows without giving each one a tab', async () => {
  const mounted = mount(<Host />);
  await flush();
  await waitFor(() => panel() !== null, 'the inline window never rendered');

  act(() => { deactivateAllModals(); });
  await waitFor(() => isHidden(panel()), 'show desktop did not hide the window');
  assert.equal(
    document.querySelector(TAB), null,
    'show desktop turned a window into a restore tab — those come back together',
  );

  mounted.unmount();
});

/** A page window IS listed in the taskbar, so it must not also grow a tab. */
function TaskbarHost() {
  const { openPage } = useWindowManager();
  return (
    <div>
      <div id="taskbar-windows" />
      <button type="button" onClick={() => openPage(ROUTE)}>open page</button>
    </div>
  );
}

const ROUTE = '/inline-restore-tab-test';

test('a window the taskbar already lists grows no restore tab', async () => {
  setShellWindowRegistry({
    [ROUTE]: { component: lazy(async () => ({ default: () => <div>Page body</div> })), label: 'Inline Window' },
  });
  const mounted = mount(<TaskbarHost />);
  await flush();
  clickButton(document.body, 'open page');
  await waitFor(
    () => document.querySelector(`${PANEL}[data-window-key="page:${ROUTE}"]`) !== null,
    'the page window never opened',
  );

  const pagePanel = document.querySelector<HTMLElement>(`${PANEL}[data-window-key="page:${ROUTE}"]`)!;
  clickButton(pagePanel, '─');
  await waitFor(() => isHidden(pagePanel), 'the page window did not hide on minimize');
  assert.equal(
    document.querySelector(TAB), null,
    'a taskbar-listed window grew a second, competing restore affordance',
  );

  mounted.unmount();
  setShellWindowRegistry({});
});
