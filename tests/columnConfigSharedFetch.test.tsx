/**
 * Regression guard for SG#00590 — every list-screen mount re-fetched the whole
 * user profile, and the two hooks a list page calls each probed the table's
 * admin defaults separately.
 *
 * `useColumnConfig`'s restore effect was a raw
 * `Promise.all([GET /auth/me/, GET /auth/default-columns/{tableId}/])` fired
 * outside react-query and keyed only on `[tableId]`, so it re-ran on every
 * mount. The consumer axios instances carry no cache adapter and no in-flight
 * dedupe, so each of those was a real round trip — and `/auth/me/` is the
 * ~1.5 MB profile the consumer already holds in one cached react-query entry,
 * the same one the `<ShellPrefsProvider>` adapter reads. On the admin portal a
 * single screen pays for it twice, because `CsvActionButton`'s column-aware
 * export calls `useColumnConfig` again alongside the `<EntityList>`.
 *
 * `useSort` asked for `/auth/default-columns/{tableId}/` too, for the `sort`
 * field off the same row, so a list page issued that request twice as well.
 *
 * The claims below are therefore: the profile GET is gone and the saved
 * columns come from the prefs adapter instead; the defaults probe is one
 * request no matter how many hooks or tables ask for it; and a column change
 * is saved through the adapter (which updates the cached profile) rather than
 * behind its back with a raw PATCH.
 *
 * A fourth test guards the hazard the adapter introduced: the saved array now
 * belongs to the consumer's cached profile object, and `pinSelectColumn`
 * writes `hidden` on the entry it pins. Copy dropped, and the hook corrupts
 * the cache every other hook reads.
 */
import type { ReactElement } from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, flush, waitFor, act } from './dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setShellApiClient, type AxiosInstance } from '../src/api/client';
import { ShellPrefsProvider, type ShellPrefsAdapter } from '../src/shell/ShellPrefs';
import { useColumnConfig } from '../src/data/useColumnConfig';
import { useSort } from '../src/data/useSort';
import type { ColumnDef } from '../src/data/types';

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'sku', label: 'SKU' },
  { key: 'supplier', label: 'Supplier', defaultHidden: true },
  { key: '_select', label: '' },
];

// Every request the hooks make, in order. The shell's `apiClient` is a proxy
// over whatever the consumer registers, so registering a recorder here is the
// same seam a portal uses — and it makes `isShellApiClientConfigured()` true,
// which is what gates the defaults probe.
let requests: Array<{ url: string; params?: Record<string, unknown> }> = [];
let patches: Array<{ url: string; body: unknown }> = [];

// Admin-saved defaults for the tables below. `visible_columns` is empty, which
// the hook reads as "no admin opinion" — these tests are about how MANY times
// the row is fetched, not what it says.
setShellApiClient({
  get: (url: string, config?: { params?: Record<string, unknown> }) => {
    requests.push({ url, params: config?.params });
    if (url.startsWith('/auth/default-columns/')) {
      return Promise.resolve({ data: { visible_columns: [], sort: null } });
    }
    return Promise.resolve({ data: null });
  },
  patch: (url: string, body: unknown) => {
    patches.push({ url, body });
    return Promise.resolve({ data: null });
  },
} as unknown as AxiosInstance);

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// A fresh client per test, and torn down with the tree: an idle react-query
// entry holds a 5-minute garbage-collection timer, which keeps node's event
// loop alive long after the last assertion. `clear()` destroys the entries and
// the timers with them, so this file exits in a second rather than five
// minutes. (Nothing in the hooks under test schedules that timer — it is
// react-query's own `gcTime`.)
function mount(ui: ReactElement, prefs: ShellPrefsAdapter) {
  const client = freshClient();
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <ShellPrefsProvider value={prefs}>{ui}</ShellPrefsProvider>
    </QueryClientProvider>,
  );
  return { unmount: () => { unmount(); client.clear(); } };
}

const emptyPrefs = (): ShellPrefsAdapter => ({ prefs: {}, save: () => {} });

const defaultsProbes = (tableId: string) =>
  requests.filter(r => r.url === `/auth/default-columns/${tableId}/`);

