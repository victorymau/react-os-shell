import { act, flush, pressKey, render } from './dom';
import { lazy, useEffect, useState } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider } from '../src/shell/ConfirmDialog';
import { WindowManagerProvider, useWindowDirty, useWindowManager } from '../src/shell/WindowManager';
import { useWindowDirty as publicUseWindowDirty } from '../src/index';
import WidgetManager from '../src/shell/WidgetManager';
import { setShellWindowRegistry } from '../src/windowRegistry/types';

const ROUTE = '/window-dirty-test';
const WIDGET_ROUTE = '/window-dirty-widget-test';
const SECOND_WIDGET_ROUTE = '/window-dirty-widget-test-2';
const panelSelector = (route = ROUTE) => `[data-modal-panel][data-window-key="page:${route}"]`;

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
  [WIDGET_ROUTE]: {
    label: 'Window dirty widget test',
    component: lazy(() => Promise.resolve({ default: DirtyTestPage })),
    widget: true,
  },
  [SECOND_WIDGET_ROUTE]: {
    label: 'Window dirty widget test 2',
    component: lazy(() => Promise.resolve({ default: DirtyTestPage })),
    widget: true,
  },
});

function PageOpener({ route }: { route: string }) {
  const { openPage, closeEntity, remove } = useWindowManager();
  const [showWidgetManager, setShowWidgetManager] = useState(false);
  useEffect(() => { openPage(route); }, [openPage, route]);
  const windowId = `page:${route}`;
  return (
    <>
      <button type="button" data-testid="reopen" onClick={() => openPage(route)}>Reopen</button>
      <button type="button" data-testid="public-close" onClick={() => closeEntity(windowId)}>Public close</button>
      <button type="button" data-testid="legacy-remove" onClick={() => remove(windowId)}>Legacy remove</button>
      <button type="button" data-testid="widget-toggle" onClick={() => openPage(route)}>Widget toggle</button>
      <button type="button" data-testid="show-widget-manager" onClick={() => setShowWidgetManager(true)}>Show widget manager</button>
      <WidgetManager open={showWidgetManager} onClose={() => setShowWidgetManager(false)} />
      <div id="taskbar-windows" />
    </>
  );
}

async function mountPage(route = ROUTE) {
  localStorage.setItem('access_token', 'window-dirty-test');
  localStorage.setItem('erp_open_windows', '[]');
  const mounted = render(
    <MemoryRouter>
      <ConfirmProvider>
        <WindowManagerProvider>
          <PageOpener route={route} />
        </WindowManagerProvider>
      </ConfirmProvider>
    </MemoryRouter>,
  );
  await flush();
  await flush();
  assert.ok(document.querySelector(panelSelector(route)), 'the real PageWindow opened');
  return mounted;
}

function DirtyWidgetBulkOpener() {
  const { openPage } = useWindowManager();
  useEffect(() => {
    openPage(WIDGET_ROUTE);
    openPage(SECOND_WIDGET_ROUTE);
  }, [openPage]);
  return (
    <>
      <WidgetManager open={true} onClose={() => {}} />
      <div id="taskbar-windows" />
    </>
  );
}

async function mountDirtyWidgets() {
  localStorage.setItem('access_token', 'window-dirty-bulk-test');
  localStorage.setItem('erp_open_windows', '[]');
  const mounted = render(
    <MemoryRouter>
      <ConfirmProvider>
        <WindowManagerProvider>
          <DirtyWidgetBulkOpener />
        </WindowManagerProvider>
      </ConfirmProvider>
    </MemoryRouter>,
  );
  await flush();
  await flush();
  assert.ok(document.querySelector(panelSelector(WIDGET_ROUTE)), 'the first dirty widget opened');
  assert.ok(document.querySelector(panelSelector(SECOND_WIDGET_ROUTE)), 'the second dirty widget opened');
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
  assert.ok(document.querySelector(panelSelector()), 'canceling the existing confirmation keeps the page open');
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
  assert.equal(document.querySelector(panelSelector()), null, 'changing dirty to false closes without confirmation');
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
  assert.equal(document.querySelector(panelSelector()), null, 'unmounting the registration also closes without confirmation');
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
  assert.ok(document.querySelector(panelSelector()), 'one cleanup cannot clear another registration');

  clickTestButton('second-unmount');
  pressKey('Escape');
  await flush();
  assert.equal(document.querySelector(panelSelector()), null, 'the guard clears after the final dirty registration unmounts');
});

