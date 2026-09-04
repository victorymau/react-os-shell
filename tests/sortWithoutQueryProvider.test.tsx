/**
 * The list hooks must not require a `<QueryClientProvider>`.
 *
 * `useSort` used to be pure React plus one raw axios GET, so a consumer could
 * call it anywhere — and the `tableId`-less form, which is just in-memory sort
 * state, reached no network and no react-query at all. SG#00590 routed the
 * admin-defaults probe through react-query, and `useQuery` resolves its client
 * before it looks at `enabled`: every `useSort` call in a tree with no provider
 * above it threw `No QueryClient set, use QueryClientProvider to set one`,
 * including the form that makes no request. A public hook is not allowed to
 * grow a provider requirement quietly, least of all one it never uses.
 *
 * `useDefaultColumnConfig` therefore falls back to a client the package owns
 * when the consumer has not mounted one. The claims below are that both forms
 * of `useSort` and `useColumnConfig` mount and work with NO provider in the
 * tree, that the `tableId`-less form still issues no request, that the
 * `tableId` form still reaches the network and applies what comes back — a
 * fallback that silently stopped fetching would pass a "does not throw" test —
 * and that the fallback is ONE client, so the two hooks on a list screen still
 * share a single probe there, which is the whole point of the change.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, flush, waitFor, act } from './dom';
import { setShellApiClient, type AxiosInstance } from '../src/api/client';
import { useColumnConfig } from '../src/data/useColumnConfig';
import { __resetOwnedQueryClient } from '../src/data/useDefaultColumnConfig';
import { useSort } from '../src/data/useSort';
import type { ColumnDef } from '../src/data/types';

// The whole point of these specs is that nothing mounts a `<QueryClientProvider>`,
// so the probe lands in the client the package owns and no spec holds a handle
// on it. Its idle entries keep a five-minute garbage-collection timer, which
// node's runner will not exit past — so drop it between tests, which also keeps
// one test's cached defaults out of the next one.
afterEach(__resetOwnedQueryClient);

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'sku', label: 'SKU' },
  { key: 'supplier', label: 'Supplier', defaultHidden: true },
];

let requests: string[] = [];
setShellApiClient({
  get: (url: string) => {
    requests.push(url);
    if (url.startsWith('/auth/default-columns/')) {
      return Promise.resolve({
        data: { visible_columns: ['name', 'supplier'], sort: { field: 'sku', direction: 'desc' } },
      });
    }
    return Promise.resolve({ data: null });
  },
  patch: () => Promise.resolve({ data: null }),
} as unknown as AxiosInstance);

test('useSort without a tableId mounts with no QueryClientProvider and makes no request', async (t) => {
  localStorage.clear();
  requests = [];

  const ref: { current: ReturnType<typeof useSort> | null } = { current: null };
  function Probe() {
    ref.current = useSort('name', 'asc');
    return null;
  }

  // No provider of any kind — the shape a consumer that only wants in-memory
  // sort state renders.
  const { unmount } = render(<Probe />);
  t.after(unmount);
  await flush();

  assert.equal(ref.current!.ordering, 'name');
  await act(() => { ref.current!.onSort('sku'); });
  assert.equal(ref.current!.ordering, 'sku', 'onSort still drives the in-memory state');
  assert.deepEqual(requests, [], 'the tableId-less form must reach no network at all');
});

test('useSort with a tableId works with no QueryClientProvider, probe included', async (t) => {
  localStorage.clear();
  requests = [];

  const ref: { current: ReturnType<typeof useSort> | null } = { current: null };
  function Probe() {
    ref.current = useSort('name', 'asc', 'sg590-noprovider-sort');
    return null;
  }

  const { unmount } = render(<Probe />);
  t.after(unmount);

  await waitFor(
    () => ref.current!.ordering === '-sku',
    () => `the admin-saved sort never applied; ordering was ${ref.current!.ordering}`,
  );
  assert.deepEqual(
    requests,
    ['/auth/default-columns/sg590-noprovider-sort/'],
    'the probe still fires exactly once through the fallback client',
  );
});

test('useColumnConfig works with no QueryClientProvider', async (t) => {
  localStorage.clear();
  requests = [];

  const ref: { current: ReturnType<typeof useColumnConfig> | null } = { current: null };
  function Probe() {
    ref.current = useColumnConfig('sg590-noprovider-cols', COLUMNS);
    return null;
  }

  const { unmount } = render(<Probe />);
  t.after(unmount);

  // `supplier` is `defaultHidden`, and the admin default lists it as visible —
  // so this only holds once the probe has resolved through the fallback client.
  await waitFor(
    () => ref.current!.allColumns.filter(c => c.hidden).map(c => c.key).join() === 'sku',
    () => `the admin default never applied: ${JSON.stringify(ref.current!.allColumns)}`,
  );
});

test('with no provider the two hooks still share ONE probe', async (t) => {
  localStorage.clear();
  requests = [];

  // The list-screen shape from `columnConfigSharedFetch`, minus the provider:
  // the sharing has to survive the fallback, or a consumer without a provider
  // pays the very double fetch SG#00590 removed.
  function ListScreen() {
    useColumnConfig('sg590-noprovider-shared', COLUMNS);
    useSort('name', 'asc', 'sg590-noprovider-shared');
    return null;
  }

  const { unmount } = render(<ListScreen />);
  t.after(unmount);

  await waitFor(
    () => requests.length > 0,
    'the defaults probe never fired at all',
  );
  // Give a duplicate the same chance to land as the first one had.
  await flush();
  await flush();

  assert.deepEqual(
    requests,
    ['/auth/default-columns/sg590-noprovider-shared/'],
    'both hooks must land in the SAME fallback client, so one request serves both',
  );
});
