import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify,
  summariseFrames,
  SMOOTH_FPS,
  BLOCKED_PCT_CPU,
  type PerfReading,
} from '../src/shell/perfVerdict';

/** A reading with everything healthy, so each test can vary one axis. */
const reading = (over: Partial<PerfReading> = {}): PerfReading => ({
  fps: 60,
  frameMs: 16.7,
  worstMs: 18,
  blockedPct: 0,
  ...over,
});

test('evenly spaced frames report the obvious rate', () => {
  // 3 intervals across 30ms — 100fps, 10ms a frame, nothing anomalous.
  const { fps, frameMs, worstMs } = summariseFrames([0, 10, 20, 30]);
  assert.equal(fps, 100);
  assert.equal(frameMs, 10);
  assert.equal(worstMs, 10);
});

test('worst frame reports the spike, not the average that hides it', () => {
  // The mean here is a comfortable-looking 100ms, but one frame took 190ms.
  // The spike is the whole reason someone opened the HUD, so it gets its own
  // number rather than being averaged into invisibility.
  const { frameMs, worstMs } = summariseFrames([0, 10, 200]);
  assert.equal(frameMs, 100);
  assert.equal(worstMs, 190);
});

test('too few timestamps is no reading, not zero fps', () => {
  // One timestamp describes no interval. Reporting 0 fps would render as a
  // hard red "0" and read as a frozen UI — the opposite of the truth.
  for (const frames of [[], [42]]) {
    assert.deepEqual(summariseFrames(frames), { fps: 0, frameMs: 0, worstMs: 0 });
  }
});

test('a zero-length span never divides by zero', () => {
  // Timestamps that collapse to one instant would make fps Infinity.
  const { fps, frameMs } = summariseFrames([5, 5, 5]);
  assert.equal(fps, 0);
  assert.equal(frameMs, 0);
});

test('a healthy frame rate is smooth', () => {
  assert.equal(classify(reading({ fps: 60 })).kind, 'smooth');
  // Boundary is inclusive — exactly SMOOTH_FPS is not a complaint.
  assert.equal(classify(reading({ fps: SMOOTH_FPS })).kind, 'smooth');
});

test('late frames + an idle main thread is the GPU', () => {
  // The signature of compositing cost: JS has nothing to do, yet frames still
  // miss. This is the case the shell's 40px backdrop blur produces.
  const verdict = classify(reading({ fps: 24, blockedPct: 2 }));
  assert.equal(verdict.kind, 'gpu');
  // The verdict has to name the fix, or the reading is just a number.
  assert.match(verdict.detail, /Reduce transparency/);
});

test('late frames + a blocked main thread is JS, not the GPU', () => {
  const verdict = classify(reading({ fps: 24, blockedPct: BLOCKED_PCT_CPU }));
  assert.equal(verdict.kind, 'cpu');
  // Must not send someone to a rendering setting that cannot help them.
  assert.doesNotMatch(verdict.detail, /Reduce transparency/);
});

test('without long-task timing, jank is unattributed — never blamed on the GPU', () => {
  // Safari exposes no `longtask` observer. Every dropped frame there looks
  // exactly like the GPU case (low fps, no evidence of a busy thread), so the
  // null has to short-circuit ahead of the GPU branch. Getting this wrong
  // would tell every Safari user to turn off transparency for a problem that
  // might be entirely in JavaScript.
  const verdict = classify(reading({ fps: 20, blockedPct: null }));
  assert.equal(verdict.kind, 'unknown');
  assert.doesNotMatch(verdict.detail, /Reduce transparency/);
});

test('a healthy rate needs no attribution, even with no long-task timing', () => {
  // Smooth is decided before the null check: there is no bottleneck to
  // attribute, so missing evidence does not downgrade the answer.
  assert.equal(classify(reading({ fps: 60, blockedPct: null })).kind, 'smooth');
});

test('a rate that is not yet a number reads as measuring', () => {
  for (const fps of [0, NaN, Infinity, -1]) {
    const verdict = classify(reading({ fps }));
    assert.equal(verdict.kind, 'unknown', `fps=${fps}`);
    assert.match(verdict.label, /Measuring/);
  }
});

test('a thread too blocked to deliver frames is CPU-bound, not "measuring"', () => {
  // Caught by driving a real browser: block the main thread hard and rAF stops
  // firing altogether, so the frame window empties and fps reads as nothing.
  // Treating that as "no data yet" made the HUD go blank under the single
  // worst condition it exists to diagnose. A starved thread is *why* the
  // frames stopped, so the block share decides it even with no frame rate.
  for (const fps of [0, NaN]) {
    const verdict = classify(reading({ fps, blockedPct: 100 }));
    assert.equal(verdict.kind, 'cpu', `fps=${fps}`);
  }
  // Still only when there is evidence: no frames and a quiet thread really is
  // just a HUD that has not collected a window yet.
  assert.equal(classify(reading({ fps: 0, blockedPct: 0 })).kind, 'unknown');
  // …and with no long-task support there is no evidence either way.
  assert.equal(classify(reading({ fps: 0, blockedPct: null })).kind, 'unknown');
});
