import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importHistoryReducer, describeImport, matchImportHotkey } from '../src/hooks/useImportHistory';
import type { ImportHistoryState, ImportStep, ImportHotkeyEvent } from '../src/hooks/useImportHistory';

type Row = { pn: string };
const rows = (...pns: string[]): Row[] => pns.map(pn => ({ pn }));
const step = (items: Row[], label = 'import'): ImportStep<Row> => ({ items, label });

const start: ImportHistoryState<Row> = { past: [], future: [] };
const commit = (s: ImportHistoryState<Row>, before: Row[], label?: string) =>
  importHistoryReducer(s, { type: 'commit', step: step(before, label) });
const undo = (s: ImportHistoryState<Row>, onScreen: Row[]) =>
  importHistoryReducer(s, { type: 'undo', redoStep: step(onScreen) });
const redo = (s: ImportHistoryState<Row>, onScreen: Row[]) =>
  importHistoryReducer(s, { type: 'redo', undoStep: step(onScreen) });

test('an import is one step, whatever it carried', () => {
  const s = commit(start, []);
  assert.equal(s.past.length, 1);
  // Five rows landing is one press to take back, not five.
  assert.deepEqual(s.past[0].items, []);
});

test('undo restores what stood before the import, redo puts it back', () => {
  const before = rows('WHL-19-GM');
  const after = rows('WHL-19-GM', 'WHL-20-SB', 'WHL-18-SL');

  const imported = commit(start, before);
  const undone = undo(imported, after);
  assert.deepEqual(undone.past, []);
  assert.deepEqual(undone.future[0].items, after);

  const redone = redo(undone, before);
  assert.deepEqual(redone.past[0].items, before);
  assert.deepEqual(redone.future, []);
});

test('redo restores the list as it stood, not as the import left it', () => {
  // Import, then hand-edit a row, then undo: redo must bring back the edited
  // list. Replaying the import's own output would silently drop the edit.
  const edited = rows('WHL-19-GM', 'EDITED-BY-HAND');
  const undone = undo(commit(start, []), edited);
  assert.deepEqual(undone.future[0].items, edited);
});

test('undo and redo at the ends of the stack do nothing', () => {
  assert.equal(undo(start, rows('a')), start);
  assert.equal(redo(start, rows('a')), start);
});

test('a fresh import drops the redo branch', () => {
  const undone = undo(commit(start, rows('a')), rows('a', 'b'));
  assert.equal(undone.future.length, 1);
  assert.deepEqual(commit(undone, rows('a')).future, []);
});

test('stacked imports undo newest first', () => {
  const first = rows('a');
  const second = rows('a', 'b');
  let s = commit(start, first, 'import of 1 line');
  s = commit(s, second, 'import of 3 lines');
  assert.equal(s.past[s.past.length - 1].label, 'import of 3 lines');

  s = undo(s, rows('a', 'b', 'c', 'd', 'e'));
  assert.equal(s.past[s.past.length - 1].label, 'import of 1 line');
});

test('the stack is bounded and drops the oldest step', () => {
  let s = start;
  for (let i = 0; i < 60; i++) s = commit(s, rows(`row-${i}`), `import ${i}`);
  assert.equal(s.past.length, 50);
  assert.equal(s.past[0].label, 'import 10');
});

const key = (over: Partial<ImportHotkeyEvent> = {}): ImportHotkeyEvent => ({
  key: 'z', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, target: null, ...over,
});

test('⌘Z / Ctrl+Z undoes, the shifted form and Ctrl+Y redo', () => {
  assert.equal(matchImportHotkey(key({ metaKey: true })), 'undo');
  assert.equal(matchImportHotkey(key({ ctrlKey: true })), 'undo');
  assert.equal(matchImportHotkey(key({ metaKey: true, shiftKey: true })), 'redo');
  assert.equal(matchImportHotkey(key({ ctrlKey: true, shiftKey: true })), 'redo');
  assert.equal(matchImportHotkey(key({ key: 'y', ctrlKey: true })), 'redo');
  // Uppercase arrives when Shift is down; the match is on the letter.
  assert.equal(matchImportHotkey(key({ key: 'Z', metaKey: true, shiftKey: true })), 'redo');
});

test('a bare or wrongly-modified Z is not the shortcut', () => {
  assert.equal(matchImportHotkey(key()), null);
  assert.equal(matchImportHotkey(key({ metaKey: true, altKey: true })), null);
  assert.equal(matchImportHotkey(key({ key: 'x', metaKey: true })), null);
  // ⌘Y is Mac "history", not redo — only Ctrl+Y is.
  assert.equal(matchImportHotkey(key({ key: 'y', metaKey: true })), null);
});

test('the caret in a field keeps its own undo', () => {
  // Inside a field ⌘Z means "take back what I typed" — the browser does that,
  // and swapping it for a six-row rollback would be a nasty surprise.
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(matchImportHotkey(key({ metaKey: true, target: { tagName } })), null, tagName);
  }
  // A grid cell is contenteditable, not an input.
  assert.equal(matchImportHotkey(key({ metaKey: true, target: { isContentEditable: true } })), null);
  // Anything else on the form is fair game.
  assert.equal(matchImportHotkey(key({ metaKey: true, target: { tagName: 'BUTTON' } })), 'undo');
  assert.equal(matchImportHotkey(key({ metaKey: true, target: { tagName: 'BODY' } })), 'undo');
});

test('describeImport counts what landed, and stays vague when nothing did', () => {
  assert.equal(describeImport([], rows('a')), 'import of 1 line');
  assert.equal(describeImport(rows('a'), rows('a', 'b', 'c')), 'import of 2 lines');
  // A merging import can land fewer rows than it carried, or replace them
  // outright — no count would match what the user sees.
  assert.equal(describeImport(rows('a', 'b'), rows('a')), 'import');
  assert.equal(describeImport(rows('a'), rows('b')), 'import');
});
