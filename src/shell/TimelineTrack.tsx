import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ComponentPropsWithRef, type CSSProperties, type ReactNode, type RefObject,
} from 'react';
import { DAY_MS, fmtSliderDate } from './timelineDates';
import { registerModalEscapeInterceptor } from './escapeInterceptors';
import { stagger } from '../charts/effects';
import {
  clampLabelLeft, clusterLabel, clusterMarks, compressTimeAxis, estimateLabelWidth,
  packLabelLanes, FALLBACK_TRACK_PX, TRACK_LABEL_LANE_COUNT,
  type ClusterGroup, type CompressedAxis,
} from './timelineGeometry';

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Visual category for one mark on the track. Drives shape, colour and glyph, so
 * a reader can tell a shipment from a drawing revision without reading a word.
 *
 * `MilestoneKind` is this list minus the two only a production bar has, and
 * `TimelineMarkerKind` is the two a marker may be — one union, so a kind added
 * here cannot be missing a style below.
 */
export type TimelineTrackKind =
  | 'default'    // accent disc with a flag — the opening milestone / a phase start
  | 'dfm'        // amber disc with a document — an engineering iteration
  | 'shipment'   // emerald diamond — goods moving
  | 'testing'    // violet disc with a flask — a test, a sign-off, a mould check
  | 'completion' // green disc with a check — the thing finished
  | 'inspection' // amber diamond — a QC report filed against the order
  | 'report'     // accent ring — a supplier's production-progress report
;

/** One dated point on the track. */
export interface TimelineTrackItem {
  /** Stable key — React key, the active/current lookup, and the focus roving. */
  key: string;
  /** When it happened, epoch ms. Undated things belong in `pending`. */
  ms: number;
  /** Optional visual category — defaults to `'default'`. */
  kind?: TimelineTrackKind;
  /** Short label: the lane label, the tooltip title, the accessible name. */
  label: string;
  /** The date as the user's format would write it. Defaults to `fmtSliderDate`. */
  date?: string;
  /** Optional second line for the tooltip. */
  detail?: ReactNode;
  /**
   * Which marks matter most, lower first (default 0).
   *
   * It does two jobs, and they are the same judgement: a lane goes to a low
   * number before a high one, and a mark with a number ABOVE zero is an ordinary
   * dot — small, and foldable into a `×N` pill with its same-kind neighbours.
   * One field, so the size of a dot and the lane it gets can never disagree
   * about which milestones the reader opened the card for.
   */
  priority?: number;
  /** Optional click handler — the dot is a button either way, so its tooltip is
   *  focusable, but only a handler makes activating it do something. */
  onClick?: () => void;
}

/** Visual classification for a `TimelineMarker`. */
export type TimelineMarkerKind = 'shipment' | 'inspection';

/**
 * A non-progress event drawn on the track for context — a goods issue, a QC
 * report. Markers are decorative in the domain sense: they never move a
 * scrubber's displayed snapshot, and they never fold into a cluster.
 */
export interface TimelineMarker {
  id: string;
  /** ISO date or full ISO datetime — the date the event happened on. */
  date: string;
  kind: TimelineMarkerKind;
  /** Short label shown in the tooltip (e.g. "GR#10001"). */
  label: string;
  /** Optional second line for the tooltip. */
  detail?: string;
  /** Optional click handler — when set, the dot calls this with the marker. */
  onClick?: (m: TimelineMarker) => void;
}

/** An undated thing: listed beside the track, never placed on it. */
export interface TimelineTrackPending {
  key: string;
  label: string;
  kind?: TimelineTrackKind;
}

/** A stretch of parallel work, bracketed under the rail. */
export interface TimelineTrackPhase {
  key: string;
  label: string;
  minMs: number;
  maxMs: number;
}

