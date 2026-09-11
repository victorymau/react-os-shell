import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DAY_MS, toDayMs, fmtSliderDate } from './timelineDates';
import TimelineCard from './TimelineCard';
import { TimelineGlyph, TimelineProgressIcon } from './timelineGlyphs';
import TimelineTrack, {
  type TimelineMarker, type TimelineMarkerKind, type TimelineTrackItem,
} from './TimelineTrack';

/**
 * The marker types live with the track that draws them, so the milestone card
 * and this one cannot end up with two shapes for one dot. Re-exported here
 * because this is where consumers have always imported them from.
 */
export type { TimelineMarker, TimelineMarkerKind };

// ─── Constants & helpers ────────────────────────────────────────────────────

/** Statuses where the PO has moved past active production. Used to decide
 *  whether the timeline's right edge should extend to "today" (still active)
 *  or stop at est-completion / latest report (already shipped / completed). */
export const POST_PRODUCTION_STATUSES: ReadonlySet<string> = new Set([
  'finished', 'partial_shipped', 'shipped', 'completed', 'cancelled',
]);

/** Ordered stage breakdown used by `calcOverall`. The first four contribute
 *  weighted % progress; finished_goods and stock are reported but excluded
 *  from the headline % (they're outcomes, not in-flight progress). */
export const STAGES = [
  { key: 'casting', label: 'Casting', weight: 0.20 },
  { key: 'cnc', label: 'CNC', weight: 0.20 },
  { key: 'painting', label: 'Painting', weight: 0.50 },
  { key: 'packing', label: 'Packing', weight: 0.10 },
  { key: 'finished_goods', label: 'FG', weight: 0 },
  { key: 'stock_qty', label: 'Stock', weight: 0 },
] as const;

export interface ProgressItem {
  id: string;
  part_number: string;
  description: string;
  order_qty: number;
  casting: number;
  cnc: number;
  painting: number;
  packing: number;
  finished_goods: number;
  stock_qty: number;
}

export function calcOverall(item: ProgressItem): number {
  if (item.order_qty <= 0) return 0;
  let weighted = 0;
  for (const s of STAGES) {
    if (s.weight > 0) {
      const stagePct = Math.min((item[s.key] || 0) / item.order_qty, 1);
      weighted += stagePct * s.weight;
    }
  }
  return weighted * 100;
}

/** A production-progress report as consumed by the timeline. This is the
 *  structural subset of the `ProductionProgress` domain type that the hook
 *  actually reads — real reports satisfy it, and so do the synthetic
 *  zero/interpolated anchors the hook builds internally. */
export interface TimelineReport {
  id: string;
  progress_number: string;
  date: string;
  est_completion_date?: string | null;
  items?: ProgressItem[];
  created_by_name?: string;
  notes?: string;
  /**
   * Rich content for this report's hover/focus popover — the stage row it
   * filed, who filed it, the note attached to it. The card forwards it to the
   * dot exactly as a milestone or a marker forwards its own, so a report is not
   * the one mark on the rail that cannot show its document.
   *
   * Kit-only: nothing in the hook reads it, and the synthetic anchors it builds
   * carry none. The popover has ALREADY drawn the report's `progress_number`
   * and its date line above whatever this renders, so a preview that repeats
   * them says them twice. It wins over `renderReportPreview` when both exist.
   */
  preview?: ReactNode;
}

export function calcReportOverall(report: Pick<TimelineReport, 'items'> | null | undefined): number {
  const items = report?.items ?? [];
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + calcOverall(item), 0) / items.length;
}

// ─── State hook ─────────────────────────────────────────────────────────────

