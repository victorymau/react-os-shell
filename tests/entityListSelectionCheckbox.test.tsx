/**
 * `EntityList`'s selection column renders the kit's own `Checkbox`.
 *
 * It used to be two hand-rolled `<input type="checkbox">` — one in the header,
 * one per row — carrying `text-blue-600` where every other box in the kit
 * carries `accent-blue-600`, no focus ring, and no third state. The header was
 * the defect: `checked={allSelected}` and nothing else, so a page with three of
 * forty rows ticked showed an EMPTY select-all. That reads as "nothing here is
 * selected", and the operator's next click — meaning "select everything" —
 * does select everything, which is exactly what it already looked like. A bulk
 * action on the result is the part that does not undo.
 *
 * `indeterminate` is a DOM property with no HTML attribute, which is why this
 * file renders rather than serialising: `renderToStaticMarkup` cannot show it
 * at all, and a spec written that way would pass against a box that never sets
 * it. It is read off the live element, and the two-line contract is asserted
 * in all three states.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, act } from './dom';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EntityList from '../src/data/EntityList';

interface Row { id: number; name: string }

const ROWS: Row[] = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

// Same reasoning as the other EntityList specs: ResizableTable's column config
// opens a react-query entry that nothing here fetches, and an idle entry holds
// a five-minute gc timer node's runner will not exit past.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
afterEach(() => { queryClient.clear(); });

function List({ initial = [] as number[] }) {
  const [selected, setSelected] = useState<Set<string | number>>(new Set(initial));
  return (
    <QueryClientProvider client={queryClient}>
      <EntityList<Row>
        items={ROWS}
        isLoading={false}
        emptyState={<div>empty</div>}
        tableId="selection-checkbox-spec"
        columns={[{ key: 'name', label: 'Name' }]}
        renderCell={(r) => <span>{r.name}</span>}
        selected={selected}
        setSelected={setSelected}
        onRowClick={() => {}}
        footerLabel="rows"
      />
    </QueryClientProvider>
  );
}

/** The header box is the one outside `<tbody>`; the rest are the rows'. */
function header(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('thead input[type=checkbox]')!;
}
function rows(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')];
}

test('the header box reads unchecked, mixed, then checked as the page fills', async () => {
  const none = render(<List />);
  assert.equal(header(none.container).checked, false);
  assert.equal(header(none.container).indeterminate, false, 'nothing selected is not "some"');
  await act(async () => { none.unmount(); });

  const some = render(<List initial={[1, 2]} />);
  assert.equal(header(some.container).checked, false);
  assert.equal(header(some.container).indeterminate, true, 'two of four is the mixed state');
  await act(async () => { some.unmount(); });

  const all = render(<List initial={[1, 2, 3, 4]} />);
  assert.equal(header(all.container).checked, true);
  assert.equal(header(all.container).indeterminate, false, 'all of them is checked, not mixed');
  await act(async () => { all.unmount(); });
});

test('the mixed state survives a re-render that reassigns checked', async () => {
  // The bug the kit Checkbox exists to avoid, and the one a bare ref callback
  // gets wrong: a browser CLEARS `indeterminate` whenever `checked` is
  // assigned, and React writes `checked` on every render. So it has to be
  // rewritten after that, not only when the mixedness itself changes.
  const view = render(<List initial={[1]} />);
  assert.equal(header(view.container).indeterminate, true);

  // Tick a second row: still mixed, but `checked` was written again in between.
  await act(async () => { rows(view.container)[1].click(); });
  assert.equal(header(view.container).indeterminate, true, 'still mixed after a re-render');
  assert.equal(header(view.container).checked, false);
  await act(async () => { view.unmount(); });
});

test('the header still selects and clears the page', async () => {
  const view = render(<List />);
  await act(async () => { header(view.container).click(); });
  assert.deepEqual(rows(view.container).map(b => b.checked), [true, true, true, true]);
  assert.equal(header(view.container).checked, true);

  await act(async () => { header(view.container).click(); });
  assert.deepEqual(rows(view.container).map(b => b.checked), [false, false, false, false]);
  await act(async () => { view.unmount(); });
});

test('a row box toggles its own row and never opens it', async () => {
  let opened = 0;
  const view = render(
    <QueryClientProvider client={queryClient}>
      <EntityList<Row>
        items={ROWS}
        isLoading={false}
        emptyState={<div>empty</div>}
        tableId="selection-checkbox-open-spec"
        columns={[{ key: 'name', label: 'Name' }]}
        renderCell={(r) => <span>{r.name}</span>}
        selected={new Set()}
        setSelected={() => {}}
        onRowClick={() => { opened += 1; }}
        footerLabel="rows"
      />
    </QueryClientProvider>,
  );
  await act(async () => { rows(view.container)[0].click(); });
  assert.equal(opened, 0, 'the box selects; the row opens');
  await act(async () => { view.unmount(); });
});

test('the boxes keep the 14px this column has always drawn', async () => {
  // `Checkbox` carries `h-4 w-4` in its own base and Tailwind emits `.h-3\.5`
  // BEFORE `.h-4`, so a class cannot win this — the size is an inline style,
  // which is the kit's documented way out of exactly that cascade.
  const view = render(<List initial={[1]} />);
  for (const box of [header(view.container), ...rows(view.container)]) {
    assert.equal(box.style.height, '14px');
    assert.equal(box.style.width, '14px');
  }
  // And it is the kit's box, not a bare input: the accent that follows the
  // user's theme is the reason for the swap.
  assert.match(header(view.container).className, /\baccent-blue-600\b/);
  await act(async () => { view.unmount(); });
});

test('both boxes are named, from the same catalog DataTable reads', async () => {
  // They had no accessible name at all, which on the one control a bulk action
  // runs through is the wrong place to leave one. The words come from
  // `useShellStrings` rather than a literal, so the two selection columns in
  // the kit say the same thing and both follow a mounted catalog.
  const view = render(<List />);
  assert.equal(header(view.container).getAttribute('aria-label'), 'Select all rows');
  for (const box of rows(view.container)) {
    assert.equal(box.getAttribute('aria-label'), 'Select row');
  }
  await act(async () => { view.unmount(); });
});
