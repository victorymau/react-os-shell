import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DAY_MS, toDayMs, fmtSliderDate } from './timelineDates';

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
   *  "not reached yet": the milestone gets NO dot and no coordinate, because
   *  the only coordinate available would be a date nobody recorded. It is
   *  listed as pending in the block at the right edge instead. */
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
   *  `MilestoneTimelineProps.phaseLabels`. Undated milestones take no part:
   *  a bracket spans a range of dates. */
  phase?: string;
}

export interface MilestoneTimelineProps {
  /** Title rendered above the bar — e.g. "Mould Development Timeline". */
  title: string;
  /** Ordered milestones from earliest expected to latest expected. The order
   *  is the order the pending (undated) ones are listed in; the dated ones are
   *  placed by their date. */
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
  /** Outline-only variant — the glyph beside a pending milestone in the list
   *  at the right edge. Nothing outline-shaped sits on the TRACK any more: an
   *  undated milestone has no coordinate to sit at. */
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

// ─── Label lane packing ──────────────────────────────────────────────────────

/** One label's geometry, as `packLabelLanes` needs it. */
export interface LabelLaneItem {
  /** The milestone's `key` — what the answer is keyed by. */
  key: string;
  /** The milestone's date, as epoch ms. */
  ms: number;
  /** The label's rendered width in pixels: measured, or estimated. */
  widthPx: number;
}

/** Where one label ended up: a lane index, or `-1` when no lane could hold it. */
export interface LabelLane {
  key: string;
  lane: number;
}

/**
 * How many lanes the packer may use, tried nearest the bar first and
 * alternating sides: lanes 0 and 2 sit above the bar, 1 and 3 below.
 */
export const LABEL_LANE_COUNT = 4;

/**
 * Assign each label a lane so no two labels sharing a lane overlap.
 *
 * Pure, and exported for its own spec. The arrangement this replaced was
 * `i % 2` — an answer that never looked at how wide a label is or how close two
 * dates are, so eight milestones over 337 days drew four of them on top of each
 * other while every check stayed green.
 *
 * Greedy, left to right: a label takes the FIRST lane whose last occupant ends
 * at least `gapPx` before this label starts. Two labels on the same day
 * therefore always land in different lanes. A label that fits nowhere — every
 * lane still busy at that point, or a label wider than the whole track — gets
 * `-1`, and the caller reveals it on hover instead of overprinting its
 * neighbour.
 *
 * The answer comes back in the order the items arrived, whatever order that is.
 */
export function packLabelLanes(
  items: LabelLaneItem[],
  trackWidthPx: number,
  startMs: number,
  spanMs: number,
  gapPx = 6,
): LabelLane[] {
  const track = trackWidthPx > 0 ? trackWidthPx : 0;
  const span = spanMs > 0 ? spanMs : 1;
  // Chronological, because a greedy pack only works left to right: a lane's
  // occupancy is remembered as ONE right-hand edge, which is the whole truth
  // only while labels arrive in increasing `left`. Ties keep the caller's order
  // so the answer never depends on the sort's internals.
  const chronological = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.ms - b.item.ms) || (a.index - b.index));

  const lastRight = new Array<number>(LABEL_LANE_COUNT).fill(-Infinity);
  const assigned = new Map<string, number>();

  for (const { item } of chronological) {
    const width = Math.max(0, item.widthPx);
    // A label wider than the track it labels has no lane anywhere: placing it
    // would run text off both ends of the bar.
    if (track <= 0 || width > track) {
      assigned.set(item.key, -1);
      continue;
    }
    const centre = ((item.ms - startMs) / span) * track;
    const left = Math.min(Math.max(centre - width / 2, 0), track - width);
    const right = left + width;
    let lane = -1;
    for (let candidate = 0; candidate < LABEL_LANE_COUNT; candidate++) {
      if (left > lastRight[candidate] + gapPx) {
        lastRight[candidate] = right;
        lane = candidate;
        break;
      }
    }
    assigned.set(item.key, lane);
  }

  return items.map((item) => ({ key: item.key, lane: assigned.get(item.key) ?? -1 }));
}

