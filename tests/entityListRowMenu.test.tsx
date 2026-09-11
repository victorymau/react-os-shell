/**
 * The row menu every `EntityList` draws.
 *
 * Before 4.104.0 a list drew a right-click menu only when it was handed
 * `exportEndpoint` or `contextActions`, so a bare list fell through to a menu
 * that knew nothing about rows. What these specs pin:
 *
 *   - the menu exists with neither prop, and it claims the event — the
 *     shell-wide `ShellContextMenu` must stand down over a row, not open a
 *     second menu on top of it;
 *   - Open opens the row RIGHT-CLICKED, which inside a multi-selection is not
 *     the same as "the first ticked row";
 *   - the copies hold what is on SCREEN: the visible columns, in their order,
 *     only the ticked rows, cell text escaped in the HTML flavour — a copy that
 *     read the raw record would paste ids and ISO dates;
 *   - the browser keeps its menu on a text field inside a row, and on
 *     Shift+right-click, exactly as it does under the shell-wide menu.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { render, flush, act } from './dom';
import { useState } from 'react';
import type { AxiosInstance } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setShellApiClient } from '../src/api/client';
import EntityList, { type EntityListContextAction, type EntityListProps } from '../src/data/EntityList';
import ShellContextMenu from '../src/shell/ShellContextMenu';

interface Row { id: number; name: string; code: string }

const ROWS: Row[] = [
  { id: 1, name: 'Row 1', code: 'R-1' },
  { id: 2, name: 'Row 2', code: 'R-2' },
  { id: 3, name: 'A & <B>', code: 'R-3' },
];

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
// `ResizableTable` puts the table's admin-defaults query in this cache, and an
// idle react-query entry holds a timer node's runner will not exit past.
afterEach(() => { queryClient.clear(); });

// The shell issues `/auth/me/` and `/auth/default-columns/` through the api
// client while the table mounts; nothing here is about them.
setShellApiClient({
  get: () => Promise.resolve({ data: null, status: 200, statusText: 'OK', headers: {}, config: {} }),
} as unknown as AxiosInstance);

/** What reached the clipboard — both flavours when HTML was written. */
const clipboard: { text?: string; html?: string }[] = [];
class FakeClipboardItem {
  constructor(public readonly items: Record<string, Blob>) {}
}
Object.defineProperty(globalThis, 'ClipboardItem', { value: FakeClipboardItem, configurable: true, writable: true });
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    async write(items: FakeClipboardItem[]) {
      const [item] = items;
      clipboard.push({ text: await item.items['text/plain'].text(), html: await item.items['text/html'].text() });
    },
    async writeText(text: string) { clipboard.push({ text }); },
  },
});

afterEach(() => {
  clipboard.length = 0;
  document.getElementById('toast-container')?.remove();
});

function List(props: Partial<EntityListProps<Row>>) {
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  return (
    <QueryClientProvider client={queryClient}>
      <ShellContextMenu />
      <EntityList<Row>
        items={ROWS}
        isLoading={false}
        emptyState={<div>empty</div>}
        tableId="row-menu-spec"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'code', label: 'Code' },
          { key: 'secret', label: 'Secret', defaultHidden: true },
        ]}
        renderCell={(r, k) => (k === 'name' ? <b>{r.name}</b> : k === 'code' ? <span>{r.code}</span> : <span>hidden</span>)}
        selected={selected}
        setSelected={setSelected}
        onRowClick={() => {}}
        footerLabel="rows"
        {...props}
      />
    </QueryClientProvider>
  );
}

function row(container: HTMLElement, idx: number) {
  return container.querySelector(`[data-row-idx="${idx}"]`) as HTMLElement;
}

