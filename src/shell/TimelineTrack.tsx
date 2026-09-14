import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ComponentPropsWithRef, type CSSProperties, type ReactNode, type RefObject,
} from 'react';
import { DAY_MS, fmtSliderDate } from './timelineDates';
import { registerModalEscapeInterceptor } from './escapeInterceptors';
import { TimelineGlyph, type TimelineGlyphName } from './timelineGlyphs';
import { stagger } from '../charts/effects';
import {
  clampLabelLeft, clusterLabel, clusterMarks, compressTimeAxis, estimateLabelWidth,
  packLabelLanes, FALLBACK_TRACK_PX, TRACK_LABEL_LANE_COUNT,
  type ClusterGroup, type CompressedAxis,
} from './timelineGeometry';
import {
  advancePlayback, playbackSegments, positionAt, progressBetween,
  type PlaybackCursor, type PlaybackNode, type TimelineScrubProgress,
} from './timelinePlayback';

export type { TimelineScrubProgress } from './timelinePlayback';

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Visual category for one mark on the track. Drives SHAPE and glyph, so a reader
 * can tell a shipment from a drawing revision without reading a word — and
 * without a hue doing the telling. Every kind but `completion` paints in the
 * accent; see the mapping block in `ui.css` for why.
 *
 * `MilestoneKind` is this list minus the two only a production bar has, and
 * `TimelineMarkerKind` is the two a marker may be — one union, so a kind added
 * here cannot be missing a style below.
 */
export type TimelineTrackKind =
  | 'default'    // accent disc, a flag on the one that opened the programme
  | 'dfm'        // accent disc with a document — an engineering iteration
  | 'shipment'   // accent diamond — goods moving
  | 'testing'    // accent disc with a flask — a test, a sign-off, a mould check
  | 'completion' // success disc with a check — the thing finished
  | 'inspection' // accent disc with a flask — a QC report filed against the order
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
  /**
   * Which glyph sits inside the dot. Defaults by kind; `'none'` draws a bare
   * one. The FIRST dated mark of the default kind gets a flag when it asks for
   * nothing else, because that is the milestone that opened the programme.
   */
  glyph?: TimelineGlyphName | 'none';
  /**
   * Rich content for the hover/focus popover — a drawing's version and feedback
   * snippet, a report's stage row, a shipment's goods-issue number. Rendered
   * under the mark's own label and date; without it the popover falls back to
   * label · date · `detail`.
   *
   * The popover has ALREADY drawn the label and the date line above this, so a
   * preview that opens with either of them says it twice. Give it what the two
   * lines do not already say.
   */
  preview?: ReactNode;
  /** Optional click handler — the dot is a button either way, so its tooltip is
   *  focusable, but only a handler makes activating it do something. */
  onClick?: () => void;
  /**
   * Opens the DOCUMENT behind the mark, as opposed to selecting it. When set,
   * the mark's drawn label becomes a real button and the popover grows an
   * "Open" footer; without it the label is text, because a label that looks
   * like a link and does nothing is worse than one that does not.
   */
  onOpen?: () => void;
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
  /** Rich content for the hover/focus popover — see `TimelineTrackItem`. The
   *  label and the date line are already drawn above it; do not repeat them. */
  preview?: ReactNode;
  /** Optional click handler — when set, the dot calls this with the marker. */
  onClick?: (m: TimelineMarker) => void;
  /** Opens the document behind the marker — a goods issue, a QC report. */
  onOpen?: (m: TimelineMarker) => void;
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
  /**
   * The only values the thumb may rest on, epoch ms, in any order.
   *
   * With stops the slider is DISCRETE: a drag follows the pointer but the thumb
   * snaps to the nearest stop as it goes, a release settles on one, and the
   * arrow keys step between them. That is the difference between a bar you can
   * read and a bar you can interpolate — a production scrubber has facts on
   * certain days and nothing at all between them, so a thumb resting on the
   * 11th of the month would be claiming a snapshot nobody filed.
   *
   * Without it the thumb is continuous and the arrows move by the day.
   */
  stops?: number[];
  /** What a screen reader should read for a value — "PP#10143 · 13/05/2026".
   *  Defaults to the date alone. */
  valueText?: (ms: number) => string;
  /** Names the slider. Defaults to "Scrub the timeline". */
  ariaLabel?: string;
}

/**
 * Playback: the thumb travelling the rail on its own, stop to stop.
 *
 * The caller owns the button and the `playing` flag; the track owns the travel,
 * because the travel is measured in pixels of ITS axis and the caller has never
 * been told how wide the track is. Flip `playing` on and the thumb glides from
 * the stop it is on to the next one, rests there, and goes on; flip it off
 * mid-glide and it freezes where it is, with the same flag turning it back on
 * from exactly there.
 *
 * `onArrive` is deliberately NOT `onActivate`. Activating a mark is what a click
 * means, and in both portals that navigates — the admin window swaps itself to
 * the report you clicked. A playback that activated each stop in turn would
 * therefore walk the user through six windows and, by remounting the card,
 * cancel itself on the first one. Arriving is a quieter event: move the value,
 * swap the snapshot, leave the window alone.
 */
export interface TimelineTrackPlayback {
  /** True while the thumb should be travelling. */
  playing: boolean;
  /**
   * The thumb has reached a stop. Fired once per stop, in axis order, at the
   * moment of arrival and never mid-glide — which is what keeps the consumer's
   * status line ("Showing PP#…") an account of where the thumb IS rather than a
   * counter that ticks while it moves.
   *
   * The caller is expected to move `thumb.valueMs` to `ms`: that is what the
   * next segment is measured from.
   */
  onArrive: (key: string, ms: number) => void;
  /**
   * Where the thumb is BETWEEN two stops, on every frame it is travelling, and
   * `null` the moment it is not — on arrival, on a pause, on a cancel, at the
   * end of the run, and on the release of a drag.
   *
   * `onArrive` is the event; this is the journey, and a consumer needs both for
   * a different reason. The kit does not render the table under the timeline,
   * and the table is why this exists: while the thumb travels from one report
   * to the next, the quantities beneath it should travel too rather than
   * waiting for the arrival and jumping. `t` is the EASED fraction — the same
   * number that places the disc — so figures interpolated on it move with the
   * disc and not against it.
   *
   * A drag reports the same shape with the pointer's LINEAR fraction between
   * its two neighbouring stops: the disc snaps to the nearest one as it goes, so
   * the hand is the only continuous thing there is to report. Under
   * `prefers-reduced-motion` a playback has no travel to report, so the only
   * value it ever passes is `null`.
   */
  onProgress?: (state: TimelineScrubProgress | null) => void;
  /** Playback is over — the last stop was reached, or a drag, a click or a key
   *  took the thumb back. The caller is expected to set `playing` false; the
   *  next `playing` turns into a fresh run rather than a resume. */
  onStop?: () => void;
  /** Multiplier on the glide and the dwell alike. Defaults to 1, which is the
   *  timing `timelinePlayback.ts` specifies. */
  speed?: number;
}