/** Track width assumed before anything has been measured — a server render, or
 *  the first paint before the layout effect runs. */
const FALLBACK_TRACK_PX = 600;

/** How many pending milestones are listed before the rest fold into `+N more`. */
const PENDING_LINE_LIMIT = 3;

/**
 * A label's width before the DOM has been asked.
 *
 * 5.6 px per character is about right for the 10 px face these labels use, and
 * the 8 px is the slack two centred lines leave around the longer one. It only
 * has to be close, because the measured width replaces it one layout effect
 * later. It does have to be DETERMINISTIC, so that a server render and a spec
 * asserting on one agree.
 */
function estimateLabelWidth(label: string, dateText: string): number {
  return Math.max(label.length, dateText.length) * 5.6 + 8;
}

/** Sub-pixel-tolerant compare, so a re-measure that found the same layout does
 *  not set state and re-render for ever. */
function sameWidths(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.5);
}

/**
 * `useLayoutEffect` on the client, `useEffect` where there is no DOM.
 *
 * The measuring pass has to land before paint or the labels visibly reshuffle
 * from the estimate to the measurement. React's server renderer warns about
 * `useLayoutEffect` on EVERY render though, and this component is meant to
 * render to static markup — so pick the hook once, at module scope, where the
 * choice is constant and the hook order comes out identical either way.
 */
const useMeasureEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

// ─── Private render helpers ──────────────────────────────────────────────────

/** A milestone whose date parsed, with its axis coordinate resolved. */
type DatedMilestone = Milestone & { ms: number };

/** Percentage position of `ms` on the axis, clamped to the track. */
function clampedPct(ms: number, startMs: number, span: number): number {
  return Math.max(0, Math.min(100, ((ms - startMs) / span) * 100));
}

/**
 * One row of packed labels, above or below the bar.
 *
 * Rendered only for a lane the packer actually used, so a sparse timeline keeps
 * the short card it has always had instead of reserving four empty rows.
 */
