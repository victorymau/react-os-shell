import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { render, act } from './dom';
import TimePicker, { parseTime, formatTime, toMinutes } from '../src/forms/TimePicker';

/**
 * Most of these are about the typing path, because that is where a time field
 * is usually judged: someone types `930` and either it works or the control
 * feels broken. The rest pin the two decisions worth not reversing by accident
 * — the value is a `HH:mm` STRING rather than a Date, and a bad entry reverts
 * visibly rather than being stored or dropped in silence.
 */

const setup = (props: Partial<Parameters<typeof TimePicker>[0]> = {}) =>
  render(<TimePicker aria-label="Pickup time" {...props} />);

const field = (v: { container: HTMLElement }) => v.container.querySelector('input')!;
const list = (v: { container: HTMLElement }) => v.container.querySelector('[role="listbox"]');
const options = (v: { container: HTMLElement }) =>
  [...v.container.querySelectorAll('[role="option"]')] as HTMLElement[];

function key(el: Element, k: string): boolean {
  const win = el.ownerDocument.defaultView as Window & typeof globalThis;
  const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(e); });
  return e.defaultPrevented;
}

const type = (el: HTMLInputElement, text: string) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView!.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, text);
  el.dispatchEvent(new (el.ownerDocument.defaultView as Window & typeof globalThis).Event('input', { bubbles: true }));
});

const blur = (el: HTMLElement) => act(() => {
  // React delegates onBlur from focusout, because blur does not bubble.
  el.dispatchEvent(new (el.ownerDocument.defaultView as Window & typeof globalThis).FocusEvent('focusout', { bubbles: true }));
});

test('it announces itself as a combobox over a list', () => {
  const view = setup();
  const input = field(view);
  assert.equal(input.getAttribute('role'), 'combobox');
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(input.getAttribute('aria-label'), 'Pickup time');
  assert.equal(list(view), null, 'and the list is absent until it opens');
  view.unmount();
});

test('focus opens the list, and the field points at it', () => {
  const view = setup();
  act(() => { field(view).focus(); });
  const l = list(view)!;
  assert.ok(l);
  assert.equal(field(view).getAttribute('aria-expanded'), 'true');
  assert.equal(field(view).getAttribute('aria-controls'), l.id);
  view.unmount();
});

test('the step decides what is offered', () => {
  const view = setup({ step: 60 });
  act(() => { field(view).focus(); });
  assert.equal(options(view).length, 24);
  assert.equal(options(view)[0].textContent, '00:00');
  assert.equal(options(view)[23].textContent, '23:00');
  view.unmount();
});

test('min and max bound the list, not just the entry', () => {
  const view = setup({ step: 60, min: '09:00', max: '17:00' });
  act(() => { field(view).focus(); });
  const labels = options(view).map(o => o.textContent);
  assert.equal(labels[0], '09:00');
  assert.equal(labels[labels.length - 1], '17:00');
  assert.equal(labels.length, 9);
  view.unmount();
});

test('a step of zero does not hang the tab', () => {
  // The generator loops on `mins += step`. A caller passing 0 — from a config
  // value, or a stray `Number('')` — would spin forever and take the page with
  // it, which is not a failure anyone can diagnose from the outside.
  const view = setup({ step: 0 });
  act(() => { field(view).focus(); });
  assert.ok(options(view).length > 0 && options(view).length < 100);
  view.unmount();
});

test('the arrows move through the list and Enter takes one', () => {
  const chosen: (string | null)[] = [];
  const view = setup({ step: 60, onChange: v => chosen.push(v) });
  const input = field(view);
  act(() => { input.focus(); });

  key(input, 'ArrowDown');
  key(input, 'ArrowDown');
  assert.equal(key(input, 'Enter'), true);
  assert.deepEqual(chosen, ['02:00']);
  assert.equal(list(view), null, 'and it closes');
  view.unmount();
});

test('Escape closes without choosing, and puts the value back', () => {
  const chosen: (string | null)[] = [];
  const view = setup({ step: 60, value: '09:00', onChange: v => chosen.push(v) });
  const input = field(view);
  act(() => { input.focus(); });
  type(input, '11');
  key(input, 'Escape');

  assert.equal(list(view), null);
  assert.deepEqual(chosen, [], 'nothing was committed');
  assert.equal(input.value, '09:00', 'the field shows the value again');
  view.unmount();
});

test('the active option is reported, not just highlighted', () => {
  // A highlight nobody can see is not a selection. aria-activedescendant is
  // what tells a screen reader which row the arrows are on.
  const view = setup({ step: 60 });
  const input = field(view);
  act(() => { input.focus(); });
  key(input, 'ArrowDown');
  const activeId = input.getAttribute('aria-activedescendant');
  assert.ok(activeId);
  // getElementById, not querySelector: useId produces ':r1:' and a colon is
  // not a valid CSS identifier.
  assert.equal(view.container.ownerDocument.getElementById(activeId!)?.getAttribute('data-active'), 'true');
  view.unmount();
});

