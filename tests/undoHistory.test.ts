import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  undoReducer,
  emptyUndoState,
  matchUndoHotkey,
  UNDO_LIMIT,
} from '../src/hooks/undoHistory';
import type { UndoState, UndoStep, UndoSnapshot, UndoHotkeyEvent } from '../src/hooks/undoHistory';

const step = (values: UndoSnapshot, label = 'edit', coalesceKey: string | null = null): UndoStep =>
  ({ values, label, coalesceKey });

const record = (s: UndoState, st: UndoStep) => undoReducer(s, { type: 'record', step: st });
const undo = (s: UndoState, onScreen: UndoSnapshot) =>
  undoReducer(s, { type: 'undo', redoStep: step(onScreen) });
const redo = (s: UndoState, onScreen: UndoSnapshot) =>
  undoReducer(s, { type: 'redo', undoStep: step(onScreen) });

test('a step snapshots the whole form, not just the slice that moved', () => {
  // qty changed; the supplier field and the line items ride along, so undoing
  // restores a coherent form rather than one slice out of step.
  const before = { supplier: 'Acme', qty: '6', items: ['a'] };
  const s = record(emptyUndoState, step(before, 'qty'));
  assert.deepEqual(s.past[0].values, before);
});

test('undo restores the form as it was, redo puts back what was on screen', () => {
  const before = { qty: '6' };
  const after = { qty: '12' };

  const edited = record(emptyUndoState, step(before, 'qty'));
  const undone = undo(edited, after);
  assert.deepEqual(undone.past, []);
  assert.deepEqual(undone.future[0].values, after);

  const redone = redo(undone, before);
  assert.deepEqual(redone.past[0].values, before);
  assert.deepEqual(redone.future, []);
});

test('a run of typing in one field is a single step', () => {
  // Each keystroke records, but they share the field's key, so the step that
  // holds the value from before the run is the one that survives.
  let s = record(emptyUndoState, step({ qty: '' }, 'qty', 'qty'));
  s = record(s, step({ qty: '1' }, 'qty', 'qty'));
  s = record(s, step({ qty: '12' }, 'qty', 'qty'));
  assert.equal(s.past.length, 1);
  assert.deepEqual(s.past[0].values, { qty: '' });
});

test('moving to another field ends the run', () => {
  let s = record(emptyUndoState, step({ qty: '' }, 'qty', 'qty'));
  s = record(s, step({ qty: '12' }, 'price', 'price'));
  assert.equal(s.past.length, 2);
});

test('a whole change never folds, even twice in a row', () => {
  // Two bulk imports back to back are two steps: neither carries a key.
  let s = record(emptyUndoState, step({ items: [] }, 'import of 5 lines'));
  s = record(s, step({ items: ['a'] }, 'import of 3 lines'));
  assert.equal(s.past.length, 2);
});

test('coalescing still drops the redo branch', () => {
  // Typing after an undo is a new branch — the redone future must not survive
  // just because the keystroke folded into an existing step.
  const undone = undo(record(emptyUndoState, step({ qty: '' }, 'qty', 'qty')), { qty: '12' });
  assert.equal(undone.future.length, 1);
  const typed = record(undone, step({ qty: '' }, 'qty', 'qty'));
  assert.equal(typed.future.length, 0);
});

test('undo and redo at the ends of the stack change nothing', () => {
  assert.equal(undo(emptyUndoState, {}), emptyUndoState);
  assert.equal(redo(emptyUndoState, {}), emptyUndoState);
});

test('a save clears the history', () => {
  // Past that point "earlier" is on the server, and a form cannot take it back.
  const s = record(emptyUndoState, step({ qty: '6' }));
  const cleared = undoReducer(s, { type: 'clear' });
  assert.deepEqual(cleared, emptyUndoState);
  // Already empty — same object back, so a save does not re-render the form.
  assert.equal(undoReducer(emptyUndoState, { type: 'clear' }), emptyUndoState);
});

test('the stack is bounded and drops the oldest step', () => {
  let s = emptyUndoState;
  for (let i = 0; i < UNDO_LIMIT + 10; i++) s = record(s, step({ n: i }, `edit ${i}`));
  assert.equal(s.past.length, UNDO_LIMIT);
  assert.equal(s.past[0].label, 'edit 10');
});

const key = (over: Partial<UndoHotkeyEvent> = {}): UndoHotkeyEvent => ({
  key: 'z', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, target: null, ...over,
});

test('⌘Z / Ctrl+Z undoes, the shifted form and Ctrl+Y redo', () => {
  assert.equal(matchUndoHotkey(key({ metaKey: true })), 'undo');
  assert.equal(matchUndoHotkey(key({ ctrlKey: true })), 'undo');
  assert.equal(matchUndoHotkey(key({ metaKey: true, shiftKey: true })), 'redo');
  assert.equal(matchUndoHotkey(key({ key: 'y', ctrlKey: true })), 'redo');
  // Uppercase arrives when Shift is down; the match is on the letter.
  assert.equal(matchUndoHotkey(key({ key: 'Z', metaKey: true, shiftKey: true })), 'redo');
});

test('a bare or wrongly-modified Z is not the shortcut', () => {
  assert.equal(matchUndoHotkey(key()), null);
  assert.equal(matchUndoHotkey(key({ metaKey: true, altKey: true })), null);
  assert.equal(matchUndoHotkey(key({ key: 'x', metaKey: true })), null);
  // ⌘Y is Mac "history", not redo — only Ctrl+Y is.
  assert.equal(matchUndoHotkey(key({ key: 'y', metaKey: true })), null);
});

test('the caret in a field keeps its own undo', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(matchUndoHotkey(key({ metaKey: true, target: { tagName } })), null, tagName);
  }
  // A grid cell is contenteditable, not an input.
  assert.equal(matchUndoHotkey(key({ metaKey: true, target: { isContentEditable: true } })), null);
  // Anything else in the form is fair game.
  assert.equal(matchUndoHotkey(key({ metaKey: true, target: { tagName: 'BUTTON' } })), 'undo');
});
