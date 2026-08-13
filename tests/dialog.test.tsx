import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoot, act } from './dom';
import Dialog from '../src/shell/Dialog';
import { ConfirmProvider, confirm, confirmDestructive } from '../src/shell/ConfirmDialog';
import { runEscapeInterceptors } from '../src/shell/escapeInterceptors';

/**
 * 4.18.0 rebuilt the imperative dialogs on the package's own `Dialog` so that
 * asking a yes/no question stopped costing a consumer `@headlessui/react` and
 * `@heroicons/react`. Three portals render these, so the behaviour that used to
 * come from a library now has to be asserted rather than assumed.
 *
 * What is pinned here is the part that is dangerous to get wrong: a confirm
 * with nothing mounted must answer NO, a destructive action must never be what
 * focus or Enter lands on, and Escape over a stack must dismiss the dialog the
 * user is actually looking at.
 */

const escape = () => runEscapeInterceptors(new KeyboardEvent('keydown', { key: 'Escape' }));

function mount(ui: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(ui); });
  return {
    host,
    unmount: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

/**
 * The open dialog. There is only ever one in the DOM here, because a closed
 * `Dialog` renders null — the Headless UI version this replaced kept all three
 * of the provider's dialogs mounted at all times.
 */
const openDialog = () => document.querySelector('[role="dialog"]') as HTMLElement;
const buttons = () => Array.from(openDialog().querySelectorAll('button'));
const byLabel = (label: string) => buttons().find(b => b.textContent === label)!;

/**
 * Call an imperative dialog and let its state update settle.
 *
 * Sync `act`, deliberately. These functions return a promise that stays pending
 * until the user answers, and awaiting an async `act` scope that contains one
 * never returns — the test hangs rather than failing, which is a considerably
 * worse way to find out something is wrong.
 */
function ask<T>(fn: () => Promise<T>): Promise<T> {
  let answer!: Promise<T>;
  act(() => { answer = fn(); });
  return answer;
}

/** Flush a pending render without introducing an async act scope. */
const flush = () => act(() => {});

test('a confirm with no provider mounted resolves false, never true', async () => {
  // Fail-closed. A dialog nobody can see must not be able to authorise
  // anything — that is the difference between a no-op and a deletion.
  assert.equal(await confirm('Delete everything?'), false);
  assert.equal(await confirmDestructive({ message: 'Drop the tenant' }), false);
});

test('Dialog renders nothing while closed', () => {
  const { host, unmount } = mount(<Dialog open={false} onClose={() => {}}>body</Dialog>);
  assert.equal(host.textContent, '');
  unmount();
});

test('Dialog is an accessible modal with its own label', () => {
  const { unmount } = mount(<Dialog open onClose={() => {}} title="Confirm">body</Dialog>);
  const panel = document.querySelector('[role="dialog"]');
  assert.ok(panel, 'renders a dialog role');
  assert.equal(panel?.getAttribute('aria-modal'), 'true');
  // The NAME, not the attribute that happens to carry it: the title is wired
  // through aria-labelledby so an element title is named too, and asserting on
  // aria-label would have locked in the mechanism that could not do that.
  const labelledBy = panel?.getAttribute('aria-labelledby');
  assert.equal(document.getElementById(labelledBy ?? '')?.textContent, 'Confirm');
  unmount();
});

test('Escape closes a dialog, and a blocking dialog claims Escape without closing', () => {
  let closed = 0;
  const { unmount } = mount(<Dialog open onClose={() => { closed++; }}>body</Dialog>);
  assert.equal(escape(), true, 'the dialog claims the key');
  assert.equal(closed, 1);
  unmount();

  closed = 0;
  const blocking = mount(<Dialog open blocking onClose={() => { closed++; }}>body</Dialog>);
  // Still claimed — otherwise Escape would fall through to the shell and close
  // the WINDOW BEHIND the dialog — but deliberately does nothing.
  assert.equal(escape(), true);
  assert.equal(closed, 0);
  blocking.unmount();
});

test('Escape over a stack dismisses the top-most dialog, not the one beneath', () => {
  // The regression that made this ordering matter: interceptors used to run
  // oldest-first, so a second dialog opened on top of a first handed Escape to
  // the first — dismissing something the user could not see while the dialog in
  // front of them stayed put.
  let closedBottom = 0;
  let closedTop = 0;
  const { unmount } = mount(
    <>
      <Dialog open onClose={() => { closedBottom++; }}>bottom</Dialog>
      <Dialog open onClose={() => { closedTop++; }}>top</Dialog>
    </>,
  );
  escape();
  assert.equal(closedTop, 1, 'the top dialog closed');
  assert.equal(closedBottom, 0, 'the one underneath did not');
  unmount();
});

test('a blocking dialog on top shields the one beneath from Escape', () => {
  let closedBottom = 0;
  const { unmount } = mount(
    <>
      <Dialog open onClose={() => { closedBottom++; }}>bottom</Dialog>
      <Dialog open blocking onClose={() => {}}>top</Dialog>
    </>,
  );
  escape();
  assert.equal(closedBottom, 0);
  unmount();
});

test('a closed dialog is absent from the DOM, not merely hidden', () => {
  // The Headless UI version kept all three of the provider's dialogs mounted
  // at all times. Nothing renders now until something is asked.
  const { unmount } = mount(<ConfirmProvider><div /></ConfirmProvider>);
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 0);
  unmount();
});

