/**
 * The schedule playback follows: which stretch of rail the thumb is crossing,
 * how long that takes, and where it is partway through.
 *
 * Pure — no React, no DOM, and no clock of its own: a reading of the wall clock
 * is an argument. `TimelineTrack` owns the animation frame and the dwell timer
 * and asks these functions where the thumb goes, which is what lets the timing
 * be specified rather than observed: a spec can assert that a 200 px stretch
 * takes 700 ms, and that five idle seconds end one rest rather than five, with
 * nothing rendered and nothing waited for.
 *
 * The whole file exists because of one distinction. A tween in TIME — walk the
 * date from report to report and let the axis place it — looks right on a linear
 * axis and stalls on a compressed one: an idle stretch cut down to a 48 px notch
 * holds most of the window's DAYS, so a time-paced thumb spends most of its
 * journey inside a notch it crosses in 48 px. So the tween is in PIXELS. The
 * thumb travels the rail at one visual speed throughout, the date under it is
 * read back through the axis's inverse mapping, and a cut therefore does what a
 * cut is for: the thumb crosses it in 48 px of travel and the chip skips the
 * days the axis is not showing.
 */
import type { CompressedAxis } from './timelineGeometry';

/**
 * How much time 100 px of rail is worth, in ms.
 *
 * 350 ms per 100 px puts a weekly report about 450 ms from the next one on a
 * 700 px card and the two ends of a year-long programme about 2.4 s apart before
 * the clamps. Slower reads as a progress bar the user is waiting on; faster and
 * the dates under the thumb are unreadable.
 */
const MS_PER_100_PX = 350;

/** The floor. Under it a glide is a flicker: two reports a day apart are ~10 px
 *  on a 700 px card, and 35 ms of travel is one or two frames. */
const MIN_GLIDE_MS = 450;

/** The ceiling. NN/g puts the usable band at 100–400 ms and calls ≥ 500 ms
 *  "cumbersome"; a scrubber crossing a bar is the one case where longer is the
 *  point, but past ~1.4 s a single stretch outlasts the reader's patience for
 *  it, and the rest of the programme is still to come. */
const MAX_GLIDE_MS = 1400;

/** How long the thumb rests on a report before leaving it. Long enough to read
 *  the stage row that just changed, short enough that six reports is about
 *  seven seconds end to end. */
export const PLAYBACK_DWELL_MS = 700;

/** A stretch shorter than this is not travel: two reports filed on one day sit
 *  at one coordinate, and easing across half a pixel for 450 ms is a stall. */
const ZERO_TRAVEL_PX = 0.5;

/** One stop playback visits: the mark's key, and when it happened. */
export interface PlaybackNode {
  key: string;
  ms: number;
}

/** One node-to-node leg of a playback, with every number the driver needs. */
export interface PlaybackSegment {
  /** The node the thumb leaves. */
  fromKey: string;
  /** The node it arrives at — the key `onArrive` is called with. */
  toKey: string;
  fromMs: number;
  toMs: number;
  /** Where those two sit on the rail, in px. */
  fromPx: number;
  toPx: number;
  /** How far the thumb actually travels. The duration is derived from THIS and
   *  not from `toMs - fromMs`, which is the whole point of the file. */
  lengthPx: number;
  /** How long the glide takes. 0 means "arrive at once" — a zero-length stretch,
   *  or reduced motion, where the thumb still moves but nothing tweens. */
  durationMs: number;
  /** How long to rest on `toKey` after arriving. */
  dwellMs: number;
  /** The axis's inverse mapping, carried so `positionAt` can report the date
   *  under a pixel without the caller threading the axis back in. */
  msByPx: (px: number) => number;
}

