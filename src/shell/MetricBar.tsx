/**
 * MetricBar — a measured value, a proportional bar, and optional threshold
 * ticks. The CPU / memory / disk row every status surface ends up rewriting.
 *
 * The contract worth knowing before you use it: **`null` is not zero.** A
 * missing reading renders as a dashed empty track and an em dash, never as a
 * zero-width bar — a zero-width bar is a picture of a healthy idle box, which
 * is the opposite of "we have no idea". Same reasoning one level up: with no
 * thresholds the fill stays grey rather than green, because green is a claim
 * ("measured, and under warn") that nothing here has standing to make.
 *
 * Four render states, because there are four different facts:
 *   value + thresholds  the real row — toned fill, ticks, coloured value ink
 *   value, no threshold a real magnitude nobody can judge — grey fill, no ticks
 *   thresholds, no value  no reading — dashed empty track, em dash
 *   neither               same
 *
 * `max` is held to the same standard as `value`, because it is the divisor: a
 * bar is a proportion, and a proportion of an unknown total is not a small bar,
 * it is no bar. `max={0}` used to divide to `Infinity`, clamp to 100 % and paint
 * a full green bar out of a division by zero — a fabricated measurement on the
 * exact path this component exists to guard (`max={total ?? 0}` where the probe
 * never learned the total). Now a non-positive or non-finite `max` drops the
 * scale: the value still prints, the bar does not pretend to place it.
 *
 * Severity is `success | warning | danger` — the shell's status vocabulary (see
 * `severity.ts`), not a private ok/warn/crit dialect.
 */
import type { ReactNode } from 'react';
import { boundOf, resolveSeverity, severityOf, styleForTone, warnOnce, type SeverityTone } from './severity';

export interface MetricBarProps {
  /** Row label — `CPU`, `Memory`, `Disk`. Rendered in a fixed-width column so
   *  a stack of rows aligns. */
  label?: ReactNode;
  /** The measured value. `null` / `undefined` means NO READING — rendered as
   *  unknown, never as 0. */
  value: number | null | undefined;
  /** Value mapped to a full bar. Default 100. Must be a positive finite number:
   *  it is the divisor, so `0`, a negative or `NaN` is not a scale. Given one,
   *  the row prints the value but draws no proportional bar and no ticks —
   *  there is nothing truthful to draw them against. */
  max?: number;
  /** Warning bound, in the same unit as `value`. Inclusive (`>=`). */
  warn?: number | null;
  /** Critical bound, in the same unit as `value`. Inclusive (`>=`). */
  crit?: number | null;
  /** Forces the tone when the caller judges severity itself (e.g. a rollup
   *  served by the backend). Overrides `warn`/`crit` for colour; the ticks
   *  still render wherever `warn`/`crit` say. */
  severity?: SeverityTone;
  /** Trailing secondary text — `10.9 / 16 GiB`, `4 vCPU`. Hidden when there is
   *  no reading, where the row has something more important to say. */
  detail?: ReactNode;
  /** Formats the printed value. Default: one decimal plus `%` on the default
   *  0–100 scale, the bare number on any other `max` (a custom scale is not a
   *  percentage, and printing one would be a lie). */
  formatValue?: (value: number) => string;
  /** Wording for "no reading". Default `no data`. */
  emptyLabel?: string;
  /** `sm` (default) — the compact row that stacks three to a card.
   *  `md` — bigger value type for a standalone stat. Neither draws a frame;
   *  wrap in a `Card` (or your own) if you want one. */
  size?: 'sm' | 'md';
  /** Accessible name for the meter. Defaults to `label` when it's a string. */
  ariaLabel?: string;
  className?: string;
}

/** Ticks come from the caller's numbers — the shell hardcodes no threshold,
 *  not even as a fallback. Mid-greys, deliberately not dark-remapped: they stay
 *  legible on the light (`bg-gray-200`) and dark track alike. */
