/**
 * BudgetBar — how much of a run's wall clock is gone.
 *
 * An autonomous run is killed by a clock, not finished by one: 3600 seconds for
 * a run that changes code, 1800 for a read. So the honest reading is BUDGET
 * CONSUMED, never work done — nothing here knows how much of the task is left,
 * and a bar that implied it would be the most confident lie on the screen. The
 * printed figure is a percentage of the budget and the wording says so.
 *
 * `MetricBar` is the sibling to read first; this one keeps its contract that a
 * `null` is NO READING and never a zero, and adds the two facts a deadline has
 * that a gauge does not: a run can go PAST its allowance, and a run can have no
 * allowance at all.
 *
 * ── The three states a glance has to separate ──
 *
 *   within budget   a solid fill on a solid track. The ordinary case.
 *
 *   past the deadline, inside the reaper's grace
 *                   a HATCHED band. Not a longer solid bar: a solid bar at
 *                   full width is the calm "finished" shape, and this is its
 *                   opposite. The texture survives a glance, a greyscale
 *                   screenshot and a colour-blind reader, none of which a
 *                   change of hue alone does. When a `grace` is given the track
 *                   spans budget + grace, so the bar is only FULL when the
 *                   reaper is actually due, and a deadline marker sits where
 *                   the budget ran out.
 *
 *   no estimate at all
 *                   NO BAR. Not a zero-width one, not an empty track — a run
 *                   whose budget nobody knows has no proportion to draw, and
 *                   drawing the track anyway invites the reader to measure the
 *                   emptiness. The elapsed time still prints, because that part
 *                   IS known.
 *
 * A fourth, from `MetricBar`'s contract: no reading of `elapsed` prints an em
 * dash and draws nothing. `elapsed={0}` is a reading — a run that just started
 * — and renders a real meter at zero. The two must not look alike.
 *
 * ── Overrun with no grace ──
 * Past the deadline with no `grace` supplied there is no scale for the
 * overrun: the component knows the run is over and cannot know how far the
 * reaper will let it go. It paints the whole track hatched and marks nothing,
 * which claims exactly what is known — "past the deadline, magnitude unscaled"
 * — and leaves the magnitude to the printed figure. This is `MetricBar`'s
 * non-positive `max` reasoning applied to the other end of the bar: with no
 * divisor, no proportional claim.
 */
import type { ReactNode } from 'react';

/** What the numbers say, before anything is drawn. Exported because a run LIST
 *  needs the same verdict to sort and filter by, and re-deriving it at the call
 *  site is how two surfaces start disagreeing about which runs are late. */
export type BudgetState = 'no-reading' | 'no-budget' | 'within' | 'over';

export interface BudgetBarProps {
  /** Row label — `Run 41c2`, `Nightly sweep`. */
  label?: ReactNode;
  /** Seconds consumed. `null` / `undefined` / non-finite means NO READING —
   *  rendered as unknown, never as 0. Negative is not a reading either. */
  elapsed: number | null | undefined;
  /** The wall clock the run is allowed, in seconds. Must be positive and
   *  finite; anything else is NO ESTIMATE and draws no bar at all. */
  budget?: number | null;
  /** Seconds past the budget the reaper tolerates before it kills the run.
   *  Given one, the track spans `budget + grace` and the overrun is drawn to
   *  scale; without one the overrun is drawn as unscaled. */
  grace?: number | null;
  /** Trailing secondary text. Defaults to `elapsed / budget` as durations. */
  detail?: ReactNode;
  /** Formats a duration in seconds. Default: `1h 0m` / `12m 30s` / `45s`. */
  formatDuration?: (seconds: number) => string;
  /** Wording for "no reading". */
  emptyLabel?: string;
  /** Wording for a run with no budget. */
  noBudgetLabel?: string;
  /** `sm` (default) — the compact row that stacks in a run list.
   *  `md` — bigger figure for a single run's header. */
  size?: 'sm' | 'md';
  /** Accessible name for the meter. Defaults to `label` when it's a string. */
  ariaLabel?: string;
  className?: string;
}

