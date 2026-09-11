import { useState, type ReactNode } from 'react';
import { DAY_MS, fmtSliderDate, toDayMs } from './timelineDates';
import TimelineCard from './TimelineCard';
import { TimelineMilestoneIcon, type TimelineGlyphName } from './timelineGlyphs';
import TimelineTrack, {
  type TimelineTrackItem, type TimelineTrackKind, type TimelineTrackPending, type TimelineTrackPhase,
} from './TimelineTrack';

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Visual category for a milestone. Drives shape + colour so the user can tell
 * different milestone types apart at a glance.
 *
 * Derived from `TimelineTrackKind` rather than written out again: the two lists
 * differ only by the kinds a production bar has and a milestone cannot be
 * (`report`, `inspection`), and a second copy is where a kind added to one and
 * not the other goes to hide.
 */
export type MilestoneKind = Exclude<TimelineTrackKind, 'report' | 'inspection'>;

/** A single point on the timeline. Generic, product-agnostic: the consuming
 *  app maps its domain records to this shape in a thin wrapper. */
export interface Milestone {
  /** Stable key — used for React keys and the active-dot lookup. */
  key: string;
  /** Short label rendered in a lane beside the dot. */
  label: string;
  /** ISO date string (`YYYY-MM-DD`) for the milestone. Null / undefined =
   *  "not reached yet": the milestone gets NO dot and no coordinate, because
   *  the only coordinate available would be a date nobody recorded. It is
   *  listed as pending in the block beside the bar instead. */
  date: string | null | undefined;
  /** Optional second line for the hover tooltip. */
  detail?: string;
  /** Optional click handler so the caller can open a related entity. */
  onClick?: () => void;
  /**
   * Opens the DOCUMENT behind the milestone — the drawing, the mould record,
   * the goods issue — as opposed to selecting it on the bar. When set, the
   * popover's "Open" button fires this; a card that only ever had `onClick`
   * keeps working, because the button falls back to it.
   */
  onOpen?: () => void;
  /** Optional visual category — defaults to `'default'`. */
  kind?: MilestoneKind;
  /**
   * Which glyph sits inside the dot. Defaults by kind (dfm → a document,
   * testing → a flask, completion → a check, shipment → a diamond with no
   * glyph), and the FIRST dated milestone gets a flag when it asks for nothing
   * else. `'none'` draws a bare dot.
   *
   * It exists because the milestone spec's kinds and the reader's eye do not
   * line up everywhere: "DFM Confirmed" is a `default` milestone in the spec
   * and a signed drawing to the reader, so the portal sets `glyph: 'doc'` and
   * gets the amber document the prototype drew.
   */
  glyph?: TimelineGlyphName | 'none';
  /**
   * Rich content for the hover/focus popover — a drawing's version and feedback
   * date, a shipment's goods-issue number. Falls back to label · date · detail.
   *
   * The popover has ALREADY drawn the milestone's label and its date line above
   * this, so a preview that opens with either of them says it twice.
   */
  preview?: ReactNode;
  /** Optional phase grouping — milestones sharing the same `phase` value
   *  render with a bracket below the bar showing they happened in parallel
   *  (e.g. two concurrent QA steps). Lookup the human-readable name from
   *  `MilestoneTimelineProps.phaseLabels`. Undated milestones take no part:
   *  a bracket spans a range of dates. */
  phase?: string;
}

