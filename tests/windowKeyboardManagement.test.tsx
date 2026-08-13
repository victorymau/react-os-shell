/**
 * Window snapping, moving and resizing were pointer-only: the title bar is the
 * drag handle, and a drag handle with no keyboard path leaves the window
 * itself unreachable (WCAG 2.1.1 — the same reasoning that put clickable
 * table rows into the tab order in 4.53.0).
 *
 * The title bar is now a tab stop. Plain arrows move the window, Shift+arrows
 * resize it, Ctrl/Cmd+arrows snap it, Enter mirrors the maximize button.
 *
 * `Modal` portals into `document.body`, so queries go through the document.
 * The panel is the title bar's parent — the element carrying the inline
 * left/top/width/height the window system positions with.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { act, render, pressKey } from './dom';
import Modal from '../src/shell/Modal';

function chrome() {
  return document.querySelector<HTMLElement>('[data-window-chrome]')!;
}
function panel() {
  return chrome().parentElement as HTMLElement;
}
const px = (v: string) => parseFloat(v || '0');

test('the title bar is a tab stop that names its keys', async () => {
  const view = render(<Modal open onClose={() => {}} title="Orders">body</Modal>);
  assert.equal(chrome().tabIndex, 0);
  assert.ok(chrome().getAttribute('aria-keyshortcuts')?.includes('ArrowRight'));
  assert.equal(chrome().getAttribute('aria-label'), 'Orders — window');
  await act(async () => { view.unmount(); });
});

test('plain arrows move the window by a step', async () => {
  const view = render(<Modal open onClose={() => {}} title="Orders">body</Modal>);
  const x0 = px(panel().style.left);
  const y0 = px(panel().style.top);
  pressKey('ArrowRight', { target: chrome() });
  pressKey('ArrowDown', { target: chrome() });
  assert.equal(px(panel().style.left), x0 + 24);
  assert.equal(px(panel().style.top), y0 + 24);
  pressKey('ArrowLeft', { target: chrome() });
  assert.equal(px(panel().style.left), x0);
  await act(async () => { view.unmount(); });
});

test('shift+arrows resize, and never below the pointer minimum', async () => {
  const view = render(<Modal open onClose={() => {}} title="Orders">body</Modal>);
  const w0 = px(panel().style.width);
  pressKey('ArrowRight', { shift: true, target: chrome() });
  assert.equal(px(panel().style.width), w0 + 24);
  // Shrink far past the minimum — it must stop at 384, the same floor the
  // pointer resize enforces.
  for (let i = 0; i < 60; i++) pressKey('ArrowLeft', { shift: true, target: chrome() });
  assert.equal(px(panel().style.width), 384);
  await act(async () => { view.unmount(); });
});

test('ctrl+left snaps to the left half, ctrl+down restores the pre-snap box', async () => {
  const view = render(<Modal open onClose={() => {}} title="Orders">body</Modal>);
  const w0 = px(panel().style.width);
  pressKey('ArrowLeft', { ctrl: true, target: chrome() });
  assert.equal(px(panel().style.left), 0);
  assert.equal(px(panel().style.width), Math.floor(window.innerWidth / 2));
  pressKey('ArrowDown', { ctrl: true, target: chrome() });
  assert.equal(px(panel().style.width), w0);
  await act(async () => { view.unmount(); });
});

test('ctrl+up maximizes and Enter toggles back to windowed', async () => {
  const view = render(<Modal open onClose={() => {}} title="Orders">body</Modal>);
  pressKey('ArrowUp', { ctrl: true, target: chrome() });
  assert.ok(document.querySelector('button[title="Windowed"]'), 'window should be maximized');
  pressKey('Enter', { target: chrome() });
  assert.ok(document.querySelector('button[title="Maximize"]'), 'window should be windowed again');
  await act(async () => { view.unmount(); });
});

test('keys pressed on the bar’s own controls stay theirs', async () => {
  const view = render(<Modal open onClose={() => {}} title="Orders">body</Modal>);
  const x0 = px(panel().style.left);
  const minimize = document.querySelector<HTMLElement>('button[title="Minimize"]')!;
  pressKey('ArrowRight', { target: minimize });
  assert.equal(px(panel().style.left), x0);
  await act(async () => { view.unmount(); });
});
