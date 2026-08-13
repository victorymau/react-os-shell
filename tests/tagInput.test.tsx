/**
 * TagInput is SearchableSelect's multi-value sibling: chips in the field, the
 * same portaled dropdown behind it. The contracts worth pinning are the array
 * ones — the value is always duplicate-free, chosen options leave the list,
 * Backspace in an empty input removes the last chip — and the free-text gate,
 * which is off by default.
 *
 * The dropdown portals into `document.body`, so option queries go through the
 * document (`div.fixed`, the portal root); the chips live in the render
 * container.
 *
 * TagInput imports `react-dom` (createPortal), which is why typing into it in
 * a spec needs the runner's DOM preload — see scripts/test-dom-preload.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { act, render, pressKey } from './dom';
import TagInput from '../src/forms/TagInput';

const OPTIONS = [
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
];

function inputIn(container: HTMLElement) {
  return container.querySelector('input')!;
}
function type(el: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function menuOptions() {
  return [...document.querySelectorAll<HTMLButtonElement>('div.fixed button')];
}

test('chips render with labels resolved from options, × removes', async () => {
  let next: string[] | null = null;
  const view = render(
    <TagInput value={['red', 'blue']} onChange={v => { next = v; }} options={OPTIONS} />,
  );
  const chips = view.container.querySelectorAll('span.truncate');
  assert.deepEqual([...chips].map(c => c.textContent), ['Red', 'Blue']);
  const removeRed = view.container.querySelector<HTMLButtonElement>('button[aria-label="Remove Red"]')!;
  act(() => { removeRed.click(); });
  assert.deepEqual(next, ['blue']);
  await act(async () => { view.unmount(); });
});

test('chosen values leave the option list; picking appends', async () => {
  let next: string[] | null = null;
  const view = render(
    <TagInput value={['red']} onChange={v => { next = v; }} options={OPTIONS} />,
  );
  // 'e' matches Red, Green and Blue — but Red is already chosen.
  type(inputIn(view.container), 'e');
  assert.deepEqual(menuOptions().map(b => b.textContent), ['Green', 'Blue'],
    'a chosen value must not be offered again');
  act(() => {
    menuOptions()[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(next, ['red', 'green']);
  await act(async () => { view.unmount(); });
});

test('typing filters, Enter takes a single match', async () => {
  let next: string[] | null = null;
  const view = render(<TagInput value={[]} onChange={v => { next = v; }} options={OPTIONS} />);
  const input = inputIn(view.container);
  type(input, 'gre');
  assert.deepEqual(menuOptions().map(b => b.textContent), ['Green']);
  pressKey('Enter', { target: input });
  assert.deepEqual(next, ['green']);
  await act(async () => { view.unmount(); });
});

test('Backspace in an empty input removes the last chip', async () => {
  let next: string[] | null = null;
  const view = render(
    <TagInput value={['red', 'green']} onChange={v => { next = v; }} options={OPTIONS} />,
  );
  pressKey('Backspace', { target: inputIn(view.container) });
  assert.deepEqual(next, ['red']);
  await act(async () => { view.unmount(); });
});

test('free text is gated: rejected by default, committed with allowFreeText', async () => {
  let next: string[] | null = null;
  const closed = render(<TagInput value={[]} onChange={v => { next = v; }} options={OPTIONS} />);
  const closedInput = inputIn(closed.container);
  type(closedInput, 'purple');
  pressKey('Enter', { target: closedInput });
  assert.equal(next, null, 'unlisted text must not become a tag by default');
  await act(async () => { closed.unmount(); });

  const openView = render(<TagInput value={[]} onChange={v => { next = v; }} allowFreeText />);
  const openInput = inputIn(openView.container);
  type(openInput, 'purple');
  pressKey('Enter', { target: openInput });
  assert.deepEqual(next, ['purple']);
  await act(async () => { openView.unmount(); });
});

test('adding an existing value is a no-op, so the array stays duplicate-free', async () => {
  const calls: string[][] = [];
  const view = render(
    <TagInput value={['purple']} onChange={v => calls.push(v)} allowFreeText />,
  );
  const input = inputIn(view.container);
  type(input, 'purple');
  pressKey('Enter', { target: input });
  assert.deepEqual(calls, [], 'a duplicate commit must not call onChange at all');
  assert.equal(input.value, '', 'but the typed text is consumed');
  await act(async () => { view.unmount(); });
});
