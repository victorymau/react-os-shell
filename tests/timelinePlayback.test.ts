/**
 * `timelinePlayback` — the schedule the thumb follows while Play is pressed.
 *
 * Pure arithmetic over an axis, and specified here rather than through the card
 * for the reason the rest of the geometry is: a claim about how long 140 px of
 * rail takes is a claim about a number, and asserting it through a rendered
 * component asserts the component's markup and the machine's frame rate as well.
 *
 * The distinction under test throughout is px versus ms. The thumb is paced by
 * the DISTANCE it covers, not by the days it crosses, which is the only pacing
 * that survives a compressed axis — where one 48 px notch can hold 290 days.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First — installs the DOM globals before anything that reads them evaluates.
import './dom';
import { compressTimeAxis } from '../src/shell/timelineGeometry';
import {
  playbackSegments, positionAt, PLAYBACK_DWELL_MS, type PlaybackNode,
} from '../src/shell/timelinePlayback';
import { DAY_MS, toDayMs } from '../src/shell/timelineDates';

const day = (iso: string) => toDayMs(iso)!;

/** The axis the production scrubber draws on: linear, nothing cut, no floor —
 *  a week between two reports is not an idle stretch to hide. */
const linearAxis = (anchors: number[], trackPx: number) =>
  compressTimeAxis(anchors, trackPx, { maxTimeShare: Infinity, minGapPx: 0 });

/** The axis the mould card draws on: a stretch holding over 30% of the window's
 *  time is cut down to a 48 px notch. */
const compressedAxis = (anchors: number[], trackPx: number) =>
  compressTimeAxis(anchors, trackPx, {});

/**
 * Four reports on a 35-day window, 700 px wide — so exactly 20 px a day, and
 * every duration below can be read off the calendar.
 *
 *   r1 01/05 ── 140px ── r2 08/05 ─ 20px ─ r3 09/05 ──── 540px ──── r4 05/06
 */
const WINDOW = [day('2026-05-01'), day('2026-06-05')];
const NODES: PlaybackNode[] = [
  { key: 'r1', ms: day('2026-05-01') },
  { key: 'r2', ms: day('2026-05-08') },
  { key: 'r3', ms: day('2026-05-09') },
  { key: 'r4', ms: day('2026-06-05') },
];
const REPORT_AXIS = linearAxis([WINDOW[0], ...NODES.map((n) => n.ms), WINDOW[1]], 700);

test('a glide is paced by the pixels it covers, at 350ms per 100px', () => {
  const segments = playbackSegments(REPORT_AXIS, NODES);
  assert.deepEqual(segments.map((s) => [s.fromKey, s.toKey]), [['r1', 'r2'], ['r2', 'r3'], ['r3', 'r4']]);
  assert.deepEqual(segments.map((s) => Math.round(s.lengthPx)), [140, 20, 540]);
  // 140px × 3.5 = 490ms, and nothing clamps it.
  assert.equal(Math.round(segments[0].durationMs), 490);
  // Every stop is rested on for the same length of time, whatever the distance
  // to the next one: the dwell is reading time, not travel.
  assert.deepEqual(segments.map((s) => s.dwellMs), segments.map(() => PLAYBACK_DWELL_MS));
});

test('the clamps hold: a step is never a flicker, a haul is never a wait', () => {
  const segments = playbackSegments(REPORT_AXIS, NODES);
  // 20px of rail is 70ms of travel at the rate — one or two frames, which reads
  // as the thumb having jumped rather than moved.
  assert.equal(segments[1].durationMs, 450, 'the floor caught the one-day step');
  // 540px is 1,890ms, and a single stretch outlasting a second and a half is a
  // reader waiting for a bar rather than watching a build.
  assert.equal(segments[2].durationMs, 1400, 'the ceiling caught the 27-day haul');
});

test('speed divides the travel and the rest alike, and nonsense reads as 1', () => {
  const fast = playbackSegments(REPORT_AXIS, NODES, { speed: 2 });
  assert.equal(Math.round(fast[0].durationMs), 245);
  assert.equal(fast[0].dwellMs, PLAYBACK_DWELL_MS / 2);
  // The clamps are on the DISTANCE-derived duration, so speed scales the clamped
  // value: halving 450 is a real 225ms glide, not a floor violation.
  assert.equal(fast[1].durationMs, 225);
  for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const same = playbackSegments(REPORT_AXIS, NODES, { speed });
    assert.equal(same[0].durationMs, playbackSegments(REPORT_AXIS, NODES)[0].durationMs, `speed ${speed}`);
  }
});

