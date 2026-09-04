/**
 * "Export selected to CSV" must not report a row count the file does not hold.
 *
 * BG#00477. The backend caps every list export at `MAX_EXPORT_ROWS`
 * (efficient/mixins.py) and, since efficient-backend #1337, says so on
 * `X-Truncated` / `X-Row-Count` — where the count is the rows actually written,
 * not the number that matched. `exportSelected` used to announce
 * `ids.length`, which is the number of rows ASKED FOR. So an export the server
 * cut short still produced a green "Exported 8000 rows." over a file holding
 * 5,000. That was the only place in the product that stated a false row count.
 *
 * What these specs pin is the SOURCE of the number, not the wording: the claim
 * has to come off the response. Hence the untruncated case is here too — it is
 * the half that a fix could quietly break by warning on every export.
 *
 * The seam is `setShellApiClient`: `src/api/client.ts` is a proxy that
 * delegates to whatever instance the consumer registers, so a stub instance
 * puts real headers on the real code path without touching the component.
 * Registration is global and lives for the process, and node's runner gives
 * each spec FILE its own process, so the stub is swapped per test rather than
 * torn down.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, flush, act, waitFor } from './dom';
import { useState } from 'react';
import type { AxiosInstance } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setShellApiClient } from '../src/api/client';
import EntityList from '../src/data/EntityList';

interface Row { id: number; name: string }

const ROWS: Row[] = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
// `ResizableTable` puts the table's admin-defaults query in this cache, and an
// idle react-query entry holds a five-minute garbage-collection timer that
// node's runner will not exit past. Drop the entries with the tree.
afterEach(() => { queryClient.clear(); });

/**
 * A stub api client that answers the export GET with `headers`.
 *
 * Only `get` is reached here; the proxy in `src/api/client.ts` forwards every
 * property, so anything else this tree asks for would surface as a clear
 * "not a function" rather than a silent wrong answer.
 */
function stubClient(headers: Record<string, string>) {
  const calls: string[] = [];
  setShellApiClient({
    get: (url: string) => {
      // The shell issues its own `/auth/me/` and `/auth/default-columns/`
      // queries through this same client; only the export is under test.
      if (url.includes('export_csv')) calls.push(url);
      return Promise.resolve({ data: 'id,name\n', status: 200, statusText: 'OK', headers, config: {} });
    },
  } as unknown as AxiosInstance);
  return calls;
}

/**
 * Anchor clicks, recorded instead of navigated.
 *
 * `exportSelected` downloads by clicking a detached `<a download>`. jsdom has
 * no download behaviour and treats that as a navigation it has not
 * implemented, which prints an async error from a timer AFTER the test that
 * caused it has finished. Recording the click keeps the real call and makes
 * the download assertable, which matters here: a truncated export must still
 * hand over the partial file, not swallow it.
 */
const downloads: { href: string; download: string }[] = [];
(window.HTMLAnchorElement.prototype as unknown as { click: () => void }).click = function click(this: HTMLAnchorElement) {
  downloads.push({ href: this.href, download: this.download });
};

function List() {
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  return (
    <QueryClientProvider client={queryClient}>
      <EntityList<Row>
        items={ROWS}
        isLoading={false}
        emptyState={<div>empty</div>}
        tableId="export-truncation-spec"
        columns={[{ key: 'name', label: 'Name' }]}
        renderCell={(r) => <span>{r.name}</span>}
        selected={selected}
        setSelected={setSelected}
        onRowClick={() => {}}
        footerLabel="rows"
        exportEndpoint="/things/export_csv/"
        exportFilename="Things.csv"
      />
    </QueryClientProvider>
  );
}

/**
 * Tick every row, open the bulk menu, and run "Export selected to CSV".
 *
 * Driven through the real gestures rather than by calling the handler, because
 * the count under test is derived from the selection the menu was opened over.
 */
async function exportAll(container: HTMLElement) {
  for (const row of container.querySelectorAll('[data-row-idx]')) {
    const box = row.querySelector('input[type=checkbox]') as HTMLInputElement;
    act(() => { box.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  }
  await flush();

  const row = container.querySelector('[data-row-idx="0"]')!;
  act(() => { row.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await flush();

  const item = [...document.querySelectorAll('button, [role=menuitem], div')]
    .find((el) => el.textContent === 'Export selected to CSV');
  assert.ok(item, 'the bulk menu offers the export');
  act(() => { item!.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  // The export is a request away, so wait for the announcement it produces
  // rather than for a fixed number of turns — every caller reads `announced()`.
  await waitFor(() => /rows/.test(announced()), 'the export never announced a result');
}

/** What the user was told — toasts and notifications both render their text. */
function announced() {
  return [
    document.getElementById('toast-container')?.textContent ?? '',
    document.getElementById('notif-container')?.textContent ?? '',
  ].join(' ').trim();
}

test.beforeEach(() => {
  // jsdom implements neither, and the download path calls both.
  (window.URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:stub';
  (window.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
  downloads.length = 0;
  document.getElementById('toast-container')?.remove();
  document.getElementById('notif-container')?.remove();
});

test('a truncated export reports the row count from the RESPONSE, not the request', async (t) => {
  // Three rows asked for, two in the file. The old code said "Exported 3 rows."
  const calls = stubClient({ 'x-truncated': 'true', 'x-row-count': '2' });
  const { container, unmount } = render(<List />);
  t.after(unmount);

  await exportAll(container);

  assert.equal(calls.length, 1, 'the export request still goes out');
  assert.match(calls[0], /ids=1%2C2%2C3/, 'over the ticked rows');
  assert.deepEqual(downloads.map((d) => d.download), ['Things.csv'],
    'and the partial file is still handed over, not withheld');

  const said = announced();
  assert.match(said, /2 of 3 rows/, 'the real count, against the count asked for');
  assert.match(said, /incomplete/, 'and it is named as a partial file');
  assert.doesNotMatch(said, /Exported 3 rows\./, 'never the number that was requested');
});

test('an untruncated export still reports plain success', async (t) => {
  const calls = stubClient({ 'x-truncated': 'false', 'x-row-count': '3' });
  const { container, unmount } = render(<List />);
  t.after(unmount);

  await exportAll(container);

  assert.equal(calls.length, 1);
  assert.equal(announced(), 'Exported 3 rows.', 'unchanged for the everyday case');
});

test('a backend that sends no headers keeps the old message', async (t) => {
  // The package is pinned by portals independently of the backend deploy, and
  // a cross-origin response without `Access-Control-Expose-Headers` reads the
  // same way. Neither may turn every export into a truncation warning.
  const calls = stubClient({});
  const { container, unmount } = render(<List />);
  t.after(unmount);

  await exportAll(container);

  assert.equal(calls.length, 1);
  assert.equal(announced(), 'Exported 3 rows.');
});
