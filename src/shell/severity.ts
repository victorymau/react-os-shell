/**
 * Severity — the health subset of the shell's status vocabulary.
 *
 * The shell already speaks `success | warning | danger` everywhere status has a
 * colour (`StatusBadge`'s `SemanticGroup`, `Banner`'s `BannerTone`,
 * `ConfirmDialog`'s `variant`). Health surfaces reuse those three words rather
 * than introducing an ok/warn/crit dialect that would mean the same thing in a
 * different language — a consumer mapping one to the other is a bug waiting to
 * happen. The type is deliberately narrower than `SemanticGroup`: an alarm
 * marker has exactly three things to say.
 *
 * "No severity" is expressed as the ABSENCE of a tone (`undefined`/`null`), not
 * as a fourth member. Two different facts collapse into it — no reading at all,
 * and a reading with nothing to judge it against — and both must render as
 * "unknown" rather than borrowing the calm green of a measured healthy value.
 * See `MetricBar`, which keeps them apart.
 */

/** Health tone. Same three words the rest of the shell uses for status colour. */
export type SeverityTone = 'success' | 'warning' | 'danger';

/**
 * Severity of `value` against its bounds, or `null` when nothing can be said.
 *
 * Both bounds are INCLUSIVE (`>=`): a disk at exactly its `crit` number is
 * `danger`. Either bound may be omitted — a metric with only a `crit` still
 * judges — but with neither the answer is `null`, never `success`: no threshold
 * is hardcoded here, not even as a fallback, so with nothing to measure against
 * there is no verdict to report.
 */
export function severityOf(
  value: number | null | undefined,
  warn?: number | null,
  crit?: number | null,
): SeverityTone | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (warn == null && crit == null) return null;
  if (crit != null && value >= crit) return 'danger';
  if (warn != null && value >= warn) return 'warning';
  return 'success';
}

/** Marker dot / bar fill. The vivid 500s are deliberately NOT dark-remapped in
 *  `styles.css`: they carry meaning, and they read on the light (`bg-gray-200`)
 *  and dark (#313244) track alike. */
export const SEVERITY_FILL: Record<SeverityTone, string> = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
};

/** Ink for a value the tone judges. `success` stays neutral on purpose —
 *  colour on a metric row means "look at me", and a healthy number has nothing
 *  to say. Write the 600s: `styles.css` remaps them to the lighter weights in
 *  dark mode (`text-red-600` → #f87171); the 400s are not remapped. */
export const SEVERITY_INK: Record<SeverityTone, string> = {
  success: 'text-gray-900',
  warning: 'text-amber-600',
  danger: 'text-red-600',
};

/** Screen-reader / tooltip wording. The colour is the fast channel; this is the
 *  one that survives a screen reader or a colour-blind operator. */
export const SEVERITY_WORD: Record<SeverityTone, string> = {
  success: 'ok',
  warning: 'warning',
  danger: 'critical',
};
