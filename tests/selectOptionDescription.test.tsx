import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * `SelectOption.description` — a second, muted line in the OPEN list, and
 * nowhere else.
 *
 * ── Why this file stubs `CSS` ──
 * Opening the desktop listbox runs the effect that keeps the active option
 * scrolled into view, and that effect builds a selector with `CSS.escape`
 * (option ids come from `useId`, so they are full of colons). **jsdom ships no
 * `CSS` object at all** — not a partial one, not one without `escape` — so the
 * effect throws before any assertion here could run. Nothing in the repo had
 * opened the listbox in a spec before, which is why the gap had never shown up.
 *
 * The stub is deliberately minimal and lives here rather than in `tests/dom.ts`:
 * a correct `CSS.escape` is a specification, and inventing one in shared test
 * infrastructure would be a bigger claim than this spec needs. All the effect
 * does with the result is `scrollIntoView`, which `tests/dom.ts` already stubs
 * to a no-op — so the escape only has to produce a selector the parser accepts.
 */
Object.defineProperty(globalThis, 'CSS', {
  configurable: true,
  writable: true,
  value: { escape: (s: string) => s.replace(/[^\w-]/g, c => `\\${c}`) },
});

const { act, render } = await import('./dom');
const { default: Select, NativeSelect } = await import('../src/forms/Select');

const OPTIONS = [
  { value: 'net_30', label: 'Net 30', description: 'Due 30 days after the invoice date.' },
  { value: 'net_60', label: 'Net 60', description: 'Due 60 days after the invoice date.' },
  { value: 'prepaid', label: 'Prepaid' },
];

/** The portaled listbox lands on `document.body`, not inside the container. */
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

function openListbox(container: ParentNode) {
  const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  act(() => { trigger.click(); });
  return trigger;
}

test('the open list carries the description; the closed trigger does not', () => {
  const view = render(<Select value="net_30" onChange={() => {}} options={OPTIONS} />);

  const trigger = view.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  assert.equal(trigger.textContent, 'Net 30');
  assert.doesNotMatch(
    trigger.textContent ?? '',
    /Due 30 days/,
    'a two-line trigger changes the height of every field in the row',
  );

  openListbox(view.container);
  assert.ok(listbox(), 'the listbox did not open');
  const [first] = options();
  assert.match(first.textContent ?? '', /Net 30/);
  assert.match(first.textContent ?? '', /Due 30 days after the invoice date\./);

  view.unmount();
});

test('the description is a second line, in its own quieter ink', () => {
  const view = render(<Select value="net_30" onChange={() => {}} options={OPTIONS} />);
  openListbox(view.container);

  const [first] = options();
  const [labelEl, descEl] = [...first.children] as HTMLElement[];
  assert.equal(labelEl.textContent, 'Net 30');
  assert.match(labelEl.className, /\bblock\b/, 'the label needs its own line box');
  assert.equal(descEl.textContent, 'Due 30 days after the invoice date.');
  assert.match(descEl.className, /\bblock\b/);
  assert.match(descEl.className, /\btext-xs\b/);
  assert.match(descEl.className, /\btext-gray-500\b/);
  // The row goes blue when active or selected; a description that followed the
  // row's ink would read as a second label.
  assert.match(descEl.className, /\bfont-normal\b/);

  view.unmount();
});

test('an option without one is the bare label it has always been', () => {
  const view = render(<Select value="net_30" onChange={() => {}} options={OPTIONS} />);
  openListbox(view.container);

  const prepaid = options()[2];
  assert.equal(prepaid.textContent, 'Prepaid');
  assert.equal(prepaid.children.length, 0, 'no wrapper spans appear around an option that explains nothing');

  view.unmount();
});

test('picking an option still reports its value', () => {
  // The markup changed; the behaviour did not.
  const picked: string[] = [];
  const view = render(<Select value="net_30" onChange={v => picked.push(v)} options={OPTIONS} />);
  openListbox(view.container);

  act(() => { options()[1].click(); });
  assert.deepEqual(picked, ['net_60']);

  view.unmount();
});

test('NativeSelect ignores it — an <option> can hold text and nothing else', () => {
  const markup = renderToStaticMarkup(
    <NativeSelect value="net_30" onChange={() => {}} options={OPTIONS} />,
  );
  assert.match(markup, /<option value="net_30"[^>]*>Net 30<\/option>/);
  assert.doesNotMatch(markup, /Due 30 days/, 'a description inside an <option> would be pasted into its label');
});

test('the hidden native shadow behind the desktop listbox ignores it too', () => {
  // It is what carries the forwarded ref and any form post; a description
  // leaking into it would change the text a form submits nothing about and a
  // screen reader might still reach.
  const view = render(<Select value="net_30" onChange={() => {}} options={OPTIONS} />);
  const shadow = view.container.querySelector<HTMLSelectElement>('select.sr-only')!;
  assert.deepEqual([...shadow.options].map(o => o.textContent), ['Net 30', 'Net 60', 'Prepaid']);
  view.unmount();
});

test('SelectOption stays backward compatible — description is optional', () => {
  // The type change must not oblige a single existing caller to say anything.
  const view = render(
    <Select value="a" onChange={() => {}} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />,
  );
  openListbox(view.container);
  assert.deepEqual(options().map(o => o.textContent), ['A', 'B']);
  view.unmount();
});
