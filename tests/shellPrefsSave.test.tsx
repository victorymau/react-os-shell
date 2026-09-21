/**
 * `useShellPrefs().save` never rejects; `useShellPrefsAdapter().save` does.
 *
 * The shell asks consumers for an adapter that reports a failed write, because
 * that is the only way `SessionWindowRestore` can tell a lost write from a
 * saved one and retry it. But nearly every other caller fires and forgets —
 * `save({ desktop_bg: bg })` in an onChange, result discarded — and a rejecting
 * adapter turns each of those into an unhandled rejection, once per failed
 * PATCH, in the shell and in every consumer.
 *
 * So the two are split: the hook components use swallows, and the raw adapter
 * (SessionRestore's) still rejects. Pinned here because the failure is a
 * runtime event no typecheck sees, and because re-pointing SessionRestore at
 * `useShellPrefs` would silently undo the retry it was given in 4.118.2.
 */
import { act, render } from './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShellPrefsProvider,
  useShellPrefs,
  useShellPrefsAdapter,
  type ShellPrefsAdapter,
} from '../src/shell/ShellPrefs';

let wrapped: ShellPrefsAdapter | null = null;
let raw: ShellPrefsAdapter | null = null;
function Capture() {
  wrapped = useShellPrefs();
  raw = useShellPrefsAdapter();
  return null;
}

function mount(adapter?: ShellPrefsAdapter) {
  return render(
    adapter
      ? <ShellPrefsProvider value={adapter}><Capture /></ShellPrefsProvider>
      : <Capture />,
  );
}

/** An adapter shaped like a portal's once it stops swallowing its own PATCH
 *  failure: the promise it hands back rejects. */
const rejecting = (): ShellPrefsAdapter => ({
  prefs: { theme: 'dark' },
  save: () => Promise.reject(new Error('PATCH failed')),
});

/** How a promise settled, without letting a rejection escape the assertion. */
async function settle(result: Promise<void> | void): Promise<'resolved' | 'rejected'> {
  let how: 'resolved' | 'rejected' = 'resolved';
  await Promise.resolve(result).then(() => {}, () => { how = 'rejected'; });
  return how;
}

test('a save the adapter rejects resolves for a component', async () => {
  const view = mount(rejecting());
  let how: string = '';
  await act(async () => { how = await settle(wrapped!.save({ desktop_bg: 'x' })); });
  assert.equal(how, 'resolved', 'a fire-and-forget caller must never see a rejection');
  await act(async () => { view.unmount(); });
});

test('the same save still rejects through the raw adapter', async () => {
  const view = mount(rejecting());
  let how: string = '';
  await act(async () => { how = await settle(raw!.save({ desktop_bg: 'x' })); });
  assert.equal(how, 'rejected', 'SessionRestore needs the failure to retry the write');
  await act(async () => { view.unmount(); });
});

test('a void-returning adapter still returns void, and the patch lands', async () => {
  const store: Record<string, unknown> = {};
  const view = mount({ prefs: store, save: patch => { Object.assign(store, patch); } });
  // The bundled localStorage adapter returns nothing; wrapping must not make
  // it thenable, or `save(…) ?? fallback` style callers change behaviour.
  assert.equal(wrapped!.save({ taskbar_size: 'large' }), undefined);
  assert.equal(store.taskbar_size, 'large');
  await act(async () => { view.unmount(); });
});

test('prefs pass through untouched', async () => {
  const view = mount(rejecting());
  assert.deepEqual(wrapped!.prefs, { theme: 'dark' });
  await act(async () => { view.unmount(); });
});

test('with no provider, reads empty and drops the save without throwing', async () => {
  const view = mount();
  assert.deepEqual(wrapped!.prefs, {});
  assert.equal(wrapped!.save({ anything: 1 }), undefined);
  assert.equal(raw!.save({ anything: 1 }), undefined);
  await act(async () => { view.unmount(); });
});
