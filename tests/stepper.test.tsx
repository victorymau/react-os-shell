/**
 * Stepper is the progress strip of a linear wizard, and its load-bearing rule
 * is the ONE-WAY one: completed steps are clickable (going back is always
 * safe), upcoming steps never are — a strip that lets the user jump forward
 * has silently promised that the skipped validation didn't matter. These
 * specs pin that rule, the aria-current marker, and the indicator-only form.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { act, render } from './dom';
import { renderToStaticMarkup } from 'react-dom/server';
import Stepper from '../src/shell/Stepper';

const STEPS = [
  { id: 'contact', label: 'Contact' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'payment', label: 'Payment' },
];

test('the current step carries aria-current="step", and only it', () => {
  const markup = renderToStaticMarkup(<Stepper items={STEPS} value="shipping" />);
  const hits = markup.match(/aria-current="step"/g) ?? [];
  assert.equal(hits.length, 1);
  assert.match(markup, /aria-current="step"[^>]*>(?:(?!<\/li>).)*Shipping/s);
});

test('completed steps show a check, upcoming ones their number', () => {
  const markup = renderToStaticMarkup(<Stepper items={STEPS} value="shipping" />);
  // One check (Contact done), and "3" still visible for Payment.
  assert.equal((markup.match(/<svg/g) ?? []).length, 1);
  assert.match(markup, />3</);
});

test('back is a click, forward is not', async () => {
  const seen: string[] = [];
  const view = render(<Stepper items={STEPS} value="shipping" onChange={id => seen.push(id)} />);
  const buttons = [...view.container.querySelectorAll('button')];
  assert.equal(buttons.length, 1, 'only the completed step is clickable');
  act(() => { buttons[0].click(); });
  assert.deepEqual(seen, ['contact']);
  await act(async () => { view.unmount(); });
});

test('without onChange the strip is an indicator: no controls at all', () => {
  const markup = renderToStaticMarkup(<Stepper items={STEPS} value="payment" />);
  assert.doesNotMatch(markup, /<button/);
});

test('the connectors left of the current step read as travelled', () => {
  const markup = renderToStaticMarkup(<Stepper items={STEPS} value="shipping" />);
  assert.equal((markup.match(/bg-blue-600 rounded|rounded bg-blue-600/g) ?? []).length, 1,
    'one blue connector (into Shipping), the one into Payment stays grey');
});
