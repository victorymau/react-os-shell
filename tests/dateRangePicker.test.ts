import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toISODate } from '../src/forms/DateRangePicker';

/**
 * The date-range filter must send the day the operator clicked.
 *
 * `DateRangePicker` builds every Date at LOCAL midnight — calendar cells
 * (`new Date(year, month, d)`), the preset boundaries, `new Date()` — so
 * serialising them with `toISOString().split('T')[0]` is wrong: local midnight
 * always falls in the *previous* UTC day for any positive UTC offset. That bug
 * shipped in the admin portal and shifted the whole picker back one day for
 * every user east of Greenwich, on every list page that mounts it.
 *
 * TZ is set to a positive-offset zone for this file — these assertions are only
 * meaningful outside UTC, and CI runs UTC, where the broken code looked
 * correct. It is set before any Date is constructed; Node re-reads TZ on
 * assignment.
 */
process.env.TZ = 'Asia/Singapore';

/** What the broken version did. Kept as the contrast case. */
const viaUTC = (d: Date) => d.toISOString().split('T')[0];

test('toISODate serialises the local calendar day, not the UTC one', () => {
  // The regression in one line: clicking cell "15" of July 2026.
  const cell = new Date(2026, 6, 15);
  assert.equal(toISODate(cell), '2026-07-15');
  assert.equal(viaUTC(cell), '2026-07-14'); // what shipped before
});

test('toISODate keeps the last day of a "Last Month" preset', () => {
  // `new Date(y, m, 0)` — the month-end boundary every preset but
  // "Last 2 Weeks" uses. Through UTC this became the 29th.
  assert.equal(toISODate(new Date(2026, 6, 0)), '2026-06-30');
  assert.equal(toISODate(new Date(2026, 0, 1)), '2026-01-01');
});

test('toISODate zero-pads single-digit months and days', () => {
  assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(toISODate(new Date(2026, 8, 9)), '2026-09-09');
});

test('toISODate round-trips with the component\'s parseDate contract', () => {
  // parseDate does `new Date(y, m - 1, d)` — local midnight. Serialising it
  // back must be the identity, which is exactly what UTC broke.
  for (const iso of ['2026-01-01', '2026-07-15', '2026-12-31', '2026-02-28']) {
    const [y, m, d] = iso.split('-').map(Number);
    assert.equal(toISODate(new Date(y, m - 1, d)), iso);
  }
});

test('toISODate handles a year boundary without rolling over', () => {
  assert.equal(toISODate(new Date(2026, 11, 31)), '2026-12-31');
  assert.equal(viaUTC(new Date(2026, 11, 31)), '2026-12-30');
});