function LaneRow({ items, side, startMs, span, hoveredKey }: {
  items: DatedMilestone[];
  side: 'above' | 'below';
  startMs: number;
  span: number;
  hoveredKey: string | null;
}) {
  return (
    <div className={`relative h-7 ${side === 'above' ? 'mb-1' : 'mt-1'}`}>
      {items.map((m) => {
        const p = ((m.ms - startMs) / span) * 100;
        if (p < -0.5 || p > 100.5) return null;
        const isHovered = m.key === hoveredKey;
        return (
          <div
            key={m.key}
            className={`absolute ${side === 'above' ? 'bottom-0' : 'top-0'} -translate-x-1/2 text-center text-[10px] leading-tight whitespace-nowrap pointer-events-none ${
              isHovered ? 'text-blue-700 font-semibold' : 'text-gray-700'
            }`}
            style={{ left: `${clampedPct(m.ms, startMs, span)}%` }}
          >
            <div>{m.label}</div>
            <div className="text-[9px] text-gray-400 font-normal">{fmtSliderDate(m.ms)}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * An off-layout copy of every lane label, so the packer gets real widths.
 *
 * Every CANDIDATE is measured here, not just the labels currently drawn: a
 * collapsed label is not in the DOM at all, so measuring only what is drawn
 * would leave it collapsed for ever, however wide the card grew.
 */
function MeasuringRow({ items, innerRef }: {
  items: DatedMilestone[];
  innerRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      aria-hidden="true"
      className="absolute left-0 top-0 flex gap-2 invisible pointer-events-none"
    >
      {items.map((m) => (
        <div
          key={m.key}
          data-lane-key={m.key}
          className="shrink-0 text-center text-[10px] leading-tight whitespace-nowrap"
        >
          <div>{m.label}</div>
          <div className="text-[9px] font-normal">{fmtSliderDate(m.ms)}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * The undated milestones, listed where the last label used to sit.
 *
 * A list, not a position: the block at the right edge is the one spot on this
 * card that is not a date coordinate, which is exactly what a milestone with no
 * date needs.
 */
function PendingList({ pending }: { pending: Milestone[] }) {
  const shown = pending.slice(0, PENDING_LINE_LIMIT);
  const rest = pending.slice(PENDING_LINE_LIMIT);
  return (
    <>
      {shown.map((m) => (
        <div key={m.key} className="flex items-center gap-1 text-[10px] italic text-gray-400">
          <span aria-hidden="true" className={`shrink-0 border ${KIND_STYLES[m.kind ?? 'default'].placeholder}`} />
          <span>{m.label}</span>
        </div>
      ))}
      {rest.length > 0 && (
        <div className="text-[10px] italic text-gray-400" title={rest.map((m) => m.label).join(', ')}>
          +{rest.length} more
        </div>
      )}
    </>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Static date-axis bar showing a sequence of milestones along a single line.
 *
 * - No scrubber / playback / interpolation — milestones don't move.
 * - A milestone with no date gets no position, because the only position
 *   available would be a date the record does not have. It is listed as pending
 *   beside the bar instead, and takes no part in the range, the fill, the
 *   lead-time summary or a phase bracket.
 * - The first dated milestone is an inline label on the left. Every other one
 *   is packed into up to four lanes — two above the bar, two below — by its
 *   MEASURED width, so a cluster of same-week milestones stacks instead of
 *   overprinting. A label that fits no lane is collapsed and reveals on hover
 *   or keyboard focus. With nothing pending, the last dated milestone keeps its
 *   inline label on the right.
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
  const trackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [trackWidthPx, setTrackWidthPx] = useState(0);
  const [measuredWidths, setMeasuredWidths] = useState<Record<string, number>>({});

  // Two populations, and they are not the same kind of thing. A dated milestone
  // is a coordinate; an undated one is a fact about what has NOT happened, and
  // putting it on the axis states a date the record never held.
  const dated: DatedMilestone[] = [];
  const pending: Milestone[] = [];
  for (const m of milestones) {
    const ms = toDayMs(m.date ?? null);
    if (ms === null) pending.push(m);
    else dated.push({ ...m, ms });
  }
  // Chronological; `sort` is stable, so a same-day pair keeps the caller's order.
  dated.sort((a, b) => a.ms - b.ms);

  // Date range. The caller can pin the right edge explicitly via `endDate`.
  // Otherwise we fall back to the latest dated milestone, padding to today only
  // when nothing's reached.
  const explicitEnd = toDayMs(endDate ?? null);
  let startMs: number;
  let endMs: number;
  if (dated.length === 0) {
    // Nothing reached yet — show a 30-day window ending at the explicit end (or
    // today), so the axis is still a real axis with nothing on it.
    endMs = explicitEnd ?? today;
    startMs = endMs - 30 * DAY_MS;
  } else {
    startMs = dated[0].ms;
    endMs = explicitEnd ?? dated[dated.length - 1].ms;
    if (endMs - startMs < DAY_MS) endMs = startMs + DAY_MS;
  }
  const span = Math.max(endMs - startMs, DAY_MS);

  // Auto-summarise the bar's lead time so callers don't each have to compute
  // and pass it. Caller-provided `summary` always wins so a more meaningful
  // sub-title can override the default.
  const totalLeadDays = dated.length > 0
    ? Math.max(0, Math.round((endMs - startMs) / DAY_MS))
    : 0;
  const autoSummary = totalLeadDays > 0
    ? `${totalLeadDays.toLocaleString()} day${totalLeadDays === 1 ? '' : 's'} lead time`
    : undefined;
  const renderSummary = summary ?? autoSummary;

  // The right-hand block holds ONE of two things. With nothing pending it is
  // the last dated milestone's inline label, as it always was; with something
  // pending, the pending list takes it and that last label joins the lanes like
  // any other middle one.
  const lastDatedIsEdge = pending.length === 0 && dated.length > 1;
  const leftEdge = dated.length > 0 ? dated[0] : null;
  const rightEdge = lastDatedIsEdge ? dated[dated.length - 1] : null;
  const laneCandidates = dated.slice(1, lastDatedIsEdge ? dated.length - 1 : undefined);

  // Measured widths win; the estimate covers the server render and the first
  // paint. A measurement of zero is not a measurement — a card in a collapsed
  // panel, or a DOM that does no layout — so the estimate holds there too.
  const effectiveTrackPx = trackWidthPx > 0 ? trackWidthPx : FALLBACK_TRACK_PX;
  const laneItems: LabelLaneItem[] = laneCandidates.map((m) => ({
    key: m.key,
    ms: m.ms,
    widthPx: measuredWidths[m.key] || estimateLabelWidth(m.label, fmtSliderDate(m.ms)),
  }));
  const laneByKey = new Map(
    packLabelLanes(laneItems, effectiveTrackPx, startMs, span).map((l) => [l.key, l.lane]),
  );

  // Re-measure when the set of lane labels or their text changes. Joined into a
  // string because the candidate ARRAY is rebuilt on every render.
  const measureSignature = laneCandidates.map((m) => `${m.key} ${m.label} ${m.ms}`).join('|');
  useMeasureEffect(() => {
    const row = measureRef.current;
    if (!row) return;
    const next: Record<string, number> = {};
    for (const child of Array.from(row.children)) {
      const key = (child as HTMLElement).dataset.laneKey;
      const width = child.getBoundingClientRect().width;
      if (key && width > 0) next[key] = width;
    }
    setMeasuredWidths((prev) => (sameWidths(prev, next) ? prev : next));
  }, [measureSignature]);

  // The track's own width is what the percentages map onto, so the packer has
  // to watch it: the same eight milestones fit one lane in a maximised window
  // and four in a side-by-side pane.
  useMeasureEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const read = () => setTrackWidthPx(el.getBoundingClientRect().width);
    read();
    // Guarded: this package renders under jsdom and under the server renderer,
    // and neither is required to have a ResizeObserver.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, []);

  const todayMs = today;

  // Group dated milestones by phase. A phase only renders a bracket when it has
  // 2+ members — a single-member "phase" would just look like a noise glyph
  // under the bar with no parallel work to communicate.
  type Phase = { key: string; label: string; minMs: number; maxMs: number };
  const phases: Phase[] = (() => {
    const groups: Record<string, DatedMilestone[]> = {};
    for (const m of dated) {
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

  const inLane = (lane: number) => laneCandidates.filter((m) => laneByKey.get(m.key) === lane);
  // Farthest-from-the-bar first above, nearest first below, so the DOM order
  // reads top to bottom the way the card does.
  const aboveLanes = [2, 0].map(inLane).filter((items) => items.length > 0);
  const belowLanes = [1, 3].map(inLane).filter((items) => items.length > 0);
  // The one label revealed on hover or focus: a collapsed one, never a drawn
  // one, so a reveal never duplicates a label already on the card.
  const collapsed = laneCandidates.find((m) => m.key === hoveredKey && laneByKey.get(m.key) === -1);

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
          {/* Layout: the first dated milestone renders as an inline label on the
           *  LEFT; the right-hand block holds either the last dated label or the
           *  pending list, both on the same row as the bar so the bar itself can
           *  be a touch shorter. Every other dated label is packed into lanes. */}
          <div className="flex items-center gap-3 px-3 py-3">
            {/* Left edge — first dated milestone, name above its date,
             *  right-aligned so the text hugs the bar. */}
            {leftEdge && (
              <div className="text-[10px] leading-tight whitespace-nowrap text-right shrink-0 pointer-events-none text-gray-700">
                <div className="font-medium">{leftEdge.label}</div>
                <div className="text-[9px] text-gray-400 font-normal">{fmtSliderDate(leftEdge.ms)}</div>
              </div>
            )}
            <div className="relative flex-1 flex flex-col justify-center">
              <MeasuringRow items={laneCandidates} innerRef={measureRef} />

              {aboveLanes.map((items) => (
                <LaneRow
                  key={`above-${items[0].key}`}
                  items={items}
                  side="above"
                  startMs={startMs}
                  span={span}
                  hoveredKey={hoveredKey}
                />
              ))}

              <div ref={trackRef} className="relative h-2 bg-gray-200 rounded-full">
                {/* The collapsed label's reveal. One at a time, above the track,
                 *  on a chip of its own so it reads over whichever lane label it
                 *  lands on. */}
                {collapsed && (
                  <div
                    className="absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap pointer-events-none text-[10px] leading-tight text-center rounded border border-gray-300 bg-white px-1 py-0.5 shadow-sm"
                    style={{ left: `${clampedPct(collapsed.ms, startMs, span)}%` }}
                  >
                    <div className="text-blue-700 font-semibold">{collapsed.label}</div>
                    <div className="text-[9px] text-gray-400 font-normal">{fmtSliderDate(collapsed.ms)}</div>
                  </div>
                )}

                {/* Filled portion = bar start to latest reached milestone,
                 *  but never past today: achieved progress can't run into the
                 *  future, so a projected anchor (an estimated-completion date,
                 *  a future ETA) must not paint the bar as if that point were
                 *  already reached. */}
                {dated.length > 0 && (() => {
                  const lastReal = Math.min(dated[dated.length - 1].ms, todayMs);
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

                {dated.map((m) => {
                  const p = ((m.ms - startMs) / span) * 100;
                  if (p < -0.5 || p > 100.5) return null;
                  const isHovered = m.key === hoveredKey;
                  const style = KIND_STYLES[m.kind ?? 'default'];
                  const dotClass = isHovered ? `${style.base} ${style.active}` : style.base;
                  const Tag = m.onClick ? 'button' : 'div';
                  const reveal = () => setHoveredKey(m.key);
                  const hide = () => setHoveredKey((prev) => (prev === m.key ? null : prev));
                  return (
                    <Tag
                      key={m.key}
                      type={m.onClick ? 'button' : undefined}
                      onMouseEnter={reveal}
                      onMouseLeave={hide}
                      // A collapsed label has to be reachable without a pointer,
                      // and a clickable dot is already a button in the tab order.
                      onFocus={reveal}
                      onBlur={hide}
                      onClick={m.onClick}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 shadow flex items-center justify-center ${dotClass} ${m.onClick ? 'cursor-pointer' : 'cursor-default'}`}
                      style={{ left: `${clampedPct(m.ms, startMs, span)}%` }}
                      aria-label={`${m.label} on ${fmtSliderDate(m.ms)}`}
                      title={`${m.label} • ${fmtSliderDate(m.ms)}${m.detail ? ` — ${m.detail}` : ''}`}
                    >
                      {style.inner}
                    </Tag>
                  );
                })}
              </div>

              {belowLanes.map((items) => (
                <LaneRow
                  key={`below-${items[0].key}`}
                  items={items}
                  side="below"
                  startMs={startMs}
                  span={span}
                  hoveredKey={hoveredKey}
                />
              ))}

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
            {/* Right edge — the last dated milestone's label, or the pending
             *  list when there is one, left-aligned so the text hugs the bar. */}
            {(rightEdge || pending.length > 0) && (
              <div className="text-[10px] leading-tight whitespace-nowrap text-left shrink-0 pointer-events-none">
                {rightEdge && (
                  <div className="text-gray-700">
                    <div className="font-medium">{rightEdge.label}</div>
                    <div className="text-[9px] text-gray-400 font-normal">{fmtSliderDate(rightEdge.ms)}</div>
                  </div>
                )}
                {pending.length > 0 && <PendingList pending={pending} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