export interface UseProductionTimelineOpts {
  /** Progress reports for this PO, sorted DESC by date (newest first). */
  reports: TimelineReport[];
  /** PO production start date (ISO YYYY-MM-DD or full ISO) — left edge of bar. */
  poProductionStartDate: string | null | undefined;
  /** PO est completion date — right edge candidate. */
  poEstCompletionDate: string | null | undefined;
  /** PO status — when post-production we cap the right edge at est / latest
   *  report; otherwise we extend to "today" so the slider can reach now. */
  poStatus: string | null | undefined;
  /** PO number — used as a stable key for the synthetic zero anchor only. */
  poNumber?: string;
  /** Optional. The id of the report the user is "on" right now. The slider
   *  initially sits on this report's date and Play stops there too. When
   *  omitted, the slider initial position is the latest report's date and
   *  Play runs all the way to the right edge of the visible range. */
  currentReportId?: string;
  /** ISO date string for the report identified by `currentReportId`. We take
   *  this as a separate input rather than digging into `reports` because the
   *  PP detail page may have the current report fetched independently. */
  currentReportDate?: string | null;
  /** Optional override for what playback presses do. Default: rewind to
   *  startMs and walk forward at 0.5 s per timeline-day. */
  msPerDayOfPlayback?: number;
  /** Additional non-progress events to mark on the bar (e.g. goods receipts).
   *  Markers are decorative — they DON'T affect interpolation, the displayed
   *  snapshot, or playback. They render as dots in their own color so the
   *  user can correlate "PP report X happened the same week as shipment Y". */
  markers?: TimelineMarker[];
}

export interface ProductionTimelineSnapshot {
  // Range
  startMs: number;
  endMs: number;
  /** Total lead time in days (max(1, endMs-startMs in days)). */
  totalLeadDays: number;

  // Slider
  scrubMs: number;
  /** Set the slider position (clamped only at render time, not here, so the
   *  caller can drag past the edges briefly). */
  setScrubMs: (ms: number) => void;
  /** Reset the slider to the date of the report identified by
   *  `currentReportId` (if any). Also stops playback. */
  resetToCurrent: () => void;
  /** True when the slider is on a date other than the current report's date. */
  scrubbedAway: boolean;

  // Anchors + computed displayed report
  beforeAnchor: TimelineReport | null;
  nextAfter: TimelineReport | null;
  displayed: TimelineReport | null;
  prevReport: TimelineReport | null;
  /** Quick lookup: part_number -> the prevReport's item with that PN. Used
   *  by the items table to render delta bars. */
  prevByPN: Record<string, ProgressItem>;
  /** True when the slider is strictly between two real reports (so the
   *  displayed values are interpolated estimates rather than facts). */
  isInterpolated: boolean;

  // Playback
  playing: boolean;
  startPlay: () => void;
  stopPlay: () => void;

  // Pass-through (so the component doesn't have to re-thread these)
  reports: TimelineReport[];
  /** Decorative event dots (shipments etc.) — not part of interpolation. */
  markers: TimelineMarker[];
  poNumber: string;
  /** The id of the "current" report (if any) so the component can label
   *  the "Back to PP#XXX" affordance. */
  currentReportId?: string;
  /** Convenience: progress_number of the current report, looked up in the
   *  reports list. */
  currentReportProgressNumber?: string;
}

/** Owns all the state for a Production Timeline: scrub position, playback,
 *  hover, plus the derived "displayed" snapshot (interpolated or not).
 *
 *  Why a hook (and not a component-with-render-prop): the PP detail page
 *  renders an items table that depends on `displayed.items` + `prevByPN`,
 *  AND it renders the timeline bar. Both views need access to the same live
 *  state. A hook gives the parent direct access; a render-prop would force
 *  awkward inversion.
 *
 *  NOTE — `isInterpolated`, the lerped `displayed` snapshot it produces, and
 *  the continuous `startPlay` sweep are no longer reachable from this package.
 *  `ProductionTimeline` moves the slider only to dates a report was actually
 *  filed on, so the anchors are always a report and never a pair straddling
 *  one, and playback steps stop to stop. They stay exported and working for a
 *  caller that drives the hook itself and wants an estimate for a day in
 *  between; nothing the kit renders asks for one. */
