/**
 * Regression guard: a paste that fills the grid leaves a blank line under it.
 *
 * Reported against the vendor-invoice bulk import, which opens with 15 lines:
 * "if they paste 16 lines data, you automatically add line 17, this is easier
 * for the user paste more information in the same bulk import". Pasting 16 rows
 * grew the grid to exactly 16, every one of them full, so an operator with a
 * second batch on the clipboard had no cell to click into — the only way on was
 * to import what was there and start the grid again.
 *
 * Typing never had that problem: `ensureRows` adds five rows as the cursor
 * comes within two of the bottom. These specs hold the paste paths to the same
 * promise, in the one shape that matters — there is always a line left.
 *
 * Driven through `EditableGrid` rather than `BulkImportGrid` because the paste
 * handler is the thing under test and the grid is where it lives; the import
 * surface only passes `data`/`onChange` through. The assertions read the data
 * the grid hands back, not the DOM, so they say nothing about how many rows
 * happen to be rendered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, act } from './dom';
import { useState } from 'react';
import EditableGrid, { withSpareRow } from '../src/shell/EditableGrid';

const COLUMNS = [
  { key: 'pn', title: 'Part Number *' },
  { key: 'qty', title: 'Qty' },
  { key: 'price', title: 'Unit Price' },
];

const OPENING_ROWS = 15;

/** The clipboard an operator gets from a spreadsheet: tab-delimited, one line per row. */
function clipboard(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `PN-${i + 1}\t${i + 1}\t10.00`).join('\n');
}

/**
 * A grid wired the way `BulkImportGrid` wires it — 15 blank rows, state held by
 * the caller — with the latest data pushed out through `seen` so a spec can
 * assert on what the grid asked for rather than on what it drew.
 */
function Grid({ seen, fixedRows = false }: { seen: { rows: string[][] }; fixedRows?: boolean }) {
  const [data, setData] = useState<string[][]>(() =>
    Array.from({ length: OPENING_ROWS }, () => Array(COLUMNS.length).fill(''))
  );
  seen.rows = data;
  return <EditableGrid columns={COLUMNS} data={data} onChange={setData} fixedRows={fixedRows} />;
}

/** Click into a cell and paste, the way the browser delivers it to the window listener. */
function pasteInto(container: HTMLElement, row: number, col: number, text: string) {
  const cell = container.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
  assert.ok(cell, `no cell at ${row}:${col}`);
  act(() => { cell.focus(); });
  // jsdom builds no ClipboardEvent, so carry the payload on a plain paste event.
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  act(() => { window.dispatchEvent(event); });
}

test('a paste that fills the last line adds one blank line under it', (t) => {
  const seen = { rows: [] as string[][] };
  const { container, unmount } = render(<Grid seen={seen} />);
  t.after(unmount);

  pasteInto(container, 0, 0, clipboard(16));

  assert.equal(seen.rows.length, 17, '16 pasted lines should leave a 17th to paste into');
  assert.deepEqual(seen.rows[15], ['PN-16', '16', '10.00'], 'the 16th line still holds the last pasted row');
  assert.deepEqual(seen.rows[16], ['', '', ''], 'the spare line is blank');
});

test('a paste with room to spare leaves the row count alone', (t) => {
  const seen = { rows: [] as string[][] };
  const { container, unmount } = render(<Grid seen={seen} />);
  t.after(unmount);

  pasteInto(container, 0, 0, clipboard(5));

  // Ten blank lines below already: nothing to add, and adding anyway would
  // walk the grid one row longer on every paste.
  assert.equal(seen.rows.length, OPENING_ROWS);
});

test('a fixed-row grid gains no spare line', (t) => {
  const seen = { rows: [] as string[][] };
  const { container, unmount } = render(<Grid seen={seen} fixedRows />);
  t.after(unmount);

  pasteInto(container, 0, 0, clipboard(16));

  // A caller that fixes its rows owns the row count — PriceSheetGrid renders one
  // row per price on the sheet. What the paste itself writes is unchanged here.
  assert.equal(seen.rows.length, 16);
});

test('withSpareRow is idempotent', () => {
  const full = [['A', '1'], ['B', '2']];
  const once = withSpareRow(full, 2);
  assert.equal(once.length, 3);
  assert.equal(withSpareRow(once, 2), once, 'a grid that already ends blank is returned as-is');
  // Whitespace is not content — the CSV upload path pads with '' and must not
  // then be handed a second blank row.
  assert.equal(withSpareRow([['A'], ['  ']], 1).length, 2);
});
