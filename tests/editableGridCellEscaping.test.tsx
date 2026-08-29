/**
 * A spreadsheet cell is shown as text, not run as markup.
 *
 * `EditableGrid` renders each cell by setting `innerHTML` on its
 * `contentEditable` node — React cannot own the children of one without
 * fighting the caret, so there is no text-child option here. That makes the
 * cell value markup unless something escapes it, and the value is not always
 * the product's own: the admin portal's CSV preview feeds this grid an export
 * of storefront form submissions, which anonymous visitors type through a
 * public endpoint.
 *
 * These specs render the REAL component. Testing the escape helper on its own
 * would pass with the call site reverted, which is the failure mode worth
 * avoiding — the helper was never the part at risk.
 */

import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import EditableGrid from '../src/shell/EditableGrid';
import { escapeHtml } from '../src/utils/escapeHtml';

const noop = () => {};
const COLUMNS = [{ key: 'name', title: 'Name' }];

/** Render a one-cell grid and hand back the markup it produced. */
function gridMarkup(value: string): string {
  return renderToStaticMarkup(
    <EditableGrid columns={COLUMNS} data={[[value]]} onChange={noop} fixedRows minRows={1} />,
  );
}

test('an event-handler payload reaches the page as text, not as an element', () => {
  // `<script>` does not execute through innerHTML, so the realistic payload is
  // a tag that fires without one. Neither needs a quote or a comma, so both
  // survive the CSV parser that feeds this grid.
  for (const payload of ['<img src=x onerror=alert(1)>', '<svg onload=alert(1)>']) {
    const html = gridMarkup(payload);
    // The angle brackets are what decide whether this parses as an element.
    // The words `onerror=`/`onload=` still appear inside the escaped text, and
    // harmlessly so — asserting on them would fail against a correct fix.
    assert.ok(!html.includes(payload), `the raw payload reached the markup: ${payload}`);
    assert.ok(html.includes(escapeHtml(payload)), `the escaped payload is missing: ${payload}`);
  }
});

test('markup in a cell is displayed rather than applied', () => {
  const html = gridMarkup('<b>not bold</b>');
  assert.ok(!html.includes('<b>not bold</b>'), 'the cell opened a real <b>');
  assert.ok(html.includes('&lt;b&gt;not bold&lt;/b&gt;'));
});

test('an ordinary cell value is untouched', () => {
  assert.ok(gridMarkup('Ada Lovelace, 12 High St').includes('Ada Lovelace, 12 High St'));
});

test('the value survives the textContent round-trip the grid reads back', () => {
  // Every read path in EditableGrid takes `textContent`, and `onBlur` compares
  // it against the stored cell before writing. A lossy round-trip would make
  // the grid rewrite a row on a blur the user never made.
  for (const value of ['a < b', 'Tom & Jerry', 'say "hi"', "it's fine"]) {
    const cell = document.createElement('div');
    cell.innerHTML = escapeHtml(value);
    assert.equal(cell.textContent, value, value);
  }
});
