/**
 * `Snippet id` / `aria-describedby` — what makes a Snippet behave like a field
 * when a `FormField` wraps one.
 *
 * `FormField` renders its hint with `id="${htmlFor}-hint"` and clones its
 * single element child with `aria-describedby` pointing at it. A child that
 * does not ACCEPT the prop drops it: the `<p>` renders under the snippet, the
 * row looks wired, and the hint is announced to nobody. Same for `htmlFor` —
 * a `<label for>` whose id resolves to nothing is not a label.
 *
 * Both land on the copy button rather than on the box, because the button is
 * the only focusable thing in a Snippet (see the component's own doc-block for
 * why the value is not a read-only `Input`) and both attributes are about what
 * the user focuses. A `<button>` is labelable, so `for`/`id` is a real
 * association here and not a decoration.
 *
 * With `hideCopyButton` there is nothing focusable left and they fall back to
 * the box — the ids still have to resolve to an element.
 */
import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from './dom';
import Snippet from '../src/forms/Snippet';
import FormField from '../src/forms/FormField';

const button = (root: ParentNode) => root.querySelector<HTMLButtonElement>('button[aria-label^="Copy"]')!;

test('id and aria-describedby land on the copy button', () => {
  const view = render(
    <Snippet value="https://hooks.efficient.test/t/8e1c" id="hook" aria-describedby="hook-hint" />,
  );
  const copy = button(view.container);
  assert.equal(copy.id, 'hook');
  assert.equal(copy.getAttribute('aria-describedby'), 'hook-hint');
  // Not on the box as well — one id, one element, or `getElementById` picks
  // whichever comes first and a label points at the wrong half of the row.
  assert.equal(view.container.querySelector('div#hook'), null);
  view.unmount();
});

test('a wrapping FormField actually announces its hint', () => {
  // The end-to-end claim, and the reason the props exist: FormField generates
  // the id, clones the child with it, and the child has to keep it.
  const view = render(
    <FormField label="Webhook endpoint" htmlFor="hook" hint="Your server must answer this within 5 seconds.">
      <Snippet value="https://hooks.efficient.test/t/8e1c" label="the webhook endpoint" />
    </FormField>,
  );
  const copy = button(view.container);
  const hint = view.container.querySelector('p')!;

  assert.equal(copy.getAttribute('aria-describedby'), 'hook-hint');
  assert.equal(hint.id, 'hook-hint', 'the id it points at must be the one rendered');
  view.unmount();
});

test('the label a FormField draws points at something focus can land on', () => {
  const view = render(
    <FormField label="Tenant id" htmlFor="tenant">
      <Snippet value="tnt_8e1c4f2a" label="the tenant id" id="tenant" />
    </FormField>,
  );
  const label = view.container.querySelector('label')!;
  const target = view.container.querySelector(`#${label.htmlFor}`)!;

  assert.ok(target, 'htmlFor must resolve to a rendered element');
  assert.equal(target.tagName, 'BUTTON', 'and to the focusable one — a <label for> needs a labelable target');
  view.unmount();
});

test('hideCopyButton falls the wiring back onto the box', () => {
  // No affordance, so no button to carry them — but a hint that points at
  // nothing is still a hint nobody hears.
  const view = render(
    <Snippet value="build-2026-09-14-a41f8c" hideCopyButton id="build" aria-describedby="build-hint" />,
  );
  assert.equal(view.container.querySelector('button'), null);
  const box = view.container.querySelector('#build')!;
  assert.equal(box.tagName, 'DIV');
  assert.equal(box.getAttribute('aria-describedby'), 'build-hint');
  view.unmount();
});

test('neither prop renders an empty attribute when it is not given', () => {
  const view = render(<Snippet value="tnt_8e1c4f2a" />);
  const copy = button(view.container);
  assert.equal(copy.getAttribute('id'), null);
  assert.equal(copy.getAttribute('aria-describedby'), null);
  assert.equal(view.container.firstElementChild!.getAttribute('id'), null);
  view.unmount();
});

test('the copy button keeps its own accessible name', () => {
  // `aria-describedby` describes; it never names. The button that copies "the
  // API key" must still say so, whatever the field around it adds.
  const view = render(<Snippet value="sk_live_8Hf2" label="the API key" id="key" aria-describedby="key-hint" />);
  assert.equal(button(view.container).getAttribute('aria-label'), 'Copy the API key');
  view.unmount();
});