test('taskbar close requests use the same guard while dirty and close directly while clean', async (t) => {
  const mounted = await mountPage();
  t.after(() => mounted.unmount());

  clickTaskbarClose();
  clickTaskbarClose();
  await flush();
  assertDiscardConfirmation();
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1, 'repeated close requests share one confirmation');
  assert.ok(document.querySelector(panelSelector()), 'the taskbar cannot bypass the dirty guard');

  clickButton('Keep Editing');
  await flush();
  clickTestButton('first-false');
  clickTaskbarClose();
  await flush();
  assert.equal(document.querySelector(panelSelector()), null, 'the same taskbar request closes a clean page');
  assert.doesNotMatch(document.body.textContent ?? '', /Discard changes\?/);
});

test('public closeEntity guards dirty windows and confirmed removal does not recurse', async (t) => {
  const mounted = await mountPage();
  t.after(() => mounted.unmount());

  clickTestButton('public-close');
  await flush();
  assertDiscardConfirmation();

  clickButton('Discard');
  await flush();
  assert.equal(document.querySelector(panelSelector()), null, 'confirmation performs one forced removal');
  assert.doesNotMatch(document.body.textContent ?? '', /Discard changes\?/, 'forced removal does not re-enter the guard');
});

test('legacy remove guards dirty windows and clean public closes remain direct', async (t) => {
  const mounted = await mountPage();
  t.after(() => mounted.unmount());

  clickTestButton('legacy-remove');
  await flush();
  assertDiscardConfirmation();
  clickButton('Keep Editing');
  await flush();

  clickTestButton('first-false');
  clickTestButton('public-close');
  await flush();
  assert.equal(document.querySelector(panelSelector()), null, 'clean public close removes the window directly');
  assert.doesNotMatch(document.body.textContent ?? '', /Discard changes\?/);
});

test('toggling an active widget through openPage cannot bypass its dirty guard', async (t) => {
  const mounted = await mountPage(WIDGET_ROUTE);
  t.after(() => mounted.unmount());

  clickTestButton('widget-toggle');
  await flush();
  assertDiscardConfirmation();
  assert.ok(document.querySelector(panelSelector(WIDGET_ROUTE)), 'widget toggle keeps the dirty page mounted');

  clickButton('Keep Editing');
  await flush();
  clickTestButton('first-false');
  clickTestButton('widget-toggle');
  await flush();
  assert.equal(document.querySelector(panelSelector(WIDGET_ROUTE)), null, 'clean widget toggle removes the page directly');
});

test('Widget Manager removal uses the same dirty guard', async (t) => {
  const mounted = await mountPage(WIDGET_ROUTE);
  t.after(() => mounted.unmount());

  clickTestButton('show-widget-manager');
  await flush();
  const removeWidget = document.querySelector<HTMLButtonElement>('[title="Remove Window dirty widget test from desktop"]');
  assert.ok(removeWidget, 'Widget Manager exposes the active widget removal control');
  act(() => { removeWidget.click(); });
  await flush();

  assertDiscardConfirmation();
  assert.ok(document.querySelector(panelSelector(WIDGET_ROUTE)), 'Widget Manager cannot remove a dirty page directly');
});

test('Widget Manager bulk removal serializes dirty confirmations without locking a canceled window', async (t) => {
  const mounted = await mountDirtyWidgets();
  t.after(() => mounted.unmount());

  clickButton('Remove all');
  await flush();
  assertDiscardConfirmation();
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1, 'only one dirty confirmation is active');

  clickButton('Keep Editing');
  await flush();
  assertDiscardConfirmation();
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1, 'the second dirty close is presented after canceling the first');

  clickButton('Discard');
  await flush();
  const remainingPanels = [WIDGET_ROUTE, SECOND_WIDGET_ROUTE]
    .filter(route => document.querySelector(panelSelector(route)));
  assert.equal(remainingPanels.length, 1, 'discarding the second queued close removes exactly one widget');

  const retry = document.querySelector<HTMLButtonElement>('[title^="Remove Window dirty widget test"]');
  assert.ok(retry, 'Widget Manager still exposes the canceled widget');
  act(() => { retry.click(); });
  await flush();
  assertDiscardConfirmation();
  clickButton('Discard');
  await flush();

  assert.equal(document.querySelector(panelSelector(WIDGET_ROUTE)), null);
  assert.equal(document.querySelector(panelSelector(SECOND_WIDGET_ROUTE)), null);
  assert.doesNotMatch(document.body.textContent ?? '', /Discard changes\?/, 'the retried Modal was not left locked');
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