export function useProductionTimeline(opts: UseProductionTimelineOpts): ProductionTimelineSnapshot {
  const {
    reports,
    poProductionStartDate,
    poEstCompletionDate,
    poStatus,
    poNumber = '',
    currentReportId,
    currentReportDate,
    msPerDayOfPlayback = 500,
    markers = [],
  } = opts;

  // Slider position. null until first effect runs; render uses fallback.
  const [scrubMs, setScrubMs] = useState<number | null>(null);

  // Reset slider whenever the "current" report identity changes — e.g. user
  // navigated by clicking a dot. We DON'T depend on currentReportDate alone
  // because that would re-snap on every refetch (autosave, polling, etc.).
  useEffect(() => {
    if (currentReportDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local scrubMs from currentReportDate/reports when the current-report identity changes; deriving in render would drop in-flight drag/playback edits
      setScrubMs(new Date(currentReportDate).getTime());
    } else if (reports.length > 0) {
      // No current report → start the slider on the latest known data point.
      setScrubMs(new Date(reports[0].date).getTime());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentReportId]);

  // Playback state. rAF id lives in a ref so we can cancel cleanly.
  const [playing, setPlaying] = useState(false);
  const playRafRef = useRef<number | null>(null);
  const stopPlay = () => {
    if (playRafRef.current != null) {
      cancelAnimationFrame(playRafRef.current);
      playRafRef.current = null;
    }
    setPlaying(false);
  };
  // Halt on unmount and on currentReport change (otherwise the rAF would
  // keep ticking against a now-stale endMs / scrubMs reference).
  useEffect(() => () => stopPlay(), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentionally halting playback (setPlaying(false)) when the current-report identity changes so the rAF loop stops ticking against a stale endMs/scrubMs
    stopPlay();
  }, [currentReportId]);

  // ─── Range computation ────────────────────────────────────────────────
  const reportTimes = reports
    .map(r => toDayMs(r.date))
    .filter((t): t is number => t != null);
  // eslint-disable-next-line react-hooks/purity -- render-time value used only for display layout: "today" fallback for the empty-reports timeline range
  const earliestReport = reportTimes.length ? Math.min(...reportTimes) : Date.now();
  // eslint-disable-next-line react-hooks/purity -- render-time value used only for display layout: "today" fallback for the empty-reports timeline range
  const latestReport = reportTimes.length ? Math.max(...reportTimes) : Date.now();
  const startMs = toDayMs(poProductionStartDate ?? null) ?? earliestReport;
  const estComplete = toDayMs(poEstCompletionDate ?? null) ?? 0;
  const isPostProd = POST_PRODUCTION_STATUSES.has((poStatus || '').toLowerCase());
  // Latest marker date — pulls in shipments etc. so a late GRN doesn't fall
  // off the right edge of the visible range.
  const latestMarker = markers.reduce((acc, m) => {
    const t = toDayMs(m.date);
    return t != null && t > acc ? t : acc;
  }, 0);
  const endMs = (() => {
    const candidates = [estComplete, latestReport, latestMarker, startMs + DAY_MS];
    // eslint-disable-next-line react-hooks/purity -- render-time value used only for display layout: extends the timeline's right edge to "today" for still-active POs
    if (!isPostProd) candidates.push(Date.now());
    return Math.max(...candidates);
  })();
  const totalLeadDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS));

  // ─── Effective scrub (clamped) ────────────────────────────────────────
  const fallback = toDayMs(currentReportDate ?? null) ?? latestReport ?? startMs;
  const effectiveScrub = Math.min(Math.max(scrubMs ?? fallback, startMs), endMs);

  // ─── Anchors for interpolation ────────────────────────────────────────
  const realBefore = reports.find(r => {
    const t = toDayMs(r.date);
    return t != null && t <= effectiveScrub;
  }) ?? null;
  let nextAfter: TimelineReport | null = null;
  for (let i = reports.length - 1; i >= 0; i--) {
    const t = toDayMs(reports[i].date);
    if (t != null && t > effectiveScrub) { nextAfter = reports[i]; break; }
  }

  // Synthetic zero-state anchor at production_start_date so the slider has
  // meaningful data even before the first real report exists.
  const zeroAnchor = (() => {
    if (realBefore || !nextAfter || reports.length === 0) return null;
    const earliest = reports[reports.length - 1]; // DESC → last is earliest
    const zeroItems: ProgressItem[] = (earliest.items ?? []).map((it, i) => ({
      id: `zero-${it.part_number}-${i}`,
      part_number: it.part_number,
      description: it.description ?? '',
      order_qty: Number(it.order_qty || 0),
      casting: 0, cnc: 0, painting: 0, packing: 0,
      finished_goods: 0, stock_qty: 0,
    }));
    return {
      id: `zero-${poNumber}`,
      progress_number: 'Start',
      date: poProductionStartDate || new Date(startMs).toISOString().slice(0, 10),
      items: zeroItems,
      est_completion_date: poEstCompletionDate ?? null,
      created_by_name: '',
      notes: '',
    };
  })();

  const beforeAnchor = realBefore ?? zeroAnchor;
  const beforeMs = realBefore
    ? toDayMs(realBefore.date)
    : (zeroAnchor ? startMs : null);
  const nextMs = nextAfter ? toDayMs(nextAfter.date) : null;

  const isInterpolated = !!(
    beforeAnchor && nextAfter
    && beforeMs != null && nextMs != null
    && effectiveScrub > beforeMs && effectiveScrub < nextMs
  );

  // ─── Build the displayed snapshot ─────────────────────────────────────
  let displayed: TimelineReport | null;
  let prevReport: TimelineReport | null;
  if (isInterpolated && beforeMs != null && nextMs != null) {
    const ratio = (effectiveScrub - beforeMs) / Math.max(nextMs - beforeMs, 1);
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * ratio);
    const beforeByPN: Record<string, Partial<ProgressItem>> = {};
    for (const it of beforeAnchor?.items ?? []) beforeByPN[it.part_number] = it;
    const afterByPN: Record<string, Partial<ProgressItem>> = {};
    for (const it of nextAfter?.items ?? []) afterByPN[it.part_number] = it;
    const allPNs = Array.from(new Set([
      ...Object.keys(beforeByPN), ...Object.keys(afterByPN),
    ]));
    const items: ProgressItem[] = allPNs.map((pn, i) => {
      const a = beforeByPN[pn] ?? {};
      const b = afterByPN[pn] ?? {};
      const num = (v: number | undefined) => Number(v) || 0;
      return {
        id: `interp-${pn}-${i}`,
        part_number: pn,
        description: a.description ?? b.description ?? '',
        // order_qty is the build target — not interpolated.
        order_qty: num(a.order_qty ?? b.order_qty ?? 0),
        casting: lerp(num(a.casting), num(b.casting)),
        cnc: lerp(num(a.cnc), num(b.cnc)),
        painting: lerp(num(a.painting), num(b.painting)),
        packing: lerp(num(a.packing), num(b.packing)),
        finished_goods: lerp(num(a.finished_goods), num(b.finished_goods)),
        stock_qty: lerp(num(a.stock_qty), num(b.stock_qty)),
      };
    });
    const aEst = toDayMs(beforeAnchor?.est_completion_date);
    const bEst = toDayMs(nextAfter?.est_completion_date);
    let estCompletion: string | null;
    if (aEst != null && bEst != null) {
      estCompletion = new Date(Math.round(aEst + (bEst - aEst) * ratio)).toISOString().slice(0, 10);
    } else {
      estCompletion = beforeAnchor?.est_completion_date || nextAfter?.est_completion_date || null;
    }
    displayed = {
      id: `interp-${effectiveScrub}`,
      progress_number: 'Estimated',
      date: new Date(effectiveScrub).toISOString().slice(0, 10),
      created_by_name: '',
      est_completion_date: estCompletion,
      items,
      notes: '',
    };
    prevReport = beforeAnchor;
  } else {
    displayed = beforeAnchor ?? reports[reports.length - 1] ?? null;
    if (displayed) {
      const idx = reports.findIndex(r => r.id === displayed!.id);
      prevReport = idx >= 0 && idx < reports.length - 1 ? reports[idx + 1] : null;
    } else {
      prevReport = null;
    }
  }

  const prevByPN: Record<string, ProgressItem> = {};
  for (const pi of prevReport?.items ?? []) {
    prevByPN[pi.part_number] = pi;
  }

  const scrubbedAway = !!(currentReportId && displayed?.id !== currentReportId);

  // ─── Playback ─────────────────────────────────────────────────────────
  // Play stops at the date of the "current" report (when one is set);
  // otherwise it runs to the right edge of the visible range. The natural
  // PP-detail use is "show me the buildup that LED to this report" — playing
  // past it into estimated-future days isn't what the user is asking for.
  const playStopMs = currentReportId
    ? Math.min(toDayMs(currentReportDate ?? null) ?? endMs, endMs)
    : endMs;

  const startPlay = () => {
    if (playing) { stopPlay(); return; }
    if (playStopMs <= startMs) { setScrubMs(playStopMs); return; }
    setPlaying(true);
    setScrubMs(startMs);
    let lastTime = performance.now();
    let cur = startMs;
    const step = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      cur = cur + (dt / msPerDayOfPlayback) * DAY_MS;
      if (cur >= playStopMs) {
        setScrubMs(playStopMs);
        playRafRef.current = null;
        setPlaying(false);
        return;
      }
      setScrubMs(cur);
      playRafRef.current = requestAnimationFrame(step);
    };
    playRafRef.current = requestAnimationFrame(step);
  };

  const resetToCurrent = () => {
    stopPlay();
    if (currentReportDate) setScrubMs(new Date(currentReportDate).getTime());
  };

  // ─── Lookup the current report's progress_number for "Back to PP#XXX" ─
  const currentReportProgressNumber = currentReportId
    ? reports.find(r => r.id === currentReportId)?.progress_number
    : undefined;

  return {
    startMs,
    endMs,
    totalLeadDays,
    scrubMs: effectiveScrub,
    setScrubMs: (ms: number) => { stopPlay(); setScrubMs(ms); },
    resetToCurrent,
    scrubbedAway,
    beforeAnchor,
    nextAfter,
    displayed,
    prevReport,
    prevByPN,
    isInterpolated,
    playing,
    startPlay,
    stopPlay,
    reports,
    markers,
    poNumber,
    currentReportId,
    currentReportProgressNumber,
  };
}

