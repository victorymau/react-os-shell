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
 * Severity is `success | warning | danger` — the shell's status vocabulary (see
 * `severity.ts`), not a private ok/warn/crit dialect.
 */
import type { ReactNode } from 'react';
import { SEVERITY_FILL, SEVERITY_INK, severityOf, type SeverityTone } from './severity';

export interface MetricBarProps {
  /** Row label — `CPU`, `Memory`, `Disk`. Rendered in a fixed-width column so
   *  a stack of rows aligns. */
  label?: ReactNode;
  /** The measured value. `null` / `undefined` means NO READING — rendered as
   *  unknown, never as 0. */
  value: number | null | undefined;
  /** Value mapped to a full bar. Default 100. */
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
  const tone = reading != null ? (severity ?? severityOf(reading, warn, crit)) : null;
  // Clamp the BAR only — never the printed number. A probe blipping to 103 %
  // should draw a full bar and still say 103 %.
  const width = reading != null ? clampPct((reading / max) * 100) : 0;
  const format = formatValue ?? ((v: number) => (max === 100 ? `${v.toFixed(1)}%` : String(v)));
  const printed = reading != null ? format(reading) : '—';
  const showTicks = reading != null && (warn != null || crit != null);

  const meterLabel = ariaLabel ?? (typeof label === 'string' ? label : undefined);
  const barHeight = size === 'md' ? 'h-2' : 'h-1.5';

  const bar = (
    <div
      role="meter"
      aria-label={meterLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      // Omitted when there is no reading — an indeterminate meter, which is
      // exactly the fact. `aria-valuenow={0}` would announce a healthy zero.
      aria-valuenow={reading ?? undefined}
      aria-valuetext={reading != null ? printed : emptyLabel}
      className={
        reading != null && tone
          ? `relative mt-2 ${barHeight} rounded-full bg-gray-200`
          // Dashed track: nothing to compare against, or nothing to compare.
          : `relative mt-2 ${barHeight} rounded-full border border-dashed border-gray-300 bg-transparent`
      }
    >
      {reading != null && (
        // Grey when unjudged: the magnitude is real, the verdict is not ours.
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${tone ? SEVERITY_FILL[tone] : 'bg-gray-400'}`}
          style={{ width: `${width}%` }}
        />
      )}
      {showTicks && warn != null && (
        <Tick at={clampPct((warn / max) * 100)} title={`warning ≥ ${warn}`} className="bg-gray-400 opacity-75" />
      )}
      {showTicks && crit != null && (
        <Tick at={clampPct((crit / max) * 100)} title={`critical ≥ ${crit}`} className="bg-gray-500" />
      )}
    </div>
  );

  const valueInk = tone ? SEVERITY_INK[tone] : reading != null ? 'text-gray-900' : 'text-gray-400';

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
