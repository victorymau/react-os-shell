/**
 * The escaping that stands between a spreadsheet cell and script execution.
 *
 * `EditableGrid` renders each cell by setting `innerHTML` on a
 * `contentEditable` node — React cannot own the children of one without
 * fighting the caret, so there is no text-child option here. That makes the
 * cell value markup unless something escapes it, and the value is not always
 * ours: the admin portal's CSV preview feeds this grid an export of storefront
 * form submissions, which are typed by anonymous visitors.
 *
 * These specs pin two things: the vector is closed, and the round-trip through
 * `textContent` — which is how every read path in the grid gets the value back
 * — is unchanged by the escaping.
 */

import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/utils/escapeHtml';

/** Render a cell value the way `EditableGrid` does. */
function renderCell(value: string): HTMLElement {
  const cell = document.createElement('div');
  cell.innerHTML = escapeHtml(value);
  return cell;
}

test('escapes the five characters that can change the parse', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('leaves an ordinary cell value alone', () => {
  assert.equal(escapeHtml('Ada Lovelace, 12 High St'), 'Ada Lovelace, 12 High St');
});

test('an event-handler payload becomes text, not an element', () => {
  // The realistic vector: <script> does not execute through innerHTML, so an
  // attacker reaches for a tag that fires without one. Neither needs a quote or
  // a comma, so both survive the CSV parser intact.
  for (const payload of ['<img src=x onerror=alert(1)>', '<svg onload=alert(1)>']) {
    const cell = renderCell(payload);
    assert.equal(cell.querySelector('img'), null, payload);
    assert.equal(cell.querySelector('svg'), null, payload);
    assert.equal(cell.children.length, 0, `${payload} produced an element`);
    assert.equal(cell.textContent, payload, 'the payload is shown verbatim');
  }
});

test('markup in a cell is displayed rather than applied', () => {
  const cell = renderCell('<b>not bold</b>');
  assert.equal(cell.querySelector('b'), null);
  assert.equal(cell.textContent, '<b>not bold</b>');
});

test('the value survives the textContent round-trip the grid reads back', () => {
  // Every read path in EditableGrid takes `textContent`, and `onBlur` compares
  // it against the stored cell before writing. A lossy round-trip would make
  // the grid rewrite the row on a blur the user never edited.
  for (const value of ['a < b', 'Tom & Jerry', 'say "hi"', "it's fine", '5 > 4 & 3 < 4']) {
    assert.equal(renderCell(value).textContent, value, value);
  }
});