// ─── Internal: the scrubber, drawn on the shared track ──────────────────────

/** Production timeline scrubber bar.
 *
 *  A thin arrangement of `TimelineTrack`: the track owns the axis, the rail and
 *  its fill, the date ruler, the dots, the thumb, the tooltips and the keyboard
 *  contract, and this knows what the dots MEAN — a progress report, a shipment,
 *  a QC inspection. The mould milestone card is the same track with lane labels
 *  instead of a thumb, which is what keeps the two bars one picture rather than
 *  two that drifted.
 *
 *  Reports are `kind: 'report'` marks (an accent ring); markers keep their own
 *  kinds and shapes. Clicking a dot both moves the thumb and navigates, exactly
 *  as it did when this drew its own bar. */
function TimelineScrubber({
  startMs, endMs, reports, markers, valueMs, activeId,
  onChange, onPickReport, onOpenReport, onOpenMarker, onDragStart, renderReportPreview,
}: {
  startMs: number;
  endMs: number;
  reports: TimelineReport[];
  markers: TimelineMarker[];
  valueMs: number;
  activeId: string;
  onChange: (ms: number) => void;
  onPickReport: (id: string) => void;
  onOpenReport?: (id: string) => void;
  onOpenMarker?: (marker: TimelineMarker) => void;
  onDragStart?: () => void;
  renderReportPreview?: (report: TimelineReport) => ReactNode;
}) {
  const dated = reports
    .map(r => ({ report: r, ms: new Date(r.date).getTime() }))
    .filter(({ ms }) => Number.isFinite(ms))
    .sort((a, b) => a.ms - b.ms);
  const items: TimelineTrackItem[] = dated.map(({ report, ms }) => ({
    key: report.id,
    ms,
    kind: 'report',
    label: report.progress_number,
    // The report's own preview wins. `renderReportPreview` is the convenience
    // for a caller whose reports come straight off an API and cannot each carry
    // one, not an override of a preview somebody attached deliberately.
    preview: report.preview ?? renderReportPreview?.(report),
    onOpen: onOpenReport ? () => onOpenReport(report.id) : undefined,
  }));
  const msById = new Map(dated.map(({ report, ms }) => [report.id, ms]));
  // The only dates the thumb may rest on. A day between two reports holds no
  // snapshot anybody filed, so a thumb that stopped there would be showing an
  // estimate dressed as a fact.
  const stops = dated.map(({ ms }) => ms);
  /** The report a value stands for — every stop IS a report, so this is a
   *  lookup rather than a search for the one before. */
  const reportAt = (ms: number) => dated.find((entry) => entry.ms === ms)?.report;
  const withOpen: TimelineMarker[] = onOpenMarker
    ? markers.map((marker) => ({ ...marker, onOpen: onOpenMarker }))
    : markers;

  return (
    <div className="select-none">
      <TimelineTrack
        axis="linear"
        labels="active"
        items={items}
        markers={withOpen}
        startMs={startMs}
        endMs={endMs}
        activeKey={activeId}
        onActivate={(key) => {
          const ms = msById.get(key);
          if (ms != null) onChange(ms);
          onPickReport(key);
        }}
        thumb={{
          valueMs,
          onChange,
          onDragStart,
          stops,
          ariaLabel: 'Scrub the production timeline',
          valueText: (ms) => {
            const report = reportAt(ms);
            return report ? `${report.progress_number} · ${fmtSliderDate(ms)}` : fmtSliderDate(ms);
          },
        }}
        // The window's ends used to be captions flanking the bar. The date
        // ruler under the rail says the same thing in the same place as every
        // other date on the card, so the captions survive only for a reader who
        // cannot see the ruler.
        ariaLabel={
          `Production reports and events, ${fmtSliderDate(startMs)} to ${fmtSliderDate(endMs)}`
        }
      />
    </div>
  );
}