/** The draggable thumb, controlled by the caller. */
export interface TimelineTrackThumb {
  valueMs: number;
  onChange: (ms: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** The chip above the thumb. Defaults to the date in the user's format. */
  chip?: (ms: number) => ReactNode;
}

export interface TimelineTrackProps {
  /** Left edge of the window, epoch ms. */
  startMs: number;
  /** Right edge of the window, epoch ms. */
  endMs: number;
  /**
   * `'compressed'` caps any idle stretch at 30% of the track and marks it with a
   * break glyph; `'linear'` (the default) keeps time proportional. A bar whose
   * events arrive weekly wants linear — a week is not an idle stretch to hide.
   */
  axis?: 'linear' | 'compressed';
  /** The dated marks, in any order. */
  items: TimelineTrackItem[];
  /** Context events, drawn on the rail beside the items. */
  markers?: TimelineMarker[];
  /** Undated things, listed at the right edge (or under a vertical track). */
  pending?: TimelineTrackPending[];
  /** Where the filled part of the rail stops. Defaults to the last item, never
   *  past today; `null` draws no fill. With a thumb it follows the thumb. */
  fillToMs?: number | null;
  /** "Now". Defaults to `Date.now()`, captured once so render stays idempotent. */
  todayMs?: number;
  /**
   * `'lanes'` packs every label into two rows and folds same-kind runs into
   * `×N` pills; `'active'` draws ONE label — the active or hovered mark — which
   * is what a scrubber wants, because the thumb already says where you are.
   */
  labels?: 'lanes' | 'active';
  /** The mark the caller considers selected. Gets the hot treatment and, in
   *  `'active'` mode, the one label that is drawn. */
  activeKey?: string | null;
  /** Called when a dot is activated by click, Enter or Space. */
  onActivate?: (key: string) => void;
  /** Turns the track into a scrubber. */
  thumb?: TimelineTrackThumb;
  /** Text flanking the track — the "start" and "completed" edge captions. */
  edgeCaptions?: { start?: ReactNode; end?: ReactNode };
  /** Parallel-work brackets under the rail. */
  phases?: TimelineTrackPhase[];
  /** The one mark that is "where we are": `aria-current="step"`, the larger
   *  accent disc, and the pulse. Defaults to the last dated item. */
  currentKey?: string;
  /** Play the mount reveal. Default true; reduced motion is handled in CSS. */
  motion?: boolean;
  /** Names the ordered list of dated marks. Required — a list of dots with no
   *  name is a list of nothing. */
  ariaLabel: string;
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** The rail's own height — `h-2`, unchanged from the bar this replaced, so a
 *  card's vertical rhythm does not move. */
const RAIL_PX = 8;

/** Every vertical offset inside the stage, per label strategy. One object rather
 *  than a stack of flex rows: a label in a lane, its leader hairline, the ruler
 *  tick under it and the today line crossing all three have to agree on where
 *  each band starts, and a flex column can only place them in order. */
interface TrackGeometry {
  /** The row above everything: the "Today" tag, or the thumb's date chip. */
  tag: number;
  /** Top of the lane above the rail. */
  laneA: number;
  /** How tall one lane row is. */
  laneH: number;
  /** Top of the rail. */
  rail: number;
  /** Top of the ruler band. */
  ruler: number;
  /** Top of the lane below the ruler. */
  laneB: number;
  /** The stage's height with both lanes in use. */
  height: number;
}

const GEOMETRY: Record<'lanes' | 'active', TrackGeometry> = {
  lanes: { tag: 0, laneA: 17, laneH: 30, rail: 52, ruler: 64, laneB: 86, height: 120 },
  active: { tag: 0, laneA: 17, laneH: 30, rail: 38, ruler: 50, laneB: 74, height: 108 },
};

/** Room under the ruler for a phase bracket and its caption. */
const PHASE_BAND_PX = 22;

/** Below this the axis is abandoned rather than squeezed: one row per mark, the
 *  connector carrying the fill. Ant Design's `Steps` switches at 532 px of
 *  viewport; this is the CONTAINER, because the card lives inside resizable
 *  shell windows where the viewport says nothing about it. */
const VERTICAL_BELOW_PX = 320;

/** Two rows of pending, then a real button for the rest. A `title` is invisible
 *  on touch, so it cannot be the only way to read what was folded. */
const PENDING_ROW_LIMIT = 2;

/** A week tick is drawn only where the weeks stand this far apart. */
const WEEK_TICK_MIN_PX = 14;

/** A month is LABELLED only when it clears this much from the last label, so the
 *  same code serves a 73-day order and a 337-day mould. */
const MONTH_LABEL_PITCH_PX = 72;

/** Per character, for the 10 px mono face the ruler and the date lines use. Only
 *  ever used to decide whether two pieces of ruler text would collide. */
const MONO_CHAR_PX = 5.6;

/** How long a bubble survives the pointer leaving its dot. WCAG 1.4.13 asks for
 *  hoverable content, and the bubble sits a few pixels below the dot: without
 *  the grace the pointer dismisses it on the way. */
const BUBBLE_GRACE_MS = 160;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monoWidth = (text: string) => text.length * MONO_CHAR_PX;

// ─── Kind styles ─────────────────────────────────────────────────────────────

type NodeRole = 'dot' | 'key' | 'current';

interface KindStyle {
  /** `true` when the mark is drawn as a rotated square. */
  diamond?: boolean;
  /** Which glyph sits inside a filled node. */
  glyph?: 'check' | 'doc' | 'flask' | 'flag';
  /**
   * The kind's colour, as a token reference — declared light AND dark in
   * `ui.css`. `undefined` means "the accent", which cannot be a token: the kit's
   * accent themes work by REMAPPING the blue utility classes, so an
   * accent-coloured mark has to wear `bg-blue-500` / `border-blue-500` to follow
   * the accent the user picked.
   */
  token?: string;
}

const KIND_STYLES: Record<TimelineTrackKind, KindStyle> = {
  default: { glyph: 'flag' },
  dfm: { glyph: 'doc', token: 'var(--tl-dfm)' },
  shipment: { diamond: true, token: 'var(--tl-shipment)' },
  testing: { glyph: 'flask', token: 'var(--tl-testing)' },
  completion: { glyph: 'check', token: 'var(--tl-completion)' },
  inspection: { diamond: true, token: 'var(--tl-inspection)' },
  report: {},
};

const GLYPH_PATHS: Record<NonNullable<KindStyle['glyph']>, ReactNode> = {
  check: (
    <path d="M2.6 6.3 4.9 8.6 9.4 3.6" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" />
  ),
  doc: (
    <>
      <path d="M3.5 1.9h3.4l2 2v6.2H3.5z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.1 6.5h2.8M5.1 8.2h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  flask: (
    <path d="M4.6 1.8h2.8M5.4 1.8v3.1L3.3 9.3a.9.9 0 0 0 .8 1.3h3.8a.9.9 0 0 0 .8-1.3L6.6 4.9V1.8"
      fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  ),
  flag: (
    <>
      <path d="M3.8 1.7v8.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3.8 2.5h4.8L7.5 4.4l1.1 1.9H3.8z" fill="currentColor" />
    </>
  ),
};

function Glyph({ name }: { name: NonNullable<KindStyle['glyph']> }) {
  return <svg viewBox="0 0 12 12" aria-hidden="true">{GLYPH_PATHS[name]}</svg>;
}

/** The classes and inline colour one node wears. Kept together because the
 *  choice between a token and an accent utility is per kind, and applying both
 *  would let one silently win. */
function nodeDressing(kind: TimelineTrackKind, role: NodeRole): { className: string; style: CSSProperties } {
  const style = KIND_STYLES[kind];
  const classes = ['rosh-tl-node', 'rosh-tl-mark', `is-${role}`];
  if (style.diamond) classes.push('is-diamond');
  const css: CSSProperties = {};
  if (role === 'current') {
    // The current mark is the accent's, whatever its kind: it is not "a
    // shipment", it is where you are.
    classes.push('bg-blue-500', 'text-white');
  } else if (style.token) {
    if (role === 'key') { css.backgroundColor = style.token; css.color = 'var(--tl-on-kind)'; }
    else css.borderColor = style.token;
  } else if (role === 'key') {
    classes.push('bg-blue-500', 'text-white');
  } else {
    classes.push('border-blue-500');
  }
  return { className: classes.join(' '), style: css };
}

// ─── Internal mark shape ─────────────────────────────────────────────────────

/** One thing drawn on the rail, with everything the layout needs resolved. */
interface Mark {
  key: string;
  ms: number;
  x: number;
  kind: TimelineTrackKind;
  label: string;
  dateText: string;
  detail?: ReactNode;
  role: NodeRole;
  /** The width of the label it would draw, measured or estimated. */
  widthPx: number;
  /** Ordinary dots fold into `×N` pills; the marks that settle something never
   *  do, and neither does a context marker. */
  collapsible: boolean;
  onClick?: () => void;
  /** False for a context marker — on the rail, but not part of the programme. */
  isItem: boolean;
}

/** Every `data-*` a part of the track carries, so a spec or a browser check can
 *  name a part without keying on a class the design may restyle. */
type NodeButtonProps = ComponentPropsWithRef<'button'> & { [key: `data-${string}`]: string | undefined };

const detailText = (detail: ReactNode): string => (typeof detail === 'string' ? detail : '');

function accessibleName(mark: Mark): string {
  const detail = detailText(mark.detail);
  return `${mark.label} · ${mark.dateText}${detail ? ` · ${detail}` : ''}`;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

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

/** Sub-pixel-tolerant compare, so a re-measure that found the same layout does
 *  not set state and re-render for ever. */
function sameWidths(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.5);
}

/** The track's own width, watched: the same eight milestones fit one lane in a
 *  maximised window and two in a side-by-side pane. */
function useObservedWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useMeasureEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    // Guarded: this package renders under jsdom and under the server renderer,
    // and neither is required to have a ResizeObserver.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [ref]);
  return width;
}

/** True when the user asked for less motion. Read at the moment of the gesture,
 *  because a click-to-jump easing is JavaScript and cannot be a CSS rule. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ─── Parts ───────────────────────────────────────────────────────────────────

/**
 * An off-layout copy of every label, so the packer gets real widths.
 *
 * Every CANDIDATE is measured here, not just the labels currently drawn: a
 * collapsed label is not in the DOM at all, so measuring only what is drawn
 * would leave it collapsed for ever, however wide the card grew.
 */
function MeasuringRow({ marks, innerRef }: { marks: Mark[]; innerRef: RefObject<HTMLDivElement> }) {
  return (
    <div ref={innerRef} aria-hidden="true" className="rosh-tl-measure">
      {marks.map((mark) => (
        <div key={mark.key} data-lane-key={mark.key} className="rosh-tl-measure-box">
          <span className="rosh-tl-name">{mark.label}</span>
          <span className="rosh-tl-date">{mark.dateText}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The date ruler: month ticks always, week ticks where they would not crowd, a
 * month label only where one fits, and the span a cut swallowed.
 *
 * Nothing is drawn inside a cut. A cut is the one part of the bar that does not
 * keep time, so a tick there would mark a coordinate with no date.
 */
function Ruler({ startMs, endMs, axis, geo, reveal }: {
  startMs: number;
  endMs: number;
  axis: CompressedAxis;
  geo: TrackGeometry;
  reveal: boolean;
}) {
  const y = geo.ruler;
  const ticks: ReactNode[] = [];
  const labels: ReactNode[] = [];
  const cuts = axis.gaps.filter((gap) => gap.compressed);

  const weekStep = axis.xByMs(startMs + 7 * DAY_MS) - axis.xByMs(startMs);
  if (weekStep >= WEEK_TICK_MIN_PX) {
    const monday = new Date(startMs);
    // The next Monday, so the weeks line up with a calendar rather than with the
    // day the programme happened to start.
    monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7));
    for (let t = monday.getTime(); t < endMs; t += 7 * DAY_MS) {
      if (axis.inCut(t)) continue;
      ticks.push(
        <i key={`wk-${t}`} className="rosh-tl-tick is-week"
          style={{ left: `${axis.xByMs(t)}px`, top: `${y}px`, height: '3px' }} />,
      );
    }
  }

  // A cut's span label carries information no other mark repeats, so it owns its
  // stretch of the ruler; a month label that would collide is dropped.
  const bands = cuts.map((gap) => {
    const centre = (gap.fromPx + gap.toPx) / 2;
    const half = monoWidth(`${Math.round(gap.gapMs / DAY_MS)} days`) / 2 + 6;
    return [centre - half, centre + half] as const;
  });
  const blocked = (from: number, to: number) => bands.some(([low, high]) => from < high && to > low);

  const cursor = new Date(startMs);
  cursor.setUTCDate(1);
  let lastLabelX = -Infinity;
  let firstLabel = true;
  while (cursor.getTime() < endMs) {
    const t = cursor.getTime();
    const beforeStart = t < startMs;
    if (!axis.inCut(beforeStart ? startMs : t)) {
      const x = beforeStart ? 0 : axis.xByMs(t);
      if (!beforeStart) {
        ticks.push(
          <i key={`mo-${t}`} className="rosh-tl-tick" style={{ left: `${x}px`, top: `${y}px`, height: '6px' }} />,
        );
      }
      // Pitch is measured label-start to label-start, so a long "Apr 2026" does
      // not swallow the month that follows it.
      if (x - lastLabelX >= MONTH_LABEL_PITCH_PX || firstLabel) {
        const withYear = firstLabel || cursor.getUTCMonth() === 0;
        const text = `${MONTHS[cursor.getUTCMonth()]}${withYear ? ` ${cursor.getUTCFullYear()}` : ''}`;
        if (!blocked(x, x + monoWidth(text))) {
          labels.push(
            <span key={`mon-${t}`} className={`rosh-tl-month${reveal ? ' rosh-tl-fade' : ''}`}
              style={{ left: `${x}px`, top: `${y + 9}px`, ...(reveal ? { animationDelay: '420ms' } : {}) }}>
              {text}
            </span>,
          );
          lastLabelX = x;
          firstLabel = false;
        }
      }
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return (
    <div aria-hidden="true" data-timeline-part="ruler">
      {ticks}
      {labels}
      {cuts.map((gap) => {
        const days = Math.max(1, Math.round(gap.gapMs / DAY_MS));
        return (
          <span key={`cut-${gap.fromMs}`} data-timeline-part="break"
            className={`rosh-tl-rulercut${reveal ? ' rosh-tl-fade' : ''}`}
            style={{
              left: `${(gap.fromPx + gap.toPx) / 2}px`,
              top: `${y}px`,
              ...(reveal ? { animationDelay: '420ms' } : {}),
            }}>
            <span className="rosh-tl-cutglyph"><i /><i /></span>
            <span>{days.toLocaleString()} days</span>
          </span>
        );
      })}
    </div>
  );
}

/** The undated things, listed where a date coordinate is not. */
function PendingColumn({ pending, reveal }: { pending: TimelineTrackPending[]; reveal: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? pending : pending.slice(0, PENDING_ROW_LIMIT);
  const folded = pending.length - shown.length;
  return (
    <div className="rosh-tl-pending" data-timeline-part="pending">
      <p className="rosh-tl-pending-head">Not yet reached</p>
      <ol className="rosh-tl-ghosts" aria-label="Not yet reached">
        {shown.map((entry, index) => (
          <li key={entry.key} className={reveal ? 'rosh-tl-fade' : undefined}
            style={reveal ? { animationDelay: `${440 + index * 60}ms` } : undefined}>
            <span aria-hidden="true" className="rosh-tl-node is-ghost" />
            <span>
              {index === 0 && <b>Next · </b>}
              {entry.label}
            </span>
          </li>
        ))}
      </ol>
      {folded > 0 && (
        <button type="button" className="rosh-tl-more text-gray-500" onClick={() => setExpanded(true)}>
          +{folded} more
        </button>
      )}
    </div>
  );
}

/**
 * The vertical variant, for a track too narrow to be an axis.
 *
 * The idle stretch is stated in words rather than drawn: a break glyph needs an
 * axis to break.
 */
function VerticalTrack({ marks, pending, currentKey, todayMs, reveal, ariaLabel, step, nodeProps, onKeyDown }: {
  marks: Mark[];
  pending: TimelineTrackPending[];
  currentKey: string | null;
  todayMs: number;
  reveal: boolean;
  ariaLabel: string;
  step: number;
  nodeProps: (mark: Mark) => NodeButtonProps;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  const currentIndex = marks.findIndex((mark) => mark.key === currentKey);
  const gapDays = marks.length > 0 ? Math.round((todayMs - marks[marks.length - 1].ms) / DAY_MS) : 0;
  return (
    <div data-timeline-part="vertical">
      <ol className="rosh-tl-v" aria-label={ariaLabel} onKeyDown={onKeyDown}>
        {marks.map((mark, index) => {
          const dressing = nodeDressing(mark.kind, mark.role);
          const reached = currentIndex >= 0 && index < currentIndex;
          const glyph = KIND_STYLES[mark.kind].glyph;
          return (
            <li key={mark.key} className={reveal ? 'rosh-tl-fade' : undefined}
              style={reveal ? stagger(index, step) : undefined}
              {...(mark.key === currentKey ? { 'aria-current': 'step' as const } : {})}>
              <i aria-hidden="true"
                className={`rosh-tl-vline text-blue-500${reached ? ' is-on' : ' is-dash'}${reached && reveal ? ' rosh-tl-drawy' : ''}`} />
              <button {...nodeProps(mark)}
                className={`${dressing.className}${reveal ? ' rosh-tl-pop' : ''}`}
                style={{ ...dressing.style, ...(reveal ? stagger(index, step) : {}) }}>
                {glyph && <Glyph name={glyph} />}
                {mark.role === 'current' && (
                  <span aria-hidden="true" className={`rosh-tl-pulse bg-blue-500${reveal ? ' is-on' : ''}`} />
                )}
              </button>
              <span className="rosh-tl-vrow" aria-hidden="true">
                <span className="rosh-tl-name">{mark.label}</span>
                <span className="rosh-tl-date">{mark.dateText}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {gapDays > 0 && (
        <p className="rosh-tl-vgap" aria-hidden="true">
          <i className="rosh-tl-vline is-dash" />
          <span>{gapDays.toLocaleString()} days to today</span>
        </p>
      )}
      {pending.length > 0 && <PendingColumn pending={pending} reveal={reveal} />}
    </div>
  );
}

/** The rail, its fill, and the notches where the axis stops keeping time. */
function TrackRail({ axis, geo, fillTo, reveal, trackPx }: {
  axis: CompressedAxis;
  geo: TrackGeometry;
  fillTo: number | null;
  reveal: boolean;
  trackPx: number;
}) {
  return (
    <div aria-hidden="true">
      <div className="rosh-tl-rail bg-gray-200" style={{ top: `${geo.rail}px`, height: `${RAIL_PX}px` }} />
      {fillTo !== null && (
        <div data-timeline-part="fill"
          className={`rosh-tl-fill bg-blue-500${reveal ? ' rosh-tl-draw' : ''}`}
          style={{
            top: `${geo.rail}px`,
            height: `${RAIL_PX}px`,
            width: `${Math.max(0, Math.min(axis.xByMs(fillTo), trackPx))}px`,
          }} />
      )}
      {axis.gaps.filter((gap) => gap.compressed).map((gap) => (
        <div key={`railcut-${gap.fromMs}`} className="rosh-tl-cut"
          style={{ left: `${(gap.fromPx + gap.toPx) / 2}px`, top: `${geo.rail}px`, height: `${RAIL_PX}px` }}>
          <i /><i />
        </div>
      ))}
    </div>
  );
}

/** Today: a dashed rule through the bands, with a tag that says so. */
function TodayMark({ x, geo, trackPx, label, reveal }: {
  x: number;
  geo: TrackGeometry;
  trackPx: number;
  label: string;
  reveal: boolean;
}) {
  const tagWidth = 48;
  return (
    <div aria-hidden="true" data-timeline-part="today">
      <div className={`rosh-tl-todayline${reveal ? ' rosh-tl-fade' : ''}`}
        style={{
          left: `${x}px`,
          top: `${geo.laneA}px`,
          height: `${geo.ruler + 20 - geo.laneA}px`,
          ...(reveal ? { animationDelay: '420ms' } : {}),
        }} />
      <span className={`rosh-tl-todaytag${reveal ? ' rosh-tl-fade' : ''}`} title={`Today — ${label}`}
        style={{
          left: `${clampLabelLeft(x, tagWidth, trackPx)}px`,
          top: `${geo.tag}px`,
          ...(reveal ? { animationDelay: '420ms' } : {}),
        }}>
        Today
      </span>
    </div>
  );
}

/** A phase bracket: the three-sided box that says "these ran in parallel". */
function PhaseBracket({ phase, geo, xOf }: {
  phase: TimelineTrackPhase;
  geo: TrackGeometry;
  xOf: (ms: number) => number;
}) {
  const left = xOf(phase.minMs);
  // A bracket narrower than its own two borders reads as one line, so a phase
  // whose members share a day still gets a few pixels of span.
  const width = Math.max(xOf(phase.maxMs) - left, 4);
  return (
    <div aria-hidden="true" data-timeline-part="phase">
      <div className="rosh-tl-phase border-gray-300"
        style={{ left: `${left}px`, width: `${width}px`, top: `${geo.laneB + geo.laneH - 4}px` }} />
      <span className="rosh-tl-phase-label text-gray-500"
        style={{ left: `${left + width / 2}px`, top: `${geo.laneB + geo.laneH + 5}px` }}>
        {phase.label} · parallel
      </span>
    </div>
  );
}

/** The one label a scrubber draws: the hovered mark, else the active one. */
function ActiveLabel({ marks, trackPx, geo, activeKey, hoveredKey, currentKey }: {
  marks: Mark[];
  trackPx: number;
  geo: TrackGeometry;
  activeKey: string | null;
  hoveredKey: string | null;
  currentKey: string | null;
}) {
  const mark = marks.find((m) => m.key === hoveredKey) ?? marks.find((m) => m.key === activeKey) ?? null;
  if (!mark) return null;
  return (
    <div aria-hidden="true" data-timeline-part="label"
      className={`rosh-tl-label${mark.key === hoveredKey ? ' is-hot' : ''}${mark.key === currentKey ? ' is-current' : ''}`}
      style={{
        left: `${clampLabelLeft(mark.x, mark.widthPx, trackPx)}px`,
        top: `${geo.laneB}px`,
        width: `${mark.widthPx}px`,
        height: `${geo.laneH}px`,
      }}>
      <span className="rosh-tl-name">{mark.label}</span>
      <span className="rosh-tl-date">{mark.dateText}</span>
    </div>
  );
}

/** One label's worth of layout: a packed label, or a `×N` pill. */
interface LaneBox {
  key: string;
  group: ClusterGroup<Mark>;
  text: string;
  x: number;
  widthPx: number;
  index: number;
  lane: number;
  left: number;
}

/**
 * Two lanes of labels, with same-kind runs folded into `×N` pills.
 *
 * A pill is a real `<button aria-expanded>` opening a popover that lists every
 * member with its date: click pins it, hover previews it, Escape closes it. The
 * members' own dots stay on the rail with a faint span line joining them, so the
 * pill never lies about when anything happened — and every member is in its own
 * dot's accessible name, because nothing here may be hover-only.
 */
function LaneLabels({
  marks, trackPx, geo, startMs, endMs, currentKey, hoveredKey, reveal, step,
  popId, aimBubble, openCluster, setOpenCluster, previewCluster, setPreviewCluster,
}: {
  marks: Mark[];
  trackPx: number;
  geo: TrackGeometry;
  startMs: number;
  endMs: number;
  currentKey: string | null;
  hoveredKey: string | null;
  reveal: boolean;
  step: number;
  popId: string;
  aimBubble: (el: HTMLDivElement | null, x: number) => void;
  openCluster: string | null;
  setOpenCluster: (key: string | null) => void;
  previewCluster: string | null;
  setPreviewCluster: (key: string | null) => void;
}) {
  const boxes: LaneBox[] = clusterMarks(marks).map((group, index) => {
    if (group.type === 'cluster') {
      const text = clusterLabel(group.members);
      return {
        key: `cluster-${group.members[0].key}`,
        group,
        text,
        x: group.members.reduce((sum, m) => sum + m.x, 0) / group.members.length,
        index,
        lane: -1,
        left: 0,
        // A pill is a chip, not a two-line label: its text, its kind dot and the
        // padding around them.
        widthPx: Math.ceil(monoWidth(text)) + 28,
      };
    }
    return {
      key: group.mark.key,
      group,
      text: group.mark.label,
      x: group.mark.x,
      index,
      lane: -1,
      left: 0,
      widthPx: group.mark.widthPx,
    };
  }).sort((a, b) => a.x - b.x);

  const lanes = packLabelLanes(
    boxes.map((box) => ({
      key: box.key,
      ms: box.group.type === 'cluster' ? box.group.members[0].ms : box.group.mark.ms,
      xPx: box.x,
      widthPx: box.widthPx,
      // A pill already stands for several marks and survives collapsing better
      // than a lone milestone does: it keeps its members' dots and their span
      // line either way, where a collapsed label leaves nothing but a dot.
      priority: box.group.type === 'cluster' ? 1 : 0,
    })),
    trackPx, startMs, Math.max(endMs - startMs, DAY_MS),
    { laneCount: TRACK_LABEL_LANE_COUNT },
  );
  const laneByKey = new Map(lanes.map((l) => [l.key, l.lane]));
  for (const box of boxes) {
    box.lane = laneByKey.get(box.key) ?? -1;
    box.left = clampLabelLeft(box.x, box.widthPx, trackPx);
  }

  const openBox = boxes.find((box) => box.key === (openCluster ?? previewCluster));
  const laneTop = (lane: number) => (lane === 0 ? geo.laneA : geo.laneB);
  const leaderTop = (lane: number) => (lane === 0 ? geo.rail - 4 : geo.rail + RAIL_PX + 1);

  return (
    <>
      {boxes.map((box) => {
        const lane = Math.max(0, box.lane);
        const delay = Math.round(box.index * step + 60);
        if (box.group.type === 'cluster') {
          const pinned = openCluster === box.key;
          const xs = box.group.members.map((m) => m.x);
          return (
            <div key={box.key}>
              <button type="button" data-timeline-part="cluster"
                className={`rosh-tl-pill${KIND_STYLES[box.group.kind as TimelineTrackKind]?.token ? '' : ' text-blue-600'}${reveal ? ' rosh-tl-fade' : ''}`}
                aria-expanded={pinned} aria-controls={popId}
                style={{
                  left: `${box.left}px`,
                  top: `${lane === 0 ? geo.laneA + geo.laneH - 19 : geo.laneB}px`,
                  color: KIND_STYLES[box.group.kind as TimelineTrackKind]?.token,
                  ...(reveal ? { animationDelay: `${delay}ms` } : {}),
                }}
                onMouseEnter={() => setPreviewCluster(box.key)}
                onMouseLeave={() => setPreviewCluster(null)}
                onFocus={() => setPreviewCluster(box.key)}
                onBlur={() => setPreviewCluster(null)}
                onClick={() => setOpenCluster(pinned ? null : box.key)}>
                <i aria-hidden="true" />
                {box.text}
              </button>
              <i aria-hidden="true" className="rosh-tl-cspan"
                style={{
                  left: `${Math.min(...xs)}px`,
                  width: `${Math.max(1, Math.max(...xs) - Math.min(...xs))}px`,
                  top: `${leaderTop(lane)}px`,
                }} />
            </div>
          );
        }
        const mark = box.group.mark;
        if (box.lane < 0) {
          // A label with nowhere to go is revealed on hover or focus rather than
          // overprinting its neighbour. Its dot announces it either way.
          return mark.key === hoveredKey ? (
            <div key={box.key} aria-hidden="true" data-timeline-part="reveal"
              className="rosh-tl-label is-reveal is-hot"
              style={{ left: `${box.left}px`, top: `${geo.laneA}px`, width: `${box.widthPx}px` }}>
              <span className="rosh-tl-name">{mark.label}</span>
              <span className="rosh-tl-date">{mark.dateText}</span>
            </div>
          ) : null;
        }
        const centred = Math.abs(box.left + box.widthPx / 2 - mark.x) <= 8;
        return (
          <div key={box.key}>
            <div aria-hidden="true" data-timeline-part="label"
              className={`rosh-tl-label${lane === 0 ? ' is-up' : ''}${mark.key === currentKey ? ' is-current' : ''}${mark.key === hoveredKey ? ' is-hot' : ''}${reveal ? ' rosh-tl-fade' : ''}`}
              style={{
                left: `${box.left}px`,
                top: `${laneTop(lane)}px`,
                width: `${box.widthPx}px`,
                height: `${geo.laneH}px`,
                ...(reveal ? { animationDelay: `${delay}ms` } : {}),
              }}>
              <span className="rosh-tl-name">{mark.label}</span>
              <span className="rosh-tl-date">{mark.dateText}</span>
            </div>
            {/* A leader only where the label had to slide off its dot. One on a
                label that still sits over its dot is noise. */}
            {!centred && (
              <i aria-hidden="true" className={`rosh-tl-lead${reveal ? ' rosh-tl-fade' : ''}`}
                style={{
                  left: `${Math.min(box.left + box.widthPx / 2, mark.x)}px`,
                  width: `${Math.abs(box.left + box.widthPx / 2 - mark.x)}px`,
                  top: `${leaderTop(lane)}px`,
                  ...(reveal ? { animationDelay: `${delay}ms` } : {}),
                }} />
            )}
          </div>
        );
      })}
      {openBox && openBox.group.type === 'cluster' && (
        <div ref={(el) => { aimBubble(el, openBox.x); }} id={popId} className="rosh-tl-popover"
          data-timeline-part="cluster-popover"
          style={{ top: `${geo.rail + RAIL_PX + 6}px` }}
          onMouseEnter={() => setPreviewCluster(openBox.key)}
          onMouseLeave={() => setPreviewCluster(null)}>
          <p className="rosh-tl-popover-head">{openBox.text}</p>
          <ol>
            {openBox.group.members.map((member) => (
              <li key={member.key}>
                <span>{member.label}</span>
                <span className="rosh-tl-date">{member.dateText}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

/**
 * The scrubber: an 18 px disc, the date chip above it, and a hit strip.
 *
 * Drag moves it directly. A click on the strip EASES over 200 ms instead, so the
 * eye can follow a jump it did not drag — and steps straight there under reduced
 * motion. A drag that begins on the strip cancels the easing on its first move,
 * which is what keeps "press and sweep" working the way it always has.
 */
function ThumbLayer({ thumb, axis, geo, startMs, endMs, trackPx, layerRef }: {
  thumb: TimelineTrackThumb;
  axis: CompressedAxis;
  geo: TrackGeometry;
  startMs: number;
  endMs: number;
  trackPx: number;
  layerRef: RefObject<HTMLDivElement>;
}) {
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const value = Math.min(Math.max(thumb.valueMs, startMs), endMs);
  const x = axis.xByMs(value);
  const chipWidth = 88;

  const stopEasing = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);
  useEffect(() => stopEasing, [stopEasing]);

  const msFromEvent = (clientX: number): number => {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box) return value;
    return axis.msByPx(clientX - box.left);
  };

  const easeTo = (to: number) => {
    const from = value;
    if (prefersReducedMotion()) { thumb.onChange(to); return; }
    const started = performance.now();
    const tick = (frame: number) => {
      const k = Math.min(1, (frame - started) / 200);
      thumb.onChange(from + (to - from) * (1 - (1 - k) ** 3));
      rafRef.current = k < 1 ? requestAnimationFrame(tick) : null;
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const beginDrag = (event: React.PointerEvent) => {
    draggingRef.current = true;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    thumb.onDragStart?.();
  };
  const endDrag = (event: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    thumb.onDragEnd?.();
  };
  const drag = (event: React.PointerEvent) => {
    if (!draggingRef.current) return;
    stopEasing();
    thumb.onChange(msFromEvent(event.clientX));
  };

  return (
    <>
      <div className="rosh-tl-hit" aria-hidden="true" data-timeline-part="hit"
        style={{ top: `${geo.rail - 9}px`, height: `${RAIL_PX + 18}px` }}
        onPointerDown={(event) => { stopEasing(); beginDrag(event); easeTo(msFromEvent(event.clientX)); }}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag} />
      <div className="rosh-tl-chip" data-timeline-part="chip"
        style={{ left: `${clampLabelLeft(x, chipWidth, trackPx) + chipWidth / 2}px`, top: `${geo.tag}px` }}>
        {thumb.chip ? thumb.chip(value) : fmtSliderDate(value)}
      </div>
      <div role="slider" tabIndex={0} className="rosh-tl-thumb text-blue-600" data-timeline-part="thumb"
        aria-label="Scrub the timeline"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, Math.round((endMs - startMs) / DAY_MS))}
        aria-valuenow={Math.round((value - startMs) / DAY_MS)}
        aria-valuetext={fmtSliderDate(value)}
        style={{ left: `${x}px`, top: `${geo.rail + RAIL_PX / 2}px` }}
        onPointerDown={(event) => { stopEasing(); beginDrag(event); }}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(event) => {
          const days = event.shiftKey ? 7 : 1;
          const next = event.key === 'ArrowRight' ? value + days * DAY_MS
            : event.key === 'ArrowLeft' ? value - days * DAY_MS
              : event.key === 'Home' ? startMs
                : event.key === 'End' ? endMs
                  : null;
          if (next === null) return;
          event.preventDefault();
          stopEasing();
          thumb.onChange(Math.min(Math.max(next, startMs), endMs));
        }} />
    </>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/** How tall the stage has to be for the bands it actually draws. */
function stageHeight(geo: TrackGeometry, usesFarLane: boolean, hasPhases: boolean): number {
  const base = usesFarLane ? geo.height : geo.ruler + 26;
  return base + (hasPhases ? PHASE_BAND_PX : 0);
}

/**
 * The time axis both timelines are drawn on.
 *
 * One primitive behind the mould milestone card (`MilestoneTimeline`) and the
 * production-progress scrubber (`ProductionTimeline`), because they are the same
 * picture with two label strategies: a rail, a fill, a date ruler, dots that
 * mean something by their shape, and a today tick. Sharing the primitive is what
 * makes them look and move identically — the alternative had them drift into two
 * bars answering the same question in two visual languages.
 *
 * What it owns: the axis (linear or compressed), the rail and its fill, the date
 * ruler, the dots and their glyphs, label placement (two packed lanes with `×N`
 * clustering, or one active label), the optional scrubber thumb, the edge
 * captions, the pending list, the motion, and the keyboard and screen-reader
 * contract. What it does not own: the card around it, the title row, the legend,
 * or any domain summary — those belong to the consumer, which knows what the bar
 * is about.
 *
 * Accessibility: the marks are an `<ol>` in axis order with exactly one
 * `aria-current="step"`; the rail, fill, ruler, today tick, break glyphs, leader
 * hairlines, phase brackets and the drawn labels are all `aria-hidden`, because
 * they restate that list. The list is ONE tab stop with a roving `tabindex` —
 * arrows traverse, Home/End jump, Enter/Space activates. Tooltips and cluster
 * popovers are hoverable, persistent and dismissed by Escape (WCAG 1.4.13), and
 * nothing is reachable by hover alone.
 */
export default function TimelineTrack({
  startMs, endMs, axis: axisMode = 'linear', items, markers = [], pending = [],
  fillToMs, todayMs, labels = 'lanes', activeKey = null, onActivate, thumb,
  edgeCaptions, phases = [], currentKey, motion = true, ariaLabel,
}: TimelineTrackProps) {
  // Captured once at mount so render stays idempotent — day-resolution marks do
  // not care that "today" does not tick while the view is open.
  const [mountedToday] = useState(() => Date.now());
  const now = todayMs ?? mountedToday;
  const layerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const graceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [bubbleKey, setBubbleKey] = useState<string | null>(null);
  const [openCluster, setOpenCluster] = useState<string | null>(null);
  const [previewCluster, setPreviewCluster] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const tipId = useId();
  const popId = useId();

  const observed = useObservedWidth(layerRef);
  const trackPx = observed > 0 ? observed : FALLBACK_TRACK_PX;
  const vertical = observed > 0 && observed < VERTICAL_BELOW_PX;
  const geo = GEOMETRY[labels === 'active' ? 'active' : 'lanes'];

  // The axis. Anchored on both ends of the window and on every dated item inside
  // it, so the stretches that get clamped are exactly the stretches between
  // things that happened. A linear axis is the same mapping with the ceiling
  // lifted, which is what keeps one code path for both bars.
  const inWindow = (ms: number) => ms >= startMs - DAY_MS && ms <= endMs + DAY_MS;
  const dated = items
    .filter((item) => Number.isFinite(item.ms) && inWindow(item.ms))
    .slice()
    .sort((a, b) => a.ms - b.ms);
  const axis = compressTimeAxis(
    [startMs, ...dated.filter((m) => m.ms > startMs && m.ms < endMs).map((m) => m.ms), endMs],
    trackPx,
    axisMode === 'compressed' ? {} : { maxGapPx: Infinity, minGapPx: 0 },
  );
  const xOf = axis.xByMs;

  const resolvedCurrent = currentKey ?? (dated.length > 0 ? dated[dated.length - 1].key : null);

  const itemMarks: Mark[] = dated.map((item) => {
    const dateText = item.date ?? fmtSliderDate(item.ms);
    const ordinary = (item.priority ?? 0) > 0 || item.kind === 'report';
    return {
      key: item.key,
      ms: item.ms,
      x: xOf(item.ms),
      kind: item.kind ?? 'default',
      label: item.label,
      dateText,
      detail: item.detail,
      role: item.key === resolvedCurrent ? 'current' : ordinary ? 'dot' : 'key',
      widthPx: measured[item.key] || estimateLabelWidth(item.label, dateText),
      collapsible: ordinary,
      onClick: item.onClick,
      isItem: true,
    };
  });
  const markerMarks: Mark[] = markers
    .map((marker) => ({ marker, ms: new Date(marker.date).getTime() }))
    .filter(({ ms }) => Number.isFinite(ms) && inWindow(ms))
    .map(({ marker, ms }) => {
      const key = `marker-${marker.id}`;
      const dateText = fmtSliderDate(ms);
      return {
        key,
        ms,
        x: xOf(ms),
        kind: marker.kind,
        label: marker.label,
        dateText,
        detail: marker.detail,
        role: 'key' as NodeRole,
        widthPx: measured[key] || estimateLabelWidth(marker.label, dateText),
        // A marker is context, not part of the programme: it never folds into
        // someone else's `×N`.
        collapsible: false,
        onClick: marker.onClick ? () => marker.onClick?.(marker) : undefined,
        isItem: false,
      };
    });
  const marks = [...itemMarks, ...markerMarks].sort((a, b) => a.x - b.x || a.ms - b.ms);

  // Re-measure when the set of labels or their text changes. Joined into a
  // string because the mark ARRAY is rebuilt on every render.
  const measureSignature = marks.map((m) => `${m.key} ${m.label} ${m.dateText}`).join('|');
  useMeasureEffect(() => {
    const row = measureRef.current;
    if (!row) return;
    const next: Record<string, number> = {};
    for (const child of Array.from(row.children)) {
      const key = (child as HTMLElement).dataset.laneKey;
      const width = child.getBoundingClientRect().width;
      if (key && width > 0) next[key] = width;
    }
    setMeasured((prev) => (sameWidths(prev, next) ? prev : next));
  }, [measureSignature]);

  // The reveal runs once per mark set, never per render. `hoveredKey` and the
  // measured widths are both state, so the card re-renders constantly — and the
  // entrance classes have to stay ON across those renders or the animation is
  // cut off mid-flight. Holding the signature the card is CURRENTLY revealing
  // gives both halves: a hover changes nothing, and a genuinely new set of marks
  // drops the classes for exactly one render, which is what lets the animation
  // start again rather than sit at its own end state.
  const revealSignature = `${labels}|${axisMode}|${marks.map((m) => `${m.key}@${m.ms}`).join('|')}`;
  const [revealing, setRevealing] = useState(revealSignature);
  const reveal = motion && revealing === revealSignature;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the one-render gap between a new mark set and this write is the reveal restart; deriving it in render would make the classes constant and the entrance would never replay
    if (revealing !== revealSignature) setRevealing(revealSignature);
  }, [revealing, revealSignature]);

  const step = Math.min(28, 340 / Math.max(1, marks.length - 1));
  const fillTo = thumb
    ? thumb.valueMs
    : fillToMs !== undefined
      ? fillToMs
      : itemMarks.length > 0 ? Math.min(itemMarks[itemMarks.length - 1].ms, now) : null;

  const closeOverlays = useCallback(() => {
    clearTimeout(graceRef.current);
    setHoveredKey(null);
    setBubbleKey(null);
    setOpenCluster(null);
    setPreviewCluster(null);
  }, []);
  useEffect(() => () => clearTimeout(graceRef.current), []);

  // WCAG 1.4.13: content shown on hover or focus is dismissible without moving
  // the pointer or the focus. Through the shell's interceptor seam rather than a
  // listener of our own — a bubble opened by HOVER holds no focus, so a keydown
  // never reaches the trigger, and `Modal` claims Escape on `window` in the
  // capture phase, which beats a plain document listener.
  const overlayOpen = bubbleKey !== null || openCluster !== null || previewCluster !== null;
  useEffect(() => {
    if (!overlayOpen) return;
    return registerModalEscapeInterceptor((event) => {
      if (event.key !== 'Escape') return false;
      closeOverlays();
      return true;
    });
  }, [overlayOpen, closeOverlays]);

  // Clamp a bubble inside the track, then aim its arrow at the dot it describes.
  // Written straight to the node: its own width is only known once it is in the
  // DOM, and putting that in state would re-render on every hover.
  const aimBubble = useCallback((el: HTMLDivElement | null, x: number) => {
    if (!el) return;
    const half = el.offsetWidth / 2;
    const left = half > 0 ? Math.max(half, Math.min(x, trackPx - half)) : x;
    el.style.left = `${left}px`;
    el.style.setProperty('--rosh-tl-arrow', `${half + (x - left)}px`);
  }, [trackPx]);

  const bubbleMark = marks.find((mark) => mark.key === bubbleKey) ?? null;
  const bubbleX = bubbleMark ? bubbleMark.x : 0;
  useMeasureEffect(() => { aimBubble(tipRef.current, bubbleX); }, [aimBubble, bubbleX]);

  const order = marks.map((mark) => mark.key);
  const tabKey = focusKey && order.includes(focusKey)
    ? focusKey
    : resolvedCurrent && order.includes(resolvedCurrent) ? resolvedCurrent : order[0];

  const onListKeyDown = (event: React.KeyboardEvent) => {
    const from = order.indexOf((event.target as HTMLElement).dataset?.timelineKey ?? '');
    if (from < 0) return;
    const to = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? from + 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? from - 1
        : event.key === 'Home' ? 0
          : event.key === 'End' ? order.length - 1
            : -1;
    if (to < 0 || to > order.length - 1) return;
    event.preventDefault();
    setFocusKey(order[to]);
    nodeRefs.current.get(order[to])?.focus();
  };

  const showBubble = (key: string) => {
    clearTimeout(graceRef.current);
    setHoveredKey(key);
    setBubbleKey(key);
  };
  const hideBubble = (key: string) => {
    setHoveredKey((prev) => (prev === key ? null : prev));
    clearTimeout(graceRef.current);
    graceRef.current = setTimeout(
      () => setBubbleKey((prev) => (prev === key ? null : prev)),
      BUBBLE_GRACE_MS,
    );
  };

  const nodeProps = (mark: Mark): NodeButtonProps => ({
    type: 'button',
    'data-timeline-node': mark.isItem ? 'item' : 'marker',
    'data-timeline-key': mark.key,
    'aria-label': accessibleName(mark),
    'aria-describedby': bubbleKey === mark.key ? tipId : undefined,
    title: `${mark.label} • ${mark.dateText}`,
    tabIndex: mark.key === tabKey ? 0 : -1,
    ref: (el: HTMLButtonElement | null) => {
      if (el) nodeRefs.current.set(mark.key, el);
      else nodeRefs.current.delete(mark.key);
    },
    onMouseEnter: () => showBubble(mark.key),
    onMouseLeave: () => hideBubble(mark.key),
    onFocus: () => { showBubble(mark.key); setFocusKey(mark.key); },
    onBlur: () => hideBubble(mark.key),
    onPointerDown: (event) => event.stopPropagation(),
    onClick: (event) => {
      event.stopPropagation();
      mark.onClick?.();
      if (mark.isItem) onActivate?.(mark.key);
    },
  });

  if (vertical) {
    return (
      <VerticalTrack
        marks={marks} pending={pending} currentKey={resolvedCurrent} todayMs={now}
        reveal={reveal} ariaLabel={ariaLabel} step={step}
        nodeProps={nodeProps} onKeyDown={onListKeyDown}
      />
    );
  }

  const usesFarLane = labels === 'active' || marks.length > 1;
  return (
    <div className={`rosh-tl-body${pending.length > 0 ? '' : ' is-solo'}`}>
      <div className="flex items-stretch gap-3">
        {edgeCaptions?.start && <div className="rosh-tl-edge text-right">{edgeCaptions.start}</div>}
        <div className="rosh-tl-stage" style={{ height: `${stageHeight(geo, usesFarLane, phases.length > 0)}px` }}>
          <div ref={layerRef} className="rosh-tl-layer">
            <MeasuringRow marks={marks} innerRef={measureRef} />
            <TrackRail axis={axis} geo={geo} fillTo={fillTo} reveal={reveal} trackPx={trackPx} />
            <Ruler startMs={startMs} endMs={endMs} axis={axis} geo={geo} reveal={reveal} />
            {/* Today is drawn even where the axis was cut, unlike a ruler tick:
                a tick inside a cut labels a coordinate with no date, but "you
                are here" is the one landmark a reader needs most in exactly the
                stretch that got compressed. */}
            {now > startMs && now < endMs && (
              <TodayMark x={xOf(now)} geo={geo} trackPx={trackPx} label={fmtSliderDate(now)} reveal={reveal} />
            )}
            {phases.map((phase) => <PhaseBracket key={phase.key} phase={phase} geo={geo} xOf={xOf} />)}
            <ol className="rosh-tl-nodes" aria-label={ariaLabel} onKeyDown={onListKeyDown}>
              {marks.map((mark, index) => {
                const dressing = nodeDressing(mark.kind, mark.role);
                const glyph = KIND_STYLES[mark.kind].glyph;
                return (
                  <li key={mark.key} {...(mark.key === resolvedCurrent ? { 'aria-current': 'step' as const } : {})}>
                    <button {...nodeProps(mark)}
                      className={`${dressing.className}${mark.key === activeKey ? ' is-active' : ''}${reveal ? ' rosh-tl-pop' : ''}`}
                      style={{
                        ...dressing.style,
                        left: `${mark.x}px`,
                        top: `${geo.rail + RAIL_PX / 2}px`,
                        ...(reveal ? stagger(index, step) : {}),
                      }}>
                      {glyph && <Glyph name={glyph} />}
                      {mark.role === 'current' && (
                        <span aria-hidden="true" className={`rosh-tl-pulse bg-blue-500${reveal ? ' is-on' : ''}`} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
            {labels === 'lanes' ? (
              <LaneLabels
                marks={marks} trackPx={trackPx} geo={geo} startMs={startMs} endMs={endMs}
                currentKey={resolvedCurrent} hoveredKey={hoveredKey} reveal={reveal} step={step}
                popId={popId} aimBubble={aimBubble}
                openCluster={openCluster} setOpenCluster={setOpenCluster}
                previewCluster={previewCluster} setPreviewCluster={setPreviewCluster}
              />
            ) : (
              <ActiveLabel
                marks={marks} trackPx={trackPx} geo={geo}
                activeKey={activeKey} hoveredKey={hoveredKey} currentKey={resolvedCurrent}
              />
            )}
            {bubbleMark && (
              <div ref={tipRef} id={tipId} role="tooltip" className="rosh-tl-bubble"
                data-timeline-part="tooltip"
                style={{ top: `${geo.rail + RAIL_PX + 6}px` }}
                onMouseEnter={() => showBubble(bubbleMark.key)}
                onMouseLeave={() => hideBubble(bubbleMark.key)}>
                <span className="rosh-tl-name">{bubbleMark.label}</span>
                <span className="rosh-tl-date">{bubbleMark.dateText}</span>
                {bubbleMark.detail && <span className="rosh-tl-detail">{bubbleMark.detail}</span>}
              </div>
            )}
            {thumb && (
              <ThumbLayer thumb={thumb} axis={axis} geo={geo} startMs={startMs} endMs={endMs}
                trackPx={trackPx} layerRef={layerRef} />
            )}
          </div>
        </div>
        {edgeCaptions?.end && <div className="rosh-tl-edge text-left">{edgeCaptions.end}</div>}
      </div>
      {pending.length > 0 && <PendingColumn pending={pending} reveal={reveal} />}
    </div>
  );
}
