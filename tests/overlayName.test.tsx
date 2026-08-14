import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from './dom';
import Dialog from '../src/shell/Dialog';
import Drawer from '../src/shell/Drawer';

/**
 * A `role="dialog"` with no accessible name is announced as "dialog" and
 * nothing else, which is the one thing a screen reader user cannot work with:
 * something took their focus and will not say what it is.
 *
 * Both overlays derived the name from `title`, and only when `title` happened
 * to be a plain string. Two ways that failed:
 *
 *  - A title built from elements — an icon beside a word, a count in a badge —
 *    is a ReactNode, fell through the `typeof === 'string'` check, and left the
 *    overlay unnamed even though a heading was visible on screen.
 *  - An overlay with no title at all had no way to be named. A navigation
 *    drawer is exactly that case: its content is its own heading, so there is
 *    nothing to put in a title bar, and it was unnamed by construction.
 */

const panel = (view: { container: HTMLElement }) =>
  view.container.ownerDocument.querySelector('[role="dialog"]')!;

/** What a screen reader would announce, resolved the way the AX tree does. */
function accessibleName(el: Element): string {
  const by = el.getAttribute('aria-labelledby');
  if (by) return el.ownerDocument.getElementById(by)?.textContent ?? '';
  return el.getAttribute('aria-label') ?? '';
}

for (const [name, Overlay] of [['Dialog', Dialog], ['Drawer', Drawer]] as const) {
  test(`${name}: a string title names it`, () => {
    const view = render(<Overlay open onClose={() => {}} title="Cancel order">body</Overlay>);
    assert.equal(accessibleName(panel(view)), 'Cancel order');
    view.unmount();
  });

  test(`${name}: an ELEMENT title still names it`, () => {
    // The regression. This used to resolve to '' because the title was not a
    // string, while the heading sat visible on screen the whole time.
    const view = render(
      <Overlay open onClose={() => {}} title={<><span>Cancel</span> <span>order</span></>}>body</Overlay>,
    );
    assert.equal(accessibleName(panel(view)), 'Cancel order');
    view.unmount();
  });

  test(`${name}: with no title, aria-label names it`, () => {
    const view = render(<Overlay open onClose={() => {}} aria-label="Navigation menu">body</Overlay>);
    assert.equal(accessibleName(panel(view)), 'Navigation menu');
    view.unmount();
  });

  test(`${name}: a visible title wins over a parallel aria-label`, () => {
    // Two names for one thing drift. The one the sighted user can read is the
    // one that has to survive.
    const view = render(
      <Overlay open onClose={() => {}} title="Cancel order" aria-label="Something else">body</Overlay>,
    );
    const el = panel(view);
    assert.equal(accessibleName(el), 'Cancel order');
    assert.equal(el.getAttribute('aria-label'), null, 'the two must not both be set');
    view.unmount();
  });

  test(`${name}: the body is still the description`, () => {
    // Guards the wiring next door: aria-describedby and the new labelledby both
    // hang off useId, and swapping one for the other is a silent change.
    const view = render(<Overlay open onClose={() => {}} title="Cancel order">the consequences</Overlay>);
    const el = panel(view);
    const describedBy = el.getAttribute('aria-describedby')!;
    assert.ok(describedBy, 'the body must still describe the overlay');
    assert.notEqual(describedBy, el.getAttribute('aria-labelledby'), 'name and description are different ids');
    assert.match(el.ownerDocument.getElementById(describedBy)?.textContent ?? '', /the consequences/);
    view.unmount();
  });
}
