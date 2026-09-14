/**
 * `Banner action` — the control that does something about what the banner says.
 *
 * A notice that names a condition and leaves the fix three menus away is the
 * common shape of a banner nobody acts on. The claims pinned here are about
 * WHERE the control lands, because that is the whole of the feature: at the
 * right edge, after the text so a screen reader reaches the problem before the
 * button, and before the dismiss × so "Retry" is never past "close this".
 */
import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, render } from './dom';
import Banner from '../src/shell/Banner';

test('the action sits after the text and before the dismiss', () => {
  const html = renderToStaticMarkup(
    <Banner tone="danger" title="Payment failed" onDismiss={() => {}} action={<button type="button">Update card</button>}>
      Update your card to avoid interruption.
    </Banner>,
  );
  const textAt = html.indexOf('Update your card');
  const actionAt = html.indexOf('Update card<');
  const dismissAt = html.indexOf('aria-label="Dismiss"');
  assert.ok(textAt >= 0 && actionAt >= 0 && dismissAt >= 0, 'all three render');
  assert.ok(
    textAt < actionAt && actionAt < dismissAt,
    `expected text → action → dismiss, got ${textAt}/${actionAt}/${dismissAt}`,
  );
});

test('the action is centred and never squeezed', () => {
  // `self-center` against the row's `items-start`: the icon and the text hang
  // from the top because that is where their first line is, and a button has
  // no first line to hang from. `shrink-0` so a long message wraps instead of
  // crushing the control that answers it.
  const html = renderToStaticMarkup(<Banner action={<button type="button">Retry</button>}>Lost the server.</Banner>);
  assert.match(html, /<div class="shrink-0 self-center"><button type="button">Retry<\/button><\/div>/);
});

test('without the prop there is no slot at all', () => {
  // Not an empty div: the row is a flex with a `gap-3`, so a childless slot
  // would still add 12px of space to the right of every banner in the kit.
  const html = renderToStaticMarkup(<Banner tone="info" title="Heads up">A new version is available.</Banner>);
  assert.doesNotMatch(html, /shrink-0 self-center/);
});

test('the action is live — it is the caller\'s element, not a rendering of one', async () => {
  let retried = 0;
  const view = render(
    <Banner tone="warning" action={<button type="button" onClick={() => { retried += 1; }}>Retry</button>}>
      Sync stalled.
    </Banner>,
  );
  const button = [...view.container.querySelectorAll('button')].find(b => b.textContent === 'Retry')!;
  act(() => { button.click(); });
  assert.equal(retried, 1);
  await act(async () => { view.unmount(); });
});

test('a solid banner lends the action its own ink rather than restyling it', () => {
  // The solid variant carries `text-white` on the ROOT so title, body and the
  // dismiss control all inherit it. The action inherits the same way — the
  // slot adds no colour of its own, so a caller's `Button variant` survives.
  const html = renderToStaticMarkup(
    <Banner tone="danger" emphasis="solid" action={<button type="button">Retry</button>}>Offline.</Banner>,
  );
  assert.match(html, /bg-red-700 border-red-700 text-white/);
  assert.match(html, /<div class="shrink-0 self-center">/, 'the slot itself stays uncoloured');
});
