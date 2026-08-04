import { act, flush, pressKey, render } from './dom';
import { lazy, useEffect, useState } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider } from '../src/shell/ConfirmDialog';
import { WindowManagerProvider, useWindowDirty, useWindowManager } from '../src/shell/WindowManager';
import type { useWindowDirty as PublicUseWindowDirty } from '../src/index';
import { setShellWindowRegistry } from '../src/windowRegistry/types';

const ROUTE = '/window-dirty-test';
const PANEL_SELECTOR = `[data-modal-panel][data-window-key="page:${ROUTE}"]`;

const publicUseWindowDirty: typeof PublicUseWindowDirty = useWindowDirty;

function Registration({ dirty }: { dirty: boolean }) {
  useWindowDirty(dirty);
  return null;
}

function DirtyTestPage() {
  const [firstDirty, setFirstDirty] = useState(true);
  const [showFirst, setShowFirst] = useState(true);
  const [secondDirty, setSecondDirty] = useState(false);
  const [showSecond, setShowSecond] = useState(true);

  return (
    <div>
      {showFirst && <Registration dirty={firstDirty} />}
      {showSecond && <Registration dirty={secondDirty} />}
      <button type="button" data-testid="first-false" onClick={() => setFirstDirty(false)}>First clean</button>
      <button type="button" data-testid="first-unmount" onClick={() => setShowFirst(false)}>Unmount first</button>
      <button type="button" data-testid="second-true" onClick={() => setSecondDirty(true)}>Second dirty</button>
      <button type="button" data-testid="second-unmount" onClick={() => setShowSecond(false)}>Unmount second</button>
    </div>
  );
}

setShellWindowRegistry({
  [ROUTE]: {
    label: 'Window dirty test',
    component: lazy(() => Promise.resolve({ default: DirtyTestPage })),
  },
});

function PageOpener() {
  const { openPage } = useWindowManager();
  useEffect(() => { openPage(ROUTE); }, [openPage]);
  return (
    <>
      <button type="button" data-testid="reopen" onClick={() => openPage(ROUTE)}>Reopen</button>
      <div id="taskbar-windows" />
    </>
  );
}

async function mountPage() {
  localStorage.setItem('access_token', 'window-dirty-test');
  localStorage.setItem('erp_open_windows', '[]');
  const mounted = render(
    <MemoryRouter>
      <ConfirmProvider>
        <WindowManagerProvider>
          <PageOpener />
        </WindowManagerProvider>
      </ConfirmProvider>
    </MemoryRouter>,
  );
  await flush();
  await flush();
  assert.ok(document.querySelector(PANEL_SELECTOR), 'the real PageWindow opened');
  return mounted;
}

function clickTestButton(testId: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  assert.ok(button, `${testId} exists`);
  act(() => { button.click(); });
}

function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll('button'))
    .find(candidate => candidate.textContent?.trim() === label) as HTMLButtonElement | undefined;
  assert.ok(button, `${label} button exists`);
  act(() => { button.click(); });
}

function clickTaskbarClose() {
  const tab = document.querySelector(`[data-tab-group="${ROUTE}"]`);
  const close = tab?.querySelector<HTMLElement>('[role="button"]');
  assert.ok(close, 'the taskbar tab close control exists');
  act(() => { close.click(); });
}

function assertDiscardConfirmation() {
  const text = document.body.textContent ?? '';
  assert.match(text, /Discard changes\?/);
  assert.match(text, /You have unsaved changes\. Are you sure you want to close\? All changes will be lost\./);
  assert.match(text, /Keep Editing/);
}

test('a dirty PageWindow registration uses the existing Modal close confirmation', async (t) => {
  const mounted = await mountPage();
  t.after(() => mounted.unmount());

  pressKey('Escape');
  await flush();

  assertDiscardConfirmation();
  clickButton('Keep Editing');
  await flush();
  assert.ok(document.querySelector(PANEL_SELECTOR), 'canceling the existing confirmation keeps the page open');
});

test('clearing or unmounting the only dirty registration removes the close guard', async (t) => {
  const mounted = await mountPage();
  t.after(() => mounted.unmount());

  pressKey('Escape');
  await flush();
  assertDiscardConfirmation();
  clickButton('Keep Editing');
  await flush();
  clickTestButton('first-false');
  pressKey('Escape');
  await flush();
  assert.equal(document.querySelector(PANEL_SELECTOR), null, 'changing dirty to false closes without confirmation');
  assert.doesNotMatch(document.body.textContent ?? '', /Discard changes\?/);

  clickTestButton('reopen');
  await flush();
  pressKey('Escape');
  await flush();
  assertDiscardConfirmation();
  clickButton('Keep Editing');
  await flush();
  clickTestButton('first-unmount');
  pressKey('Escape');
  await flush();
  assert.equal(document.querySelector(PANEL_SELECTOR), null, 'unmounting the registration also closes without confirmation');
  assert.doesNotMatch(document.body.textContent ?? '', /Discard changes\?/);
});

test('multiple registrations stay guarded while any mounted registration is dirty', async (t) => {
  const mounted = await mountPage();
  t.after(() => mounted.unmount());

  clickTestButton('second-true');
  clickTestButton('first-unmount');
  pressKey('Escape');
  await flush();

  assertDiscardConfirmation();
  clickButton('Keep Editing');
  await flush();
  assert.ok(document.querySelector(PANEL_SELECTOR), 'one cleanup cannot clear another registration');

  clickTestButton('second-unmount');
  pressKey('Escape');
  await flush();
  assert.equal(document.querySelector(PANEL_SELECTOR), null, 'the guard clears after the final dirty registration unmounts');
});

test('taskbar close requests use the same guard while dirty and close directly while clean', async (t) => {
  const mounted = await mountPage();
  t.after(() => mounted.unmount());

  clickTaskbarClose();
  clickTaskbarClose();
  await flush();
  assertDiscardConfirmation();
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1, 'repeated close requests share one confirmation');
  assert.ok(document.querySelector(PANEL_SELECTOR), 'the taskbar cannot bypass the dirty guard');

  clickButton('Keep Editing');
  await flush();
  clickTestButton('first-false');
  clickTaskbarClose();
  await flush();
  assert.equal(document.querySelector(PANEL_SELECTOR), null, 'the same taskbar request closes a clean page');
  assert.doesNotMatch(document.body.textContent ?? '', /Discard changes\?/);
});

test('useWindowDirty is a safe no-op outside a managed page window', () => {
  function OutsidePageWindow() {
    useWindowDirty(true);
    return <span>Outside page window</span>;
  }

  const mounted = render(<OutsidePageWindow />);
  assert.equal(mounted.container.textContent, 'Outside page window');
  mounted.unmount();
});

test('the package root exports useWindowDirty', () => {
  assert.equal(publicUseWindowDirty, useWindowDirty);
});
