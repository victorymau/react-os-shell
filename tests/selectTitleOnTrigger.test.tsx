/**
 * `Select title` reaches the VISIBLE trigger.
 *
 * The desktop branch renders two elements: the button the user sees and a
 * `sr-only` `<select>` that carries the forwarded ref and any spread native
 * attributes. `title` was riding that spread onto the hidden one — where it is
 * a tooltip on a 1px clipped box nobody's pointer can reach, and a fallback
 * accessible name on an element marked `aria-hidden`. Either way it reached
 * nobody.
 *
 * `aria-describedby`, `aria-label` and `aria-labelledby` were already pulled
 * out for the same reason; `title` is the one that was missed. The mobile
 * branch renders one real `<select>` and needs none of this, which is asserted
 * at the end so the fix is not mistaken for a rule about every viewport.
 */
import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import Select, { NativeSelect } from '../src/forms/Select';

const OPTIONS = [
  { value: 'au', label: 'Australia' },
  { value: 'nz', label: 'New Zealand' },
];

/** The visible trigger and the hidden native control, from one render. */
function parts(html: string) {
  const trigger = html.match(/<button[^>]*role="combobox"[^>]*>/)?.[0] ?? '';
  const native = html.match(/<select[^>]*>/)?.[0] ?? '';
  return { trigger, native };
}

test('title lands on the trigger the user can actually hover', () => {
  const { trigger, native } = parts(renderToStaticMarkup(
    <Select value="au" onChange={() => {}} options={OPTIONS} title="Ship-to country, not bill-to" />,
  ));
  assert.match(trigger, /title="Ship-to country, not bill-to"/, 'the visible button carries it');
  assert.doesNotMatch(native, /title=/, 'the sr-only select does not');
});

test('the aria names travel with it, on the same element', () => {
  // These were already forwarded — pinned here so a later refactor cannot move
  // one of the four back onto the hidden control and leave the rest behind.
  const { trigger, native } = parts(renderToStaticMarkup(
    <Select
      value="au" onChange={() => {}} options={OPTIONS}
      title="Country" aria-label="Country" aria-describedby="country-hint"
    />,
  ));
  assert.match(trigger, /aria-label="Country"/);
  assert.match(trigger, /aria-describedby="country-hint"/);
  assert.doesNotMatch(native, /aria-label=/);
  assert.doesNotMatch(native, /aria-describedby=/);
});

test('no title asked for, no title attribute anywhere', () => {
  const html = renderToStaticMarkup(<Select value="au" onChange={() => {}} options={OPTIONS} />);
  assert.doesNotMatch(html, /title=/, 'an undefined title must not render as an empty one');
});

test('the native control keeps the rest of the spread', () => {
  // Pulling `title` out must not have pulled the form attributes out with it:
  // `name`, `required` and the ref are the reason the hidden select exists.
  const { trigger, native } = parts(renderToStaticMarkup(
    <Select value="au" onChange={() => {}} options={OPTIONS} name="country" required title="Country" />,
  ));
  assert.match(native, /name="country"/);
  assert.match(native, /required/);
  assert.doesNotMatch(trigger, /name="country"/, 'the button is not the form control');
});

test('NativeSelect is literal — one element, and the title goes on it', () => {
  // The mobile branch, and the opt-out for callers that want a raw native
  // control on every viewport. There is no hidden twin to get this wrong.
  const html = renderToStaticMarkup(
    <NativeSelect value="au" onChange={() => {}} options={OPTIONS} title="Country" />,
  );
  assert.match(html, /^<select[^>]*title="Country"/);
  assert.doesNotMatch(html, /role="combobox"/);
});
