import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEventForModal } from '../src/shell/modalEventScope';

/**
 * The rule that decides whether a Cmd+S saves one window or all of them.
 *
 * The bug it replaces: `Modal` restricted the DISPATCH to the frontmost window
 * but sent an identity-free CustomEvent to `document`, and every consuming
 * form's hook subscribed unconditionally. With two forms open, one Cmd+S ran
 * both callbacks — a PATCH of the background record, or a whole new CREATE for
 * a form sitting in "new" mode. Each write raised its own success toast, so
 * nothing looked wrong; the user simply could not tell which window had written.
 *
 * Testing it here rather than through the hooks is deliberate. This package's
 * harness renders to static markup and cannot dispatch a keystroke, so a rule
 * left inside the effect would have shipped with no coverage at all.
 */

const SAVE_FROM = (modalId: string) => ({ modalId });

test('the window the keystroke was aimed at answers', () => {
  assert.equal(isEventForModal(SAVE_FROM('modal-aaa'), 'modal-aaa'), true);
});

test('a background window does not — this is the whole bug', () => {
  assert.equal(isEventForModal(SAVE_FROM('modal-aaa'), 'modal-bbb'), false);
});

test('an event with no id is answered, so a newer app on an older shell keeps Cmd+S', () => {
  // The dispatch half and the receiving half ship as two packages and land in
  // either order. Going silent here would turn a partial upgrade into "the
  // shortcut stopped working", which is worse than the bug being fixed.
  assert.equal(isEventForModal(undefined, 'modal-aaa'), true);
  assert.equal(isEventForModal(null, 'modal-aaa'), true);
  assert.equal(isEventForModal({}, 'modal-aaa'), true);
  assert.equal(isEventForModal({ modalId: '' }, 'modal-aaa'), true);
  assert.equal(isEventForModal({ modalId: 42 }, 'modal-aaa'), true);
});

test('a receiver outside any modal is answered, not silenced', () => {
  // `useEnclosingModalId` returns '' outside a <Modal>. Such a consumer has no
  // window to be foreign to, so it keeps the old behaviour.
  assert.equal(isEventForModal(SAVE_FROM('modal-aaa'), ''), true);
  assert.equal(isEventForModal(SAVE_FROM('modal-aaa'), null), true);
  assert.equal(isEventForModal(SAVE_FROM('modal-aaa'), undefined), true);
});

test('the match is exact, not a prefix', () => {
  // Modal ids are generated per mount; two of them sharing a prefix must not
  // be treated as the same window.
  assert.equal(isEventForModal(SAVE_FROM('modal-aa'), 'modal-aab'), false);
  assert.equal(isEventForModal(SAVE_FROM('modal-aab'), 'modal-aa'), false);
});
