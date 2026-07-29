/**
 * Session log for the desktop perf HUD — and the analysis that turns it into
 * a conclusion.
 *
 * A live frame rate tells you the UI is slow *now*. It does not tell you what
 * made it slow, and the person watching it is usually the last person able to
 * say. So while the HUD is on, every reading is stamped with what was
 * happening around it: how many windows were open, which one was on top,
 * whether the user was clicking, typing, scrolling or dragging. The log is
 * exportable, so a laggy machine somewhere else can produce evidence rather
 * than an adjective.
 *
 * The maths here is deliberately non-clever. Median rather than mean, because
 * one 400ms stall would drag a mean somewhere no frame ever was. Buckets
 * rather than a fitted curve, because "6 windows open halves the frame rate"
 * is a sentence someone can act on and a correlation coefficient is not.
 */
import type { BottleneckKind } from './perfVerdict';

/** One flush interval's worth of measurement plus its context. Keys are short
 *  because thousands of these get JSON-serialised into localStorage and into
 *  whatever the user emails afterwards. */
export interface PerfLogRecord {
  /** Milliseconds since logging began. */
  t: number;
  fps: number;
  frameMs: number;
  worstMs: number;
  blockedPct: number | null;
  heapMB: number | null;
  verdict: BottleneckKind;
  /** Open shell windows at the moment of the reading. */
  windows: number;
  /** Identity of the topmost window, when there is one — so a summary can name
   *  the screen that was slow rather than just the count. */
  active: string | null;
  clicks: number;
  keys: number;
  scrolls: number;
  /** Milliseconds spent mid-drag during the interval. Dragging is the single
   *  most compositing-heavy thing a user does in a window shell, so it gets
   *  its own axis rather than being lumped in with clicks. */
  dragMs: number;
}

export interface FpsGroup {
  samples: number;
  medianFps: number;
}

export interface LogSummary {
  samples: number;
  durationMs: number;
  medianFps: number;
  worstFrameMs: number;
  /** Fraction of samples in each verdict, 0–1. */
  verdictShare: Record<BottleneckKind, number>;
  /** Split by whether the user was doing anything. The gap between these two
   *  is the headline: a desktop that is smooth at rest and janky in use has a
   *  rendering cost that only shows up under interaction. */
  interacting: FpsGroup | null;
  idle: FpsGroup | null;
  /** Frame rate against how many windows were open. */
  byWindowCount: (FpsGroup & { windows: number })[];
  /** Windows ranked worst-first, so the slowest screen names itself. */
  worstWindows: (FpsGroup & { key: string })[];
}

/** Records kept in memory before the oldest are dropped. At one record per
 *  500ms this is about 20 minutes — long enough to catch an intermittent
 *  stall, small enough to serialise without thinking about it. */
export const LOG_CAP = 2400;

/** Minimum samples before a group is reported. One unlucky reading is not a
 *  finding, and a summary that names a window off a single sample invites
 *  someone to go optimise the wrong screen. */
export const MIN_GROUP_SAMPLES = 4;

/** Append with a cap, oldest dropped first. Returns a new array — callers hold
 *  this in React state, where mutation would not re-render. */
export function appendRecord(log: PerfLogRecord[], record: PerfLogRecord, cap = LOG_CAP): PerfLogRecord[] {
  const next = log.length >= cap ? log.slice(log.length - cap + 1) : log.slice();
  next.push(record);
  return next;
}

/** True when the user was doing something during the interval. */
export function isInteracting(r: PerfLogRecord): boolean {
  return r.clicks > 0 || r.keys > 0 || r.scrolls > 0 || r.dragMs > 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function group(records: PerfLogRecord[]): FpsGroup {
  return { samples: records.length, medianFps: median(records.map(r => r.fps)) };
}

/**
 * Reduce a log to the handful of statements worth acting on.
 *
 * Only samples with a real frame rate are measured — a reading taken while the
 * main thread was too blocked to deliver frames carries fps 0, and letting
 * those into a median would report a frame rate the display never showed.
 * They still count toward `verdictShare`, which is where that condition
 * belongs.
 */
export function summariseLog(log: PerfLogRecord[]): LogSummary {
  const empty: LogSummary = {
    samples: 0,
    durationMs: 0,
    medianFps: 0,
    worstFrameMs: 0,
    verdictShare: { smooth: 0, gpu: 0, cpu: 0, unknown: 0 },
    interacting: null,
    idle: null,
    byWindowCount: [],
    worstWindows: [],
  };
  if (!log.length) return empty;

  const measured = log.filter(r => r.fps > 0);

  const verdictShare = { ...empty.verdictShare };
  for (const r of log) verdictShare[r.verdict] += 1 / log.length;

  const interacting = measured.filter(isInteracting);
  const idle = measured.filter(r => !isInteracting(r));

  const byWindows = new Map<number, PerfLogRecord[]>();
  const byKey = new Map<string, PerfLogRecord[]>();
  for (const r of measured) {
    const bucket = byWindows.get(r.windows);
    if (bucket) bucket.push(r); else byWindows.set(r.windows, [r]);
    if (r.active) {
      const keyed = byKey.get(r.active);
      if (keyed) keyed.push(r); else byKey.set(r.active, [r]);
    }
  }

  return {
    samples: log.length,
    durationMs: log[log.length - 1].t - log[0].t,
    medianFps: median(measured.map(r => r.fps)),
    worstFrameMs: log.reduce((worst, r) => (r.worstMs > worst ? r.worstMs : worst), 0),
    verdictShare,
    interacting: interacting.length >= MIN_GROUP_SAMPLES ? group(interacting) : null,
    idle: idle.length >= MIN_GROUP_SAMPLES ? group(idle) : null,
    byWindowCount: [...byWindows.entries()]
      .filter(([, rs]) => rs.length >= MIN_GROUP_SAMPLES)
      .map(([windows, rs]) => ({ windows, ...group(rs) }))
      .sort((a, b) => a.windows - b.windows),
    worstWindows: [...byKey.entries()]
      .filter(([, rs]) => rs.length >= MIN_GROUP_SAMPLES)
      .map(([key, rs]) => ({ key, ...group(rs) }))
      .sort((a, b) => a.medianFps - b.medianFps),
  };
}

const CSV_COLUMNS: (keyof PerfLogRecord)[] = [
  't', 'fps', 'frameMs', 'worstMs', 'blockedPct', 'heapMB',
  'verdict', 'windows', 'active', 'clicks', 'keys', 'scrolls', 'dragMs',
];

/** Flat CSV, for opening in a spreadsheet without writing any code. */
export function toCsv(log: PerfLogRecord[]): string {
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'number' ? String(Math.round(value * 10) / 10) : String(value);
    // A window key is app-supplied text and can contain a comma or a quote.
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    CSV_COLUMNS.join(','),
    ...log.map(r => CSV_COLUMNS.map(c => cell(r[c])).join(',')),
  ].join('\n');
}