// ─── Public component ────────────────────────────────────────────────────

export interface ProductionTimelineProps {
  /** State from `useProductionTimeline`. Lifting state into the parent lets
   *  PP detail's items table read the same `displayed` snapshot the bar is
   *  currently rendering. */
  snapshot: ProductionTimelineSnapshot;
  /** Called when the user clicks a report dot. Caller decides what
   *  "navigate" means in their context (open a new window, swap an in-place
   *  detail, etc.). */
  onPickReport: (reportId: string) => void;
  /**
   * Opens the report DOCUMENT, as opposed to selecting it on the bar. When
   * given, the label above the thumb becomes a real button — picking a dot
   * shows you the snapshot, and this is how you get to the report itself.
   */
  onOpenReport?: (reportId: string) => void;
  /** The same for a marker: a goods issue, a QC report. */
  onOpenMarker?: (marker: TimelineMarker) => void;
  /**
   * Builds the popover preview for a report that carries none of its own — the
   * convenience for a caller whose reports arrive straight off an API, where
   * attaching a `TimelineReport.preview` to each of them means copying the list
   * to add one field. A report's own `preview` wins where both are present.
   *
   * As with `preview`, the popover has already drawn the report's number and
   * its date above whatever this returns; repeating either says it twice.
   */
  renderReportPreview?: (report: TimelineReport) => ReactNode;
  /** The card's heading, in sentence case. Defaults to "Production progress";
   *  the PO number is the card's subject, not part of its title. */
  heading?: string;
}

