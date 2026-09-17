/**
 * A saved sort must be a column the list offers.
 *
 * The table makes a column sortable on `sortField ?? key`, and `useSort` saves
 * the choice per list. A sort saved on a field the columns no longer offer —
 * a column since given `sortField: ''`, or renamed onto another `sortField` —
 * goes out as `?ordering=` on every open. DRF drops a term it cannot order by
 * and returns the list unsorted, so the list stays unsorted for good.
 *
 * Given `columns`, `useSort` falls back to the page default whenever the saved
 * field is not one of them offers. Without `columns` it behaves as before, and
 * an empty array counts as "not given" — see the last spec.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect, useState } from 'react';
import { render, flush, waitFor } from './dom';
import { setShellApiClient, type AxiosInstance } from '../src/api/client';
import { __resetOwnedQueryClient } from '../src/data/useDefaultColumnConfig';
import { useSort } from '../src/data/useSort';
import type { ColumnDef } from '../src/data/types';

afterEach(__resetOwnedQueryClient);

const COLUMNS: ColumnDef[] = [
  { key: '_select', label: '' },
  { key: 'channel', label: 'Channel', sortField: 'provider' },
  { key: 'part_number', label: 'Part Number' },
  { key: 'stock', label: 'Stock', sortField: '' },
];

let adminSort: unknown = null;
let requests: string[] = [];
setShellApiClient({
  get: (url: string) => { requests.push(url); return Promise.resolve({ data: { sort: adminSort } }); },
  patch: () => Promise.resolve({ data: null }),
} as unknown as AxiosInstance);

function mount(tableId: string, saved: unknown, columns?: ColumnDef[]) {
  localStorage.clear();
  if (saved) localStorage.setItem(`sort-config-${tableId}`, JSON.stringify(saved));
  const ref: { current: ReturnType<typeof useSort> | null } = { current: null };
  function Probe() {
    ref.current = columns
      ? useSort('part_number', 'desc', tableId, { columns })
      : useSort('part_number', 'desc', tableId);
    return null;
  }
  const r = render(<Probe />);
  return { ref, unmount: r.unmount };
}

test('a saved sort on a column with sortField "" falls back to the default', async (t) => {
  adminSort = null;
  const { ref, unmount } = mount('offered-off', { field: 'stock', direction: 'asc' }, COLUMNS);
  t.after(unmount);
  await flush();
  assert.equal(ref.current!.ordering, '-part_number');
  assert.deepEqual(ref.current!.sort, { field: 'part_number', direction: 'desc' });
});

test('a saved sort on a KEY whose column sorts on another sortField falls back', async (t) => {
  adminSort = null;
  const { ref, unmount } = mount('offered-key', { field: 'channel', direction: 'asc' }, COLUMNS);
  t.after(unmount);
  await flush();
  assert.equal(ref.current!.ordering, '-part_number');
});

test('_select is never offered', async (t) => {
  adminSort = null;
  const { ref, unmount } = mount('offered-select', { field: '_select', direction: 'asc' }, COLUMNS);
  t.after(unmount);
  await flush();
  assert.equal(ref.current!.ordering, '-part_number');
});

test('a saved sort the columns offer is kept — by sortField and by key', async (t) => {
  adminSort = null;
  const a = mount('offered-yes-a', { field: 'provider', direction: 'asc' }, COLUMNS);
  t.after(a.unmount);
  await flush();
  assert.equal(a.ref.current!.ordering, 'provider');
  const b = mount('offered-yes-b', { field: 'part_number', direction: 'asc' }, COLUMNS);
  t.after(b.unmount);
  await flush();
  assert.equal(b.ref.current!.ordering, 'part_number');
});

test('an admin-saved default the columns do not offer falls back too', async (t) => {
  adminSort = { field: 'stock', direction: 'asc' };
  // Control: with no columns the same admin default DOES land — so the check
  // below is about the columns, not about a probe that never resolved.
  const control = mount('offered-admin-control', null);
  t.after(control.unmount);
  await waitFor(() => control.ref.current!.ordering === 'stock', () => `control never applied: ${control.ref.current!.ordering}`);

  requests = [];
  const { ref, unmount } = mount('offered-admin', null, COLUMNS);
  t.after(unmount);
  await waitFor(() => requests.length > 0, 'the defaults probe never fired');
  await flush(); await flush(); await flush();
  assert.equal(ref.current!.ordering, '-part_number');
});

test('clicking an offered column still sorts on it and saves it', async (t) => {
  adminSort = null;
  const { ref, unmount } = mount('offered-click', { field: 'stock', direction: 'asc' }, COLUMNS);
  t.after(unmount);
  await flush();
  ref.current!.onSort('provider');
  await waitFor(() => ref.current!.ordering === 'provider', () => `ordering was ${ref.current!.ordering}`);
  ref.current!.onSort('provider');
  await waitFor(() => ref.current!.ordering === '-provider', () => `ordering was ${ref.current!.ordering}`);
  assert.equal(localStorage.getItem('sort-config-offered-click'), JSON.stringify({ field: 'provider', direction: 'desc' }));
});

test('without columns the hook behaves as before', async (t) => {
  adminSort = null;
  const { ref, unmount } = mount('offered-none', { field: 'stock', direction: 'asc' });
  t.after(unmount);
  await flush();
  assert.equal(ref.current!.ordering, 'stock');
});

test('columns that arrive after the first render do not flip the ordering', async (t) => {
  adminSort = null;
  // A sort the columns DO offer, so the only question is the empty first
  // render. Reading `[]` as "offers nothing" sent the default out first and
  // the saved sort second: two requests per open, the first sorted wrongly.
  localStorage.clear();
  localStorage.setItem('sort-config-late', JSON.stringify({ field: 'stock', direction: 'asc' }));
  const seen: string[] = [];
  function Probe() {
    const [cols, setCols] = useState<ColumnDef[]>([]);
    useEffect(() => { setCols([{ key: 'part_number', label: 'Part Number' }, { key: 'stock', label: 'Stock' }]); }, []);
    const { ordering } = useSort('part_number', 'desc', 'late', { columns: cols });
    if (seen[seen.length - 1] !== ordering) seen.push(ordering);
    return null;
  }
  const r = render(<Probe />);
  t.after(r.unmount);
  await flush();
  await flush();
  assert.deepEqual(seen, ['stock'], `the ordering changed mid-flight: ${JSON.stringify(seen)}`);
});
