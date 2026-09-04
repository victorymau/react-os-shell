/**
 * Who wins when the user's saved columns and the admin's default columns both
 * exist — the half of SG#00590 that was rewritten rather than moved.
 *
 * `useColumnConfig` used to resolve both in one `Promise.all` and choose
 * between them with a plain `if (userSaved) … else if (adminDefault) …`, so
 * the precedence was a property of a single expression. It is now two
 * independent effects — the user's config arrives from the prefs adapter, the
 * admin default from a react-query probe — and the precedence lives in a guard
 * (`userSavedRef`) plus the order the two effects happen to fire in. That is
 * strictly more ways to be wrong, and the suite had nothing to say about any of
 * them: every existing spec that touches these hooks answers `visible_columns:
 * []`, which the hook reads as "no admin opinion" and skips. Deleting the
 * admin-defaults branch outright changed no test result.
 *
 * So the claims here are the precedence itself, with a NON-EMPTY
 * `visible_columns`:
 *
 *  - with no prefs, the admin default applies, and it hides the columns it
 *    omits and shows the ones it names even against `defaultHidden`;
 *  - with prefs, the admin default never wins — neither when it lands after
 *    prefs are already in hand, nor when prefs turn up after it has applied
 *    (the docblock's "applies for a beat, then the user's own config replaces
 *    it": the beat is allowed, the final state is not);
 *  - a Reset afterwards restores the CONSUMER's `ColumnDef` defaults, and a
 *    later re-delivery of the admin default does not undo it.
 *
 * The admin default is delivered under test control (a promise this file
 * resolves) rather than "soon", so a test that asserts the user's config
 * survived cannot pass by asserting it before the probe ever answered.
 */
import type { ReactElement } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, flush, waitFor, act } from './dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setShellApiClient, type AxiosInstance } from '../src/api/client';
import { ShellPrefsProvider, type ShellPrefsAdapter } from '../src/shell/ShellPrefs';
import { useColumnConfig } from '../src/data/useColumnConfig';
import { useDefaultColumnConfig, type DefaultColumnConfig } from '../src/data/useDefaultColumnConfig';
import type { ColumnDef } from '../src/data/types';

// `supplier` is `defaultHidden` and the admin default below lists it as
// VISIBLE, while `sku` is visible by default and the admin default omits it.
// So "the admin default applied" and "the admin default did nothing" are
// different hidden-sets in both directions — an assertion that could not be
// satisfied by leaving the initial state alone.
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'sku', label: 'SKU' },
  { key: 'supplier', label: 'Supplier', defaultHidden: true },
  { key: '_select', label: '' },
];

const ADMIN_VISIBLE = ['name', 'supplier'];

type Answer = { visible_columns: string[] | null; sort: null };

let answer: (value: Answer) => void = () => {};
let probeCalls = 0;
let nextAnswers: Answer[] = [];

// One deferred answer per GET: the first call parks until the test resolves it,
// later calls (a refetch) take the head of `nextAnswers`.
setShellApiClient({
  get: (url: string) => {
    if (!url.startsWith('/auth/default-columns/')) return Promise.resolve({ data: null });
    probeCalls += 1;
    const queued = nextAnswers.shift();
    if (queued) return Promise.resolve({ data: queued });
    return new Promise<{ data: Answer }>((resolve) => {
      answer = (value) => resolve({ data: value });
    });
  },
  patch: () => Promise.resolve({ data: null }),
} as unknown as AxiosInstance);

function resetTransport() {
  probeCalls = 0;
  nextAnswers = [];
  answer = () => {};
}

type Hook = ReturnType<typeof useColumnConfig>;

const hiddenKeys = (hook: Hook) =>
  hook.allColumns.filter(c => c.hidden).map(c => c.key).sort();

const widthOf = (hook: Hook, key: string) =>
  hook.orderedColumns.find(c => c.key === key)?.width;

/**
 * Mount a `useColumnConfig` probe plus a watcher on the shared defaults query.
 *
 * The watcher is what makes "the admin default had its chance" checkable: it
 * subscribes to the same react-query key, so once IT sees data, the probe has
 * resolved and `useColumnConfig`'s effect has had the same render to act on.
 * Without it a test could assert the user's config survived at a moment the
 * admin default simply had not arrived yet.
 */
function mountProbe(tableId: string, initialPrefs: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook: { current: Hook | null } = { current: null };
  const seen: { current: DefaultColumnConfig | undefined } = { current: undefined };

  function Probe() {
    hook.current = useColumnConfig(tableId, COLUMNS);
    return null;
  }
  function Watcher() {
    seen.current = useDefaultColumnConfig(tableId).defaultConfig;
    return null;
  }
  const tree = (prefs: Record<string, unknown>): ReactElement => (
    <QueryClientProvider client={client}>
      <ShellPrefsProvider value={{ prefs, save: () => {} } as ShellPrefsAdapter}>
        <Probe />
        <Watcher />
      </ShellPrefsProvider>
    </QueryClientProvider>
  );

  const { rerender, unmount } = render(tree(initialPrefs));
  return {
    hook,
    seen,
    client,
    setPrefs: (prefs: Record<string, unknown>) => rerender(tree(prefs)),
    // `clear()` with the unmount: an idle entry holds a five-minute gc timer,
    // which keeps node's runner from exiting.
    unmount: () => { unmount(); client.clear(); },
  };
}

