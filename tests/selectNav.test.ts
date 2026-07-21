import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  firstEnabledIndex,
  lastEnabledIndex,
  matchTypeahead,
  nextEnabledIndex,
} from '../src/forms/selectNav';

/**
 * The custom-listbox <Select>'s keyboard behaviour is driven by these pure
 * helpers (the component just wires key events to them and paints the active
 * option). The repo's test runner renders to static markup with no DOM, so it
 * cannot dispatch a keydown — but the *decisions* a keydown makes (which option
 * ArrowDown/Up, Home/End, and typeahead land on, and that disabled options are
 * skipped and the ends do not wrap) are all here and fully testable.
 */

const OPTS = [
  { label: 'Apple', value: 'a' },
  { label: 'Banana', value: 'b' },
  { label: 'Cherry', value: 'c' },
];

test('firstEnabledIndex / lastEnabledIndex skip disabled ends', () => {
  const opts = [
    { label: 'X', value: 'x', disabled: true },
    { label: 'Y', value: 'y' },
    { label: 'Z', value: 'z', disabled: true },
  ];
  assert.equal(firstEnabledIndex(opts), 1);
  assert.equal(lastEnabledIndex(opts), 1);
  assert.equal(firstEnabledIndex([]), -1, 'empty list has no selectable option');
  assert.equal(lastEnabledIndex([{ label: 'D', value: 'd', disabled: true }]), -1);
});

test('ArrowDown/ArrowUp step one option and clamp at the ends (no wrap)', () => {
  assert.equal(nextEnabledIndex(OPTS, 0, 1), 1);
  assert.equal(nextEnabledIndex(OPTS, 1, 1), 2);
  assert.equal(nextEnabledIndex(OPTS, 2, 1), 2, 'ArrowDown at the bottom stays put');
  assert.equal(nextEnabledIndex(OPTS, 2, -1), 1);
  assert.equal(nextEnabledIndex(OPTS, 0, -1), 0, 'ArrowUp at the top stays put');
});

test('nothing active yet: ArrowDown lands on first, ArrowUp on last', () => {
  assert.equal(nextEnabledIndex(OPTS, -1, 1), 0);
  assert.equal(nextEnabledIndex(OPTS, -1, -1), 2);
});

test('arrow navigation skips disabled options', () => {
  const opts = [
    { label: 'A', value: 'a' },
    { label: 'B', value: 'b', disabled: true },
    { label: 'C', value: 'c' },
  ];
  assert.equal(nextEnabledIndex(opts, 0, 1), 2, 'jumps over the disabled middle');
  assert.equal(nextEnabledIndex(opts, 2, -1), 0);
});

test('typeahead matches by label prefix, wraps, and is case-insensitive', () => {
  assert.equal(matchTypeahead(OPTS, 'b', -1), 1);
  assert.equal(matchTypeahead(OPTS, 'CH', -1), 2, 'case-insensitive prefix');
  // From the last option, the next 'a' match wraps back to the top.
  assert.equal(matchTypeahead(OPTS, 'a', 2), 0);
  assert.equal(matchTypeahead(OPTS, 'z', -1), -1, 'no match returns -1');
  assert.equal(matchTypeahead(OPTS, '', 0), -1, 'empty buffer never matches');
});

test('typeahead skips disabled matches', () => {
  const opts = [
    { label: 'Ann', value: '1', disabled: true },
    { label: 'Andrew', value: '2' },
  ];
  assert.equal(matchTypeahead(opts, 'an', -1), 1, 'lands on the enabled Andrew, not disabled Ann');
});
