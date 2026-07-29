import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendRecord,
  summariseLog,
  toCsv,
  isInteracting,
  MIN_GROUP_SAMPLES,
  type PerfLogRecord,
} from '../src/shell/perfLog';

/** A quiet, smooth sample. Tests vary only the axis under test. */
const rec = (over: Partial<PerfLogRecord> = {}): PerfLogRecord => ({
  t: 0,
  fps: 60,
  frameMs: 16.7,
  worstMs: 18,
  blockedPct: 0,
  heapMB: 100,
  verdict: 'smooth',
  windows: 0,
  active: null,
  clicks: 0,
  keys: 0,
  scrolls: 0,
  dragMs: 0,
  ...over,
});

/** n samples sharing a shape, stamped with increasing time. */
const many = (n: number, over: Partial<PerfLogRecord> = {}): PerfLogRecord[] =>
  Array.from({ length: n }, (_, i) => rec({ t: i * 500, ...over }));

test('appending past the cap drops the oldest and keeps the newest', () => {
  let log: PerfLogRecord[] = [];
  for (let i = 0; i < 10; i++) log = appendRecord(log, rec({ t: i }), 4);
  assert.equal(log.length, 4);
  assert.deepEqual(log.map(r => r.t), [6, 7, 8, 9]);
});

test('appending never mutates the array it was given', () => {
  // The caller holds this across renders; mutating in place would let a stale
  // reference silently diverge from what was logged.
  const original = [rec({ t: 1 })];
  const next = appendRecord(original, rec({ t: 2 }));
  assert.equal(original.length, 1);
  assert.equal(next.length, 2);
});

test('any input at all counts as interacting', () => {
  assert.equal(isInteracting(rec()), false);
  for (const axis of ['clicks', 'keys', 'scrolls', 'dragMs'] as const) {
    assert.equal(isInteracting(rec({ [axis]: 1 })), true, axis);
  }
});

test('an empty log summarises to zeroes rather than throwing', () => {
  const summary = summariseLog([]);
  assert.equal(summary.samples, 0);
  assert.equal(summary.medianFps, 0);
  assert.deepEqual(summary.byWindowCount, []);
  assert.deepEqual(summary.worstWindows, []);
  assert.equal(summary.interacting, null);
});

test('the idle/interacting split is the headline comparison', () => {
  const summary = summariseLog([
    ...many(MIN_GROUP_SAMPLES, { fps: 60 }),
    ...many(MIN_GROUP_SAMPLES, { fps: 20, clicks: 3 }),
  ]);
  assert.equal(summary.idle?.medianFps, 60);
  assert.equal(summary.interacting?.medianFps, 20);
});

test('a group below the sample floor is withheld, not reported thinly', () => {
  // One unlucky reading is not a finding. Reporting it would send someone off
  // to optimise a window on the strength of a single frame.
  const summary = summariseLog([
    ...many(MIN_GROUP_SAMPLES, { fps: 60 }),
    ...many(MIN_GROUP_SAMPLES - 1, { fps: 5, clicks: 1 }),
  ]);
  assert.equal(summary.interacting, null);
  assert.notEqual(summary.idle, null);
});

test('frame rate is bucketed by window count, ascending', () => {
  const summary = summariseLog([
    ...many(MIN_GROUP_SAMPLES, { windows: 1, fps: 60 }),
    ...many(MIN_GROUP_SAMPLES, { windows: 6, fps: 24 }),
  ]);
  assert.deepEqual(
    summary.byWindowCount.map(b => [b.windows, b.medianFps]),
    [[1, 60], [6, 24]],
  );
});

test('the slowest window names itself, worst first', () => {
  const summary = summariseLog([
    ...many(MIN_GROUP_SAMPLES, { active: 'page:dashboard', fps: 58 }),
    ...many(MIN_GROUP_SAMPLES, { active: 'page:sales-invoice', fps: 18 }),
  ]);
  assert.equal(summary.worstWindows[0].key, 'page:sales-invoice');
  assert.equal(summary.worstWindows[0].medianFps, 18);
});

test('a stalled sample counts as CPU-bound but never lands in a frame-rate median', () => {
  // fps 0 means the thread was too blocked to deliver frames. Averaging that
  // in would report a frame rate the display never actually showed, so it
  // shapes verdictShare and nothing else.
  const summary = summariseLog([
    ...many(MIN_GROUP_SAMPLES, { fps: 30 }),
    ...many(MIN_GROUP_SAMPLES, { fps: 0, verdict: 'cpu', blockedPct: 100 }),
  ]);
  assert.equal(summary.medianFps, 30);
  assert.equal(summary.verdictShare.cpu, 0.5);
  assert.equal(summary.verdictShare.smooth, 0.5);
});

test('the worst frame survives even when its own sample is unmeasurable', () => {
  const summary = summariseLog([rec({ worstMs: 20 }), rec({ fps: 0, worstMs: 480 })]);
  assert.equal(summary.worstFrameMs, 480);
});

test('median takes the middle, not the mean an outlier would drag', () => {
  const summary = summariseLog(
    [10, 60, 60, 60, 1000].map((fps, i) => rec({ fps, t: i * 500 })),
  );
  assert.equal(summary.medianFps, 60);
});

test('CSV escapes a window key containing a comma or a quote', () => {
  // Window keys are app-supplied text; an unescaped one silently shifts every
  // later column and quietly corrupts the export.
  const csv = toCsv([rec({ active: 'page:invoice, draft' }), rec({ active: 'say "hi"' })]);
  const [header, ...rows] = csv.split('\n');
  assert.match(header, /^t,fps,/);
  assert.match(rows[0], /"page:invoice, draft"/);
  assert.match(rows[1], /"say ""hi"""/);
});

test('a null column exports as empty, not as the string "null"', () => {
  const csv = toCsv([rec({ blockedPct: null, heapMB: null, active: null })]);
  assert.doesNotMatch(csv, /null/);
});