/** How long the thumb rests on a report while playing. Long enough to read the
 *  stage row it just changed, short enough that six reports is four seconds. */
const PLAY_DWELL_MS = 600;

/**
 * Playback, report by report.
 *
 * The hook's own `startPlay` sweeps the window continuously, which was right
 * while the bar interpolated between reports and is wrong now that the thumb
 * only rests on one: a sweep would spend most of its time on dates that hold no
 * snapshot. So the card steps its own stops instead, and the hook's sweep is
 * left in place for a caller that still wants it.
 */
function useReportPlayback(stops: number[], goTo: (ms: number) => void) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
  };
  useEffect(() => () => { if (timerRef.current != null) clearTimeout(timerRef.current); }, []);

  const toggle = () => {
    if (playing) { stop(); return; }
    if (stops.length === 0) return;
    setPlaying(true);
    goTo(stops[0]);
    let at = 0;
    const next = () => {
      at += 1;
      if (at >= stops.length) { timerRef.current = null; setPlaying(false); return; }
      goTo(stops[at]);
      timerRef.current = setTimeout(next, PLAY_DWELL_MS);
    };
    timerRef.current = setTimeout(next, PLAY_DWELL_MS);
  };

  return { playing, toggle, stop };
}

/** Title row + scrubber bar + Showing/Estimated summary line.
 *
 *  Production progress, scrubbable by date. Reports are the supplier's
 *  per-part stage quantities on the days they were filed; drag the thumb (or
 *  press play) and the hook interpolates between the two nearest reports so
 *  the caller's table can show the state of the build on ANY day. Markers
 *  are decorative context — shipments and inspections — and never move the
 *  displayed snapshot. The same block serves the admin PP window and the
 *  customer portal's order window, which feeds it order-level snapshots the
 *  backend has already pro-rated to that customer. */