export interface TimelineTrackProps {
  /** Left edge of the window, epoch ms. */
  startMs: number;
  /** Right edge of the window, epoch ms. */
  endMs: number;
  /**
   * `'compressed'` CUTS any stretch holding more than 30% of the window's time
   * down to a fixed notch with a break glyph saying how many days it hides, and
   * shares the rest of the track proportionally among what is left;
   * `'linear'` (the default) keeps time proportional throughout. A bar whose
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
  /** Drives the thumb along the rail by itself. Needs a `thumb`; without one
   *  there is nothing to move. */
  playback?: TimelineTrackPlayback;
  /**
   * The captions on the two ends of the axis.
   *
   * `start` names the START ANCHOR — the ring the track draws at `startMs`
   * whether or not anything happened on that day — and defaults to
   * `Start · <date>` in the reader's own date format. It is what makes "the
   * timeline starts at zero, not at the first production report" (Henry,
   * 2026-09-14) something the reader can SEE: before it, a bar whose first
   * report landed two days after the production start date opened with the
   * report sitting on the rail's left end, and nothing said the axis had begun
   * earlier.
   *
   * `end` is optional and has no default: the right edge is either today, which
   * has its own tag, or a completion, which has its own mark.
   */
  edgeCaptions?: { start?: ReactNode; end?: ReactNode };
  /** Parallel-work brackets under the rail. */
  phases?: TimelineTrackPhase[];
  /** The one mark that is "where we are": `aria-current="step"`, the larger
   *  accent disc, and the pulse. Defaults to the last dated item. */
  currentKey?: string;
  /**
   * Magnify one stretch of the axis, the way hovering a `×N` pill does.
   *
   * The marks inside the range spread until each pair is at least 28 px apart —
   * far enough for them to carry their own labels — and the rest of the axis
   * gives up the room in proportion. `null` (the default) is the whole bar at
   * one density. It exists so a consumer can offer "zoom to the DFM phase" as
   * an action rather than as something only a pointer can reach.
   */
  zoomRange?: [number, number] | null;
  /** Play the mount reveal. Default true; reduced motion is handled in CSS. */
  motion?: boolean;
  /** Names the ordered list of dated marks. Required — a list of dots with no
   *  name is a list of nothing. */
  ariaLabel: string;
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** The rail's own height. 6 px, as the approved prototype draws it: at 8 the
 *  rail competes with the 10 px dots standing on it, and the bar reads as the
 *  subject of the card rather than as the line the events are placed on. Every
 *  other offset is derived from it, so this is the only number to change. */
const RAIL_PX = 6;

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

/** The stage's side inset, so a dot on the first or last day is not clipped —
 *  `ui.css` sets the padding, and the threshold below has to know about it. */
const EDGE_INSET_PX = 10;

/** The pending column and the gap beside it, as `ui.css` sizes them.
 *
 *  The variant decision is taken against the CARD's width minus that column,
 *  rather than against the track element itself, because the track only exists
 *  in one of the two variants: a card measured through it goes vertical once
 *  and can never come back, since there is then nothing left to observe. */
const PENDING_COLUMN_PX = 156;
const BODY_GAP_PX = 20;

/** Two rows of pending, then a real button for the rest. A `title` is invisible
 *  on touch, so it cannot be the only way to read what was folded. */
const PENDING_ROW_LIMIT = 2;

/** A week tick is drawn only where the weeks stand this far apart. */
const WEEK_TICK_MIN_PX = 14;

/**
 * The start anchor's footprint. A dated mark landing inside it is ON the start
 * day as far as the eye is concerned, and the ring opens out to encircle it
 * rather than sitting under it — neither hides the other, and neither moves,
 * because moving one would put it on a date it does not have.
 */
const START_MARK_PX = 14;

/** The start/end caption's own height, so it can be hung off the rail rather
 *  than off a lane: the two label strategies put their lanes in different
 *  places, and the caption's relationship to the rail is the same in both. */
const START_CAPTION_PX = 13;

/** What the start caption is assumed to be worth in lane-packing width when a
 *  consumer passed something richer than a string. Wide enough for the default
 *  `Start · 20/01/2026`, which is the only caption the kit itself writes. */
const START_CAPTION_FALLBACK_PX = 96;

/** The lane the start caption reserves, under a key no mark can collide with —
 *  a consumer's `TimelineTrackItem.key` is its own, and this one is not. */
const START_LANE_KEY = '__rosh-tl-start__';

/** A month is LABELLED only when it clears this much from the last label, so the
 *  same code serves a 73-day order and a 337-day mould. */
const MONTH_LABEL_PITCH_PX = 72;

/** Per character, for the 10 px mono face the ruler and the date lines use. Only
 *  ever used to decide whether two pieces of ruler text would collide. */
const MONO_CHAR_PX = 5.6;

/** How long a mark stays lit after the thumb has crossed it. */
const SNAP_FLASH_MS = 460;

/** How long a bubble survives the pointer leaving its dot. WCAG 1.4.13 asks for
 *  hoverable content, and the bubble sits a few pixels below the dot: without
 *  the grace the pointer dismisses it on the way. */
const BUBBLE_GRACE_MS = 160;

/** Does the machine ask for stillness? Read once per card, as `Modal` reads it —
 *  a media query consulted during render would make render impure, and a user who
 *  changes the setting is one window open away from the new answer. */
function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // A jsdom without media queries, or a browser that refused the query: the
    // answer that keeps the motion is the one the stylesheet would also give.
    return false;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monoWidth = (text: string) => text.length * MONO_CHAR_PX;

// ─── Kind styles ─────────────────────────────────────────────────────────────

type NodeRole = 'dot' | 'key' | 'current';

interface KindStyle {
  /** `true` when the mark is drawn as a rotated square. */
  diamond?: boolean;
  /** Which glyph sits inside a filled node, unless the item names another. */
  glyph?: TimelineGlyphName;
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
  // No glyph by default: a flag belongs on the milestone that OPENED the
  // programme, not on every milestone whose kind nobody set.
  default: {},
  dfm: { glyph: 'doc', token: 'var(--tl-dfm)' },
  shipment: { diamond: true, token: 'var(--tl-shipment)' },
  testing: { glyph: 'flask', token: 'var(--tl-testing)' },
  completion: { glyph: 'check', token: 'var(--tl-completion)' },
  // A disc with a flask, not a diamond: a diamond is goods moving, and a bar
  // that draws an inspection as one has two meanings for a shape.
  inspection: { glyph: 'flask', token: 'var(--tl-inspection)' },
  report: {},
};

/**
 * The kind a glyph implies, for a mark whose kind says nothing.
 *
 * The milestone spec and the reader's eye do not line up everywhere: "DFM
 * Confirmed" is a `default` milestone in the spec and a signed drawing on the
 * card, so a caller naming `glyph: 'doc'` gets the filled document disc that
 * goes with it rather than a bare accent disc. Only `default` borrows — a kind
 * that was stated is never overridden.
 */
const GLYPH_KIND: Partial<Record<TimelineGlyphName, TimelineTrackKind>> = {
  doc: 'dfm',
  flask: 'testing',
  check: 'completion',
};

/** The kind a mark is drawn in, after a named glyph has had its say. */
function resolveKind(item: TimelineTrackItem): TimelineTrackKind {
  const kind = item.kind ?? 'default';
  if (kind !== 'default' || !item.glyph || item.glyph === 'none') return kind;
  return GLYPH_KIND[item.glyph] ?? kind;
}

/** The glyph a mark wears: its own, else its kind's, else a flag if it is the
 *  first thing that happened. */
function resolveGlyph(
  item: TimelineTrackItem,
  kind: TimelineTrackKind,
  opensProgramme: boolean,
): TimelineGlyphName | undefined {
  if (item.glyph === 'none') return undefined;
  if (item.glyph) return item.glyph;
  return KIND_STYLES[kind].glyph ?? (opensProgramme ? 'flag' : undefined);
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
  /** Where it is drawn — magnified when a stretch is zoomed. */
  x: number;
  /** Where it would be with nothing magnified. The pill and the clustering read
   *  this one: a pill that moved when the axis opened around it would slide out
   *  from under the pointer that opened it, close, and open again. */
  baseX: number;
  kind: TimelineTrackKind;
  label: string;
  dateText: string;
  detail?: ReactNode;
  /** Rich popover content, when the caller supplied any. */
  preview?: ReactNode;
  /** Which glyph sits inside the node, once kind and item have both had a say. */
  glyph?: TimelineGlyphName;
  role: NodeRole;
  /** The width of the label it would draw, measured or estimated. */
  widthPx: number;
  /** Ordinary dots fold into `×N` pills; the marks that settle something never
   *  do, and neither does a context marker. */
  collapsible: boolean;
  onClick?: () => void;
  /** Opens the document behind the mark, when the caller wired one up. */
  onOpen?: () => void;
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

/**
 * An element's width, watched: the same eight milestones fit one lane in a
 * maximised window and two in a side-by-side pane.
 *
 * `enabled` is how the observer follows an element that comes and goes — the
 * track layer exists only in the horizontal variant, and an effect keyed on the
 * ref alone never re-attaches when it is rendered again.
 *
 * A reading of zero is discarded rather than stored. A detaching element
 * measures 0 and a ResizeObserver reports that last size on the way out, so
 * "the element went away" and "the element is 0 px wide" arrive as the same
 * number — and taking it would collapse the axis at the moment the card
 * switched variants.
 */
function useObservedWidth(ref: RefObject<HTMLElement>, enabled: boolean): number {
  const [width, setWidth] = useState(0);
  useMeasureEffect(() => {
    const el = enabled ? ref.current : null;
    if (!el) return;
    const read = () => {
      const next = el.getBoundingClientRect().width;
      if (next > 0) setWidth(next);
    };
    read();
    // Guarded: this package renders under jsdom and under the server renderer,
    // and neither is required to have a ResizeObserver.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [ref, enabled]);
  return width;
}

/** The floor on how far apart a magnified stretch holds its marks. The real
 *  target is the room two labels need side by side; this is what a pair with no
 *  labels to speak of still gets. */
const ZOOM_MIN_PITCH_PX = 28;

/** Clear space between two magnified labels, once each has its own width. */
const ZOOM_LABEL_PAD_PX = 8;

/** A magnified stretch may not take more of the track than this. Past it the
 *  rest of the programme has stopped being context and become a margin. */
const ZOOM_MAX_SHARE = 0.8;

/** How long the axis takes to open and close around a magnified stretch. */
const ZOOM_TWEEN_MS = 240;

/**
 * Magnify one stretch of a built axis, compressing the rest to pay for it.
 *
 * A fisheye rather than a filter: every mark stays on the bar and keeps its
 * order, so the reader can see what the cluster is a part of while reading what
 * is inside it. Each pair of the magnified marks is opened to at least
 * `ZOOM_MIN_PITCH_PX` — which is the width a label needs, and the reason four
 * revisions on one fortnight can show four labels while zoomed and one pill
 * while not.
 *
 * It wraps the axis rather than rebuilding it, so the cut glyphs, the anchors
 * and `inCut` are the SAME answers as the unzoomed bar: zooming changes where a
 * date is drawn, never which stretches the axis decided not to keep time in.
 */
function magnifyAxis(
  base: CompressedAxis,
  focus: { x: number; widthPx: number }[],
  track: number,
): CompressedAxis {
  // Two marks on ONE day are one coordinate, here as everywhere else: an axis
  // that pulled them apart would be inventing a date to put between them. They
  // are still both in the pill's popover, which is where a reader finds out
  // that two of the four revisions landed together.
  const byX = new Map<number, number>();
  for (const mark of focus) {
    if (!Number.isFinite(mark.x)) continue;
    byX.set(mark.x, Math.max(byX.get(mark.x) ?? 0, mark.widthPx));
  }
  const xs = [...byX.keys()].sort((a, b) => a - b);
  if (track <= 0 || xs.length < 2) return base;

  const from = Math.max(0, xs[0]);
  const to = Math.min(track, xs[xs.length - 1]);
  const span = to - from;
  const wants: number[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    // Enough for both labels, never less than the floor, and never less than
    // the room the pair already had: a zoom only ever opens.
    const labels = (byX.get(xs[i]) ?? 0) / 2 + (byX.get(xs[i + 1]) ?? 0) / 2 + ZOOM_LABEL_PAD_PX;
    wants.push(Math.max(ZOOM_MIN_PITCH_PX, labels, xs[i + 1] - xs[i]));
  }
  const wanted = wants.reduce((sum, width) => sum + width, 0);
  const width = Math.min(Math.max(wanted, span), track * ZOOM_MAX_SHARE);
  // Already roomy enough to read: magnifying it would move every other mark for
  // no gain, which is the thing that makes a fisheye feel like a glitch.
  if (width <= span + 0.5) return base;

  const leftOld = from;
  const rightOld = track - to;
  const outside = leftOld + rightOld;
  const rest = Math.max(0, track - width);
  const leftNew = outside > 0 ? (rest * leftOld) / outside : 0;
  const fromNew = leftNew;
  const toNew = leftNew + width;
  const inner = wants.map((want) => (wanted > 0 ? (want * width) / wanted : 0));

  const map = (x: number): number => {
    if (x <= from) return leftOld > 0 ? (x * leftNew) / leftOld : fromNew;
    if (x >= to) return rightOld > 0 ? toNew + ((x - to) * (track - toNew)) / rightOld : toNew;
    let at = fromNew;
    for (let i = 0; i + 1 < xs.length; i++) {
      if (x > xs[i + 1]) { at += inner[i]; continue; }
      const sub = xs[i + 1] - xs[i];
      return at + (sub > 0 ? ((x - xs[i]) / sub) * inner[i] : 0);
    }
    return toNew;
  };
  const unmap = (x: number): number => {
    if (x <= fromNew) return leftNew > 0 ? (x * leftOld) / leftNew : from;
    if (x >= toNew) return track - toNew > 0 ? to + ((x - toNew) * rightOld) / (track - toNew) : to;
    let at = fromNew;
    for (let i = 0; i + 1 < xs.length; i++) {
      if (x > at + inner[i]) { at += inner[i]; continue; }
      return xs[i] + (inner[i] > 0 ? ((x - at) / inner[i]) * (xs[i + 1] - xs[i]) : 0);
    }
    return to;
  };

  return {
    anchorsMs: base.anchorsMs,
    xs: base.xs.map(map),
    gaps: base.gaps.map((gap) => ({
      ...gap,
      fromPx: map(gap.fromPx),
      toPx: map(gap.toPx),
      px: map(gap.toPx) - map(gap.fromPx),
    })),
    xByMs: (ms) => map(base.xByMs(ms)),
    msByPx: (px) => base.msByPx(unmap(px)),
    inCut: base.inCut,
  };
}

/** The thumb's allowed values, ascending — or null where it is continuous. */
function sortedStops(stops: number[] | undefined): number[] | null {
  if (!stops || stops.length === 0) return null;
  const clean = stops.filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
  return clean.length > 0 ? clean : null;
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

  // The axis begins HERE, and a tick is what says so. What stood at x = 0
  // before was the month boundary preceding `startMs`, drawn as a label with no
  // tick under it — a month the window does not contain, pinned to a coordinate
  // that is not its date, and the only thing the left end of the bar had to say
  // for itself. The start caption carries the start date now, so the ruler
  // labels boundaries STRICTLY INSIDE the window and marks the start itself.
  ticks.push(
    <i key="start" data-timeline-part="start-tick" className="rosh-tl-tick"
      style={{ left: '0px', top: `${y}px`, height: '6px' }} />,
  );

  const cursor = new Date(startMs);
  cursor.setUTCDate(1);
  let lastLabelX = -Infinity;
  let firstLabel = true;
  while (cursor.getTime() < endMs) {
    const t = cursor.getTime();
    // `<=`, not `<`: a window that opens on the first of a month already has a
    // tick there, and a second one on top of it is a thicker line, not a date.
    const beforeStart = t <= startMs;
    if (!beforeStart && !axis.inCut(t)) {
      const x = axis.xByMs(t);
      ticks.push(
        <i key={`mo-${t}`} className="rosh-tl-tick" style={{ left: `${x}px`, top: `${y}px`, height: '6px' }} />,
      );
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
            {/* Hollow, and in the shape its kind would wear on the rail: a
                shipment that has not happened is still shipment-shaped. */}
            <span aria-hidden="true"
              className={`rosh-tl-node is-ghost${entry.kind && KIND_STYLES[entry.kind].diamond ? ' is-diamond' : ''}`} />
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
          const { glyph } = mark;
          return (
            <li key={mark.key} className={reveal ? 'rosh-tl-fade' : undefined}
              style={reveal ? stagger(index, step) : undefined}
              {...(mark.key === currentKey ? { 'aria-current': 'step' as const } : {})}>
              <i aria-hidden="true"
                className={`rosh-tl-vline text-blue-500${reached ? ' is-on' : ' is-dash'}${reached && reveal ? ' rosh-tl-drawy' : ''}`} />
              <button {...nodeProps(mark)}
                className={`${dressing.className}${reveal ? ' rosh-tl-pop' : ''}`}
                style={{ ...dressing.style, ...(reveal ? stagger(index, step) : {}) }}>
                {glyph && <TimelineGlyph name={glyph} />}
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
function TrackRail({ axis, geo, fillTo, reveal, trackPx, tweened = false }: {
  axis: CompressedAxis;
  geo: TrackGeometry;
  fillTo: number | null;
  reveal: boolean;
  trackPx: number;
  /** True where a thumb drives the fill, which is the only case in which its
   *  width should ease: a resize moving it is a relayout, not a move. */
  tweened?: boolean;
}) {
  return (
    <div aria-hidden="true">
      <div className="rosh-tl-rail bg-gray-200" style={{ top: `${geo.rail}px`, height: `${RAIL_PX}px` }} />
      {fillTo !== null && (
        <div data-timeline-part="fill"
          className={`rosh-tl-fill bg-blue-500${tweened ? ' is-tweened' : ''}${reveal ? ' rosh-tl-draw' : ''}`}
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

/**
 * The start anchor: where the axis begins, drawn whether or not anything
 * happened there.
 *
 * A window opens on the day production started, not on the day the first report
 * was filed — but nothing used to be DRAWN at `startMs`, so a report two days
 * in (0.84% of a 237-day window, ~7.6px inside a 10px inset) sat on the rail's
 * left end and read as the beginning of the programme. The ring says otherwise,
 * and the caption under it says when.
 *
 * It is decoration, not a mark: `aria-hidden`, `pointer-events: none`, absent
 * from the ordered list the screen reader walks, and never one of the thumb's
 * stops. The date it stands for is in the caption, which is text.
 *
 * `around` is the collision case — a dated mark inside `START_MARK_PX` of the
 * start, which is every mould card, whose window opens ON its first milestone.
 * The ring opens out and encircles that mark instead of sitting under it: both
 * stay visible, and neither moves, because time stays linear.
 */
function StartMark({ geo, caption, endCaption, around, reveal, trackPx }: {
  geo: TrackGeometry;
  caption: ReactNode;
  endCaption: ReactNode;
  around: boolean;
  reveal: boolean;
  trackPx: number;
}) {
  const capTop = geo.rail - START_CAPTION_PX - 4;
  const fade = reveal ? ' rosh-tl-fade' : '';
  const delay = reveal ? { animationDelay: '420ms' } : {};
  return (
    <div aria-hidden="true" data-timeline-part="start">
      <i className={`rosh-tl-start${around ? ' is-around' : ''}${fade}`}
        style={{ left: '0px', top: `${geo.rail + RAIL_PX / 2}px`, ...delay }} />
      {caption != null && caption !== false && (
        <span className={`rosh-tl-edge${fade}`} data-timeline-part="start-caption"
          style={{ left: '0px', top: `${capTop}px`, ...delay }}>
          {caption}
        </span>
      )}
      {endCaption != null && endCaption !== false && (
        <span className={`rosh-tl-edge is-end${fade}`} data-timeline-part="end-caption"
          style={{ left: `${trackPx}px`, top: `${capTop}px`, ...delay }}>
          {endCaption}
        </span>
      )}
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

/**
 * The one label a scrubber draws: the hovered mark, else the active one.
 *
 * When the mark has an `onOpen` the NAME is a real button — the document behind
 * the dot is the thing a reader wants next, and a dot that only selects leaves
 * them hunting for a row in a table to click. It is the one part of the label
 * that is not `aria-hidden`: the rest restates the dot's own accessible name,
 * but a control has to be reachable.
 */
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
  const { onOpen } = mark;
  return (
    <div data-timeline-part="label"
      className={`rosh-tl-label${mark.key === hoveredKey ? ' is-hot' : ''}${mark.key === currentKey ? ' is-current' : ''}`}
      style={{
        left: `${clampLabelLeft(mark.x, mark.widthPx, trackPx)}px`,
        top: `${geo.laneB}px`,
        width: `${mark.widthPx}px`,
        height: `${geo.laneH}px`,
      }}>
      {onOpen ? (
        <button type="button" className="rosh-tl-name rosh-tl-open" data-timeline-part="open"
          aria-label={`Open ${mark.label}`} onClick={onOpen}>
          {mark.label}
        </button>
      ) : (
        <span className="rosh-tl-name" aria-hidden="true">{mark.label}</span>
      )}
      <span className="rosh-tl-date" aria-hidden="true">{mark.dateText}</span>
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
  groups, trackPx, geo, startMs, endMs, currentKey, hoveredKey, reveal, step, zoomedKey,
  popId, aimBubble, openCluster, setOpenCluster, previewCluster, setPreviewCluster, setZoomKey,
  startCaptionPx,
}: {
  groups: ClusterGroup<Mark>[];
  trackPx: number;
  geo: TrackGeometry;
  startMs: number;
  endMs: number;
  /** How much room the start caption claims at x = 0, so a label on the start
   *  day is packed into the other lane instead of overprinting it. 0 where the
   *  caller drew no caption. */
  startCaptionPx: number;
  currentKey: string | null;
  hoveredKey: string | null;
  reveal: boolean;
  step: number;
  /** The cluster whose stretch is currently magnified, if any: its members show
   *  their own labels, because that is what the magnification was for. */
  zoomedKey: string | null;
  popId: string;
  aimBubble: (el: HTMLDivElement | null, x: number) => void;
  openCluster: string | null;
  setOpenCluster: (key: string | null) => void;
  previewCluster: string | null;
  setPreviewCluster: (key: string | null) => void;
  setZoomKey: (key: string | null) => void;
}) {
  const boxes: LaneBox[] = [];
  groups.forEach((group, index) => {
    if (group.type === 'cluster') {
      const key = `cluster-${group.members[0].key}`;
      const text = clusterLabel(group.members);
      boxes.push({
        key,
        group,
        text,
        // The PILL does not move when the axis opens under it: it is the control
        // the pointer is resting on, and a control that slides away from the
        // pointer that opened it closes itself.
        x: group.members.reduce((sum, m) => sum + m.baseX, 0) / group.members.length,
        index,
        lane: -1,
        left: 0,
        // A pill is a chip, not a two-line label: its text, its kind dot and the
        // padding around them.
        widthPx: Math.ceil(monoWidth(text)) + 28,
      });
      // Magnified: the members are far enough apart to say who they are.
      if (key === zoomedKey) {
        for (const member of group.members) {
          boxes.push({
            key: member.key,
            group: { type: 'item', mark: member },
            text: member.label,
            x: member.x,
            index,
            lane: -1,
            left: 0,
            widthPx: member.widthPx,
          });
        }
      }
      return;
    }
    boxes.push({
      key: group.mark.key,
      group,
      text: group.mark.label,
      x: group.mark.x,
      index,
      lane: -1,
      left: 0,
      widthPx: group.mark.widthPx,
    });
  });
  boxes.sort((a, b) => a.x - b.x);

  const lanes = packLabelLanes(
    [
      // The start caption is not a label, but it occupies the same band and the
      // same pixels, so the packer has to know about it: the mould card's
      // window opens ON its first milestone, and without this reservation
      // "Project Initiated" and "Start · 09/10/2025" are printed over each
      // other. Claimed before everything, so what gives way is the label — into
      // the second lane, which is what the packer is for.
      ...(startCaptionPx > 0
        ? [{ key: START_LANE_KEY, ms: startMs, xPx: 0, widthPx: startCaptionPx, priority: -2 }]
        : []),
      ...boxes.map((box) => ({
        key: box.key,
        ms: box.group.type === 'cluster' ? box.group.members[0].ms : box.group.mark.ms,
        xPx: box.x,
        widthPx: box.widthPx,
        // A pill claims its lane FIRST, which puts it in the row above the rail
        // the way the prototype draws it: it speaks for several marks, so the
        // labels that have to give way around it are single ones — and a single
        // label that finds no lane still reveals on hover, where a pill pushed
        // into the lower lane leaves the row above it empty.
        priority: box.group.type === 'cluster' ? -1 : 0,
      })),
    ],
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
  const leaderTop = (lane: number) => (lane === 0 ? geo.rail - 4 : geo.rail + RAIL_PX + 3);

  return (
    <>
      {boxes.map((box) => {
        const lane = Math.max(0, box.lane);
        const delay = Math.round(box.index * step + 60);
        if (box.group.type === 'cluster') {
          const pinned = openCluster === box.key;
          const xs = box.group.members.map((m) => m.x);
          const close = () => {
            setPreviewCluster(null);
            if (!pinned) setZoomKey(null);
          };
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
                onMouseEnter={() => { setPreviewCluster(box.key); setZoomKey(box.key); }}
                onMouseLeave={close}
                onFocus={() => { setPreviewCluster(box.key); setZoomKey(box.key); }}
                onBlur={close}
                onClick={() => {
                  setOpenCluster(pinned ? null : box.key);
                  setZoomKey(pinned ? null : box.key);
                }}>
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
 * With `stops` the thumb is magnetic: a drag follows the pointer but the disc
 * is drawn on the nearest stop the whole way across, and the caller is told
 * about a stop change the moment it happens rather than on release. The travel
 * between stops is a 120 ms CSS transition, not a rAF tween, so a drag across
 * six reports reads as six settlings instead of a slide — and reduced motion
 * takes the transition away in the stylesheet, where the rest of the card's
 * motion rule already lives.
 *
 * `glide` is the exception, and the only one: while playback owns the thumb the
 * disc, its chip and the fill are placed by an animation frame at a coordinate
 * that is not a stop, and the date on the chip is read back out of the axis. The
 * stop index the screen reader hears stays on the value the caller is showing,
 * because a slider mid-travel has not changed its value yet.
 */
function ThumbLayer({
  thumb, value, snap, axis, geo, startMs, endMs, trackPx, layerRef, glide, onScrub,
  nodes, onProgress,
}: {
  thumb: TimelineTrackThumb;
  /** The user has taken hold of the thumb — once per gesture, before the value
   *  moves. Playback lets go when this fires. */
  onScrub?: () => void;
  /** The stops playback visits, with their keys: what names the two neighbours a
   *  drag is between. Empty where the track has no playback to report to. */
  nodes: PlaybackNode[];
  /** Where the hand is between two of those stops, or `null` on release. */
  onProgress: (state: TimelineScrubProgress | null) => void;
  /** `thumb.valueMs`, clamped and snapped — what is actually drawn. */
  value: number;
  /** Where playback has the thumb, or null when the caller's value places it. */
  glide: { px: number; ms: number } | null;
  /** Clamp + snap any time onto an allowed value. */
  snap: (ms: number) => number;
  /** The allowed stops, ascending, or null for a continuous slider. */
  axis: CompressedAxis;
  geo: TrackGeometry;
  startMs: number;
  endMs: number;
  trackPx: number;
  layerRef: RefObject<HTMLDivElement>;
}) {
  const draggingRef = useRef(false);
  const x = glide ? glide.px : axis.xByMs(value);
  /** The time under the disc: the caller's value at rest, the interpolated one
   *  while playback is carrying it between two stops. */
  const at = glide ? glide.ms : value;
  const chipWidth = 88;
  const stops = sortedStops(thumb.stops);
  const index = stops ? stops.indexOf(value) : -1;

  const msFromEvent = (clientX: number): number => {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box) return value;
    return axis.msByPx(clientX - box.left);
  };
  /** Only tell the caller about a move that changes the value: a drag fires
   *  dozens of pointermoves between two stops, and each one is a re-render of
   *  the table the scrubber feeds. */
  const moveTo = (ms: number) => {
    const next = snap(ms);
    if (next !== value) thumb.onChange(next);
  };

  const beginDrag = (event: React.PointerEvent) => {
    onScrub?.();
    draggingRef.current = true;
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    thumb.onDragStart?.();
  };
  const endDrag = (event: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    // The value is already on a stop — every move snapped — so the release has
    // nothing left to settle, and there is no longer a hand between two of them.
    onProgress(null);
    thumb.onDragEnd?.();
  };
  const drag = (event: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const ms = msFromEvent(event.clientX);
    moveTo(ms);
    // The POINTER's position, not the magnet's. The disc is drawn on the nearest
    // stop the whole way across, so the hand is the only continuous thing a
    // consumer interpolating its figures can be told about.
    onProgress(progressBetween(nodes, ms));
  };

  /** Where a key takes the thumb: the neighbouring STOP where there are stops,
   *  a day (or a week with Shift) where there are not. */
  const keyTarget = (event: React.KeyboardEvent): number | null => {
    const { key } = event;
    if (stops && stops.length > 0) {
      const at = index < 0 ? 0 : index;
      if (key === 'ArrowRight' || key === 'ArrowUp') return stops[Math.min(at + 1, stops.length - 1)];
      if (key === 'ArrowLeft' || key === 'ArrowDown') return stops[Math.max(at - 1, 0)];
      if (key === 'Home') return stops[0];
      if (key === 'End') return stops[stops.length - 1];
      return null;
    }
    const step = (event.shiftKey ? 7 : 1) * DAY_MS;
    if (key === 'ArrowRight' || key === 'ArrowUp') return value + step;
    if (key === 'ArrowLeft' || key === 'ArrowDown') return value - step;
    if (key === 'Home') return startMs;
    if (key === 'End') return endMs;
    return null;
  };

  const valueText = thumb.valueText ? thumb.valueText(at) : fmtSliderDate(at);
  const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS));

  return (
    <>
      <div className="rosh-tl-hit" aria-hidden="true" data-timeline-part="hit"
        style={{ top: `${geo.rail - 9}px`, height: `${RAIL_PX + 18}px` }}
        onPointerDown={(event) => { beginDrag(event); moveTo(msFromEvent(event.clientX)); }}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag} />
      <div className="rosh-tl-chip" data-timeline-part="chip"
        style={{ left: `${clampLabelLeft(x, chipWidth, trackPx) + chipWidth / 2}px`, top: `${geo.tag}px` }}>
        {thumb.chip ? thumb.chip(at) : fmtSliderDate(at)}
      </div>
      <div role="slider" tabIndex={0} className="rosh-tl-thumb text-blue-600" data-timeline-part="thumb"
        aria-label={thumb.ariaLabel ?? 'Scrub the timeline'}
        aria-valuemin={0}
        aria-valuemax={stops && stops.length > 0 ? stops.length - 1 : days}
        aria-valuenow={stops && stops.length > 0
          ? Math.max(0, index)
          : Math.round((value - startMs) / DAY_MS)}
        aria-valuetext={valueText}
        style={{ left: `${x}px`, top: `${geo.rail + RAIL_PX / 2}px` }}
        onPointerDown={beginDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(event) => {
          const next = keyTarget(event);
          if (next === null) return;
          event.preventDefault();
          onScrub?.();
          moveTo(next);
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
 * clustering, or one active label), the local magnification of a dense stretch,
 * the optional scrubber thumb and its stops, its playback — the travel between
 * two stops is measured in pixels of this axis, which is why the caller owns the
 * button and this owns the movement — the hover previews, the pending list, the
 * motion, and the keyboard and screen-reader contract. What it does
 * not own: the card around it, its heading, its legend, or any domain summary —
 * those belong to the consumer, which knows what the bar is about. `TimelineCard`
 * is where both of the kit's own timelines put theirs.
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
  fillToMs, todayMs, labels = 'lanes', activeKey = null, onActivate, thumb, playback,
  edgeCaptions, phases = [], currentKey, zoomRange = null, motion = true, ariaLabel,
}: TimelineTrackProps) {
  // Captured once at mount so render stays idempotent — day-resolution marks do
  // not care that "today" does not tick while the view is open.
  const [mountedToday] = useState(() => Date.now());
  const [stillness] = useState(prefersReducedMotion);
  const now = todayMs ?? mountedToday;
  const rootRef = useRef<HTMLDivElement>(null);
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
  const [zoomKey, setZoomKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const tipId = useId();
  const popId = useId();

  // The card's width decides the variant; the track's own width, when there is
  // a track, is what every coordinate is computed against.
  const rootWidth = useObservedWidth(rootRef, true);
  const bodyColumn = rootWidth > 0
    ? rootWidth - (pending.length > 0 ? PENDING_COLUMN_PX + BODY_GAP_PX : 0)
    : 0;
  const vertical = bodyColumn > 0 && bodyColumn - 2 * EDGE_INSET_PX < VERTICAL_BELOW_PX;
  const layerWidth = useObservedWidth(layerRef, !vertical);
  const trackPx = layerWidth > 0 ? layerWidth : FALLBACK_TRACK_PX;
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
    axisMode === 'compressed' ? {} : { maxTimeShare: Infinity, minGapPx: 0 },
  );
  const xOf = axis.xByMs;

  const resolvedCurrent = currentKey ?? (dated.length > 0 ? dated[dated.length - 1].key : null);

  const itemMarks: Mark[] = dated.map((item, index) => {
    const dateText = item.date ?? fmtSliderDate(item.ms);
    const ordinary = (item.priority ?? 0) > 0 || item.kind === 'report';
    const kind = resolveKind(item);
    return {
      key: item.key,
      ms: item.ms,
      x: xOf(item.ms),
      baseX: xOf(item.ms),
      kind,
      label: item.label,
      dateText,
      detail: item.detail,
      preview: item.preview,
      glyph: resolveGlyph(item, kind, index === 0 && kind === 'default'),
      role: item.key === resolvedCurrent ? 'current' : ordinary ? 'dot' : 'key',
      widthPx: measured[item.key] || estimateLabelWidth(item.label, dateText),
      collapsible: ordinary,
      onClick: item.onClick,
      onOpen: item.onOpen,
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
        baseX: xOf(ms),
        kind: marker.kind,
        label: marker.label,
        dateText,
        detail: marker.detail,
        preview: marker.preview,
        glyph: KIND_STYLES[marker.kind].glyph,
        role: 'key' as NodeRole,
        widthPx: measured[key] || estimateLabelWidth(marker.label, dateText),
        // A marker is context, not part of the programme: it never folds into
        // someone else's `×N`.
        collapsible: false,
        onClick: marker.onClick ? () => marker.onClick?.(marker) : undefined,
        onOpen: marker.onOpen ? () => marker.onOpen?.(marker) : undefined,
        isItem: false,
      };
    });
  const marks = [...itemMarks, ...markerMarks].sort((a, b) => a.x - b.x || a.ms - b.ms);

  // The start anchor. The caption defaults to the window's own left edge, in the
  // reader's date format, because that is the fact the bar was failing to state.
  const startCaption = edgeCaptions?.start ?? `Start · ${fmtSliderDate(startMs)}`;
  const startCaptionPx = startCaption == null || startCaption === false
    ? 0
    : typeof startCaption === 'string'
      ? Math.ceil(monoWidth(startCaption))
      : START_CAPTION_FALLBACK_PX;

  // Clustering is decided on the UNZOOMED axis, before any magnification, and
  // the answer is handed to the labels. Deciding it after the zoom would let a
  // cluster dissolve because it had been opened — and the pill the pointer is
  // resting on would be the first thing to go.
  const groups: ClusterGroup<Mark>[] = labels === 'lanes' ? clusterMarks(marks) : [];
  const groupKey = (group: ClusterGroup<Mark>) =>
    (group.type === 'cluster' ? `cluster-${group.members[0].key}` : group.mark.key);

  // What is magnified: the pill under the pointer or pinned open, else whatever
  // the caller asked for.
  const zoomedGroup = groups.find((group) => group.type === 'cluster'
    && groupKey(group) === (openCluster ?? previewCluster ?? zoomKey));
  const focusOf = (mark: Mark) => ({ x: mark.baseX, widthPx: mark.widthPx });
  const zoomFocus = zoomedGroup && zoomedGroup.type === 'cluster'
    ? zoomedGroup.members.map(focusOf)
    : zoomRange
      ? marks.filter((mark) => mark.ms >= zoomRange[0] && mark.ms <= zoomRange[1]).map(focusOf)
      : [];
  const view = zoomFocus.length > 1 ? magnifyAxis(axis, zoomFocus, trackPx) : axis;
  const zoomed = view !== axis;
  if (zoomed) {
    // The marks are rebuilt on every render, so moving them is local: the
    // alternative is a second pass that builds every mark twice to change one
    // number on each of them.
    for (const mark of marks) mark.x = view.xByMs(mark.ms);
  }
  // A mark on (or within a hair of) the start day, read off the coordinates
  // actually drawn rather than the ones before a magnification. The mould card
  // is always this case: its window opens on its first milestone.
  const startCrowded = marks.some((mark) => mark.x < START_MARK_PX);
  const zoomedKey = zoomed && zoomedGroup ? groupKey(zoomedGroup) : null;

  // A zoom opens and closes over 240ms, and the transition that carries it is
  // only armed around the change — a positional transition left on permanently
  // would ease every dot sideways while a window edge is being dragged.
  //
  // Not on mount, either: the measuring pass moves every mark from the fallback
  // track width to the measured one before the first paint, and an armed
  // transition would turn that correction into a slide.
  const zoomedRef = useRef(zoomedKey);
  const [zoomTweening, setZoomTweening] = useState(false);
  useEffect(() => {
    if (zoomedRef.current === zoomedKey) return;
    zoomedRef.current = zoomedKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- arming a transition for the length of one zoom change is a DOM concern with no render-time expression; deriving it would make it permanent
    setZoomTweening(true);
    const timer = setTimeout(() => setZoomTweening(false), ZOOM_TWEEN_MS);
    return () => clearTimeout(timer);
  }, [zoomedKey]);

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

  // The thumb's value, clamped to the window and snapped to an allowed stop.
  // Resolved HERE rather than inside the thumb because the fill follows it: a
  // fill drawn from the raw value and a disc drawn from the snapped one would
  // disagree by however far the pointer had wandered.
  const thumbStops = sortedStops(thumb?.stops);
  const snapThumb = (ms: number): number => {
    const inRange = Math.min(Math.max(ms, startMs), endMs);
    if (!thumbStops) return inRange;
    let best = thumbStops[0];
    for (const stop of thumbStops) {
      if (Math.abs(stop - inRange) < Math.abs(best - inRange)) best = stop;
    }
    return best;
  };
  const thumbAt = thumb ? snapThumb(thumb.valueMs) : null;

  // ── Playback ───────────────────────────────────────────────────────────────
  // The stops the walk visits: the dated ITEMS, and only the ones the thumb is
  // allowed to rest on. A marker is context rather than progress — a playback
  // that stopped on a goods issue would be showing the snapshot of a report
  // filed days earlier and pointing at a shipment.
  const playbackNodes: PlaybackNode[] = playback && thumb
    ? itemMarks
      .filter((mark) => !thumbStops || thumbStops.includes(mark.ms))
      .map((mark) => ({ key: mark.key, ms: mark.ms }))
    : [];
  // Rebuilt every render against the axis being DRAWN, so a resize or a zoom
  // mid-playback changes what is left to cross rather than leaving the thumb
  // travelling to a coordinate that has moved.
  const segments = playbackSegments(view, playbackNodes, {
    speed: playback?.speed,
    reducedMotion: stillness,
  });

  /** Where playback has the thumb, or null while the caller's value places it.
   *  State rather than a write to the node: the disc, its chip, the fill and
   *  `aria-valuetext` all read this, and four imperative writers is how they end
   *  up disagreeing about where the thumb is. */
  const [glide, setGlide] = useState<{ px: number; ms: number } | null>(null);
  /** Which leg is being crossed and how far through it. A ref because the driver
   *  reads and writes it inside an animation frame, and because it has to
   *  survive a pause — surviving is what makes resuming continue rather than
   *  restart. */
  const cursorRef = useRef<PlaybackCursor | null>(null);
  /** The schedule as it is NOW, for a loop that was started several renders ago
   *  and must not close over the arrangement it started with. */
  const liveRef = useRef({ segments, value: thumbAt, playback });
  // No dependency list: every render publishes its schedule, and this is
  // declared above the driver so the render that flips `playing` has published
  // before the driver reads.
  useEffect(() => { liveRef.current = { segments, value: thumbAt, playback }; });

  /** The last in-flight fraction handed out, so that consecutive nothings are
   *  one nothing: a consumer interpolating a table on this re-renders on every
   *  call, and a thumb at rest is not news forty times a second. */
  const progressRef = useRef<TimelineScrubProgress | null>(null);
  const reportProgress = useCallback((next: TimelineScrubProgress | null) => {
    if (next === null && progressRef.current === null) return;
    progressRef.current = next;
    liveRef.current.playback?.onProgress?.(next);
  }, []);

  /** Playback is over: the last stop, or the user taking the thumb back. */
  const endPlayback = useCallback(() => {
    cursorRef.current = null;
    setGlide(null);
    reportProgress(null);
    liveRef.current.playback?.onStop?.();
  }, [reportProgress]);

  const playing = !!playback?.playing && !!thumb;
  useEffect(() => {
    // Not playing is not the same as stopped: a PAUSE lands here, and it has to
    // leave both the cursor and the painted position alone. That is the whole
    // mechanism behind "resume continues the same segment from where it froze".
    if (!playing) return;
    const opening = liveRef.current;
    const from = opening.value === null
      ? -1
      : opening.segments.findIndex((segment) => segment.fromMs === opening.value);
    // Nowhere to go: the thumb is on the last stop, or there are no stops. The
    // caller hears about it at once rather than watching a Pause button that
    // will never do anything.
    if (from < 0) { endPlayback(); return; }
    // A cursor that belongs to a different leg than the one the caller's value
    // sits on is a stale session — the caller rewound, or jumped. Start over.
    if (!cursorRef.current || cursorRef.current.index !== from) {
      cursorRef.current = {
        index: from,
        phase: 'rest',
        t: 0,
        restLeftMs: opening.segments[from].dwellMs,
        sinceMs: null,
      };
    }

    let frame = 0;
    let dwellTimer: ReturnType<typeof setTimeout> | undefined;
    /** Paint a position, and only a position that is new: 700 ms of rest is 44
     *  frames, and React bails out of a re-render when the state it is given is
     *  the object it already had. */
    const paint = (next: { px: number; ms: number }) => setGlide((prev) => (
      prev && prev.px === next.px && prev.ms === next.ms ? prev : next
    ));

    /**
     * Give the rest the cursor is on a deadline of its own — ONCE, when the rest
     * begins, and never again while it runs.
     *
     * A frame is where the thumb MOVES, so travel can only be read there. A rest
     * is not travel, and animation frames are the wrong clock to wait on: an
     * occluded or throttled surface hands them out at whatever rate it likes, and
     * the customer portal, embedded and idle, held the thumb on its first report
     * for eight seconds because a 700 ms rest was seven frames of a page that was
     * getting one a second. So the rest is waited out on a timer.
     *
     * "Once" is load-bearing. Re-arming this from each frame — the obvious shape,
     * and the wrong one — pushes the deadline another 700 ms out every time a
     * frame arrives, which is the same unbounded stretch by a different route.
     */
    const waitOutRest = () => {
      clearTimeout(dwellTimer);
      const cursor = cursorRef.current;
      if (cursor?.phase !== 'rest') return;
      dwellTimer = setTimeout(restOver, Math.max(0, cursor.restLeftMs));
    };

    /** The rest is over on the wall clock. The glide it hands over to is charged
     *  from its own first frame, because travel nobody was shown is not travel. */
    const restOver = () => {
      const cursor = cursorRef.current;
      if (cursor?.phase !== 'rest') return;
      const segment = liveRef.current.segments[cursor.index];
      if (!segment) { endPlayback(); return; }
      cursorRef.current = {
        index: cursor.index, phase: 'glide', t: 0, restLeftMs: 0, sinceMs: null,
      };
      paint(positionAt(segment, 0));
      // No frame is asked for here. One is always in flight — every reading
      // registers the next — and cancelling it to register another does not make
      // one arrive any sooner; on a surface whose frames are timer-driven it
      // restarts the wait, and in a healthy one it moves this loop behind
      // anything else that registered in the meantime, which is a frame of lag
      // on every paint for the rest of the run.
    };

    const read = (nowMs: number) => {
      const live = liveRef.current;
      const cursor = cursorRef.current;
      // Cancelled from outside — a drag, a click, a key. Do not reschedule.
      if (!cursor) return;
      const step = advancePlayback(live.segments, cursor, nowMs);
      cursorRef.current = step.cursor;
      if (step.at) paint(step.at);
      reportProgress(step.progress);
      if (step.arrived) live.playback?.onArrive(step.arrived.key, step.arrived.ms);
      if (!step.cursor) { endPlayback(); return; }
      // Only a CHANGE of phase touches the other clock: the rest an arrival opens
      // gets its deadline here, and a rest this frame ended has none left to keep.
      // A rest that is merely still running must not be re-armed.
      if (step.cursor.phase !== cursor.phase || step.cursor.index !== cursor.index) {
        waitOutRest();
      }
      frame = requestAnimationFrame(read);
    };

    waitOutRest();
    frame = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(dwellTimer);
      // A pause, or a card on its way out. What is LEFT of the phase survives on
      // the cursor; the reading it was taken against does not, because the wall
      // clock keeps running while nothing is playing and a resumed rest charged
      // for the pause would be no rest at all.
      if (cursorRef.current) {
        cursorRef.current.sinceMs = null;
        // Frozen mid-travel: there is a position, but no journey in flight.
        reportProgress(null);
      }
    };
  }, [playing, endPlayback, reportProgress]);

  const fillTo = thumb
    ? (glide ? glide.ms : thumbAt)
    : fillToMs !== undefined
      ? fillToMs
      : itemMarks.length > 0 ? Math.min(itemMarks[itemMarks.length - 1].ms, now) : null;

  const closeOverlays = useCallback(() => {
    clearTimeout(graceRef.current);
    setHoveredKey(null);
    setBubbleKey(null);
    setOpenCluster(null);
    setPreviewCluster(null);
    setZoomKey(null);
  }, []);
  useEffect(() => () => clearTimeout(graceRef.current), []);

  // WCAG 1.4.13: content shown on hover or focus is dismissible without moving
  // the pointer or the focus. Through the shell's interceptor seam rather than a
  // listener of our own — a bubble opened by HOVER holds no focus, so a keydown
  // never reaches the trigger, and `Modal` claims Escape on `window` in the
  // capture phase, which beats a plain document listener.
  const overlayOpen = bubbleKey !== null || openCluster !== null || previewCluster !== null
    || zoomKey !== null;
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

  // The snap highlight: a mark the thumb has just passed lights up for a moment,
  // so a scrub that crosses four reports reads as four events rather than as a
  // bar getting longer. Written to the DOM rather than held in state — a drag
  // moves the thumb every frame, and a re-render per frame to add a class that
  // removes itself is a lot of React for a flash.
  const thumbValue = thumbAt ?? undefined;
  const lastThumbX = useRef<number | null>(null);
  useEffect(() => {
    if (thumbValue === undefined) return;
    const x = view.xByMs(thumbValue);
    const previous = lastThumbX.current;
    lastThumbX.current = x;
    if (previous === null || x <= previous) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const mark of marks) {
      if (mark.x <= previous || mark.x > x) continue;
      const el = nodeRefs.current.get(mark.key);
      if (!el) continue;
      el.classList.add('is-hit');
      timers.push(setTimeout(() => el.classList.remove('is-hit'), SNAP_FLASH_MS));
    }
    return () => { for (const timer of timers) clearTimeout(timer); };
    // `marks` and `axis` are rebuilt every render; the crossing is a function of
    // the thumb moving, and re-running this on a hover would re-light marks the
    // thumb crossed minutes ago.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbValue]);

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

  const usesFarLane = labels === 'active' || marks.length > 1;
  // One root in both variants, because it is what the variant is decided from.
  if (vertical) {
    return (
      <div ref={rootRef}>
        <VerticalTrack
          marks={marks} pending={pending} currentKey={resolvedCurrent} todayMs={now}
          reveal={reveal} ariaLabel={ariaLabel} step={step}
          nodeProps={nodeProps} onKeyDown={onListKeyDown}
        />
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`rosh-tl-body${pending.length > 0 ? '' : ' is-solo'}`}>
      <div className="flex items-stretch gap-3">
        <div className="rosh-tl-stage" style={{ height: `${stageHeight(geo, usesFarLane, phases.length > 0)}px` }}>
          {/* `is-gliding` takes the thumb's 120 ms transitions away for as long
              as an animation frame is placing it: a transition chasing a tween
              lags behind it, and a pause would then keep sliding for another
              120 ms after the frame that froze it. */}
          <div ref={layerRef}
            className={`rosh-tl-layer${zoomTweening ? ' is-zooming' : ''}${glide ? ' is-gliding' : ''}`}>
            <MeasuringRow marks={marks} innerRef={measureRef} />
            <TrackRail axis={view} geo={geo} fillTo={fillTo} reveal={reveal} trackPx={trackPx}
              tweened={!!thumb} />
            <Ruler startMs={startMs} endMs={endMs} axis={view} geo={geo} reveal={reveal} />
            <StartMark geo={geo} caption={startCaption} endCaption={edgeCaptions?.end}
              around={startCrowded} reveal={reveal} trackPx={trackPx} />
            {/* Today is drawn even where the axis was cut, unlike a ruler tick:
                a tick inside a cut labels a coordinate with no date, but "you
                are here" is the one landmark a reader needs most in exactly the
                stretch that got compressed.

                It is also drawn when today IS the right edge, which is the
                commonest case of all: a portal with no production-ready date
                passes today as the end of the window, and a strict `now < endMs`
                dropped the tag from every card that had not finished yet. Past
                the edge by more than a day it goes away again — a bar that
                ended in July does not have a "today" on it. */}
            {now > startMs && now <= endMs + DAY_MS && (
              <TodayMark x={view.xByMs(Math.min(now, endMs))} geo={geo} trackPx={trackPx}
                label={fmtSliderDate(now)} reveal={reveal} />
            )}
            {phases.map((phase) => (
              <PhaseBracket key={phase.key} phase={phase} geo={geo} xOf={view.xByMs} />
            ))}
            <ol className="rosh-tl-nodes" aria-label={ariaLabel} onKeyDown={onListKeyDown}>
              {marks.map((mark, index) => {
                const dressing = nodeDressing(mark.kind, mark.role);
                const { glyph } = mark;
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
                      {glyph && <TimelineGlyph name={glyph} />}
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
                groups={groups} trackPx={trackPx} geo={geo} startMs={startMs} endMs={endMs}
                currentKey={resolvedCurrent} hoveredKey={hoveredKey} reveal={reveal} step={step}
                zoomedKey={zoomedKey} popId={popId} aimBubble={aimBubble}
                startCaptionPx={startCaptionPx}
                openCluster={openCluster} setOpenCluster={setOpenCluster}
                previewCluster={previewCluster} setPreviewCluster={setPreviewCluster}
                setZoomKey={setZoomKey}
              />
            ) : (
              <ActiveLabel
                marks={marks} trackPx={trackPx} geo={geo}
                activeKey={activeKey} hoveredKey={hoveredKey} currentKey={resolvedCurrent}
              />
            )}
            {/* One bubble, two depths. Without a `preview` it is the label, the
                date and whatever `detail` said — enough to know which dot this
                is. With one it is the document in miniature, supplied by the
                consumer because only the consumer knows what a DFM log or a
                goods issue is worth showing, and it ends in an Open that goes
                to the real thing. It is hoverable, focusable and dismissed by
                Escape either way (WCAG 1.4.13): moving the pointer off the dot
                and into the card must not take it away. */}
            {bubbleMark && (
              <div ref={tipRef} id={tipId} role="tooltip"
                className={`rosh-tl-bubble${bubbleMark.preview ? ' is-preview' : ''}`}
                data-timeline-part="tooltip"
                style={{ top: `${geo.rail + RAIL_PX + 6}px` }}
                onMouseEnter={() => showBubble(bubbleMark.key)}
                onMouseLeave={() => hideBubble(bubbleMark.key)}
                onFocus={() => showBubble(bubbleMark.key)}
                onBlur={() => hideBubble(bubbleMark.key)}>
                <span className="rosh-tl-name">{bubbleMark.label}</span>
                <span className="rosh-tl-date">{bubbleMark.dateText}</span>
                {bubbleMark.preview
                  ? <div className="rosh-tl-preview" data-timeline-part="preview">{bubbleMark.preview}</div>
                  : bubbleMark.detail && <span className="rosh-tl-detail">{bubbleMark.detail}</span>}
                {(bubbleMark.onOpen ?? bubbleMark.onClick) && (
                  <button type="button" className="rosh-tl-bubble-open text-blue-600"
                    data-timeline-part="bubble-open"
                    onClick={() => (bubbleMark.onOpen ?? bubbleMark.onClick)?.()}>
                    Open
                  </button>
                )}
              </div>
            )}
            {thumb && thumbAt !== null && (
              /* Taking hold of the thumb ends a playback rather than fighting
                 it: two hands on one disc is the bug the prototype had, where a
                 drag and the sweep wrote the same position every frame. */
              <ThumbLayer thumb={thumb} value={thumbAt} snap={snapThumb} axis={view} geo={geo}
                startMs={startMs} endMs={endMs} trackPx={trackPx} layerRef={layerRef}
                glide={glide} onScrub={playback ? endPlayback : undefined}
                nodes={playbackNodes} onProgress={reportProgress} />
            )}
          </div>
        </div>
      </div>
      {pending.length > 0 && <PendingColumn pending={pending} reveal={reveal} />}
    </div>
  );
}