export interface MilestoneTimelineProps {
  /** Title rendered above the bar — e.g. "Mould Development Timeline". Used as
   *  the heading when `heading` is not given, and as the accessible name of the
   *  track either way. */
  title: string;
  /** The card's heading, in sentence case — "Mould development". Splitting it
   *  from `subject` is what lets the reference number carry the weight in the
   *  meta line instead of being buried in a sentence. */
  heading?: string;
  /** The record the card is about — `001F/1813`, `SO#35489`. First in the meta
   *  line, a shade heavier than the facts after it. */
  subject?: ReactNode;
  /** Ordered milestones from earliest expected to latest expected. The order
   *  is the order the pending (undated) ones are listed in; the dated ones are
   *  placed by their date. */
  milestones: Milestone[];
  /** Overrides the duration fact in the meta line (e.g. "On track — delivery
   *  expected late June"). When omitted, the window's length in days is used. */
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

/**
 * A DFM revision is a step in a conversation; a completion, a shipment or a test
 * is the fact the reader opened the card for.
 *
 * `TimelineTrack` reads this one number twice — for the lane a label claims, and
 * for whether the dot is an ordinary one that may fold into a `×N` pill. Four
 * revisions inside a fortnight used to claim every lane by being earlier than
 * the two milestones that settled anything; now they collapse to `DFM ×4` and
 * the two milestones keep their labels.
 */
const milestonePriority = (kind: MilestoneKind | undefined) => (kind === 'dfm' ? 1 : 0);

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Static date-axis bar showing a sequence of milestones along a single line.
 *
 * A thin domain wrapper over `TimelineTrack`: this component knows what a
 * milestone is — which kinds exist, which of them settle something, what a phase
 * means, how the window is chosen — and the track knows how to draw a time axis.
 * The production-progress scrubber is the same track with a thumb and a
 * different label strategy, which is what makes the two cards look and move
 * alike rather than merely similar.
 *
 * - No scrubber / playback / interpolation — milestones do not move.
 * - A milestone with no date gets no position, because the only position
 *   available would be a date the record does not have. It is listed as pending
 *   beside the bar instead, and takes no part in the range, the fill, the
 *   lead-time summary or a phase bracket.
 * - The axis is piecewise linear: each stretch between two dated milestones gets
 *   at least 48 px, so a week between two dates is still two dates, and at most
 *   30% of the track, so ten idle months cannot own the bar and squeeze every
 *   real date into the first sixth of it. A stretch the ceiling cut carries a
 *   break glyph saying how many days it hides.
 * - Labels are packed into two lanes by their MEASURED width, and a run of
 *   same-kind revisions folds into one `×N` pill whose members keep their dots.
 * - Milestones sharing a `phase` (2+ members) get a bracket marking parallel
 *   work. The filled portion of the bar never runs past today.
 *
 * Product-agnostic: it takes generic `Milestone` data as props. Map your
 * domain records to the `Milestone` shape in a thin wrapper at the call site.
 */
export default function MilestoneTimeline({
  title, heading, subject, milestones, summary, endDate, phaseLabels,
}: MilestoneTimelineProps) {
  // Captured once at mount so render stays idempotent — day-resolution markers
  // don't care that "today" doesn't tick while the view is open.
  const [today] = useState(() => Date.now());

  // Two populations, and they are not the same kind of thing. A dated milestone
  // is a coordinate; an undated one is a fact about what has NOT happened, and
  // putting it on the axis states a date the record never held.
  const dated: (Milestone & { ms: number })[] = [];
  const pending: TimelineTrackPending[] = [];
  for (const m of milestones) {
    const ms = toDayMs(m.date ?? null);
    if (ms === null) pending.push({ key: m.key, label: m.label, kind: m.kind });
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

  // The card's facts, in the order a reader scans them: when it started, how
  // long it has run, and how far through the programme it is. Caller-provided
  // `summary` replaces the duration so a more meaningful sentence can take its
  // place; the other two are derived and never wrong.
  const totalLeadDays = dated.length > 0 ? Math.max(0, Math.round((endMs - startMs) / DAY_MS)) : 0;
  const duration = summary
    ?? (totalLeadDays > 0 ? `${totalLeadDays.toLocaleString()} day${totalLeadDays === 1 ? '' : 's'}` : undefined);
  const meta = [
    dated.length > 0 ? `started ${fmtSliderDate(dated[0].ms)}` : undefined,
    duration,
    // Only where something HAS not happened: "7 of 7 milestones" is a count of
    // nothing, and the reader can see the dots.
    pending.length > 0 ? `${dated.length} of ${milestones.length} milestones` : undefined,
  ];

  const items: TimelineTrackItem[] = dated.map((m) => ({
    key: m.key,
    ms: m.ms,
    kind: m.kind,
    label: m.label,
    detail: m.detail,
    preview: m.preview,
    glyph: m.glyph,
    onClick: m.onClick,
    onOpen: m.onOpen,
    priority: milestonePriority(m.kind),
  }));

  // A phase only renders a bracket when it has 2+ members — a single-member
  // "phase" would just be a noise glyph under the bar with no parallel work to
  // communicate.
  const groups: Record<string, number[]> = {};
  for (const m of dated) {
    if (!m.phase) continue;
    (groups[m.phase] = groups[m.phase] || []).push(m.ms);
  }
  const phases: TimelineTrackPhase[] = Object.entries(groups)
    .filter(([, ms]) => ms.length >= 2)
    .map(([key, ms]) => ({
      key,
      label: phaseLabels?.[key] ?? key,
      minMs: Math.min(...ms),
      maxMs: Math.max(...ms),
    }));

  return (
    <div className="shrink-0">
      <TimelineCard
        icon={<TimelineMilestoneIcon />}
        heading={heading ?? title}
        subject={subject}
        meta={meta}
      >
        <div className="select-none">
          <TimelineTrack
            axis="compressed"
            labels="lanes"
            items={items}
            pending={pending}
            phases={phases}
            startMs={startMs}
            endMs={endMs}
            todayMs={today}
            ariaLabel={`${title} milestones`}
          />
        </div>
      </TimelineCard>
    </div>
  );
}
