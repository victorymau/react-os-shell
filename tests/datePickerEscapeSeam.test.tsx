import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, act, pressKey } from './dom';
import DatePicker from '../src/forms/DatePicker';
import Dialog from '../src/shell/Dialog';
import { runEscapeInterceptors } from '../src/shell/escapeInterceptors';

/**
 * The calendar's Escape has to go through the shell's interceptor seam.
 *
 * A listener of the component's own cannot win: `Modal` listens on `window` in
 * the CAPTURE phase, and capture runs window BEFORE document — so Modal took
 * the key first, closed the whole window, and stopped propagation. Someone
 * with a form open in a window who pressed Escape to dismiss the calendar lost
 * the window and their unsaved edits.
 *
 * `Select` and `FilterBar` were always on the seam; `Tooltip` moved to it in
 * 4.30.1 and `DropdownMenu` in 4.54.0. This is the fourth component to need
 * the same rule, which is why it is asserted rather than assumed.
 */

const openPanel = (view: { container: HTMLElement }) => {
  const trigger = view.container.querySelector('button')!;
  act(() => { trigger.click(); });
  return trigger;
};

/**
 * The calendar panel, addressed by its own accessible name.
 *
 * It is portalled to `<body>` and is a `role="dialog"` — and so is the `Dialog`
 * one of these specs wraps it in, so a bare `[role="dialog"]` would match the
 * wrapper and report the calendar as still open after it had closed.
 */
const panel = () => document.querySelector('[role="dialog"][aria-label="Ship date"]');

test('DatePicker: an open calendar consumes Escape at the seam', () => {
  // Asserting the seam, not just "it closed": a component that closes from its
  // own document listener passes a close test and still loses inside a window.
  const view = render(<DatePicker value="2026-08-11" onChange={() => {}} aria-label="Ship date" />);
  try {
    openPanel(view);
    assert.ok(panel(), 'the calendar opens');

    const win = view.container.ownerDocument.defaultView as Window & typeof globalThis;
    const escape = new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    let consumed = false;
    act(() => { consumed = runEscapeInterceptors(escape); });

    assert.equal(consumed, true, 'an open calendar must consume Escape at the seam');
    assert.equal(panel(), null, 'and close');
  } finally {
    view.unmount();
  }
});

test('DatePicker: Escape closes the calendar and NOT the window around it', () => {
  // A Dialog registers on the same seam and the walk is most-recent-first, so
  // the calendar — registered later, when it opened — takes the first Escape.
  let closed = 0;
  const view = render(
    <Dialog open onClose={() => { closed += 1; }} title="Edit shipment">
      <DatePicker value="2026-08-11" onChange={() => {}} aria-label="Ship date" />
    </Dialog>,
  );
  try {
    openPanel(view);
    assert.ok(panel(), 'the calendar opens');

    pressKey('Escape');
    assert.equal(panel(), null, 'the calendar goes');
    assert.equal(closed, 0, 'and the dialog stays — it is not what was dismissed');

    pressKey('Escape');
    assert.equal(closed, 1, 'the second Escape is the dialog’s');
  } finally {
    view.unmount();
  }
});

test('DatePicker: a closed calendar holds no interceptor', () => {
  // Registration is scoped to `open`, so a form full of date fields is not a
  // form full of Escape handlers competing with the window.
  let closed = 0;
  const view = render(
    <Dialog open onClose={() => { closed += 1; }} title="Edit shipment">
      <DatePicker value="2026-08-11" onChange={() => {}} aria-label="Ship date" />
    </Dialog>,
  );
  pressKey('Escape');
  assert.equal(closed, 1, 'nothing open, so the dialog takes it');
  view.unmount();
});