test('a typed time is taken on blur', () => {
  const chosen: (string | null)[] = [];
  const view = setup({ onChange: v => chosen.push(v) });
  const input = field(view);
  act(() => { input.focus(); });
  type(input, '9:15');
  blur(input);
  assert.deepEqual(chosen, ['09:15']);
  assert.equal(input.value, '09:15', 'and it is normalised on the way in');
  view.unmount();
});

test('an unreadable entry reverts rather than being stored or dropped', () => {
  // The two silent failures: storing '25:99' because it looked like text, or
  // clearing the field and leaving the user staring at a blank they did not ask
  // for. Neither tells them the entry was rejected.
  const chosen: (string | null)[] = [];
  const view = setup({ value: '09:00', onChange: v => chosen.push(v) });
  const input = field(view);
  act(() => { input.focus(); });
  type(input, 'half nine');
  blur(input);
  assert.deepEqual(chosen, []);
  assert.equal(input.value, '09:00');
  view.unmount();
});

test('a time outside min/max is refused the same way', () => {
  const chosen: (string | null)[] = [];
  const view = setup({ value: '09:00', min: '09:00', max: '17:00', onChange: v => chosen.push(v) });
  const input = field(view);
  act(() => { input.focus(); });
  type(input, '18:30');
  blur(input);
  assert.deepEqual(chosen, [], 'out of bounds is not a value');
  assert.equal(input.value, '09:00');
  view.unmount();
});

test('emptying the field clears the value', () => {
  const chosen: (string | null)[] = [];
  const view = setup({ value: '09:00', onChange: v => chosen.push(v) });
  const input = field(view);
  act(() => { input.focus(); });
  type(input, '');
  blur(input);
  assert.deepEqual(chosen, [null], 'cleared is a value, and it is null');
  view.unmount();
});

test('a 12-hour clock is display only — the value stays 24-hour', () => {
  // The decision worth not reversing. A server wants 14:30; a 12-hour string
  // does not sort, and 12:xx is ambiguous without the suffix.
  //
  // Driven through a host that actually applies the change: the control is
  // controlled, so asserting on the field without feeding the new value back
  // would be asserting that it ignores its own prop.
  const chosen: (string | null)[] = [];
  function Host() {
    const [v, setV] = useState<string | null>('14:30');
    return <TimePicker aria-label="Pickup time" hour12 value={v} onChange={next => { chosen.push(next); setV(next); }} />;
  }
  const view = render(<Host />);
  const input = field(view);
  assert.equal(input.value, '2:30 PM');

  act(() => { input.focus(); });
  type(input, '4:15 pm');
  blur(input);
  assert.deepEqual(chosen, ['16:15'], 'stored 24-hour');
  assert.equal(input.value, '4:15 PM', 'shown 12-hour');
  view.unmount();
});

// ── the parser, where a time field is actually judged ──

test('parseTime reads what people type', () => {
  for (const [input, expected] of [
    ['9', '09:00'], ['09', '09:00'], ['9:30', '09:30'], ['9.30', '09:30'],
    ['930', '09:30'], ['0930', '09:30'], ['1430', '14:30'], ['14:30', '14:30'],
    ['23:59', '23:59'], ['0:00', '00:00'], [' 9:30 ', '09:30'],
  ] as const) {
    assert.equal(parseTime(input, false), expected, input);
  }
});

test('parseTime reads a meridiem, on either clock', () => {
  for (const [input, expected] of [
    ['9am', '09:00'], ['9 AM', '09:00'], ['9pm', '21:00'], ['2:30 pm', '14:30'],
    ['12am', '00:00'], ['12pm', '12:00'], ['12:30am', '00:30'],
  ] as const) {
    assert.equal(parseTime(input, true), expected, input);
  }
});

test('parseTime refuses what is not a time', () => {
  for (const bad of ['', '  ', 'noon', '25:00', '9:75', 'abc', '9:9:9', '13pm', '0pm']) {
    assert.equal(parseTime(bad, false), null, bad);
  }
});

test('a single digit with a meridiem is not read as 24-hour', () => {
  // '3pm' is 15:00 and never 03:00 — the case that makes an afternoon booking
  // land in the small hours.
  assert.equal(parseTime('3pm', true), '15:00');
  assert.equal(parseTime('3am', true), '03:00');
});

test('formatTime and toMinutes agree with the parser', () => {
  assert.equal(formatTime('14:30', false), '14:30');
  assert.equal(formatTime('14:30', true), '2:30 PM');
  assert.equal(formatTime('00:05', true), '12:05 AM');
  assert.equal(formatTime('12:00', true), '12:00 PM');
  assert.equal(toMinutes('14:30'), 870);
  assert.equal(toMinutes('24:00'), null, 'not a time of day');
  assert.equal(toMinutes(null), null);
});
