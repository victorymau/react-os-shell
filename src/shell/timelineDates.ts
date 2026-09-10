import { formatDate } from '../utils/date';

/**
 * Date maths the timeline family shares — `MilestoneTimeline` (milestone dots
 * on a bar) and `ProductionTimeline` (the draggable scrubber). One copy, so the
 * two bars agree on what a date string means and how a day is labelled.
 */

/** Milliseconds in a day — axis padding + day-resolution math. */
export const DAY_MS = 86400000;

/**
 * Parse an ISO date string to epoch ms, or `null` when absent, unparseable, or
 * implausible. The year guard drops a typo'd date ("0202-12-20") that would
 * otherwise become the left edge of the axis and squash every real dot into
 * the last pixel.
 */
export function toDayMs(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return null;
  const year = new Date(t).getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return t;
}

/** Format an epoch-ms value as a short date in the user's date format. */
export function fmtSliderDate(ms: number): string {
  return formatDate(new Date(ms).toISOString().slice(0, 10));
}