test('confirm: cancel takes focus, and the confirming action is last in the DOM', async () => {
  const { unmount } = mount(<ConfirmProvider><div /></ConfirmProvider>);
  const answer = ask(() => confirm({ message: 'Delete the invoice?', confirmLabel: 'Delete' }));

  assert.deepEqual(buttons().map(b => b.textContent), ['Cancel', 'Delete'], 'destructive action on the right');
  assert.equal(document.activeElement, buttons()[0], 'focus starts on Cancel, not Delete');

  act(() => { byLabel('Cancel').click(); });
  assert.equal(await answer, false);
  unmount();
});

test('confirmDestructive without a confirmWord is a plain two-button dialog', async () => {
  // The 4.18.0 change. Type-to-confirm assumes a keyboard; a till has none, so
  // requiring a typed word there makes the dialog unanswerable.
  const { unmount } = mount(<ConfirmProvider><div /></ConfirmProvider>);
  const answer = ask(() => confirmDestructive({ message: 'Discard this parked sale?', confirmLabel: 'Discard' }));

  assert.equal(openDialog().querySelector('input'), null, 'no word to type');
  const action = byLabel('Discard');
  assert.equal(action.disabled, false, 'enabled without typing anything');
  // And it is still not what focus landed on.
  assert.equal(document.activeElement, byLabel('Dismiss'));

  act(() => { action.click(); });
  assert.equal(await answer, true);
  unmount();
});

test('confirmDestructive with a confirmWord still gates on typing it exactly', async () => {
  const { unmount } = mount(<ConfirmProvider><div /></ConfirmProvider>);
  const answer = ask(() => confirmDestructive({ message: 'Drop the tenant', confirmWord: 'DELETE' }));

  assert.ok(openDialog().querySelector('input'), 'there is a word to type');
  assert.equal(byLabel('DELETE').disabled, true, 'disabled until the word matches');

  act(() => { byLabel('Dismiss').click(); });
  assert.equal(await answer, false);
  unmount();
});

test('a second confirm queues rather than being dropped', async () => {
  // Dropping it would resolve a question the user was never asked, and the
  // caller cannot tell that apart from a genuine "no".
  const { unmount } = mount(<ConfirmProvider><div /></ConfirmProvider>);
  const first = ask(() => confirm('First?'));
  const second = ask(() => confirm('Second?'));

  assert.match(openDialog().textContent ?? '', /First\?/);

  act(() => { byLabel('OK').click(); });
  assert.equal(await first, true);

  flush();
  assert.match(openDialog().textContent ?? '', /Second\?/, 'the queued one is now showing');
  act(() => { byLabel('OK').click(); });
  assert.equal(await second, true);
  unmount();
});