test('positionAt eases in and out of every stop, and lands exactly on it', () => {
  const [first] = playbackSegments(REPORT_AXIS, NODES);
  assert.deepEqual(positionAt(first, 0), { px: first.fromPx, ms: first.fromMs });
  // Exactly, not nearly: a float rounding at the end of the glide would put the
  // chip on the day before the report the thumb has just arrived at.
  assert.deepEqual(positionAt(first, 1), { px: first.toPx, ms: first.toMs });
  assert.deepEqual(positionAt(first, 2), { px: first.toPx, ms: first.toMs }, 'past the end is the end');
  assert.deepEqual(positionAt(first, -1), { px: first.fromPx, ms: first.fromMs });

  // Symmetric: halfway through the time is halfway along the rail.
  assert.ok(Math.abs(positionAt(first, 0.5).px - (first.fromPx + first.toPx) / 2) < 1e-9);
  // Ease in and out — the first tenth and the last tenth each cover less ground
  // than the middle tenth does.
  const span = (from: number, to: number) => positionAt(first, to).px - positionAt(first, from).px;
  assert.ok(span(0, 0.1) < span(0.45, 0.55), 'it accelerates away from the stop');
  assert.ok(span(0.9, 1) < span(0.45, 0.55), 'and decelerates into the next one');
  // But it never STANDS still: the complaint this answers is a thumb that does
  // not appear to travel, so no frame of a 490ms glide may be a dead frame.
  const frame = 16 / first.durationMs;
  assert.ok(span(0, frame) > 0.05, `the first frame moved ${span(0, frame)}px`);

  // The date under the thumb is the axis's own inverse, so it advances day by
  // day rather than by a share of the segment.
  const midMs = positionAt(first, 0.5).ms;
  assert.equal(Math.round((midMs - first.fromMs) / DAY_MS), 4, 'four of the seven days by the halfway point');
});

test('two reports filed on one day are an arrival, not a 450ms stare', () => {
  // They sit at one coordinate — the axis de-duplicates its anchors — so there
  // is no travel to ease, and easing across half a pixel is the stall the floor
  // exists to prevent, not an instance of it.
  const sameDay: PlaybackNode[] = [
    { key: 'a', ms: day('2026-05-08') },
    { key: 'b', ms: day('2026-05-08') },
    { key: 'c', ms: day('2026-05-15') },
  ];
  const axis = linearAxis([WINDOW[0], ...sameDay.map((n) => n.ms), WINDOW[1]], 700);
  const segments = playbackSegments(axis, sameDay);
  assert.equal(segments[0].lengthPx, 0);
  assert.equal(segments[0].durationMs, 0, 'nowhere to go, so no time spent going');
  assert.equal(segments[0].dwellMs, PLAYBACK_DWELL_MS, 'the snapshot is still read');
  assert.deepEqual(positionAt(segments[0], 0.5), { px: segments[0].toPx, ms: segments[0].toMs });
  assert.ok(segments[1].durationMs > 0, 'and the next one is a real glide');
});

test('reduced motion is the stepwise walk: no travel, same rests', () => {
  const stepped = playbackSegments(REPORT_AXIS, NODES, { reducedMotion: true });
  assert.deepEqual(stepped.map((s) => s.durationMs), [0, 0, 0]);
  assert.deepEqual(stepped.map((s) => s.dwellMs), [PLAYBACK_DWELL_MS, PLAYBACK_DWELL_MS, PLAYBACK_DWELL_MS]);
  // The px are still right — reduced motion takes the tween away, not the walk.
  assert.deepEqual(stepped.map((s) => Math.round(s.toPx)), [140, 160, 700]);
  for (const t of [0.01, 0.5, 0.99]) {
    assert.deepEqual(
      positionAt(stepped[0], t), { px: stepped[0].toPx, ms: stepped[0].toMs },
      'a stepped segment is only ever at its destination',
    );
  }
});

// ── The compressed axis ─────────────────────────────────────────────────────

/**
 * A programme with a hole in the middle of it: two milestones in the first five
 * days, 290 idle days, two more at the end. That middle stretch holds 97% of the
 * window's time, so the axis cuts it to a 48 px notch in the CENTRE of the bar —
 * and only the first and last are stops, so the thumb crosses the notch mid-glide
 * instead of stopping on it.
 *
 *   first ──── 276px ────╱╱──── 276px ──── last
 *   day 0            day 5  day 295      day 300
 */
const HOLE_START = day('2025-10-09');
const HOLE_ITEMS = [0, 5, 295, 300].map((d) => HOLE_START + d * DAY_MS);
const HOLE_AXIS = compressedAxis(HOLE_ITEMS, 600);
const HOLE_NODES: PlaybackNode[] = [
  { key: 'first', ms: HOLE_ITEMS[0] },
  { key: 'last', ms: HOLE_ITEMS[3] },
];
const HOLE_CUT = HOLE_AXIS.gaps.find((gap) => gap.compressed);