test('with no user prefs, the admin default applies and hides what it omits', async (t) => {
  localStorage.clear();
  resetTransport();

  const { hook, unmount } = mountProbe('sg590-admin-only', {});
  t.after(unmount);
  await flush();

  assert.deepEqual(
    hiddenKeys(hook.current!),
    ['supplier'],
    'before the probe answers, the ColumnDef defaults stand',
  );

  await act(async () => { answer({ visible_columns: ADMIN_VISIBLE, sort: null }); });
  await waitFor(
    () => hiddenKeys(hook.current!).join() === 'sku',
    () => `the admin default never applied: ${JSON.stringify(hook.current!.allColumns)}`,
  );

  const all = hook.current!.allColumns;
  assert.equal(all[0]?.key, '_select', '_select stays pinned at index 0');
  assert.equal(all[0]?.hidden, false, '_select stays visible even though the admin default omits it');
  assert.equal(
    all.find(c => c.key === 'supplier')?.hidden,
    false,
    'a defaultHidden column the admin default NAMES becomes visible',
  );
  assert.equal(widthOf(hook.current!, 'name'), 150, 'the admin default carries the ColumnDef widths');
  assert.equal(probeCalls, 1);
});

test('user prefs held before the admin default lands are not overwritten by it', async (t) => {
  localStorage.clear();
  resetTransport();

  const saved = [
    { key: 'name', width: 111 },
    { key: 'sku', width: 222 },
  ];
  const { hook, seen, unmount } = mountProbe('sg590-prefs-first', {
    'columns_sg590-prefs-first': saved,
  });
  t.after(unmount);

  await waitFor(
    () => widthOf(hook.current!, 'name') === 111,
    'the user\'s saved config never applied',
  );
  assert.deepEqual(hiddenKeys(hook.current!), ['supplier']);

  // Now let the admin default arrive, and wait until it demonstrably has.
  await act(async () => { answer({ visible_columns: ADMIN_VISIBLE, sort: null }); });
  await waitFor(
    () => seen.current !== undefined,
    'the admin default never resolved, so this test would prove nothing',
  );
  await flush();
  await flush();

  assert.deepEqual(
    hiddenKeys(hook.current!),
    ['supplier'],
    'the admin default must not overwrite a config the user has already saved',
  );
  assert.equal(widthOf(hook.current!, 'name'), 111, 'the user\'s widths survive too');
});

test('user prefs delivered after the admin default has applied still win', async (t) => {
  localStorage.clear();
  resetTransport();

  const { hook, setPrefs, unmount } = mountProbe('sg590-prefs-late', {});
  t.after(unmount);

  await act(async () => { answer({ visible_columns: ADMIN_VISIBLE, sort: null }); });
  await waitFor(
    () => hiddenKeys(hook.current!).join() === 'sku',
    'the admin default never applied, so the late-prefs case is untested',
  );

  // The adapter resolves: prefs turn up a beat after the probe did.
  await act(async () => {
    setPrefs({ 'columns_sg590-prefs-late': [{ key: 'name', width: 111 }, { key: 'sku', width: 222 }] });
  });
  await waitFor(
    () => hiddenKeys(hook.current!).join() === 'supplier',
    () => `late prefs never replaced the admin default: ${JSON.stringify(hook.current!.allColumns)}`,
  );
  assert.equal(widthOf(hook.current!, 'name'), 111);
});

test('Reset after an admin default restores the ColumnDef defaults, and a re-delivery does not undo it', async (t) => {
  localStorage.clear();
  resetTransport();

  const { hook, seen, client, unmount } = mountProbe('sg590-reset-after-admin', {});
  t.after(unmount);

  await act(async () => { answer({ visible_columns: ADMIN_VISIBLE, sort: null }); });
  await waitFor(
    () => hiddenKeys(hook.current!).join() === 'sku',
    'the admin default never applied',
  );

  await act(() => { hook.current!.resetColumns(); });
  assert.deepEqual(
    hiddenKeys(hook.current!),
    ['supplier'],
    'Reset restores the consumer\'s ColumnDef defaults, defaultHidden included — not the admin row',
  );
  const all = hook.current!.allColumns;
  assert.equal(all[0]?.key, '_select');
  assert.equal(all[0]?.hidden, false);

  // A refetch delivers a DIFFERENT admin row, so react-query's structural
  // sharing cannot hand back the same object and the effect really re-runs.
  nextAnswers = [{ visible_columns: ['name'], sort: null }];
  await act(async () => { await client.invalidateQueries(); });
  await waitFor(
    () => (seen.current?.visible_columns ?? []).join() === 'name',
    'the second admin row never arrived, so the re-delivery case is untested',
  );
  await flush();

  assert.deepEqual(
    hiddenKeys(hook.current!),
    ['supplier'],
    'a change made this mount outranks any later delivery of the admin default',
  );
});