export default function ProductionTimeline({
  snapshot, onPickReport, onOpenReport, onOpenMarker, renderReportPreview,
  heading = 'Production progress',
}: ProductionTimelineProps) {
  const {
    reports, markers, poNumber,
    startMs, endMs, totalLeadDays,
    scrubMs, setScrubMs,
    displayed,
    scrubbedAway, resetToCurrent, currentReportProgressNumber,
  } = snapshot;

  // Ascending, because playback walks forward through the build; the hook takes
  // them newest-first because that is the order the API returns.
  const stops = reports
    .map((report) => toDayMs(report.date))
    .filter((ms): ms is number => ms != null)
    .sort((a, b) => a - b);
  const play = useReportPlayback(stops, setScrubMs);

  // Render the timeline whenever there's at least one event of any kind to
  // show — production reports OR markers (e.g. a PO that has shipments
  // tracked but no progress reports yet).
  if (reports.length === 0 && markers.length === 0) return null;

  const shipmentMarkers = markers.filter(m => m.kind === 'shipment');
  const inspectionMarkers = markers.filter(m => m.kind === 'inspection');

  const totalStock = (displayed?.items ?? [])
    .reduce((s, it) => s + (Number(it.stock_qty) || 0), 0);
  const overall = displayed ? calcReportOverall(displayed) : 0;

  return (
    <div className="shrink-0">
      <TimelineCard
        icon={<TimelineProgressIcon />}
        heading={heading}
        subject={poNumber}
        // The window and how long it is, as the prototype states them. The
        // counts that used to be here — "6 reports · 1 shipment" — are gone:
        // the dots are on the bar and the legend says what each of them is, and
        // the line has to leave room for the control beside it.
        meta={[
          `${fmtSliderDate(startMs)} → ${fmtSliderDate(endMs)}`,
          `${totalLeadDays.toLocaleString()} day${totalLeadDays === 1 ? '' : 's'} lead time`,
        ]}
        actions={
          <>
            {scrubbedAway && currentReportProgressNumber && (
              <button type="button" onClick={() => { play.stop(); resetToCurrent(); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                Back to {currentReportProgressNumber}
              </button>
            )}
            {/* The glyph follows the state: a triangle while paused, two bars
                while playing. A label that changes over an icon that does not
                is how a play control ends up saying "Pause ▶". */}
            <button type="button" onClick={play.toggle} aria-pressed={play.playing}
              title={play.playing ? 'Pause' : 'Play the timeline, report by report'}
              className="rosh-tl-play text-gray-700 border-gray-300 hover:text-blue-600 hover:border-blue-500">
              {play.playing
                ? <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1.5h2.3v7H2zM5.7 1.5H8v7H5.7z" /></svg>
                : <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1.2 8.4 5 2 8.8z" /></svg>}
              <span>{play.playing ? 'Pause' : 'Play'}</span>
            </button>
          </>
        }
        footer={
          <>
            <p className="rosh-tl-status text-gray-800">
              {displayed ? (
                <>
                  Showing <b className="font-medium">{displayed.progress_number}</b>
                  <span className="text-gray-500">
                    {' · '}{fmtSliderDate(new Date(displayed.date).getTime())}
                    {' · '}{Math.round(overall)}% overall
                    {' · '}{totalStock.toLocaleString()} pc in stock
                  </span>
                </>
              ) : (
                <span className="text-gray-500">No production report filed yet</span>
              )}
            </p>
            {/* Chips, drawn with the track's own glyphs: a legend that keeps its
                own copy of a shape is a legend that can describe a dot the rail
                stopped drawing. */}
            <div className="rosh-tl-legend">
              {reports.length > 0 && (
                <span className="border-gray-200 text-gray-500">
                  <i aria-hidden="true" className="rosh-tl-glyph is-ring border-blue-500" />
                  Production report
                </span>
              )}
              {shipmentMarkers.length > 0 && (
                <span className="border-gray-200 text-gray-500">
                  <i aria-hidden="true" className="rosh-tl-glyph is-diamond"
                    style={{ background: 'var(--tl-shipment)' }} />
                  Shipment
                </span>
              )}
              {inspectionMarkers.length > 0 && (
                <span className="border-gray-200 text-gray-500">
                  <i aria-hidden="true" className="rosh-tl-glyph is-disc"
                    style={{ background: 'var(--tl-inspection)', color: 'var(--tl-on-kind)' }}>
                    <TimelineGlyph name="flask" />
                  </i>
                  Inspection
                </span>
              )}
            </div>
          </>
        }
      >
        <TimelineScrubber
          startMs={startMs}
          endMs={endMs}
          reports={reports}
          markers={markers}
          valueMs={scrubMs}
          activeId={displayed?.id ?? ''}
          onChange={setScrubMs}
          onPickReport={onPickReport}
          onOpenReport={onOpenReport}
          onOpenMarker={onOpenMarker}
          renderReportPreview={renderReportPreview}
          onDragStart={play.stop}
        />
      </TimelineCard>
    </div>
  );
}
