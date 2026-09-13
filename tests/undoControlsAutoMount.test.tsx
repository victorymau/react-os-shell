/**
 * Undo/Redo is the shell's to show, not each form's to remember.
 *
 * Until this change every form had to mount `<ModalActions position="left">
 * <UndoControls /></ModalActions>` itself, and the ones that forgot — a
 * detail window with a bulk import, say — had a working ⌘Z and no buttons.
 * Now the window footer reads the stack `WindowManager` mounts above it and
 * shows the pair as soon as the form registers state. These specs pin the
 * cases that decide whether that is one pair, no pair, or the wrong footer.
 */
import { act, flush, render, waitFor } from './dom';
import { useEffect, useState } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '../src/shell/ConfirmDialog';
import Modal, { ModalActions } from '../src/shell/Modal';
import { WindowManagerProvider, useWindowManager } from '../src/shell/WindowManager';
import { UndoProvider, useUndoCanEdit, useUndoableState } from '../src/shell/UndoProvider';
import UndoControls from '../src/shell/UndoControls';
import { setShellWindowRegistry } from '../src/windowRegistry/types';

const ENTITY_TYPE = 'undo-auto-entity';

type Variant = 'form' | 'no-state' | 'own-mount' | 'read-only' | 'nested-provider' | 'child-dialog';
let variant: Variant = 'form';

/** One undoable field and a button that changes it — the smallest form. */
function Field() {
  const [value, setValue] = useUndoableState('', { label: 'name' });
  return (
    <>
      <span data-testid="value">{value}</span>
      <button type="button" data-testid="set" onClick={() => setValue('typed')}>Set</button>
    </>
  );
}

function ReadOnlyField() {
  useUndoCanEdit(false);
  return <Field />;
}

function ChildDialog() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Field />
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Child dialog" size="sm">
          <div data-testid="dialog-body">dialog</div>
          <ModalActions><button type="button">OK</button></ModalActions>
        </Modal>
      )}
    </>
  );
}

function Body() {
  switch (variant) {
    case 'form': return <Field />;
    case 'no-state': return <div data-testid="static">nothing to undo here</div>;
    case 'own-mount': return <><ModalActions position="left"><UndoControls /></ModalActions><Field /></>;
    case 'read-only': return <ReadOnlyField />;
    case 'nested-provider': return <UndoProvider canEdit><Field /></UndoProvider>;
    case 'child-dialog': return <ChildDialog />;
  }
}

setShellWindowRegistry({
  [ENTITY_TYPE]: {
    endpoint: '/undo-auto-entity/',
    selfFetching: true,
    title: () => 'Undo auto-mount test',
    render: () => <Body />,
  },
});

let seq = 0;

function Opener({ id }: { id: string }) {
  const { openEntity } = useWindowManager();
  useEffect(() => { openEntity(ENTITY_TYPE, id, undefined, 'Undo auto-mount test'); }, [openEntity, id]);
  return <div id="taskbar-windows" />;
}

async function openWindow(v: Variant) {
  variant = v;
  const id = String(++seq);
  const panelSelector = `[data-modal-panel][data-window-key="${ENTITY_TYPE}:${id}"]`;
  localStorage.setItem('access_token', 'undo-auto-mount-test');
  localStorage.setItem('erp_open_windows', '[]');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mounted = render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <WindowManagerProvider>
            <Opener id={id} />
          </WindowManagerProvider>
        </ConfirmProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await waitFor(() => document.querySelector(panelSelector) !== null, 'the window never opened');
  // Registration happens in the form's effects, and the footer follows a
  // render later — wait for the state, not a count of turns.
  await flush();
  await flush();
  const panel = () => document.querySelector<HTMLElement>(panelSelector)!;
  return { mounted, panel };
}

const pairs = (root: ParentNode) => root.querySelectorAll<HTMLElement>('[data-undo-controls]');
const undoButton = (root: ParentNode) =>
  root.querySelector<HTMLButtonElement>('[data-undo-controls] button:first-child')!;
const click = (el: HTMLElement | null, what: string) => {
  assert.ok(el, `${what} exists`);
  act(() => { el!.click(); });
};

test('a form that registers state gets Undo/Redo in the window footer without mounting anything', async (t) => {
  const { mounted, panel } = await openWindow('form');
  t.after(() => mounted.unmount());

  const pair = pairs(panel());
  assert.equal(pair.length, 1, 'exactly one pair of controls in the window');
  assert.equal(pair[0].dataset.undoControls, 'shell', 'and it is the one the shell mounted');
  assert.ok(pair[0].closest('[data-modal-panel]') === panel(), 'it sits in this window');
  assert.equal(undoButton(panel()).disabled, true, 'nothing to undo yet');

  click(panel().querySelector('[data-testid="set"]'), 'the Set button');
  await flush();
  assert.equal(undoButton(panel()).disabled, false, 'a change enables Undo');
  assert.equal(undoButton(panel()).title.startsWith('Undo name'), true, 'named after the field');

  click(undoButton(panel()), 'Undo');
  await flush();
  assert.equal(panel().querySelector('[data-testid="value"]')!.textContent, '', 'Undo put the value back');
});

test('a window whose content registers no state shows no controls', async (t) => {
  const { mounted, panel } = await openWindow('no-state');
  t.after(() => mounted.unmount());
  assert.ok(panel().querySelector('[data-testid="static"]'), 'the content rendered');
  assert.equal(pairs(panel()).length, 0, 'no dead pair on a window with nothing to take back');
});

test('a form still mounting its own <UndoControls /> shows one pair, not two', async (t) => {
  const { mounted, panel } = await openWindow('own-mount');
  t.after(() => mounted.unmount());
  const pair = pairs(panel());
  assert.equal(pair.length, 1, 'one pair');
  assert.equal(pair[0].dataset.undoControls, 'shell', "the form's own mount stood down");
});

test('a form that says useUndoCanEdit(false) gets no controls, even with state registered', async (t) => {
  const { mounted, panel } = await openWindow('read-only');
  t.after(() => mounted.unmount());
  assert.ok(panel().querySelector('[data-testid="value"]'), 'the field rendered');
  assert.equal(pairs(panel()).length, 0, 'read-only: nothing to take back, nothing shown');
});

test('a provider nested inside the window portals its own pair into the footer — once', async (t) => {
  const { mounted, panel } = await openWindow('nested-provider');
  t.after(() => mounted.unmount());
  const pair = pairs(panel());
  assert.equal(pair.length, 1, 'one pair');
  assert.ok(pair[0].closest('[data-modal-actions-left]'), 'landed in the left action slot through ModalActions');
  click(panel().querySelector('[data-testid="set"]'), 'the Set button');
  await flush();
  assert.equal(undoButton(panel()).disabled, false, 'and it is wired to the stack the field is on');
});

test('a dialog the form opens does not grow a second pair in its own footer', async (t) => {
  const { mounted, panel } = await openWindow('child-dialog');
  t.after(() => mounted.unmount());
  const dialogBody = document.querySelector('[data-testid="dialog-body"]');
  assert.ok(dialogBody, 'the child dialog opened');
  const dialogPanel = dialogBody!.closest<HTMLElement>('[data-modal-panel]')!;
  assert.notEqual(dialogPanel, panel(), 'the dialog is its own panel');
  assert.equal(pairs(dialogPanel).length, 0, 'no controls in the dialog footer');
  assert.equal(pairs(panel()).length, 1, 'the window keeps its one pair');
});
