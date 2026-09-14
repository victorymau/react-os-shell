import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, render } from './dom';
import RadioGroup from '../src/forms/RadioGroup';

/**
 * One choice from a visible list, and the group chrome every panel used to
 * rebuild by hand.
 *
 * ── On arrow keys ──
 * The brief for this component asked the spec to verify that Arrow moves
 * between the options. It cannot, and the reason is worth writing down rather
 * than faking: **jsdom implements no radio-group keyboard behaviour at all.**
 * Measured directly against the version this repo pins — focus the first of
 * three `<input type="radio" name="g">`, dispatch `keydown` with
 * `key: 'ArrowDown'`, and afterwards `document.activeElement` is still the
 * first input and nothing has changed its `checked`. Arrow movement is user-
 * agent behaviour, not DOM behaviour; there is no DOM API to trigger it and no
 * assertion here that could observe it.
 *
 * So what a spec CAN hold is the precondition that behaviour depends on: the
 * options are real native radios, all carrying one `name`. That is exactly the
 * invariant the panels this replaces kept losing — a group assembled from
 * `<div role="radio">`, or from radios whose `name` differed, looks identical
 * and has no keyboard at all. Asserting it here is not a proxy for the browser
 * behaviour; it is the thing this component is responsible for.
 */

const OPTIONS = [
  { value: 'net_30', label: 'Net 30', description: 'Payment is due 30 days after the invoice date.' },
  { value: 'net_60', label: 'Net 60', description: 'Payment is due 60 days after the invoice date.' },
  { value: 'prepaid', label: 'Prepaid', disabled: true },
];

