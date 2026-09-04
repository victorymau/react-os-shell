/**
 * Regression guard for BG#00576 — "Reset" in the column picker un-hid every
 * `defaultHidden` column, permanently.
 *
 * `resetColumns` rebuilt the column state as `{ key, width }` and nothing
 * else. `hidden` was never written, so every column a consumer had marked
 * `defaultHidden` came back visible — and because reset also runs
 * `persistColumns`, that wrong state went straight into `localStorage` AND,
 * a second later, into the user's server-side profile. Nothing heals it on a
 * later load: the saved config wins over the `ColumnDef` flags. One click on
 * a list like Part Numbers (35 of 45 columns hidden by default) turned an
 * 11-column grid into a 46-column one for good.
 *
 * The same file's two sibling paths — the no-cache initial state and the
 * server-prefs merge — both carry `defaultHidden` through and both run
 * `pinSelectColumn`. Reset did neither. So the claims below are the two
 * invariants those paths already hold to: a reset restores the CONSUMER's
 * defaults, hidden ones included, and `_select` stays pinned at index 0 and
 * visible — the second of which is why the fixture's `_select` is marked
 * `defaultHidden`, see the note on `COLUMNS`.
 *
 * Asserted through `allColumns` rather than the internal state, because
 * `allColumns` is what the column picker renders its checkboxes from — it is
 * the surface the bug was reported against.
 *
 * The last test covers the other line this change touched — the
 * localStorage-cache merge, which now reads `defaultHidden` the way its
 * server-side twin already did. It needs its own test because the three
 * above clear localStorage before mounting, so none of them enters that
 * branch at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, flush, act } from './dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColumnConfig } from '../src/data/useColumnConfig';
import type { ColumnDef } from '../src/data/types';

// The react-query client is for the shared admin-defaults probe
// (`useDefaultColumnConfig`), not for a mutation — persistence goes through the
// prefs adapter since 4.92.0. Nor is a client REQUIRED any more: the probe
// falls back to one the package owns. Mounting one here keeps that entry inside
// this file, and `clear()` on the way out keeps its five-minute
// garbage-collection timer from holding the runner open. Nothing here reaches a
// network either way: no `setShellApiClient` call has been made, so the probe
// is disabled and the shell's `apiClient` proxy no-ops every HTTP method.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

// `_select` carries `defaultHidden: true` on purpose, and it is the only
// reason the "pinned and visible" claim below can fail. `allColumns` reports
// `hidden: !!c.hidden`, so a `_select` with no `defaultHidden` reads as
// visible whether `pinSelectColumn` forced it or not — the assertion would
// hold against a `pinSelectColumn` that had lost its `sel.hidden = false`.
// Marked hidden by default, only the pin can bring it back visible.
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'sku', label: 'SKU', defaultHidden: true },
  { key: 'supplier', label: 'Supplier', defaultHidden: true },
  { key: '_select', label: '', defaultHidden: true },
];

type Hook = ReturnType<typeof useColumnConfig>;

function mountHook(tableId: string) {
  const ref: { current: Hook | null } = { current: null };
  function Probe() {
    ref.current = useColumnConfig(tableId, COLUMNS);
    return null;
  }
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  return { ref, unmount: () => { unmount(); queryClient.clear(); } };
}

const hiddenKeys = (hook: Hook) =>
  hook.allColumns.filter((c) => c.hidden).map((c) => c.key).sort();

test('resetColumns restores defaultHidden columns as hidden', async (t) => {
  localStorage.clear();
  const { ref, unmount } = mountHook('bg576-reset');
  t.after(unmount);
  await flush();

  // Baseline: the initial state honours `defaultHidden`, which is the
  // behaviour reset is supposed to restore.
  assert.deepEqual(hiddenKeys(ref.current!), ['sku', 'supplier']);

  await act(() => { ref.current!.resetColumns(); });

  assert.deepEqual(
    hiddenKeys(ref.current!),
    ['sku', 'supplier'],
    'reset must put the defaultHidden columns back to hidden, not un-hide them',
  );
});

test('resetColumns persists the hidden flags it restored', async (t) => {
  localStorage.clear();
  const { ref, unmount } = mountHook('bg576-persist');
  t.after(unmount);
  await flush();

  await act(() => { ref.current!.resetColumns(); });

  // The reset is written to localStorage synchronously and PATCHed to the
  // user's profile on a 1s debounce. If `hidden` is missing here, the wrong
  // state is what a reload — and the server — will see.
  const saved = JSON.parse(localStorage.getItem('col-config-bg576-persist')!) as
    Array<{ key: string; hidden?: boolean }>;
  assert.deepEqual(
    saved.filter((c) => c.hidden).map((c) => c.key).sort(),
    ['sku', 'supplier'],
    'the persisted config must carry the restored hidden flags',
  );
});

test('resetColumns pins _select first and visible', async (t) => {
  localStorage.clear();
  const { ref, unmount } = mountHook('bg576-select');
  t.after(unmount);
  await flush();

  await act(() => { ref.current!.resetColumns(); });

  const all = ref.current!.allColumns;
  assert.equal(all[0]?.key, '_select', '_select must be pinned to index 0 after a reset');
  assert.equal(all[0]?.hidden, false, '_select must never come back hidden');
});

/**
 * Cover for the OTHER hunk in this change: the localStorage-cache merge.
 *
 * It is not the reported bug — this path only affects a column added to the
 * consumer's `ColumnDef` list after the cache was written, and only until the
 * profile fetch lands — but it is production code, and every test above
 * clears localStorage first, so none of them so much as enters the branch.
 * Seed a cache and it does.
 */
test('a cached config predating a defaultHidden column brings that column back hidden', async (t) => {
  localStorage.clear();
  // A cache written when the consumer's ColumnDef list had no `supplier`:
  // three keys, and no entry for the fourth. The ColumnDef's `defaultHidden`
  // is therefore the only opinion in existence about `supplier`.
  localStorage.setItem('col-config-bg576-cache', JSON.stringify([
    { key: '_select', width: 40, hidden: false },
    { key: 'name', width: 150 },
    { key: 'sku', width: 150, hidden: true },
  ]));

  const { ref, unmount } = mountHook('bg576-cache');
  t.after(unmount);
  await flush();

  assert.deepEqual(
    hiddenKeys(ref.current!),
    ['sku', 'supplier'],
    'a column absent from the cache must take `hidden` from its ColumnDef `defaultHidden`, not come back visible',
  );
});
