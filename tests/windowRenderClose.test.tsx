/**
 * entry.render() gets the RAW window close, not the chrome's editing guard.
 *
 * The chrome close (title-bar X / ESC) deliberately exits edit mode instead of
 * closing while a window is editing and pristine. That guard used to be handed
 * to entry.render() as its `onClose` too, which made a programmatic close from
 * inside the window — most critically "the record was just deleted, close the
 * window" (`onDeleted={onClose}`) — a silent no-op: the window fell back to a
 * detail view of a record that no longer existed. Found live on the admin
 * portal's GL account delete (ap#1581 verification), latent in every
 * `onDeleted={onClose}` wiring shipped by the ap#1567 delete audit.
 *
 * These specs pin both halves: a render-callback close closes even while
 * editing, and the chrome's exit-edit-first behaviour survives unchanged.
 */

import { flush, pressKey, render, act, waitFor } from './dom';
import { useEffect } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '../src/shell/ConfirmDialog';
import { WindowManagerProvider, useWindowManager } from '../src/shell/WindowManager';
import { setShellWindowRegistry } from '../src/windowRegistry/types';

const ENTITY_TYPE = 'window-render-close-entity';
const ENTITY_ID = '1';
const panelSelector = `[data-modal-panel][data-window-key="${ENTITY_TYPE}:${ENTITY_ID}"]`;

/** Stand-in for a Detail/Form pair: `body-edit` enters edit mode, `body-close`
 *  is the app calling the render-passed onClose (a delete flow's onDeleted). */
function EntityBody({ onClose, editing, setEditing }: {
  onClose: () => void; editing: boolean; setEditing: (v: boolean) => void;
}) {
  return (
    <div>
      <button type="button" data-testid="body-edit" onClick={() => setEditing(true)}>Edit</button>
      <button type="button" data-testid="body-close" onClick={onClose}>Programmatic close</button>
      <span data-testid="body-mode">{editing ? 'editing' : 'viewing'}</span>
    </div>
  );
}

setShellWindowRegistry({
  // `selfFetching` keeps the detail query out of the way; this spec is about
  // close routing, not entity loading.
  [ENTITY_TYPE]: {
    endpoint: '/window-render-close-entity/',
    selfFetching: true,
    title: () => 'Render close test',
    render: (_entity: unknown, onClose: () => void, _entityId?: string, editing?: boolean, setEditing?: (v: boolean) => void) => (
      <EntityBody onClose={onClose} editing={!!editing} setEditing={setEditing!} />
    ),
  },
});

function EntityOpener() {
  const { openEntity } = useWindowManager();
  useEffect(() => { openEntity(ENTITY_TYPE, ENTITY_ID, undefined, 'Render close test'); }, [openEntity]);
  return <div id="taskbar-windows" />;
}

async function mountEntity() {
  localStorage.setItem('access_token', 'window-render-close-test');
  localStorage.setItem('erp_open_windows', '[]');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mounted = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <WindowManagerProvider>
            <EntityOpener />
          </WindowManagerProvider>
        </ConfirmProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await waitFor(
    () => document.querySelector(panelSelector) !== null,
    'the entity window never opened',
  );
  return mounted;
}

function clickTestButton(testId: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  assert.ok(button, `${testId} exists`);
  act(() => { button.click(); });
}

function mode(): string {
  return document.querySelector('[data-testid="body-mode"]')?.textContent ?? '';
}

test('a render-callback close closes the window even while editing and pristine', async (t) => {
  const mounted = await mountEntity();
  t.after(() => mounted.unmount());

  clickTestButton('body-edit');
  await flush();
  assert.equal(mode(), 'editing', 'the window is in edit mode');

  clickTestButton('body-close');
  await flush();
  assert.equal(
    document.querySelector(panelSelector), null,
    'the app said "this window is done" — it must close, not fall back to a detail view',
  );
});

test('the chrome close still exits edit mode first while pristine', async (t) => {
  const mounted = await mountEntity();
  t.after(() => mounted.unmount());

  clickTestButton('body-edit');
  await flush();
  assert.equal(mode(), 'editing', 'the window is in edit mode');

  pressKey('Escape');
  await flush();
  assert.ok(document.querySelector(panelSelector), 'ESC while editing keeps the window open');
  assert.equal(mode(), 'viewing', 'ESC while editing exits edit mode');

  pressKey('Escape');
  await flush();
  assert.equal(document.querySelector(panelSelector), null, 'a second ESC closes the (now viewing) window');
});

test('a render-callback close while viewing closes as before', async (t) => {
  const mounted = await mountEntity();
  t.after(() => mounted.unmount());

  assert.equal(mode(), 'viewing');
  clickTestButton('body-close');
  await flush();
  assert.equal(document.querySelector(panelSelector), null, 'the window closed');
});