const group = (root: ParentNode) => root.querySelector<HTMLElement>('[role="radiogroup"]')!;
const radios = (root: ParentNode) => [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')];

test('it is one group, named by its label', () => {
  const view = render(
    <RadioGroup name="terms" label="Payment terms" value="net_30" onChange={() => {}} options={OPTIONS} />,
  );

  const g = group(view.container);
  assert.ok(g, 'a set of radios with no radiogroup wrapper is a set of radios');

  // `<label for>` cannot name a div, so the group points at the label instead.
  // This is the wiring MediaUploadGrid established and the one a hand-rolled
  // group forgets.
  const labelledBy = g.getAttribute('aria-labelledby');
  assert.ok(labelledBy, 'the group has no accessible name');
  // `getElementById`, not a `#id` selector: React's `useId` produces ids full of
  // CSS-significant punctuation (`:r0:`), and jsdom ships no `CSS.escape` to get
  // one past a selector parser.
  assert.equal(document.getElementById(labelledBy!)?.textContent, 'Payment terms');

  view.unmount();
});

test('the options are native radios sharing one name — the keyboard depends on it', () => {
  const view = render(
    <RadioGroup name="terms" label="Payment terms" value="net_30" onChange={() => {}} options={OPTIONS} />,
  );

  const inputs = radios(view.container);
  assert.equal(inputs.length, 3, 'every option is a real radio input');
  assert.deepEqual([...new Set(inputs.map(i => i.name))], ['terms'], 'one name, or they are not one group');
  assert.deepEqual(inputs.map(i => i.value), ['net_30', 'net_60', 'prepaid']);

  // The failure mode this rules out: an ARIA group hand-built from divs, which
  // renders the same and has no user-agent keyboard behind it.
  assert.equal(view.container.querySelector('[role="radio"]'), null);

  view.unmount();
});

test('selecting one reports its value, and only one is ever checked', () => {
  const picked: string[] = [];
  const view = render(
    <RadioGroup name="terms" label="Payment terms" value="net_30" onChange={v => picked.push(v)} options={OPTIONS} />,
  );

  const inputs = radios(view.container);
  assert.deepEqual(inputs.map(i => i.checked), [true, false, false]);

  act(() => { inputs[1].click(); });
  assert.deepEqual(picked, ['net_60'], 'the group reports the option, not a boolean');

  // Controlled: the DOM follows `value`, so re-rendering with the new one is
  // what moves the dot.
  view.rerender(
    <RadioGroup name="terms" label="Payment terms" value="net_60" onChange={v => picked.push(v)} options={OPTIONS} />,
  );
  assert.deepEqual(radios(view.container).map(i => i.checked), [false, true, false]);

  view.unmount();
});

test('nothing chosen yet is a real state, not a silent first option', () => {
  const view = render(
    <RadioGroup name="terms" label="Payment terms" value={null} onChange={() => {}} options={OPTIONS} />,
  );
  assert.deepEqual(radios(view.container).map(i => i.checked), [false, false, false]);
  view.unmount();
});

test('a description rides under its own option', () => {
  const view = render(
    <RadioGroup name="terms" label="Payment terms" value="net_30" onChange={() => {}} options={OPTIONS} />,
  );

  const row = radios(view.container)[0].closest('label')!;
  assert.match(row.textContent ?? '', /Net 30/);
  assert.match(row.textContent ?? '', /due 30 days/, 'the description belongs to the option, not to the group');
  // Prepaid has none, and must not borrow one.
  assert.doesNotMatch(radios(view.container)[2].closest('label')!.textContent ?? '', /due \d+ days/);

  view.unmount();
});

test('one option can be disabled without disabling the group', () => {
  const view = render(
    <RadioGroup name="terms" label="Payment terms" value="net_30" onChange={() => {}} options={OPTIONS} />,
  );
  assert.deepEqual(radios(view.container).map(i => i.disabled), [false, false, true]);
  view.unmount();
});

test('the group can be disabled entirely, and that outranks the option', () => {
  const view = render(
    <RadioGroup name="terms" label="Payment terms" value="net_30" onChange={() => {}} options={OPTIONS} disabled />,
  );
  assert.deepEqual(radios(view.container).map(i => i.disabled), [true, true, true]);
  view.unmount();
});

test('the hint describes the GROUP — the wiring a hand-rolled one loses', () => {
  const view = render(
    <RadioGroup
      name="terms"
      label="Payment terms"
      hint="Applies to every order on this account."
      value="net_30"
      onChange={() => {}}
      options={OPTIONS}
    />,
  );

  const describedBy = group(view.container).getAttribute('aria-describedby');
  assert.ok(describedBy, 'the hint is rendered near the group but points at nothing');
  assert.match(
    document.getElementById(describedBy!.split(' ')[0])?.textContent ?? '',
    /every order on this account/,
  );

  view.unmount();
});

test('an error replaces the hint, announces itself, and marks the group invalid', () => {
  const view = render(
    <RadioGroup
      name="terms"
      label="Payment terms"
      hint="Applies to every order on this account."
      error="Choose the terms before saving."
      value={null}
      onChange={() => {}}
      options={OPTIONS}
    />,
  );

  const g = group(view.container);
  assert.equal(g.getAttribute('aria-invalid'), 'true');
  assert.equal(view.container.querySelector('[role="alert"]')?.textContent, 'Choose the terms before saving.');
  assert.doesNotMatch(view.container.textContent ?? '', /every order on this account/, 'the error takes over');

  const describedBy = g.getAttribute('aria-describedby')!;
  assert.match(
    document.getElementById(describedBy.split(' ')[0])?.textContent ?? '',
    /Choose the terms/,
  );

  view.unmount();
});

test('required is announced, not just drawn', () => {
  // FormField's asterisk is `aria-hidden` decoration on purpose; without
  // aria-required on the group the requirement reaches nobody who cannot see it.
  const view = render(
    <RadioGroup name="terms" label="Payment terms" required value={null} onChange={() => {}} options={OPTIONS} />,
  );
  assert.equal(group(view.container).getAttribute('aria-required'), 'true');
  view.unmount();
});

test('orientation changes the layout and nothing else', () => {
  const vertical = render(
    <RadioGroup name="terms" label="Terms" value="net_30" onChange={() => {}} options={OPTIONS} />,
  );
  assert.match(group(vertical.container).className, /\bflex-col\b/);
  vertical.unmount();

  const horizontal = render(
    <RadioGroup name="terms" label="Terms" value="net_30" onChange={() => {}} options={OPTIONS} orientation="horizontal" />,
  );
  const cls = group(horizontal.container).className;
  assert.doesNotMatch(cls, /\bflex-col\b/);
  assert.match(cls, /\bflex-wrap\b/, 'a horizontal group wraps rather than compressing its labels');
  assert.equal(radios(horizontal.container).length, 3, 'same options, same markup');
  horizontal.unmount();
});
