import { useState } from 'react';
import { formatDate } from '../utils/date';

// ─── Pure date helpers ───────────────────────────────────────────────────────

/** Milliseconds in a day — used for axis padding + day-resolution math. */
const DAY_MS = 86400000;

/** Parse an ISO date string to epoch ms, or `null` when absent/unparseable. */
function toDayMs(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Format an epoch-ms value as a short date using the user's date format. */
function fmtSliderDate(ms: number): string {
  return formatDate(new Date(ms).toISOString().slice(0, 10));
}

// ─── Public types ────────────────────────────────────────────────────────────

/** Visual category for a milestone. Drives shape + colour so the user can
 *  tell different milestone types apart at a glance. */
export type MilestoneKind =
  | 'default'    // blue circle — generic / phase start
  | 'dfm'        // amber rounded square — engineering iteration
  | 'shipment'   // emerald diamond — shipment idiom
  | 'testing'    // violet bullseye — mould complete / safety tests
  | 'completion' // green bigger dot — production ready
;

/** A single point on the timeline. Generic, product-agnostic: the consuming
 *  app maps its domain records to this shape in a thin wrapper. */
export interface Milestone {
  /** Stable key — used for React keys and the active-dot lookup. */
  key: string;
  /** Short label rendered above the dot when active / hovered. */
  label: string;
  /** ISO date string (`YYYY-MM-DD`) for the milestone. Null / undefined =
   *  "not reached yet"; renders as a faded outline dot at the *expected*
   *  position (between its neighbours) instead of a real coordinate. */
  date: string | null | undefined;
  /** Optional second line for the hover tooltip. */
  detail?: string;
  /** Optional click handler so the caller can open a related entity. */
  onClick?: () => void;
  /** Optional visual category — defaults to `'default'` (blue circle). */
  kind?: MilestoneKind;
  /** Optional phase grouping — milestones sharing the same `phase` value
   *  render with a bracket below the bar showing they happened in parallel
   *  (e.g. two concurrent QA steps). Lookup the human-readable name from
   *  `MilestoneTimelineProps.phaseLabels`. */
  phase?: string;
}

export interface MilestoneTimelineProps {
  /** Title rendered above the bar — e.g. "Mould Development Timeline". */
  title: string;
  /** Ordered milestones from earliest expected to latest expected. The order
   *  controls the fallback position for milestones with no date yet. */
  milestones: Milestone[];
  /** Optional sub-title to the right of the title (e.g. lead-time summary).
   *  When omitted, an auto lead-time summary is computed from the dates. */
  summary?: string;
  /** Optional explicit right edge — when provided, the bar always ends here
   *  rather than padding to today. Used when the axis should stop at a known
   *  final milestone and not run on past it. */
  endDate?: string | null;
  /** Maps `Milestone.phase` keys to the human-readable phase label that
   *  appears under the bracket — e.g. `{ qa: 'QA & Sample' }`. Phases
   *  without an entry fall back to the phase key itself. */
  phaseLabels?: Record<string, string>;
}

// Visual style map for milestone kinds. Centralised so caller intent
// (kind: 'shipment') maps to the same shape + colour everywhere.
interface KindStyle {
  /** Tailwind classes for size, shape, and base colour. */
  base: string;
  /** Hover/active variant. */
  active: string;
  /** Outline-only variant for placeholders (not yet reached). */
  placeholder: string;
  /** Optional inner content (e.g. centre dot, checkmark) rendered inside the
   *  marker. Lets us put a target ring inside a violet circle, etc. */
  inner?: React.ReactNode;
}
const KIND_STYLES: Record<MilestoneKind, KindStyle> = {
  default: {
    base: 'h-2.5 w-2.5 rounded-full bg-blue-500 border-white',
    active: 'bg-blue-700',
    placeholder: 'h-2.5 w-2.5 rounded-full bg-white border-gray-300 hover:border-gray-500',
  },
  dfm: {
    base: 'h-2.5 w-2.5 rounded-sm bg-amber-500 border-white',
    active: 'bg-amber-600',
    placeholder: 'h-2.5 w-2.5 rounded-sm bg-white border-amber-300 hover:border-amber-500',
  },
  shipment: {
    base: 'h-2.5 w-2.5 rotate-45 bg-emerald-500 border-white',
    active: 'bg-emerald-600',
    placeholder: 'h-2.5 w-2.5 rotate-45 bg-white border-emerald-300 hover:border-emerald-500',
  },
  testing: {
    base: 'h-3 w-3 rounded-full bg-violet-500 border-white',
    active: 'bg-violet-700',
    placeholder: 'h-3 w-3 rounded-full bg-white border-violet-300 hover:border-violet-500',
    inner: <span className="block h-1 w-1 rounded-full bg-white" />,
  },
  completion: {
    base: 'h-3.5 w-3.5 rounded-full bg-green-600 border-white',
    active: 'bg-green-700',
    placeholder: 'h-3.5 w-3.5 rounded-full bg-white border-green-300 hover:border-green-500',
    inner: (
      <svg className="h-2 w-2 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Static date-axis bar showing a sequence of milestones along a single line.
 *
 * - No scrubber / playback / interpolation — milestones don't move.
 * - "Not reached yet" milestones (no date) render as outline dots wedged at
 *   their expected position so the user can see what's still pending.
 * - First / last milestones render as inline edge labels; middle ones stagger
 *   above/below the bar so adjacent labels never collide.
 * - Milestones sharing a `phase` (2+ members) get a bracket marking parallel
 *   work. The filled portion of the bar never runs past today.
 *
 * Product-agnostic: it takes generic `Milestone` data as props. Map your
 * domain records to the `Milestone` shape in a thin wrapper at the call site.
 */
export default function MilestoneTimeline({ title, milestones, summary, endDate, phaseLabels }: MilestoneTimelineProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  // Captured once at mount so render stays idempotent — day-resolution markers
  // don't care that "today" doesn't tick while the view is open.
  const [today] = useState(() => Date.now());

  // Date range. The caller can pin the right edge explicitly via `endDate`.
  // Otherwise we fall back to the latest filled milestone, padding to today
  // only when nothing's reached.
  const realDates = milestones
    .map((m) => toDayMs(m.date ?? null))
    .filter((t): t is number => t !== null);
  const explicitEnd = toDayMs(endDate ?? null);
  let startMs: number;
  let endMs: number;
  if (realDates.length === 0) {
    // Nothing reached yet — show a 30-day window ending at the explicit end
    // (or today) so the outline dots line up evenly across a real axis.
    endMs = explicitEnd ?? today;
    startMs = endMs - 30 * DAY_MS;
  } else {
    startMs = Math.min(...realDates);
    endMs = explicitEnd ?? Math.max(...realDates);
    if (endMs - startMs < DAY_MS) endMs = startMs + DAY_MS;
  }
  const span = Math.max(endMs - startMs, DAY_MS);

  // Auto-summarise the bar's lead time so callers don't each have to compute
  // and pass it. Caller-provided `summary` always wins so a more meaningful
  // sub-title can override the default.
  const totalLeadDays = realDates.length > 0
    ? Math.max(0, Math.round((endMs - startMs) / DAY_MS))
    : 0;
  const autoSummary = totalLeadDays > 0
    ? `${totalLeadDays.toLocaleString()} day${totalLeadDays === 1 ? '' : 's'} lead time`
    : undefined;
  const renderSummary = summary ?? autoSummary;

  // Compute the rendered position for every milestone. Real dates pin to
  // their actual day; missing dates get a fallback position interpolated
  // between their nearest filled neighbours so they stay in chronological
  // order on the bar.
  type Placed = Milestone & { ms: number; isPlaceholder: boolean };
  const placed: Placed[] = milestones.map((m, i) => {
    const ms = toDayMs(m.date ?? null);
    if (ms !== null) return { ...m, ms, isPlaceholder: false };

    // Look left for the most recent real date and right for the next one.
    let prevMs: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const v = toDayMs(milestones[j].date ?? null);
      if (v !== null) { prevMs = v; break; }
    }
    let nextMs: number | null = null;
    for (let j = i + 1; j < milestones.length; j++) {
      const v = toDayMs(milestones[j].date ?? null);
      if (v !== null) { nextMs = v; break; }
    }
    let fallback: number;
    if (prevMs !== null && nextMs !== null) fallback = (prevMs + nextMs) / 2;
    else if (prevMs !== null) fallback = Math.min(prevMs + DAY_MS, endMs);
    else if (nextMs !== null) fallback = Math.max(nextMs - DAY_MS, startMs);
    else fallback = startMs + (span * (i + 1)) / (milestones.length + 1);
    return { ...m, ms: fallback, isPlaceholder: true };
  });

  const todayMs = today;

  // Group placed milestones by phase. A phase only renders a bracket when
  // it has 2+ members — a single-member "phase" would just look like a noise
  // glyph under the bar with no parallel work to communicate.
  type Phase = { key: string; label: string; minMs: number; maxMs: number };
  const phases: Phase[] = (() => {
    const groups: Record<string, Placed[]> = {};
    for (const m of placed) {
      if (!m.phase) continue;
      (groups[m.phase] = groups[m.phase] || []).push(m);
    }
    return Object.entries(groups)
      .filter(([, ms]) => ms.length >= 2)
      .map(([key, ms]) => ({
        key,
        label: phaseLabels?.[key] ?? key,
        minMs: Math.min(...ms.map((m) => m.ms)),
        maxMs: Math.max(...ms.map((m) => m.ms)),
      }));
  })();

  return (
    <div className="shrink-0">
      <div className="flex items-end justify-between mb-1 gap-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {title}
          {renderSummary && <span className="ml-2 text-gray-400 normal-case">{renderSummary}</span>}
        </h4>
      </div>
      <div className="border border-gray-200 rounded-lg bg-gray-50">
        <div className="select-none">
          {/* Layout: first milestone renders as an inline label on the LEFT,
           *  last milestone as an inline label on the RIGHT, both on the
           *  same row as the bar so the bar itself can be a touch shorter.
           *  Middle milestones still render staggered above/below. */}
          <div className="flex items-center gap-3 px-3 py-3">
            {/* Left edge — first milestone, name above its date, right-aligned
             *  so the text hugs the bar. */}
            {placed.length > 0 && (() => {
              const m = placed[0];
              return (
                <div className={`text-[10px] leading-tight whitespace-nowrap text-right shrink-0 pointer-events-none ${
                  m.isPlaceholder ? 'text-gray-400 italic' : 'text-gray-700'
                }`}>
                  <div className="font-medium">{m.label}</div>
                  {!m.isPlaceholder && (
                    <div className="text-[9px] text-gray-400 font-normal">{fmtSliderDate(m.ms)}</div>
                  )}
                </div>
              );
            })()}
            <div className="relative flex-1 flex flex-col justify-center">
              {/* Lane above the bar — even-indexed middle milestones render
               *  here. The first / last milestones are inline edge labels. */}
              <div className="relative h-7 mb-1">
                {placed.map((m, i) => {
                  if (i === 0 || i === placed.length - 1) return null;
                  if (i % 2 !== 0) return null;
                  const p = ((m.ms - startMs) / span) * 100;
                  if (p < -0.5 || p > 100.5) return null;
                  const isHovered = m.key === hoveredKey;
                  return (
                    <div
                      key={`above-${m.key}`}
                      className={`absolute bottom-0 -translate-x-1/2 text-center text-[10px] leading-tight whitespace-nowrap pointer-events-none ${
                        m.isPlaceholder
                          ? 'text-gray-400 italic'
                          : isHovered ? 'text-blue-700 font-semibold' : 'text-gray-700'
                      }`}
                      style={{ left: `${Math.max(0, Math.min(100, p))}%` }}
                    >
                      <div>{m.label}</div>
                      {!m.isPlaceholder && (
                        <div className="text-[9px] text-gray-400 font-normal">{fmtSliderDate(m.ms)}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="relative h-2 bg-gray-200 rounded-full">
                {/* Filled portion = bar start to latest reached milestone,
                 *  but never past today: achieved progress can't run into the
                 *  future, so a projected anchor (an estimated-completion date,
                 *  a future ETA) must not paint the bar as if that point were
                 *  already reached. */}
                {realDates.length > 0 && (() => {
                  const lastReal = Math.min(Math.max(...realDates), todayMs);
                  const fillPct = ((lastReal - startMs) / span) * 100;
                  return (
                    <div className="absolute top-0 left-0 h-full bg-blue-300 rounded-full pointer-events-none"
                      style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }} />
                  );
                })()}

                {todayMs > startMs && todayMs < endMs && (
                  <div className="absolute -top-1 h-4 w-px bg-gray-400 pointer-events-none"
                    style={{ left: `${((todayMs - startMs) / span) * 100}%` }}
                    title={`Today — ${fmtSliderDate(todayMs)}`} />
                )}

                {placed.map((m) => {
                  const p = ((m.ms - startMs) / span) * 100;
                  if (p < -0.5 || p > 100.5) return null;
                  const isHovered = m.key === hoveredKey;
                  const style = KIND_STYLES[m.kind ?? 'default'];
                  // Pick the right colour variant: placeholder (outline) when
                  // not reached, hover/active variant when hovered, base
                  // otherwise. Shape comes from style.base in all cases.
                  const dotClass = m.isPlaceholder
                    ? style.placeholder
                    : isHovered ? `${style.base} ${style.active}` : style.base;
                  const Tag = m.onClick ? 'button' : 'div';
                  return (
                    <Tag
                      key={m.key}
                      type={m.onClick ? 'button' : undefined}
                      onMouseEnter={() => setHoveredKey(m.key)}
                      onMouseLeave={() => setHoveredKey((prev) => (prev === m.key ? null : prev))}
                      onClick={m.onClick}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 shadow flex items-center justify-center ${dotClass} ${m.onClick ? 'cursor-pointer' : 'cursor-default'}`}
                      style={{ left: `${Math.max(0, Math.min(100, p))}%` }}
                      aria-label={`${m.label}${m.isPlaceholder ? ' (not reached yet)' : ` on ${fmtSliderDate(m.ms)}`}`}
                      title={`${m.label}${m.isPlaceholder ? ' — not reached yet' : ` • ${fmtSliderDate(m.ms)}`}${m.detail ? ` — ${m.detail}` : ''}`}
                    >
                      {!m.isPlaceholder && style.inner}
                    </Tag>
                  );
                })}
              </div>

              {/* Lane below the bar — odd-indexed middle milestones only. */}
              <div className="relative h-7 mt-1">
                {placed.map((m, i) => {
                  if (i === 0 || i === placed.length - 1) return null;
                  if (i % 2 === 0) return null;
                  const p = ((m.ms - startMs) / span) * 100;
                  if (p < -0.5 || p > 100.5) return null;
                  const isHovered = m.key === hoveredKey;
                  return (
                    <div
                      key={`below-${m.key}`}
                      className={`absolute top-0 -translate-x-1/2 text-center text-[10px] leading-tight whitespace-nowrap pointer-events-none ${
                        m.isPlaceholder
                          ? 'text-gray-400 italic'
                          : isHovered ? 'text-blue-700 font-semibold' : 'text-gray-700'
                      }`}
                      style={{ left: `${Math.max(0, Math.min(100, p))}%` }}
                    >
                      <div>{m.label}</div>
                      {!m.isPlaceholder && (
                        <div className="text-[9px] text-gray-400 font-normal">{fmtSliderDate(m.ms)}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Phase brackets — one per group of milestones sharing a
               *  `phase` value. Sits below the below-labels so the bracket
               *  naturally hangs off the timeline pointing at the dots
               *  it groups. The 3-sided box (top open, sides + bottom) is
               *  the standard "this range is a phase" idiom. */}
              {phases.length > 0 && (
                <div className="relative h-5 mt-2">
                  {phases.map((ph) => {
                    const leftPct = Math.max(0, ((ph.minMs - startMs) / span) * 100);
                    const rightPct = Math.min(100, ((ph.maxMs - startMs) / span) * 100);
                    const widthPct = Math.max(rightPct - leftPct, 0.5);
                    const centerPct = leftPct + widthPct / 2;
                    return (
                      <div key={`phase-${ph.key}`}>
                        <div
                          className="absolute border-l border-r border-b border-slate-300 rounded-b-md pointer-events-none"
                          style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: 0, height: 8 }}
                        />
                        <div
                          className="absolute -translate-x-1/2 text-[9px] italic text-slate-500 whitespace-nowrap pointer-events-none"
                          style={{ left: `${centerPct}%`, top: 9 }}
                        >
                          {ph.label} <span className="text-slate-400 not-italic">· parallel</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Right edge — last milestone, name above its date, left-aligned
             *  so the text hugs the bar. */}
            {placed.length > 1 && (() => {
              const m = placed[placed.length - 1];
              return (
                <div className={`text-[10px] leading-tight whitespace-nowrap text-left shrink-0 pointer-events-none ${
                  m.isPlaceholder ? 'text-gray-400 italic' : 'text-gray-700'
                }`}>
                  <div className="font-medium">{m.label}</div>
                  {!m.isPlaceholder && (
                    <div className="text-[9px] text-gray-400 font-normal">{fmtSliderDate(m.ms)}</div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