/** A number this component can actually use, or `null`. */
function reading(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The verdict on a pair of numbers. Same rules the component draws by, so a
 * list that colours its rows and the bar inside a row cannot disagree.
 */
export function budgetState(
  elapsed: number | null | undefined,
  budget: number | null | undefined,
): BudgetState {
  const spent = reading(elapsed);
  if (spent == null) return 'no-reading';
  const allowed = reading(budget);
  if (allowed == null || allowed === 0) return 'no-budget';
  return spent > allowed ? 'over' : 'within';
}

/** `1h 0m`, `12m 30s`, `45s`. Whole seconds — a wall clock in hours does not
 *  need milliseconds, and a jittering final digit reads as instability. */
function defaultDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export default function BudgetBar({
  label,
  elapsed,
  budget,
  grace,
  detail,
  formatDuration = defaultDuration,
  emptyLabel = 'no reading',
  noBudgetLabel = 'no budget',
  size = 'sm',
  ariaLabel,
  className = '',
}: BudgetBarProps) {
  const spent = reading(elapsed);
  const allowed = reading(budget);
  const budgetAt = allowed != null && allowed > 0 ? allowed : null;
  // A non-positive or absent grace is not a shorter grace, it is the absence
  // of one — the same distinction `budget` gets.
  const graceAt = reading(grace) ?? 0;
  const state = budgetState(elapsed, budget);
  const over = state === 'over';

  // The track spans the reaper's whole window. The PRINTED figure stays a
  // percentage of the budget: the number answers "how much of my allowance is
  // gone", the picture answers "how much room is left before I am killed", and
  // the deadline marker is where the two meet.
  const span = budgetAt != null ? budgetAt + graceAt : null;
  const deadlineAt = budgetAt != null && span != null ? clampPct((budgetAt / span) * 100) : null;
  // Overrun to scale needs a grace; without one there is no divisor for it.
  const scaledOverrun = over && graceAt > 0;

  const solidWidth =
    span == null || spent == null ? 0 : over ? (scaledOverrun ? (deadlineAt ?? 0) : 0) : clampPct((spent / span) * 100);
  const hatchStart = scaledOverrun ? (deadlineAt ?? 0) : 0;
  const hatchEnd = !over ? 0 : scaledOverrun && span != null && spent != null ? clampPct((spent / span) * 100) : 100;
  const hatchWidth = Math.max(0, hatchEnd - hatchStart);

  const percent = spent != null && budgetAt != null ? (spent / budgetAt) * 100 : null;
  const printed = percent != null ? `${Math.round(percent)}%` : spent != null ? formatDuration(spent) : '—';
  const trailing =
    detail ??
    (spent == null
      ? emptyLabel
      : budgetAt == null
        ? noBudgetLabel
        : `${formatDuration(spent)} / ${formatDuration(budgetAt)}`);

  const meterLabel = ariaLabel ?? (typeof label === 'string' ? label : undefined);
  const barHeight = size === 'md' ? 'h-2' : 'h-1.5';
  // A bar exists only when there is a proportion to draw: a reading, on a
  // budget. `role="meter"` requires `aria-valuenow`, so there is no honest
  // roleless-but-present rendering to fall back to — and unlike `MetricBar`,
  // which draws a dashed track for a missing reading, an unbudgeted run gets
  // nothing at all. There is no scale for a reader to measure the emptiness
  // against, so the track would be furniture pretending to be information.
  const hasBar = spent != null && budgetAt != null && span != null;

  // A run past its deadline is the one thing on this row worth colouring. An
  // elapsed time with no budget is a real magnitude with no verdict on it, so
  // it keeps the ordinary ink; only a missing reading goes faint.
  const valueInk = over ? 'text-red-600' : spent != null ? 'text-gray-900' : 'text-gray-400';

  const bar = hasBar ? (
    <div
      role="meter"
      aria-label={meterLabel}
      aria-valuemin={0}
      aria-valuemax={span}
      // Inside the declared range: the bar clamps and a valuenow past its own
      // valuemax is an invalid widget. `aria-valuetext` carries the unclamped
      // truth and takes precedence in the announcement.
      aria-valuenow={Math.min(span, spent)}
      aria-valuetext={`${printed} of budget`}
      className={`relative mt-2 ${barHeight} overflow-hidden rounded-full bg-gray-200`}
    >
      {/* Rendered even at 0%: a run that started a second ago IS a reading, and
          the empty bar is the picture of it. The state that draws nothing is
          the one with no reading, and that one draws no track either. */}
      {!over && (
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-600"
          style={{ width: `${solidWidth}%` }}
        />
      )}
      {hatchWidth > 0 && (
        <div
          className="rosh-budget-overrun absolute inset-y-0"
          style={{ left: `${hatchStart}%`, width: `${hatchWidth}%` }}
        />
      )}
      {/* Marked whenever the track runs past it — which is exactly when a
          grace was given. With no grace the deadline IS the end of the track,
          and a marker there is a line drawn on the border. */}
      {graceAt > 0 && deadlineAt != null && (
        <div
          title="budget"
          className="absolute inset-y-0 w-0.5 bg-gray-700"
          style={{ left: `${deadlineAt}%` }}
        />
      )}
    </div>
  ) : null;

  if (size === 'md') {
    return (
      <div className={className}>
        {label != null && (
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
        )}
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-2xl font-semibold leading-[30px] tabular-nums ${valueInk}`}>{printed}</span>
          <span className="min-w-0 truncate text-[11px] tabular-nums text-gray-400">{trailing}</span>
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
        <span className="ml-auto min-w-0 truncate text-[10px] tabular-nums text-gray-400">{trailing}</span>
      </div>
      {bar}
    </div>
  );
}
