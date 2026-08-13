/**
 * `virtualized` bounds what DataTable RENDERS, the way pagination bounds what
 * is fetched: a few thousand loaded rows otherwise all get DOM. The claims
 * that matter:
 *
 *  - only the window renders, and two spacer rows keep the scrollbar honest
 *    about the full dataset;
 *  - the window follows the scroll, and rows keep their ABSOLUTE index —
 *    `render`, `rowClassName` and `rowKey` must not see window-relative
 *    positions, or striping and identity break silently at scroll offset one;
 *  - a table without the prop renders exactly as before (the regression pin);
 *  - the header pins to the top of the scroll container.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { act, render } from './dom';
import DataTable from '../src/data/DataTable';

const ROWS = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Row ${i}` }));
const COLUMNS = [
  { key: 'name', title: 'Name', render: (row: { name: string }, i: number) => `${row.name}@${i}` },
];
const VIRT = { height: 200, rowHeight: 40, overscan: 3 };
// ceil(200/40) + 2*3 = 11 rendered rows.
const WINDOW = 11;

function bodyRows(container: HTMLElement) {
  return [...container.querySelectorAll('tbody tr:not([aria-hidden])')];
}
function spacers(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLTableRowElement>('tbody tr[aria-hidden]')];
}
function scroller(container: HTMLElement) {
  return container.querySelector<HTMLElement>('.overflow-y-auto')!;
}
function scrollTo(el: HTMLElement, top: number) {
  act(() => {
    Object.defineProperty(el, 'scrollTop', { value: top, configurable: true });
    el.dispatchEvent(new Event('scroll'));
  });
}

test('only the window renders, spacers stand in for the rest', async () => {
  const view = render(
    <DataTable columns={COLUMNS} data={ROWS} rowKey="id" virtualized={VIRT} />,
  );
  assert.equal(bodyRows(view.container).length, WINDOW);
  const [bottom] = spacers(view.container);
  assert.equal(spacers(view.container).length, 1, 'no top spacer before any scroll');
  assert.equal(
    bottom.querySelector('td')!.style.height,
    `${(100 - WINDOW) * 40}px`,
    'the bottom spacer covers every unrendered row',
  );
  await act(async () => { view.unmount(); });
});

test('the window follows the scroll and rows keep their absolute index', async () => {
  const view = render(
    <DataTable columns={COLUMNS} data={ROWS} rowKey="id" virtualized={VIRT} />,
  );
  scrollTo(scroller(view.container), 400); // row 10; minus overscan → start 7
  const rows = bodyRows(view.container);
  assert.equal(rows.length, WINDOW);
  assert.equal(rows[0].textContent, 'Row 7@7', 'render() must receive the absolute index');
  const [top, bottom] = spacers(view.container);
  assert.equal(top.querySelector('td')!.style.height, `${7 * 40}px`);
  assert.equal(bottom.querySelector('td')!.style.height, `${(100 - 7 - WINDOW) * 40}px`);
  await act(async () => { view.unmount(); });
});

test('scrolled to the end, the window clamps and the bottom spacer is gone', async () => {
  const view = render(
    <DataTable columns={COLUMNS} data={ROWS} rowKey="id" virtualized={VIRT} />,
  );
  scrollTo(scroller(view.container), 100 * 40);
  const rows = bodyRows(view.container);
  assert.equal(rows.at(-1)!.textContent, 'Row 99@99');
  assert.equal(spacers(view.container).length, 1, 'only the top spacer remains');
  await act(async () => { view.unmount(); });
});

test('the header pins to the top of the scroll container', async () => {
  const view = render(
    <DataTable columns={COLUMNS} data={ROWS} rowKey="id" virtualized={VIRT} />,
  );
  const th = view.container.querySelector('th')!;
  assert.ok(th.className.includes('sticky'));
  await act(async () => { view.unmount(); });
});

test('without the prop, every row renders — exactly as before', async () => {
  const view = render(<DataTable columns={COLUMNS} data={ROWS} rowKey="id" />);
  assert.equal(bodyRows(view.container).length, 100);
  assert.equal(spacers(view.container).length, 0);
  assert.equal(view.container.querySelector('th')!.className.includes('sticky'), false);
  await act(async () => { view.unmount(); });
});
