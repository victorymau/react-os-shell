/**
 * Frame-timing maths + bottleneck attribution for the desktop perf HUD.
 *
 * Split out from `PerfStats.tsx` because the interesting part is the
 * *attribution*, and attribution is pure: given a frame rate and how much of
 * the wall clock the main thread spent blocked, decide whether a janky UI is
 * the GPU's fault or JavaScript's. That decision is what the HUD exists for —
 * "the UI feels laggy" is not actionable, "you are GPU-bound" is — so it lives
 * where a test can pin it.
 *
 * The discriminator: frames are landing late, but the main thread is idle.
 * If JS were the problem the main thread would be busy, so late frames plus an
 * idle thread means the cost is downstream of script — compositing, paint,
 * backdrop-filter. The shell leans hard on frosted glass (`utils/glass.ts`
 * blurs at a 40px radius), which is exactly the kind of work that shows up
 * here and nowhere in a JS profile.
 */

/** Frame rate at or above which we call the UI smooth. Below 60 because
 *  rAF sampling is noisy and a display may be capped at 60Hz anyway — a
 *  steady 55 is not a complaint anyone would file. */
export const SMOOTH_FPS = 50;

/** Share of wall-clock time in long tasks that makes JS the prime suspect.
 *  `longtask` entries are >50ms by definition, so even 20% means the thread
 *  is stalling several times a second — visible as jank on its own. */
export const BLOCKED_PCT_CPU = 20;

export type BottleneckKind = 'smooth' | 'gpu' | 'cpu' | 'unknown';

export interface PerfReading {
  /** Frames per second across the sample window. */
  fps: number;
  /** Mean frame interval, ms. */
  frameMs: number;
  /** Slowest single frame in the window, ms — where the jank actually lives. */
  worstMs: number;
  /** Percentage of wall-clock time the main thread spent inside long tasks
   *  (0–100), or null when the browser exposes no `longtask` observer.
   *  Null is load-bearing: without it we cannot separate GPU from CPU, and
   *  guessing would defeat the point of the HUD. */
  blockedPct: number | null;
}

export interface Verdict {
  kind: BottleneckKind;
  /** Headline, for the HUD's verdict row. */
  label: string;
  /** One line of what to do about it. */
  detail: string;
}

/** Reached from two directions — frames arriving late, and frames not arriving
 *  at all because the thread is too busy to deliver them — so it lives in one
 *  place rather than being spelled out twice. */
const CPU_BOUND: Verdict = {
  kind: 'cpu',
  label: 'CPU-bound (JavaScript)',
  detail: 'The main thread is blocked. Rendering settings will not help — this is script or data work.',
};

/** Turn a window of rAF timestamps into a frame-rate reading.
 *  Needs two timestamps to describe one interval; anything less is not yet a
 *  measurement and reports zeroes rather than a fabricated 0 fps. */
export function summariseFrames(timestamps: number[]): Pick<PerfReading, 'fps' | 'frameMs' | 'worstMs'> {
  if (timestamps.length < 2) return { fps: 0, frameMs: 0, worstMs: 0 };

  let worstMs = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const delta = timestamps[i] - timestamps[i - 1];
    if (delta > worstMs) worstMs = delta;
  }

  const spanMs = timestamps[timestamps.length - 1] - timestamps[0];
  // A window where every timestamp collapsed to the same instant is not a
  // 0-second span we can divide by — treat it as no reading.
  if (spanMs <= 0) return { fps: 0, frameMs: 0, worstMs: 0 };

  const intervals = timestamps.length - 1;
  return {
    fps: (intervals / spanMs) * 1000,
    frameMs: spanMs / intervals,
    worstMs,
  };
}

/**
 * Attribute a reading to a bottleneck.
 *
 * Order matters: smooth wins outright (nobody cares what a healthy frame rate
 * is *not* bound by), and an unknown block share can only ever downgrade to
 * `unknown` — never to `gpu`. Blaming the GPU because the browser withheld
 * long-task timing would be a confident wrong answer, which is worse than no
 * answer when someone is about to go change settings on the strength of it.
 */
export function classify(reading: PerfReading): Verdict {
  const { fps, blockedPct } = reading;
  const threadBlocked = blockedPct !== null && blockedPct >= BLOCKED_PCT_CPU;

  if (!Number.isFinite(fps) || fps <= 0) {
    // No readable frame rate — but if the main thread is also blocked, the
    // blocking is *why* there are no frames: a starved thread never gets to
    // service `requestAnimationFrame`, so the samples dry up. That is the most
    // severe CPU-bound case there is, and it must not be reported as an
    // absence of data — "Measuring…" would leave the HUD at its least useful
    // exactly when the machine is at its worst.
    if (threadBlocked) return CPU_BOUND;
    return { kind: 'unknown', label: 'Measuring…', detail: 'Collecting frame timings.' };
  }

  if (fps >= SMOOTH_FPS) {
    return {
      kind: 'smooth',
      label: 'Smooth',
      detail: 'Frames are landing on time. No rendering bottleneck here.',
    };
  }

  if (blockedPct === null) {
    return {
      kind: 'unknown',
      label: 'Janky — cause unknown',
      detail: 'This browser reports no long-task timing, so GPU and JS cannot be told apart. Try Chrome or Edge.',
    };
  }

  if (threadBlocked) return CPU_BOUND;

  return {
    kind: 'gpu',
    label: 'GPU-bound (compositing)',
    detail: 'Frames are late while the main thread sits idle. Try Preferences → Customization → Reduce transparency.',
  };
}