export interface PlaybackScheduleOptions {
  /** Multiplier on every duration AND every dwell — 2 plays twice as fast.
   *  Values that are not a positive finite number are read as 1. */
  speed?: number;
  /**
   * `prefers-reduced-motion: reduce`. Every glide becomes 0 ms, so playback is
   * the stepwise walk it has always been: the thumb appears at the next report,
   * dwells, appears at the one after. The dwell is kept, because the dwell is
   * not motion — it is how long the snapshot stays readable.
   */
  reducedMotion?: boolean;
  /** Override the rest at each node. Defaults to `PLAYBACK_DWELL_MS`. */
  dwellMs?: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * Sine in–out — the CSS `cubic-bezier(0.37, 0, 0.63, 1)`.
 *
 * Ease-in-out because playback is system-triggered rather than user-triggered
 * (Polaris), and SINE rather than the cubic one because a cubic in-out spends
 * its first three frames under a single pixel: on a 450 ms glide that is 50 ms
 * of a thumb that has been told to move and has not. The complaint this whole
 * change answers is a thumb that does not appear to travel, so the curve may not
 * have dead frames at its ends.
 */
const easeInOut = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * The legs of one playback, left to right.
 *
 * Nodes are sorted by date and de-duplicated by coordinate-carrying key; `n`
 * nodes give `n - 1` segments, so a single node schedules nothing and playback
 * ends the moment it starts — which is the honest answer for a programme with
 * one report in it.
 *
 * `axis` is whatever mapping the track is currently drawing on, including a
 * magnified one: the durations are read off the pixels the reader can see, so a
 * zoomed stretch takes longer to cross precisely because it is wider.
 */
export function playbackSegments(
  axis: Pick<CompressedAxis, 'xByMs' | 'msByPx'>,
  nodes: PlaybackNode[],
  opts: PlaybackScheduleOptions = {},
): PlaybackSegment[] {
  const speed = Number.isFinite(opts.speed) && (opts.speed ?? 0) > 0 ? (opts.speed as number) : 1;
  const dwell = Math.max(0, opts.dwellMs ?? PLAYBACK_DWELL_MS) / speed;
  const ordered = nodes
    .filter((node) => Number.isFinite(node.ms))
    .slice()
    .sort((a, b) => a.ms - b.ms);

  const segments: PlaybackSegment[] = [];
  for (let i = 0; i + 1 < ordered.length; i++) {
    const from = ordered[i];
    const to = ordered[i + 1];
    const fromPx = axis.xByMs(from.ms);
    const toPx = axis.xByMs(to.ms);
    const lengthPx = Math.max(0, toPx - fromPx);
    const glide = lengthPx <= ZERO_TRAVEL_PX || opts.reducedMotion
      ? 0
      : clamp((lengthPx * MS_PER_100_PX) / 100, MIN_GLIDE_MS, MAX_GLIDE_MS) / speed;
    segments.push({
      fromKey: from.key,
      toKey: to.key,
      fromMs: from.ms,
      toMs: to.ms,
      fromPx,
      toPx,
      lengthPx,
      durationMs: glide,
      dwellMs: dwell,
      msByPx: axis.msByPx,
    });
  }
  return segments;
}

/**
 * Where the thumb is `t` of the way through a segment, as a pixel and as a date.
 *
 * `t` is raw progress in [0, 1]; the easing is applied here so that every caller
 * — the driver, a spec, the browser check — is reading the same curve. The two
 * ends are returned exactly rather than through the mapping, because a float
 * rounding at `t = 1` would put the chip on the day before the report it has
 * just arrived at.
 */
export function positionAt(segment: PlaybackSegment, t: number): { px: number; ms: number } {
  if (!(t > 0)) return { px: segment.fromPx, ms: segment.fromMs };
  if (t >= 1 || segment.durationMs <= 0) return { px: segment.toPx, ms: segment.toMs };
  const px = segment.fromPx + (segment.toPx - segment.fromPx) * easeInOut(t);
  return { px, ms: segment.msByPx(px) };
}

/**
 * Where the thumb is between two stops, for a consumer that draws numbers.
 *
 * The kit does not render the table under the timeline, and the table is the
 * reason this exists: while the thumb travels from one report to the next, the
 * quantities beneath it should travel too rather than waiting for the arrival
 * and then jumping. So the fraction the thumb is placed by is handed out, and
 * the consumer interpolates whatever it is showing on the same number.
 */
export interface TimelineScrubProgress {
  /** The stop the thumb left. */
  fromKey: string;
  /** The stop it is heading for. */
  toKey: string;
  /** 0 at `fromKey`, 1 at `toKey`. EASED during a glide — the same number that
   *  places the disc, so the figures and the disc move together — and linear
   *  during a drag, because there is no curve in a hand. */
  t: number;
  /** The date under the thumb, epoch ms, read back through the axis. */
  ms: number;
}

/**
 * Where playback has got to, and the whole of what a pause has to keep.
 *
 * One leg at a time, and the rest at a node is the leg's OWN rest, taken before
 * it sets off: that is what puts a pause on the report the reader has just
 * arrived at rather than on the one it is heading for, and it means arriving at
 * the last node has nothing left to schedule.
 */
export interface PlaybackCursor {
  /** Index into the segment list. */
  index: number;
  /** `'rest'` sits on `segments[index].fromKey`; `'glide'` crosses to its `toKey`. */
  phase: 'rest' | 'glide';
  /** Progress through the glide as of `sinceMs`, 0 to 1. */
  t: number;
  /** What is left of the rest as of `sinceMs`, in ms. */
  restLeftMs: number;
  /**
   * The wall clock the two above were read at, or `null` for "the next reading
   * is the first".
   *
   * Null is how a phase declines to be charged for time it was not running:
   * a fresh leg, a leg the dwell timer handed over while the page had no
   * frames, and — the one that matters — a resume, because the clock kept
   * running through the pause and a resumed rest that was charged for it would
   * be no rest at all.
   */
  sinceMs: number | null;
}

/** Everything one reading of the clock decides. */
export interface PlaybackFrame {
  /** The cursor to keep. `null` means playback is over. */
  cursor: PlaybackCursor | null;
  /** Where to put the thumb, or `null` when there was no leg to read. */
  at: { px: number; ms: number } | null;
  /** The stop just reached — at MOST one per reading, however long the gap. */
  arrived: { key: string; ms: number } | null;
  /** The in-flight fraction, or `null` at a stop. */
  progress: TimelineScrubProgress | null;
}

/**
 * Advance a playback to `nowMs` — the wall clock, not a frame count.
 *
 * The distinction is the whole of this function. Playback used to advance by
 * animation-frame deltas clamped to 100 ms, which spends a 700 ms rest in seven
 * frames: right at 60 fps and wrong everywhere else, because a frame is not a
 * unit of time. An occluded or throttled surface hands out frames at whatever
 * rate it likes — the customer portal, embedded and idle, held the thumb on its
 * first report for EIGHT SECONDS on 2026-09-14 — and a control whose timing is
 * measured in frames stretches with it, without bound. Read against the clock,
 * a rest is 700 ms whether it took forty frames or one.
 *
 * The deltas it does take are unclamped, so their sum between a phase's first
 * reading and this one IS the wall clock between them; re-anchoring on every
 * reading rather than at the leg's start is what lets a pause freeze the thumb
 * where the reader can see it, at the last position painted.
 *
 * At most ONE arrival per reading, which is the other half of the fix. A page
 * that comes back after five idle seconds owes the reader four reports, and
 * announcing all four in the frame it wakes up in announces none of them: the
 * status line would land on the last, having never shown the three before it.
 * One per reading walks the backlog forward at a pace somebody can read.
 */
export function advancePlayback(
  segments: PlaybackSegment[],
  cursor: PlaybackCursor,
  nowMs: number,
): PlaybackFrame {
  const segment = segments[cursor.index];
  if (!segment) return { cursor: null, at: null, arrived: null, progress: null };
  const elapsed = cursor.sinceMs === null ? 0 : Math.max(0, nowMs - cursor.sinceMs);

  if (cursor.phase === 'rest') {
    const left = cursor.restLeftMs - elapsed;
    // Still resting. Idempotent: it holds the thumb on the node it is resting
    // at, which is also where a render arriving mid-rest would have put it.
    if (left > 0) {
      return {
        cursor: { ...cursor, restLeftMs: left, sinceMs: nowMs },
        at: positionAt(segment, 0),
        arrived: null,
        progress: null,
      };
    }
    // The rest is over on the clock, however few readings it took. The glide
    // starts HERE and not `left` ms ago: a page that went five seconds without
    // a frame owes the reader a glide, not five seconds of one already spent.
    return {
      cursor: { index: cursor.index, phase: 'glide', t: 0, restLeftMs: 0, sinceMs: nowMs },
      at: positionAt(segment, 0),
      arrived: null,
      progress: null,
    };
  }

  const t = segment.durationMs > 0 ? Math.min(1, cursor.t + elapsed / segment.durationMs) : 1;
  const at = positionAt(segment, t);
  if (t < 1) {
    return {
      cursor: { ...cursor, t, sinceMs: nowMs },
      at,
      arrived: null,
      progress: { fromKey: segment.fromKey, toKey: segment.toKey, t: easeInOut(t), ms: at.ms },
    };
  }
  // Arrived. The next leg's rest is charged from this reading, because that is
  // the moment the reader was given something to read.
  const next = segments[cursor.index + 1];
  return {
    cursor: next
      ? { index: cursor.index + 1, phase: 'rest', t: 0, restLeftMs: next.dwellMs, sinceMs: nowMs }
      : null,
    at,
    arrived: { key: segment.toKey, ms: segment.toMs },
    progress: null,
  };
}

/**
 * The two stops a date falls between, and how far along it is.
 *
 * A drag is the other way the thumb ends up between two reports, and the only
 * continuous thing about a MAGNETIC drag is the pointer: the disc is drawn on
 * the nearest stop the whole way across, so a consumer interpolating its table
 * has to be told where the hand is instead.
 *
 * `null` outside the run of stops. Before the first and after the last there is
 * no pair to be between, and a consumer showing that end stop's own figures is
 * showing the truth.
 */
export function progressBetween(nodes: PlaybackNode[], ms: number): TimelineScrubProgress | null {
  if (!Number.isFinite(ms)) return null;
  const ordered = nodes
    .filter((node) => Number.isFinite(node.ms))
    .slice()
    .sort((a, b) => a.ms - b.ms);
  for (let i = 0; i + 1 < ordered.length; i++) {
    const from = ordered[i];
    const to = ordered[i + 1];
    if (ms < from.ms || ms > to.ms) continue;
    const span = to.ms - from.ms;
    return {
      fromKey: from.key,
      toKey: to.key,
      // A pair at one coordinate is an arrival rather than a journey, so the
      // hand is at its far end by definition.
      t: span > 0 ? clamp((ms - from.ms) / span, 0, 1) : 1,
      ms,
    };
  }
  return null;
}
