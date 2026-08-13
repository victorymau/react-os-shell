/**
 * The form kit had DatePicker and DateRangePicker but nothing for time — a
 * delivery window or a scheduled report run could not be expressed. TimePicker
 * and DateTimePicker close that on the DatePicker pattern: native inputs
 * wearing the kit's field styling.
 *
 * The contracts worth pinning are the timezone ones. A Date passed to
 * TimePicker contributes its LOCAL wall-clock time; DateTimePicker serialises
 * and parses local fields only — `toISOString` anywhere in that path shifts
 * the value by the runner's UTC offset, which is exactly how every date bug in
 * DatePicker's history shipped (its header tells the story). TimePicker's
 * onChange hands back a string, never a Date: a time of day names no calendar
 * day, so a Date built from one has a made-up date inside it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { act, render } from './dom';
import TimePicker from '../src/forms/TimePicker';
import DateTimePicker from '../src/forms/DateTimePicker';

function inputIn(container: HTMLElement) {
  return container.querySelector('input')!;
}
function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('TimePicker: a Date value contributes its local wall-clock time', async () => {
  // 09:05 local, whatever timezone the runner is in.
  const view = render(<TimePicker value={new Date(2026, 7, 13, 9, 5)} onChange={() => {}} />);
  assert.equal(inputIn(view.container).value, '09:05');
  assert.equal(inputIn(view.container).type, 'time');
  await act(async () => { view.unmount(); });
});

test('TimePicker: onChange hands back the string, and null for empty', async () => {
  const seen: (string | null)[] = [];
  const view = render(<TimePicker value="10:30" onChange={v => seen.push(v)} />);
  setValue(inputIn(view.container), '14:45');
  setValue(inputIn(view.container), '');
  assert.deepEqual(seen, ['14:45', null]);
  await act(async () => { view.unmount(); });
});

test('TimePicker: a sub-minute step serialises Date seconds too', async () => {
  const view = render(<TimePicker step={1} value={new Date(2026, 7, 13, 9, 5, 42)} onChange={() => {}} />);
  assert.equal(inputIn(view.container).value, '09:05:42');
  await act(async () => { view.unmount(); });
});

test('DateTimePicker: a Date round-trips through local fields, never UTC', async () => {
  const seen: (Date | null)[] = [];
  const view = render(
    <DateTimePicker value={new Date(2026, 7, 13, 23, 30)} onChange={v => seen.push(v)} />,
  );
  // Late evening local: a UTC serialisation would land on a different day in
  // most timezones. The input must show the local fields verbatim.
  assert.equal(inputIn(view.container).value, '2026-08-13T23:30');
  assert.equal(inputIn(view.container).type, 'datetime-local');
  setValue(inputIn(view.container), '2026-12-31T23:59');
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], new Date(2026, 11, 31, 23, 59));
  await act(async () => { view.unmount(); });
});

test('DateTimePicker: an impossible value never arrives as a Date', async () => {
  // The DOM sanitises `2026-02-31T10:00` to '' before React sees it (jsdom
  // implements the same value-sanitisation browsers do), so the component's
  // own roll-over guard is a second line of defence. The observable claim is
  // the union of the two: however far an impossible value gets, what reaches
  // onChange is never a rolled-over Date — either the event never fires, or
  // it carries null.
  const seen: (Date | null)[] = [];
  const view = render(<DateTimePicker onChange={v => seen.push(v)} />);
  setValue(inputIn(view.container), '2026-08-13T10:00'); // valid, proves events flow
  setValue(inputIn(view.container), '2026-02-31T10:00'); // the constructor would roll into March
  setValue(inputIn(view.container), '2026-08-13T25:00'); // no such hour
  assert.deepEqual(seen[0], new Date(2026, 7, 13, 10, 0));
  assert.ok(seen.slice(1).every(v => v === null), 'an impossible value must never arrive as a Date');
  await act(async () => { view.unmount(); });
});

test('both are styled like Input and mark invalid', async () => {
  const view = render(<TimePicker invalid value="10:00" onChange={() => {}} />);
  assert.ok(inputIn(view.container).className.includes('border-red-300'));
  assert.equal(inputIn(view.container).getAttribute('aria-invalid'), 'true');
  await act(async () => { view.unmount(); });
});