test('a list mount reads saved columns from the prefs adapter, not GET /auth/me/', async (t) => {
  localStorage.clear();
  requests = [];

  // The shape the adapter hands over: the user's saved config, living inside
  // the profile the consumer already has cached.
  const saved = [
    { key: '_select', width: 40, hidden: true },
    { key: 'sku', width: 222, hidden: true },
    { key: 'name', width: 111 },
  ];
  const ref: { current: ReturnType<typeof useColumnConfig> | null } = { current: null };
  function Probe() {
    ref.current = useColumnConfig('sg590-prefs', COLUMNS);
    return null;
  }

  const { unmount } = mount(<Probe />, { prefs: { 'columns_sg590-prefs': saved }, save: () => {} });
  t.after(unmount);

  await waitFor(
    () => ref.current!.allColumns.some(c => c.key === 'sku' && c.hidden),
    () => `columns never restored from prefs: ${JSON.stringify(ref.current!.allColumns)}`,
  );

  assert.deepEqual(
    requests.map(r => r.url).filter(u => u === '/auth/me/'),
    [],
    'mounting a list must not fetch the user profile — the prefs adapter already holds it',
  );

  // The restore itself still happened, and still pins `_select` visible.
  const all = ref.current!.allColumns;
  assert.equal(all[0]?.key, '_select');
  assert.equal(all[0]?.hidden, false);
  assert.deepEqual(
    all.filter(c => c.hidden).map(c => c.key).sort(),
    ['sku', 'supplier'],
    'saved hidden flags apply, and a column absent from the saved config falls back to its ColumnDef defaultHidden',
  );
  assert.equal(
    ref.current!.orderedColumns.find(c => c.key === 'name')?.width,
    111,
    'saved widths apply',
  );
});

test('the saved config handed over by the adapter is not mutated in place', async (t) => {
  localStorage.clear();
  requests = [];

  // `_select` last and hidden: `pinSelectColumn` moves it to index 0 and sets
  // `hidden = false`. If the hook works on the adapter's own objects, this
  // array — which belongs to the cached profile every other consumer of
  // `/auth/me/` reads — comes back reordered and re-flagged.
  const saved = [
    { key: 'name', width: 111 },
    { key: '_select', width: 40, hidden: true },
  ];
  const snapshot = JSON.stringify(saved);

  function Probe() {
    useColumnConfig('sg590-nomutate', COLUMNS);
    return null;
  }
  const { unmount } = mount(<Probe />, { prefs: { 'columns_sg590-nomutate': saved }, save: () => {} });
  t.after(unmount);
  await flush();
  await flush();

  assert.equal(
    JSON.stringify(saved),
    snapshot,
    'the hook must copy the adapter\'s saved entries before pinning _select, not rewrite the cached profile',
  );
});

test('useColumnConfig and useSort share one default-columns probe per table', async (t) => {
  localStorage.clear();
  requests = [];

  // What a real list page does: `<EntityList>` drives both hooks against the
  // same tableId, and on the admin portal `CsvActionButton` adds a second
  // `useColumnConfig` for the same table on the same screen.
  function ListScreen() {
    useColumnConfig('sg590-shared', COLUMNS);
    useSort('name', 'asc', 'sg590-shared');
    return null;
  }
  function CsvButton() {
    useColumnConfig('sg590-shared', COLUMNS);
    return null;
  }

  const { unmount } = mount(<><ListScreen /><CsvButton /></>, emptyPrefs());
  t.after(unmount);

  await waitFor(
    () => defaultsProbes('sg590-shared').length > 0,
    'the defaults probe never fired at all',
  );
  // Give any duplicate the same chance to land as the first one had.
  await flush();
  await flush();

  assert.equal(
    defaultsProbes('sg590-shared').length,
    1,
    `three hooks on one table must share a single /auth/default-columns/ request, got ${JSON.stringify(requests.map(r => r.url))}`,
  );
  assert.deepEqual(
    defaultsProbes('sg590-shared')[0].params,
    { viewport: 'desktop' },
    'the shared probe still sends the viewport the callers used to send',
  );
});

test('a column change is saved through the prefs adapter, not a raw PATCH /auth/me/', async (t) => {
  localStorage.clear();
  requests = [];
  patches = [];

  const saves: Array<Record<string, unknown>> = [];
  const ref: { current: ReturnType<typeof useColumnConfig> | null } = { current: null };
  function Probe() {
    ref.current = useColumnConfig('sg590-save', COLUMNS);
    return null;
  }
  const { unmount } = mount(<Probe />, { prefs: {}, save: (patch) => { saves.push(patch); } });
  t.after(unmount);
  await flush();

  await act(() => { ref.current!.toggleColumn('sku'); });

  // The save is debounced by a second.
  await waitFor(
    () => saves.length > 0,
    'the column change never reached the prefs adapter',
    { timeout: 8000 },
  );

  assert.equal(Object.keys(saves[0]).length, 1, 'the save must be a one-key shallow patch');
  const hiddenKeys = (saves[0]['columns_sg590-save'] as Array<{ key: string; hidden?: boolean }>)
    .filter(c => c.hidden).map(c => c.key).sort();
  assert.deepEqual(hiddenKeys, ['sku', 'supplier'], 'the adapter receives the new column state');

  assert.deepEqual(
    patches.filter(p => p.url === '/auth/me/'),
    [],
    'saving must go through the adapter (which updates the cached profile), not behind it',
  );
});
