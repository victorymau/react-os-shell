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
 *
 * A severity usually arrives from a backend rollup, so it crosses a JSON
 * boundary where the compiler cannot follow it. `resolveSeverity` is what the
 * components call: a token the shell does not recognise renders a LOUD unknown
 * marker and logs, it never renders nothing. An alarm surface that silently
 * stops alarming is the one failure these components exist to prevent, so it is
 * also the one failure they must not have themselves.
 */

/** Health tone. Same three words the rest of the shell uses for status colour. */
export type SeverityTone = 'success' | 'warning' | 'danger';

/** The tones as a runtime list. A `SeverityTone` annotation is erased at the
 *  boundary the values actually cross (a fetch response), so the check that
 *  matters has to exist at runtime. */
export const SEVERITY_TONES: readonly SeverityTone[] = ['success', 'warning', 'danger'];

/** True when `value` is one of the three tones. Exported so a consumer can
 *  validate a rollup at the fetch boundary — where a bad token can still be
 *  reported against its payload — rather than discovering it as a wrong pixel. */
export function isSeverityTone(value: unknown): value is SeverityTone {
  return typeof value === 'string' && (SEVERITY_TONES as readonly string[]).includes(value);
}

/**
 * Severity of `value` against its bounds, or `null` when nothing can be said.
 *
 * Both bounds are INCLUSIVE (`>=`): a disk at exactly its `crit` number is
 * `danger`. Either bound may be omitted — a metric with only a `crit` still
 * judges — but with neither the answer is `null`, never `success`: no threshold
 * is hardcoded here, not even as a fallback, so with nothing to measure against
 * there is no verdict to report.
 *
 * A non-finite bound counts as omitted, not as a bound that nothing exceeds.
 * `NaN >= NaN` is false, so an unguarded `warn={NaN}` would have quietly
 * returned `success` — a verdict invented out of a missing threshold.
 */
export function severityOf(
  value: number | null | undefined,
  warn?: number | null,
  crit?: number | null,
): SeverityTone | null {
  if (value == null || !Number.isFinite(value)) return null;
  const warnAt = boundOf(warn);
  const critAt = boundOf(crit);
  if (warnAt == null && critAt == null) return null;
  if (critAt != null && value >= critAt) return 'danger';
  if (warnAt != null && value >= warnAt) return 'warning';
  return 'success';
}

