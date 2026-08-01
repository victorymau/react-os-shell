/**
 * Regression guard for EntityList's Shift+click range selection.
 *
 * Two bugs, both in the document-capture click handler in `useTableNav`:
 *
 *  1. The Shift+clicked row was counted as selected but its checkbox drew
 *     EMPTY — "the last one is always not ticked". The handler called
 *     `preventDefault()`, which for a checkbox runs the browser's *canceled
 *     activation steps*. Those restore the pre-click checkedness at the END of
 *     event dispatch, which is after the microtask in which React commits the
 *     new selection — so the browser overwrote React's `checked = true`, and
 *     React never wrote it again because the prop is unchanged on every later
 *     render.
 *  2. A Shift+click made with no anchor yet (the first click into a freshly
 *     loaded list) selected NOTHING: the handler toggled the row and then let
 *     the event through to the checkbox's own onClick, which toggled it back.
 *
 * Note what the first test asserts and why. jsdom runs a whole dispatch inside
 * one JS stack frame, so it has no per-listener microtask checkpoint and cannot
 * reproduce the browser's commit-then-revert ordering — the *mechanism* is the
 * thing to hold onto, not the pixel. So the claim made there is the invariant
 * that ordering makes necessary: a Shift+click on a row checkbox is never
 * canceled. Cancel it again and this spec fails, in jsdom, on the same line.
 *
 * `t.after(unmount)` rather than an unmount at the end of the body, because
 * `useTableNav` binds its listeners to `document`: a test that fails before it
 * tears down leaves them there, and the next test's clicks are then handled
 * twice — once by a live tree and once by a dead one holding a stale anchor.
 * That silently turns the tests after the first failure green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, flush, act } from './dom';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EntityList from '../src/data/EntityList';

interface Row { id: number; name: string }

const ROWS: Row[] = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

// ResizableTable's column config saves through a mutation, so the tree needs a
// client. Nothing here fetches; retries off keeps a stray one from lingering.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function List({ onRowClick = () => {} }: { onRowClick?: (r: Row) => void }) {
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  return (
    <QueryClientProvider client={queryClient}>
      <EntityList<Row>
        items={ROWS}
        isLoading={false}
        emptyState={<div>empty</div>}
        tableId="shift-click-spec"
        columns={[{ key: 'name', label: 'Name' }]}
        renderCell={(r) => <a href="/detail">{r.name}</a>}
        selected={selected}
        setSelected={setSelected}
        onRowClick={onRowClick}
        footerLabel="rows"
        // The selection as a number the specs can read. The footer says it in
        // prose too, but "Row 6" and "1 selected" are adjacent in textContent
        // and read back as 61.
        footerExtra={<span data-selected={selected.size} />}
      />
    </QueryClientProvider>
  );
}

/** The row checkboxes, in render order — index N is `data-row-idx="N"`. */
function boxes(container: HTMLElement) {
  return [...container.querySelectorAll('[data-row-idx]')].map(
    (row) => row.querySelector('input[type=checkbox]') as HTMLInputElement,
  );
}

/** How many rows the STATE holds — the count to compare the drawn boxes against. */
function selectedCount(container: HTMLElement) {
  return Number(container.querySelector('[data-selected]')?.getAttribute('data-selected'));
}

/** Click an element the way a user does — real activation behaviour included. */
function click(el: Element, opts: { shift?: boolean } = {}) {
  const event = new window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    shiftKey: opts.shift ?? false,
  });
  act(() => { el.dispatchEvent(event); });
  return event;
}

test('Shift+click ticks the whole range INCLUDING the row that was clicked', async (t) => {
  const { container, unmount } = render(<List />);
  t.after(unmount);
  const cb = boxes(container);

  click(cb[1]);
  await flush();

  const shiftClick = click(cb[4], { shift: true });
  await flush();

  assert.deepEqual(
    boxes(container).map((b) => b.checked),
    [false, true, true, true, true, false],
    'rows 1-4 ticked — the anchor, the rows between, and the clicked row itself',
  );
  assert.equal(selectedCount(container), 4, 'and the footer agrees with the boxes');
  // Bug 1's mechanism: cancelling this click is what let the browser revert the
  // clicked checkbox after React had already committed it as selected.
  assert.equal(shiftClick.defaultPrevented, false, 'a checkbox Shift+click is never canceled');
});

test('Shift+clicking a row that is ALREADY selected leaves it ticked', async (t) => {
  // The case no amount of React re-rendering can fix on its own: the `checked`
  // prop is true before and after, so React has no reason to write the DOM —
  // whatever the click's activation behaviour left behind is what stays.
  const { container, unmount } = render(<List />);
  t.after(unmount);
  const cb = boxes(container);

  click(cb[1]);
  await flush();
  click(cb[4], { shift: true });
  await flush();

  click(cb[3], { shift: true });
  await flush();

  assert.deepEqual(
    boxes(container).map((b) => b.checked),
    [false, true, true, true, true, false],
    'still the same range — a re-Shift+click adds, it never unticks',
  );
  assert.equal(selectedCount(container), 4);
});

test('the first Shift+click of all selects the row it landed on', async (t) => {
  // Bug 2: with no anchor the handler toggled the row and then let the event
  // reach the checkbox, whose own onClick toggled it straight back off.
  const { container, unmount } = render(<List />);
  t.after(unmount);

  click(boxes(container)[2], { shift: true });
  await flush();

  assert.deepEqual(
    boxes(container).map((b) => b.checked),
    [false, false, true, false, false, false],
  );
  assert.equal(selectedCount(container), 1);
});

test('that first Shift+click becomes the anchor for the next one', async (t) => {
  const { container, unmount } = render(<List />);
  t.after(unmount);
  const cb = boxes(container);

  click(cb[2], { shift: true });
  await flush();
  click(cb[0], { shift: true });
  await flush();

  assert.deepEqual(
    boxes(container).map((b) => b.checked),
    [true, true, true, false, false, false],
    'ranges upward from the anchor just as well as downward',
  );
});

test('Shift+click on the row BODY range-selects without opening the row', async (t) => {
  // Here preventDefault() is still wanted: cell content is often a link, and a
  // Shift+click on a link opens a new window.
  const opened: Row[] = [];
  const { container, unmount } = render(<List onRowClick={(r) => opened.push(r)} />);
  t.after(unmount);

  click(boxes(container)[1]);
  await flush();

  const event = click(container.querySelector('[data-row-idx="4"] a')!, { shift: true });
  await flush();

  assert.deepEqual(
    boxes(container).map((b) => b.checked),
    [false, true, true, true, true, false],
  );
  assert.equal(event.defaultPrevented, true, 'the link default is canceled');
  assert.deepEqual(opened, [], 'and the row does not open');
});
