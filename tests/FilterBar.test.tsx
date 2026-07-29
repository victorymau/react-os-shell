import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import FilterBar from '../src/shell/FilterBar';
import type { FilterOption } from '../src/shell/FilterBar';

/**
 * The regression: the clear-X inside an active filter pill was a `<button>`,
 * and the pill itself is a `<button role="combobox">`. `<button>` cannot be a
 * descendant of `<button>` — React logs it and warns of a hydration error, on
 * every list page that had a filter applied. The affordance is now a span, so
 * these specs pin the DOM shape rather than the styling.
 */

const short: FilterOption = {
  label: 'All warehouses',
  field: 'warehouse',
  options: [
    { value: '1', label: 'Main' },
    { value: '2', label: 'Overflow' },
  ],
};

// > 8 options, so `searchable` defaults on and this takes the SearchableFilter path.
const long: FilterOption = {
  label: 'All products',
  field: 'product',
  options: Array.from({ length: 12 }, (_, i) => ({ value: `p${i}`, label: `Product ${i}` })),
};

const bar = (filters: FilterOption[], values: Record<string, string>) =>
  renderToStaticMarkup(<FilterBar filters={filters} values={values} onChange={() => {}} onClear={() => {}} />);

/** Deepest run of unclosed `<button>` tags in the markup. 1 is fine, 2 is the bug. */
const maxButtonDepth = (html: string) => {
  let depth = 0;
  let max = 0;
  for (const tag of html.match(/<button\b|<\/button>/g) ?? []) {
    if (tag === '</button>') depth--;
    else max = Math.max(max, ++depth);
  }
  assert.equal(depth, 0, 'unbalanced <button> tags — the depth scan is meaningless');
  return max;
};

test('the scan itself catches a nested button', () => {
  // Guards the guard: every assertion below is worthless if this returns 1.
  assert.equal(maxButtonDepth('<button><span>x</span><button>y</button></button>'), 2);
  assert.equal(maxButtonDepth('<button>a</button><button>b</button>'), 1);
});

test('an active short-list filter nests no button in its combobox', () => {
  const html = bar([short], { warehouse: '1' });
  assert.equal(maxButtonDepth(html), 1);
  assert.match(html, /role="combobox"/, 'the pill is still the combobox');
  assert.match(html, />Main</, 'and still shows the selection');
});

test('an active searchable filter nests no button in its combobox', () => {
  const html = bar([long], { product: 'p3' });
  assert.equal(maxButtonDepth(html), 1);
  assert.match(html, />Product 3</);
});

test('every filter active at once — the state the admin portal actually warned on', () => {
  assert.equal(maxButtonDepth(bar([short, long], { warehouse: '2', product: 'p0' })), 1);
});

test('the clear affordance is still rendered, and stays out of the a11y tree', () => {
  const cleared = bar([short], {});
  const active = bar([short], { warehouse: '1' });

  // The X path, from the heroicons XMarkIcon: present only when a value is set.
  const X_ICON = /viewBox="0 0 20 20"/;
  assert.doesNotMatch(cleared, X_ICON, 'no value, no clear affordance');
  assert.match(active, X_ICON, 'a value gets one');
  assert.match(active, /<span aria-hidden="true" class="cursor-pointer/, 'decorative, and clickable-looking');

  // A chevron instead when there is nothing to clear, and no phantom widget.
  assert.match(cleared, /d="M19.5 8.25l-7.5 7.5-7.5-7.5"/);
  assert.doesNotMatch(active, /role="button"/, 'not a nested control either — "All" in the listbox clears');
});

test('the pill keeps its combobox keyboard contract', () => {
  const html = bar([short], { warehouse: '1' });
  assert.match(html, /<button type="button" role="combobox"/, 'still a real, tabbable button');
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /aria-expanded="false"/);
  // Nothing inside the pill steals a tab stop from it.
  assert.doesNotMatch(html, /tabindex/i);
});

test('the row-level "Clear filters" button appears only with an active filter', () => {
  assert.doesNotMatch(bar([short], {}), />Clear filters</);
  assert.match(bar([short], { warehouse: '1' }), />Clear filters</);
});