function rightClick(target: Element, opts: { shift?: boolean } = {}) {
  const event = new window.MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, button: 2, shiftKey: opts.shift ?? false,
  });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function click(target: Element) {
  act(() => { target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
}

/** The row menu's items in order. The menu portals into `document.body`, so
 *  its buttons are the ones outside the list's own container. */
function menuItems(container: HTMLElement): HTMLButtonElement[] {
  return [...document.body.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !container.contains(b));
}

function menuLabels(container: HTMLElement) {
  return menuItems(container).map((b) => b.textContent);
}

function item(container: HTMLElement, label: string) {
  const found = menuItems(container).find((b) => b.textContent === label);
  assert.ok(found, `the row menu offers "${label}" — it has ${JSON.stringify(menuLabels(container))}`);
  return found!;
}

test('a list with neither exportEndpoint nor contextActions still has a row menu, and claims the event', async (t) => {
  const { container, unmount } = render(<List />);
  t.after(unmount);

  const event = rightClick(row(container, 0));
  await flush();

  assert.equal(event.defaultPrevented, true, 'the row menu claims the right-click');
  assert.equal(document.querySelector('[data-shell-context-menu]'), null,
    'so the shell-wide menu stands down instead of opening over it');
  assert.match(document.body.textContent ?? '', /1 selected/, 'the right-clicked row became the selection');
  assert.deepEqual(menuLabels(container), ['Open', 'Copy Name', 'Copy row', 'Select all', 'Clear selection']);
});

test('Open opens the row right-clicked, not the first ticked one', async (t) => {
  const opened: Row[] = [];
  const { container, unmount } = render(<List onRowClick={(r) => opened.push(r)} />);
  t.after(unmount);

  // Tick rows 0 and 1, then right-click row 1 inside that selection.
  click(row(container, 0).querySelector('input[type=checkbox]')!);
  click(row(container, 1).querySelector('input[type=checkbox]')!);
  await flush();
  rightClick(row(container, 1));
  await flush();

  assert.match(document.body.textContent ?? '', /2 selected/, 'a right-click inside a selection keeps it');
  click(item(container, 'Open'));
  await flush();

  assert.deepEqual(opened.map((r) => r.id), [2]);
  assert.deepEqual(menuItems(container), [], 'and the menu closes');
});

test('Copy rows copies the ticked rows as a table of the visible columns, escaped in the HTML', async (t) => {
  const { container, unmount } = render(<List />);
  t.after(unmount);

  click(row(container, 0).querySelector('input[type=checkbox]')!);
  click(row(container, 2).querySelector('input[type=checkbox]')!);
  await flush();
  rightClick(row(container, 2));
  await flush();
  click(item(container, 'Copy 2 rows'));
  await flush();

  assert.equal(clipboard.length, 1);
  assert.equal(clipboard[0].text, 'Name\tCode\nRow 1\tR-1\nA & <B>\tR-3',
    'a header row, then the ticked rows only — never the hidden column');
  assert.match(clipboard[0].html ?? '', /<th>Name<\/th><th>Code<\/th>/);
  assert.match(clipboard[0].html ?? '', /<td>A &amp; &lt;B&gt;<\/td>/, 'cell text is escaped, never markup');
  assert.doesNotMatch(clipboard[0].html ?? '', /<b>/, 'the copy is the text on screen, not the rendered elements');
});

test('Copy <first column> copies that column of every ticked row, one per line', async (t) => {
  const { container, unmount } = render(<List />);
  t.after(unmount);

  click(row(container, 0).querySelector('input[type=checkbox]')!);
  click(row(container, 1).querySelector('input[type=checkbox]')!);
  await flush();
  rightClick(row(container, 0));
  await flush();
  click(item(container, 'Copy Name'));
  await flush();

  assert.deepEqual(clipboard, [{ text: 'Row 1\nRow 2' }]);
});

test('Refresh is offered only when onRetry is wired, and calls it', async (t) => {
  let refetched = 0;
  const { container, unmount } = render(<List onRetry={() => { refetched++; }} />);
  t.after(unmount);

  rightClick(row(container, 0));
  await flush();
  click(item(container, 'Refresh'));
  await flush();

  assert.equal(refetched, 1);
});

test('Select all ticks every loaded row, and names them "loaded" when more exist', async (t) => {
  const { container, unmount } = render(<List totalCount={40} />);
  t.after(unmount);

  rightClick(row(container, 0));
  await flush();
  click(item(container, 'Select all 3 loaded'));
  await flush();

  const boxes = [...container.querySelectorAll<HTMLInputElement>('[data-row-idx] input[type=checkbox]')];
  assert.deepEqual(boxes.map((b) => b.checked), [true, true, true]);
});

test('domain actions sit between the copy items and the selection items, and get the ticked rows', async (t) => {
  const posted: number[][] = [];
  const contextActions = (items: Row[]): EntityListContextAction<Row>[] => [
    { label: 'Post', onClick: (rows) => posted.push(rows.map((r) => r.id)) },
    { label: 'Cancel', onClick: () => {}, danger: true, divider: true },
  ];
  const { container, unmount } = render(<List contextActions={contextActions} exportEndpoint="/things/export_csv/" />);
  t.after(unmount);

  rightClick(row(container, 1));
  await flush();
  assert.deepEqual(menuLabels(container), [
    'Open', 'Copy Name', 'Copy row', 'Export selected to CSV', 'Post', 'Cancel', 'Select all', 'Clear selection',
  ]);

  click(item(container, 'Post'));
  await flush();
  assert.deepEqual(posted, [[2]]);
});

test('a text field inside a row keeps the browser menu, and Shift+right-click reaches it anywhere', async (t) => {
  const { container, unmount } = render(
    <List renderCell={(r, k) => (k === 'name' ? <input type="text" defaultValue={r.name} /> : <span>{r.code}</span>)} />,
  );
  t.after(unmount);

  const onField = rightClick(row(container, 0).querySelector('input[type=text]')!);
  await flush();
  assert.equal(onField.defaultPrevented, false, 'spellcheck and Paste stay the browser\'s');
  assert.deepEqual(menuItems(container), []);

  const shifted = rightClick(row(container, 0).querySelector('span')!, { shift: true });
  await flush();
  assert.equal(shifted.defaultPrevented, false, 'Shift+right-click is the way to Inspect');
  assert.deepEqual(menuItems(container), []);
});