function Tick({ at, title, className }: { at: number; title: string; className: string }) {
  return (
    <div
      title={title}
      className={`absolute -top-[3px] h-3 w-0.5 rounded-[1px] ${className}`}
      style={{ left: `${at}%` }}
    />
  );
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export default function MetricBar({
  label,
  value,
  max = 100,
  warn,
  crit,
  severity,
  detail,
  formatValue,
  emptyLabel = 'no data',
  size = 'sm',
  ariaLabel,
  className = '',
}: MetricBarProps) {
  // One narrowed reading for the whole component: `null` covers both "not
  // supplied" and NaN/Infinity, which are just as unmeasured.
  const reading = value != null && Number.isFinite(value) ? value : null;
  // The same test applied to the divisor, plus positivity. Anything else is not
  // a smaller scale, it is the absence of one.
  const scale = Number.isFinite(max) && max > 0 ? max : null;
  if (scale == null) {
    warnOnce(
      `MetricBar:max:${String(max)}`,
      `[react-os-shell] MetricBar: max=${String(max)} is not a positive finite number, so there is ` +
        'no scale to draw a proportional bar against. Printing the value without a bar. Pass the real ' +
        'capacity, or leave the reading out entirely (value={null}) when it is unknown — do not pass 0.',
    );
  }
  // A `severity` the caller supplied outranks the bounds. An unrecognised one
  // resolves to a visible "unknown" style rather than to undefined classes.
  const supplied = resolveSeverity(severity, 'MetricBar');
  const paint = reading != null ? (supplied ?? styleForTone(severityOf(reading, warn, crit))) : null;
  // Ticks need a bound the component can actually place, on a scale that exists.
  const warnAt = boundOf(warn);
  const critAt = boundOf(crit);
  // Clamp the BAR only — never the printed number. A probe blipping to 103 %
  // should draw a full bar and still say 103 %.
  const width = reading != null && scale != null ? clampPct((reading / scale) * 100) : 0;
  const format = formatValue ?? ((v: number) => (scale === 100 ? `${v.toFixed(1)}%` : String(v)));
  const printed = reading != null ? format(reading) : '—';
  const showTicks = reading != null && scale != null && (warnAt != null || critAt != null);

  const meterLabel = ariaLabel ?? (typeof label === 'string' ? label : undefined);
  const barHeight = size === 'md' ? 'h-2' : 'h-1.5';
  // It is a meter only when it is actually a meter: a reading, on a scale.
  // `role="meter"` REQUIRES `aria-valuenow` (unlike `progressbar`, it has no
  // indeterminate state), so a roleless track is the honest empty rendering —
  // omitting valuenow under the role would have been a malformed widget whose
  // announcement is undefined, and `aria-valuenow={0}` would have announced a
  // healthy idle box. Either way the row already says "— / no data" in text.
  const isMeter = reading != null && scale != null;

  const bar = (
    <div
      {...(isMeter
        ? {
            role: 'meter' as const,
            'aria-label': meterLabel,
            'aria-valuemin': 0,
            'aria-valuemax': scale,
            // Kept inside the declared range: the bar clamps, and a valuenow
            // past its own valuemax is an invalid widget. `aria-valuetext`
            // still carries the unclamped truth, and takes precedence in the
            // announcement.
            'aria-valuenow': Math.min(scale, Math.max(0, reading)),
            'aria-valuetext': printed,
          }
        : { 'aria-hidden': true as const })}
      className={
        isMeter && paint
          ? `relative mt-2 ${barHeight} rounded-full bg-gray-200`
          // Dashed track: nothing to compare against, nothing to compare, or
          // nothing to compare it on.
          : `relative mt-2 ${barHeight} rounded-full border border-dashed border-gray-300 bg-transparent`
      }
    >
      {isMeter && (
        // Grey when unjudged: the magnitude is real, the verdict is not ours.
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${paint ? paint.fill : 'bg-gray-400'}`}
          style={{ width: `${width}%` }}
        />
      )}
      {showTicks && scale != null && warnAt != null && (
        <Tick at={clampPct((warnAt / scale) * 100)} title={`warning ≥ ${warnAt}`} className="bg-gray-400 opacity-75" />
      )}
      {showTicks && scale != null && critAt != null && (
        <Tick at={clampPct((critAt / scale) * 100)} title={`critical ≥ ${critAt}`} className="bg-gray-500" />
      )}
    </div>
  );

  const valueInk = paint ? paint.ink : reading != null ? 'text-gray-900' : 'text-gray-400';

  if (size === 'md') {
    return (
      <div className={className}>
        {label != null && (
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
        )}
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-2xl font-semibold leading-[30px] tabular-nums ${valueInk}`}>{printed}</span>
          <span className="min-w-0 truncate text-[11px] tabular-nums text-gray-400">
            {reading != null ? detail : emptyLabel}
          </span>
        </div>
        {bar}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-baseline gap-2">
        {label != null && (
          <span className="w-14 shrink-0 truncate text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {label}
          </span>
        )}
        <span className={`text-sm font-semibold tabular-nums ${valueInk}`}>{printed}</span>
        {/* One slot, one question — "what do we know about this number?".
            "No reading" outranks whatever the absolute figure would have said. */}
        <span className="ml-auto min-w-0 truncate text-[10px] tabular-nums text-gray-400">
          {reading != null ? detail : emptyLabel}
        </span>
      </div>
      {bar}
    </div>
  );
}
