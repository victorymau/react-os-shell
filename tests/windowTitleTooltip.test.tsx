/**
 * The window title bar truncates a long title with CSS and offers no way to
 * read the rest of it. Card 66029 adds the missing affordance: a native
 * tooltip on the title element, carrying the title's plain text.
 *
 * These specs assert on the rendered attribute rather than on the extractor,
 * because the extractor is private and the attribute is the thing the user
 * hovers. `Modal` portals into `document.body`, so the queries go through the
 * document, not the render container.
 *
 * Five of the six fail on 4.10.0. The sixth — no plain text, no tooltip —
 * passes there vacuously, and is here to keep the attribute from arriving
 * empty or as "[object Object]" later.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { act, render } from './dom';
import Modal from '../src/shell/Modal';

function titleEl() {
  return document.querySelector('[data-window-title]');
}

const LONG = 'Campaign editor - Panthera Blackout Sale: Blade | Walkin | Tri-spoke | Gen-2';

test('a long string title is readable in full from the title attribute', async () => {
  const view = render(<Modal open onClose={() => {}} title={LONG}>body</Modal>);
  assert.equal(titleEl()?.getAttribute('title'), LONG);
  await act(async () => { view.unmount(); });
});

test('a ReactNode title contributes its text, not "[object Object]"', async () => {
  const view = render(
    <Modal open onClose={() => {}} title={<span>Campaign editor <b>Blackout Sale</b></span>}>body</Modal>,
  );
  const tip = titleEl()?.getAttribute('title');
  assert.equal(tip, 'Campaign editor Blackout Sale');
  assert.ok(!tip?.includes('[object'));
  await act(async () => { view.unmount(); });
});

test('a title with no plain text gets no tooltip at all', async () => {
  const view = render(
    <Modal open onClose={() => {}} title={<svg viewBox="0 0 1 1" />}>body</Modal>,
  );
  assert.equal(titleEl()?.hasAttribute('title'), false);
  await act(async () => { view.unmount(); });
});

test('a short title is unaffected — same text, still exact', async () => {
  const view = render(<Modal open onClose={() => {}} title="Settings">body</Modal>);
  assert.equal(titleEl()?.getAttribute('title'), 'Settings');
  await act(async () => { view.unmount(); });
});

test('the compact title bar carries the tooltip too', async () => {
  const view = render(<Modal open compact onClose={() => {}} title={LONG}>body</Modal>);
  assert.equal(titleEl()?.getAttribute('title'), LONG);
  await act(async () => { view.unmount(); });
});

test('the app-style title bar carries the tooltip too', async () => {
  const view = render(<Modal open appStyle onClose={() => {}} title={LONG}>body</Modal>);
  assert.equal(titleEl()?.getAttribute('title'), LONG);
  await act(async () => { view.unmount(); });
});