test('a cut is crossed in pixels, so it costs travel rather than time', () => {
  assert.ok(HOLE_CUT, `no stretch was cut: ${JSON.stringify(HOLE_AXIS.gaps.map((g) => g.px))}`);
  assert.equal(Math.round(HOLE_CUT.px), 48, 'a cut stretch is a fixed notch');
  assert.equal(Math.round((HOLE_CUT.gapMs / (HOLE_ITEMS[3] - HOLE_ITEMS[0])) * 100), 97);

  const [whole] = playbackSegments(HOLE_AXIS, HOLE_NODES);
  assert.equal(Math.round(whole.lengthPx), 600);
  assert.equal(whole.durationMs, 1400, 'the distance, clamped — not the 300 days');
  // 97% of the DAYS are inside 8% of the rail. Paced by time the thumb would
  // spend 97% of the glide inside the notch and cross the visible 552px in 40ms;
  // paced by distance the notch costs it 48px, like any other 48px.
  assert.equal(Math.round((HOLE_CUT.px / whole.lengthPx) * 100), 8);
});

test('the thumb does not stall or jump at the cut, and its chip never goes back', () => {
  const [whole] = playbackSegments(HOLE_AXIS, HOLE_NODES);
  const frames = 60;
  const samples = Array.from({ length: frames + 1 }, (_, i) => positionAt(whole, i / frames));

  // Strictly forward, on both readings.
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].px > samples[i - 1].px, `frame ${i} did not move: ${samples[i - 1].px} → ${samples[i].px}`);
    assert.ok(samples[i].ms >= samples[i - 1].ms, `frame ${i} went back in time`);
  }

  // No stall and no jump through the middle of the glide — the notch is at 46–54%
  // of the rail, so these are the frames that cross it. Consecutive steps differ
  // by the easing and by nothing else; a time-paced tween fails this at the notch
  // by three orders of magnitude, which is what "it must not stall" means. The
  // ends are excluded because ease-in-out is SUPPOSED to change speed there.
  const steps = samples.slice(1).map((s, i) => s.px - samples[i].px);
  for (let i = 8; i < steps.length - 8; i++) {
    const ratio = steps[i] / steps[i - 1];
    assert.ok(
      ratio > 0.8 && ratio < 1.25,
      `step ${i} is ${ratio.toFixed(2)}× its neighbour (px: ${steps[i - 1]} → ${steps[i]})`,
    );
  }

  // The px path is the part the axis cannot touch: the same 600px with nothing
  // cut draws exactly the same travel, which is what "the cut is crossed at the
  // same visual speed as everything else" means.
  const plain = playbackSegments(
    linearAxis([HOLE_ITEMS[0], HOLE_ITEMS[3]], 600),
    HOLE_NODES,
  )[0];
  for (let i = 0; i <= frames; i++) {
    assert.ok(
      Math.abs(positionAt(plain, i / frames).px - samples[i].px) < 1e-9,
      `the cut changed the travel at frame ${i}`,
    );
  }

  // And the DATE does what the cut is for: it skips the days the axis is not
  // showing, in a step, rather than creeping through 290 of them.
  const biggest = samples.slice(1).reduce(
    (worst, s, i) => Math.max(worst, (s.ms - samples[i].ms) / DAY_MS),
    0,
  );
  assert.ok(biggest > 20, `the chip crept through the cut (biggest step ${biggest} days)`);
  const inside = samples.filter((s) => s.ms > HOLE_CUT!.fromMs && s.ms < HOLE_CUT!.toMs);
  assert.ok(
    inside.length > 0 && inside.length < frames / 6,
    `${inside.length} of ${frames} frames sat inside the cut`,
  );
});

test('one stop is not a sequence, and an empty list schedules nothing', () => {
  assert.deepEqual(playbackSegments(REPORT_AXIS, []), []);
  assert.deepEqual(playbackSegments(REPORT_AXIS, [NODES[0]]), []);
  // Out of order in, in order out: the caller's list is a set of stops, not an
  // itinerary.
  const shuffled = playbackSegments(REPORT_AXIS, [NODES[2], NODES[0], NODES[1]]);
  assert.deepEqual(shuffled.map((s) => s.fromKey), ['r1', 'r2']);
  // A stop with no date is not a place on the rail.
  const dateless = playbackSegments(REPORT_AXIS, [NODES[0], { key: 'x', ms: Number.NaN }, NODES[1]]);
  assert.deepEqual(dateless.map((s) => [s.fromKey, s.toKey]), [['r1', 'r2']]);
});