/** A threshold the component can actually compare against, or `null`. */
export function boundOf(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
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

/** Fill for a severity the shell does not recognise. Grey reads "unknown", the
 *  red edge reads "and that is a problem" — deliberately unlike all three real
 *  tones, and deliberately never empty: an unrecognised token used to produce
 *  `class="… rounded-full undefined"`, an invisible dot on the one surface whose
 *  entire job is being visible. Both utilities are un-remapped in dark mode. */
export const SEVERITY_UNKNOWN_FILL = 'bg-gray-300 border border-red-500';

/** Ink for a value carrying an unrecognised severity: the number is real, the
 *  verdict on it is not, so it gets no tone colour. */
export const SEVERITY_UNKNOWN_INK = 'text-gray-900';

/** How a `severity` prop resolved. `fill`, `ink` and `word` are ALWAYS
 *  non-empty, which is what makes a bad token impossible to render as nothing;
 *  `tone` is `null` when the token was not recognised, for the few places that
 *  need to know whether there is a real verdict behind the marker. */
export interface SeverityStyle {
  /** The recognised tone, or `null` when the token was not one of the three. */
  tone: SeverityTone | null;
  /** Marker-dot / bar-fill background classes. Never empty. */
  fill: string;
  /** Ink classes for the value this severity judges. Never empty. */
  ink: string;
  /** Tooltip / screen-reader wording. Never empty. */
  word: string;
}

const TONE_STYLES: Record<SeverityTone, SeverityStyle> = {
  success: { tone: 'success', fill: SEVERITY_FILL.success, ink: SEVERITY_INK.success, word: SEVERITY_WORD.success },
  warning: { tone: 'warning', fill: SEVERITY_FILL.warning, ink: SEVERITY_INK.warning, word: SEVERITY_WORD.warning },
  danger: { tone: 'danger', fill: SEVERITY_FILL.danger, ink: SEVERITY_INK.danger, word: SEVERITY_WORD.danger },
};

/** Presentation for a tone the shell already trusts, or `null` for "no tone".
 *  Use this for a severity the component computed itself (via `severityOf`),
 *  where there is no untrusted token to fall back from. */
export function styleForTone(tone: SeverityTone | null | undefined): SeverityStyle | null {
  return tone == null ? null : TONE_STYLES[tone];
}

/** Renderable description of whatever the caller passed, capped so a runaway
 *  payload cannot become a 10 KB `title`. React escapes it on the way out. */
function describeToken(value: unknown): string {
  const raw =
    typeof value === 'string'
      ? JSON.stringify(value)
      : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
        ? String(value)
        : Object.prototype.toString.call(value);
  return raw.length > 32 ? `${raw.slice(0, 31)}…` : raw;
}

/** One console line per distinct (component, token) pair — a sidebar with 200
 *  items on one bad rollup should say this once, not 200 times. */
const reported = new Set<string>();

function reportUnknownSeverity(component: string, described: string): void {
  const key = `${component}:${described}`;
  if (reported.has(key)) return;
  reported.add(key);
  // Not gated on NODE_ENV: a mis-typed severity is a production bug that
  // silences an alarm, and the library cannot assume a bundler define exists.
  console.error(
    `[react-os-shell] ${component}: severity ${described} is not one of ` +
      `${SEVERITY_TONES.join(' | ')}. Rendering an "unknown severity" marker — a health ` +
      'marker must never silently disappear. If this came from a backend rollup, map it ' +
      "to the shell's vocabulary at the fetch boundary (see isSeverityTone).",
  );
}

/**
 * Resolve a `severity` prop that may have come from anywhere.
 *
 * Three outcomes, because there are three different facts:
 *   `null`/`undefined` in  →  `null` out    nothing was claimed; render no marker
 *   a recognised tone      →  its style     the normal path
 *   anything else          →  unknown style logged once, and rendered VISIBLY
 *
 * The third case is the whole point. `SEVERITY_FILL[severity]` on an unknown
 * key yields `undefined`, which interpolates into a className as the string
 * `"undefined"` — a dot with no colour, no title and no screen-reader word, on
 * a component whose entire purpose is making a deep alarm visible at the top
 * level. Failing loudly (console) and degrading visibly (grey dot, red edge,
 * the token in its tooltip) are both strictly better than vanishing.
 *
 * Note what this deliberately does NOT do: alias `ok`/`warn`/`crit`, or the
 * displayed words `critical`/`ok`, onto the three tones. Quietly accepting a
 * second dialect would re-create exactly the two-vocabularies-for-one-idea
 * problem this module exists to avoid, and would hide the caller's bug instead
 * of surfacing it. The mismatch is reported, not papered over.
 */
export function resolveSeverity(severity: unknown, component: string): SeverityStyle | null {
  if (severity == null) return null;
  if (isSeverityTone(severity)) return TONE_STYLES[severity];

  const described = describeToken(severity);
  reportUnknownSeverity(component, described);
  return {
    tone: null,
    fill: SEVERITY_UNKNOWN_FILL,
    ink: SEVERITY_UNKNOWN_INK,
    word: `unrecognised severity ${described}`,
  };
}

/** Deduplicated console line for the other way a caller can hand these
 *  components an impossible number. Shared with `resolveSeverity`'s registry so
 *  one bad prop is one line, however many rows render it. */
export function warnOnce(key: string, message: string): void {
  if (reported.has(key)) return;
  reported.add(key);
  console.error(message);
}
