/**
 * The geometry the timeline family shares: where a time lands on the track,
 * which labels can sit in which lane, and which runs of dots are one step
 * reported several times.
 *
 * Pure — no React, no DOM, no dates beyond `DAY_MS`. `TimelineTrack` draws what
 * these functions decide, and both timelines draw through `TimelineTrack`, so
 * this file is the one place the two bars can disagree about a coordinate. Each
 * function is exported for its own spec, because asserting geometry through a
 * rendered card asserts the markup instead.
 */

/** Two milestones never sit closer together than this, whatever their dates
 *  say. 48 px is about where a 10 px label stops touching its neighbour's date
 *  line, which is the width the lanes are trying to place. */
const DEFAULT_MIN_GAP_PX = 48;

/** A stretch holding more than this share of the window's TIME is cut out of
 *  the axis. A mould whose last milestone was ten months ago is the case: that
 *  one idle stretch holds 84% of the programme's time, and on a linear axis it
 *  takes 84% of the bar and squeezes every real date into the first sixth. */
const DEFAULT_MAX_TIME_SHARE = 0.3;

/** What a cut stretch is worth on the track: a fixed notch, the same width
 *  whether it swallowed 282 days or 2,820. A cut is not a short stretch — it is
 *  a piece of axis that has stopped keeping time — so scaling it by what it
 *  hides would be reading a duration off a mark that is not a duration. */
const DEFAULT_BREAK_PX = 48;

/** Slack below this is float noise, not space left to hand out. */
const FILL_EPSILON = 1e-6;

// ─── Compressed time axis ────────────────────────────────────────────────────

/** One stretch of axis between two consecutive anchors, with every width that
 *  went into its final size — the record the break glyph reads. */
export interface AxisGap {
  /** The anchor at the left of the stretch, epoch ms. */
  fromMs: number;
  /** The anchor at the right of the stretch, epoch ms. */
  toMs: number;
  /** How much time the stretch actually holds. */
  gapMs: number;
  /** Where the stretch starts on the track, in px. */
  fromPx: number;
  /** Where it ends, in px. */
  toPx: number;
  /** The width a linear axis would have given it. */
  wantPx: number;
  /** Its width once cut or floored, before the flow was fitted to the track. */
  clampedPx: number;
  /** Its width in the end. */
  px: number;
  /** True when this stretch was CUT: it holds more of the window's time than
   *  the axis is willing to spend track on, so it was replaced by a fixed
   *  notch. This piece of bar does not keep time, and the user has to be told
   *  so — it is what puts a break glyph on the rail and on the ruler. */
  compressed: boolean;
}

/** A time axis that is piecewise linear rather than linear. */
export interface CompressedAxis {
  /** The anchors the axis was built from, sorted and de-duplicated. */
  anchorsMs: number[];
  /** One x per anchor, in the same order. */
  xs: number[];
  /** One entry per consecutive pair of anchors. */
  gaps: AxisGap[];
  /** Map ANY time onto the axis: linear inside a stretch, clamped to the track
   *  at both ends. Everything drawn on the bar goes through this, so a dot, its
   *  label, the fill and today cannot end up on different axes. */
  xByMs: (ms: number) => number;
  /** The inverse, for the scrubber: the time a pixel on the track stands for.
   *  A thumb dragged across a compressed stretch therefore reports the dates
   *  that stretch actually holds, rather than a linear reading of a non-linear
   *  bar. */
  msByPx: (px: number) => number;
  /** True while `ms` falls strictly inside a stretch the axis cut. Nothing is
   *  drawn there — a cut is where time is NOT shown, so a ruler tick or a month
   *  label inside one would be labelling a coordinate that has no date. */
  inCut: (ms: number) => boolean;
}

export interface CompressTimeAxisOptions {
  /** Narrowest a stretch that still keeps time may be. Default 48 px. */
  minGapPx?: number;
  /** The share of the window's TIME above which a stretch is cut rather than
   *  drawn. Default 0.3. `Infinity` never cuts, which is a linear axis. */
  maxTimeShare?: number;
  /** The fixed width a cut stretch is given. Default 48 px. */
  breakPx?: number;
}

/**
 * Raise the stretches under the floor, and take it back from the ones that can
 * afford it.
 *
 * Two dates a week apart on a 337-day window are 1.8 px apart in proportion,
 * which draws them as one date; the floor is what the label lanes are packing
 * against. It is paid for out of the stretches that are ALREADY above it, in
 * proportion to how far above — a stretch at exactly the floor never funds
 * another one, so a pass can never create a new short stretch and one pass is
 * the whole redistribution.
 *
 * When the floor costs more than the whole track can pay, the layout wins: the
 * final fit scales everything back down, and stretches fall below the floor
 * because there is no arrangement in which they do not.
 */
function applyFloor(px: number[], fixed: boolean[], floor: number): number[] {
  const out = px.slice();
  let need = 0;
  for (let i = 0; i < out.length; i++) {
    if (fixed[i] || out[i] >= floor - FILL_EPSILON) continue;
    need += floor - out[i];
    out[i] = floor;
  }
  if (need <= FILL_EPSILON) return out;

  let slack = 0;
  for (let i = 0; i < out.length; i++) {
    if (!fixed[i] && out[i] > floor + FILL_EPSILON) slack += out[i] - floor;
  }
  if (slack <= FILL_EPSILON) return out;

  const take = Math.min(need, slack);
  for (let i = 0; i < out.length; i++) {
    if (fixed[i] || out[i] <= floor + FILL_EPSILON) continue;
    out[i] -= (take * (out[i] - floor)) / slack;
  }
  return out;
}

/**
 * Build a piecewise-linear time axis from the times that matter on it.
 *
 * A linear axis is the honest one right up until the data is lumpy, and a mould
 * programme is lumpy by nature: seven dated milestones inside eight weeks, then
 * nothing for ten months while the customer decides. On `(ms - startMs) / span`
 * those seven share the first sixth of the bar, the lanes fill up, and the two
 * milestones a reader came for collapse to hover-only. The empty tail was the
 * problem, not the labels.
 *
 * So the tail is not squeezed — it is CUT. Any stretch between two consecutive
 * anchors that holds more than `maxTimeShare` of the window's time loses its
 * proportion entirely and becomes a fixed `breakPx` notch carrying a break
 * glyph and the number of days it hides; everything left shares the rest of the
 * track in proportion, at one honest density. A stretch under the threshold is
 * never touched, which is what keeps a fortnight looking like twice a week.
 *
 * The floor is applied after that, for the same reason a ruler has millimetres:
 * two dates a week apart on a year-long window are 1.8 px apart in proportion,
 * and two dates drawn as one date are a lie the compression was supposed to
 * stop telling.
 *
 * Anchors are de-duplicated, which is what makes three milestones on one day
 * one coordinate rather than three that happen to coincide.
 *
 * Pass `maxTimeShare: Infinity` for a plain linear axis: nothing is ever cut,
 * and everything else on the card keeps reading its coordinate off the same
 * mapping. That is what the production scrubber asks for, because a supplier's
 * reports arrive weekly and a week is not an idle stretch to hide.
 */
export function compressTimeAxis(
  anchorsMs: number[],
  trackWidthPx: number,
  opts: CompressTimeAxisOptions = {},
): CompressedAxis {
  const track = Number.isFinite(trackWidthPx) && trackWidthPx > 0 ? trackWidthPx : 0;
  const anchors = Array.from(new Set(anchorsMs.filter((ms) => Number.isFinite(ms)))).sort((a, b) => a - b);

  // A point is not a range: with one anchor, or no track to draw on, every time
  // maps to the left edge and no stretch exists to compress.
  if (track <= 0 || anchors.length < 2) {
    const only = anchors[0] ?? 0;
    return {
      anchorsMs: anchors,
      xs: anchors.map(() => 0),
      gaps: [],
      xByMs: () => 0,
      msByPx: () => only,
      inCut: () => false,
    };
  }

  const totalMs = anchors[anchors.length - 1] - anchors[0];
  const maxShare = opts.maxTimeShare ?? DEFAULT_MAX_TIME_SHARE;
  const breakPx = Math.min(opts.breakPx ?? DEFAULT_BREAK_PX, track);
  const floor = opts.minGapPx ?? DEFAULT_MIN_GAP_PX;

  const gapMs: number[] = [];
  const wantPx: number[] = [];
  const cut: boolean[] = [];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const held = anchors[i + 1] - anchors[i];
    gapMs.push(held);
    wantPx.push(totalMs > 0 ? (held / totalMs) * track : 0);
    cut.push(totalMs > 0 && held / totalMs > maxShare);
  }

  // The cuts are paid first, out of the track; what is left is shared by the
  // stretches that still keep time, in proportion to how much they hold.
  const cutCount = cut.filter(Boolean).length;
  const flowPx = Math.max(0, track - cutCount * breakPx);
  let flowMs = 0;
  let flowCount = 0;
  for (let i = 0; i < gapMs.length; i++) {
    if (cut[i]) continue;
    flowMs += gapMs[i];
    flowCount += 1;
  }
  const clampedPx = gapMs.map((held, i) => {
    if (cut[i]) return breakPx;
    if (flowCount === 0) return 0;
    return flowMs > 0 ? (flowPx * held) / flowMs : flowPx / flowCount;
  });

  const floored = applyFloor(clampedPx, cut, floor);
  // Fit the stretches that keep time back into what the cuts left them. A
  // no-op unless the floor cost more than the track had — see `applyFloor`.
  const flowTotal = floored.reduce((sum, width, i) => (cut[i] ? sum : sum + width), 0);
  const px = floored.map((width, i) => {
    if (cut[i]) return width;
    return flowTotal > 0 ? (width * flowPx) / flowTotal : width;
  });

  const xs = [0];
  for (let i = 0; i < px.length; i++) xs.push(xs[i] + px[i]);
  // A dozen additions of floats leave the last anchor a hair short of the
  // track, and `xByMs(endMs) === trackWidthPx` is a claim callers lean on — the
  // fill bar's full width, the right edge of a phase bracket.
  xs[xs.length - 1] = track;

  const gaps: AxisGap[] = xs.slice(0, -1).map((fromPx, i) => ({
    fromMs: anchors[i],
    toMs: anchors[i + 1],
    gapMs: gapMs[i],
    fromPx,
    toPx: xs[i + 1],
    wantPx: wantPx[i],
    clampedPx: clampedPx[i],
    px: xs[i + 1] - fromPx,
    compressed: cut[i],
  }));

  const xByMs = (ms: number): number => {
    if (!Number.isFinite(ms) || ms <= anchors[0]) return 0;
    if (ms >= anchors[anchors.length - 1]) return track;
    // A linear scan: an axis has as many anchors as the card has milestones, so
    // a binary search would buy nothing but somewhere for an off-by-one to live.
    for (let i = 0; i + 1 < anchors.length; i++) {
      if (ms > anchors[i + 1]) continue;
      const segMs = anchors[i + 1] - anchors[i];
      const t = segMs > 0 ? (ms - anchors[i]) / segMs : 0;
      return xs[i] + t * (xs[i + 1] - xs[i]);
    }
    return track;
  };

  const msByPx = (raw: number): number => {
    const x = Math.min(Math.max(Number.isFinite(raw) ? raw : 0, 0), track);
    for (let i = 0; i + 1 < anchors.length; i++) {
      if (x > xs[i + 1] && i + 2 < anchors.length) continue;
      const segPx = xs[i + 1] - xs[i];
      const t = segPx > 0 ? (x - xs[i]) / segPx : 0;
      return anchors[i] + t * (anchors[i + 1] - anchors[i]);
    }
    return anchors[anchors.length - 1];
  };

  const inCut = (ms: number): boolean =>
    gaps.some((gap) => gap.compressed && ms > gap.fromMs && ms < gap.toMs);

  return { anchorsMs: anchors, xs, gaps, xByMs, msByPx, inCut };
}

// ─── Label lane packing ──────────────────────────────────────────────────────

/** One label's geometry, as `packLabelLanes` needs it. */
export interface LabelLaneItem {
  /** The milestone's `key` — what the answer is keyed by. */
  key: string;
  /** The milestone's date, as epoch ms. */
  ms: number;
  /** The label's rendered width in pixels: measured, or estimated. */
  widthPx: number;
  /** The centre of the label on the track, in px. Pass it whenever the caller's
   *  axis is not linear — the fallback below computes the centre from `ms`
   *  against `startMs` / `spanMs`, which is only the right answer on a linear
   *  axis, and the milestone card's axis is piecewise. */
  xPx?: number;
  /** Which labels claim a lane first; lower goes first, default 0. Chronological
   *  within a tier. With more labels than lanes something has to collapse, and
   *  it should not be the milestone the reader opened the card for: the caller
   *  says which those are by giving the rest a higher number. */
  priority?: number;
}

/** Where one label ended up: a lane index, or `-1` when no lane could hold it. */
export interface LabelLane {
  key: string;
  lane: number;
}

export interface PackLabelLanesOptions {
  /** Clear space demanded between two labels sharing a lane. Default 6 px. */
  gapPx?: number;
  /** How many lanes are available. Default `LABEL_LANE_COUNT`. */
  laneCount?: number;
}

/**
 * The packer's default lane count.
 *
 * The card asks for `TRACK_LABEL_LANE_COUNT` (2) instead: four lanes resolve an
 * overlap at the cost of ~112 px of card height and an eye that has to zig-zag
 * across four rows to read one week of history, which was the "crammed"
 * complaint itself. Clustering (below) collapses the runs that used to need the
 * other two lanes. The default stays 4 because the packer is a general helper
 * and its specs describe four-lane geometry.
 */
export const LABEL_LANE_COUNT = 4;

/** The lanes the timeline card itself uses: one above the rail, one below. */
export const TRACK_LABEL_LANE_COUNT = 2;

/**
 * Assign each label a lane so no two labels sharing a lane overlap.
 *
 * The arrangement this replaced was `i % 2` — an answer that never looked at how
 * wide a label is or how close two dates are, so eight milestones over 337 days
 * drew four of them on top of each other while every check stayed green.
 *
 * Greedy: a label takes the FIRST lane that has room for it, which means the
 * first lane holding nothing within `gapPx` of where it would sit. Two labels on
 * the same day therefore always land in different lanes. A label that fits
 * nowhere — every lane busy at that point, or a label wider than the whole
 * track — gets `-1`, and the caller reveals it on hover instead of overprinting
 * its neighbour.
 *
 * Lanes are claimed in `priority` order (lower first, default 0), and
 * chronologically inside a tier. That is the whole point of the field: on a
 * timeline with four DFM revisions and two milestones that actually settle
 * something, the four revisions used to claim all four lanes by being earlier,
 * and "DFM Confirmed" and "Mould Complete" were the two that collapsed. A lane
 * therefore remembers every interval it holds rather than just its rightmost
 * one — with priorities the labels no longer arrive left to right, so "is there
 * room" is a question about the whole lane.
 *
 * The answer comes back in the order the items arrived, whatever order that is.
 */
export function packLabelLanes(
  items: LabelLaneItem[],
  trackWidthPx: number,
  startMs: number,
  spanMs: number,
  opts: PackLabelLanesOptions = {},
): LabelLane[] {
  const track = trackWidthPx > 0 ? trackWidthPx : 0;
  const span = spanMs > 0 ? spanMs : 1;
  const gapPx = opts.gapPx ?? 6;
  const laneCount = Math.max(1, opts.laneCount ?? LABEL_LANE_COUNT);
  // Priority first, then chronological, then the caller's order — ties keep the
  // caller's order so the answer never depends on the sort's internals.
  const claimOrder = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => ((a.item.priority ?? 0) - (b.item.priority ?? 0))
      || (a.item.ms - b.item.ms)
      || (a.index - b.index));

  const occupied: { left: number; right: number }[][] =
    Array.from({ length: laneCount }, () => []);
  const assigned = new Map<string, number>();

  for (const { item } of claimOrder) {
    const width = Math.max(0, item.widthPx);
    // A label wider than the track it labels has no lane anywhere: placing it
    // would run text off both ends of the bar.
    if (track <= 0 || width > track) {
      assigned.set(item.key, -1);
      continue;
    }
    // `xPx` when the caller has an axis; the linear fallback otherwise.
    const centre = item.xPx ?? ((item.ms - startMs) / span) * track;
    const left = Math.min(Math.max(centre - width / 2, 0), track - width);
    const right = left + width;
    let lane = -1;
    for (let candidate = 0; candidate < laneCount; candidate++) {
      const clear = occupied[candidate]
        .every((held) => left > held.right + gapPx || right + gapPx < held.left);
      if (!clear) continue;
      occupied[candidate].push({ left, right });
      lane = candidate;
      break;
    }
    assigned.set(item.key, lane);
  }

  return items.map((item) => ({ key: item.key, lane: assigned.get(item.key) ?? -1 }));
}

/** Where a label sits once it has a lane: clamped so no label overflows the
 *  track it labels. The packer clamps the same way — one formula, so a label is
 *  drawn where the lane was reserved for it. */
export function clampLabelLeft(centrePx: number, widthPx: number, trackWidthPx: number): number {
  return Math.max(0, Math.min(centrePx - widthPx / 2, Math.max(0, trackWidthPx - widthPx)));
}

// ─── Clustering ──────────────────────────────────────────────────────────────

/** The narrowest two labels may be pitched before they are treated as colliding,
 *  whatever their own widths say. */
const DEFAULT_CLUSTER_PITCH_PX = 40;

/** Breathing room added to the wider of two neighbouring labels when deciding
 *  whether they collide. */
const CLUSTER_PITCH_PAD_PX = 8;

/** One dot as the clusterer sees it: a coordinate, a width, a kind, and whether
 *  it is the sort of milestone that may be folded away at all. */
export interface ClusterMark {
  key: string;
  /** Its coordinate on the track, in px. Marks arrive in ascending order. */
  x: number;
  /** The width of the label it would otherwise draw. */
  widthPx: number;
  /** Only a run of ONE kind clusters — `DFM ×4` is true of four DFM revisions
   *  and a lie about three revisions and a shipment. */
  kind: string;
  /** False for a milestone that settles something (a completion, a shipment, a
   *  confirmed drawing). Those never fold: `×N` is for iterations of one step,
   *  and the reader opened the card for the step itself. */
  collapsible: boolean;
}

/** A label position, after clustering: either one mark, or a run of them. */
export type ClusterGroup<M extends ClusterMark = ClusterMark> =
  | { type: 'item'; mark: M }
  | { type: 'cluster'; kind: string; members: M[] };

export interface ClusterMarksOptions {
  /** Minimum pitch two labels are allowed before they count as colliding. */
  minPitchPx?: number;
}

/**
 * Fold runs of same-kind dots into `×N` groups.
 *
 * A run of three or more consecutive dots of one kind is iterations of ONE step
 * — `DFM v1..v4` is one conversation about one drawing — so it always folds,
 * however much room the axis hands out: four labels saying almost the same word
 * is noise even when they fit. A run of two folds only when the two labels
 * would not clear each other, because `DFM ×2` tells the reader strictly less
 * than `DFM v1` and `DFM v2` do.
 *
 * The member marks stay on the rail at their real coordinates — the pill speaks
 * for them but never moves them, so the axis keeps telling the truth about when
 * things happened (vis-timeline's rule, and the reason a cluster is not a
 * summary row).
 */
export function clusterMarks<M extends ClusterMark>(
  marks: M[],
  opts: ClusterMarksOptions = {},
): ClusterGroup<M>[] {
  const minPitch = opts.minPitchPx ?? DEFAULT_CLUSTER_PITCH_PX;
  const out: ClusterGroup<M>[] = [];
  let i = 0;
  while (i < marks.length) {
    const head = marks[i];
    if (!head.collapsible) {
      out.push({ type: 'item', mark: head });
      i += 1;
      continue;
    }
    let end = i + 1;
    while (end < marks.length && marks[end].collapsible && marks[end].kind === head.kind) end += 1;
    const run = marks.slice(i, end);
    const tight = run.length > 1 && run.every((mark, k) => {
      if (k === 0) return true;
      const previous = run[k - 1];
      const pitch = Math.max(minPitch, Math.max(mark.widthPx, previous.widthPx) + CLUSTER_PITCH_PAD_PX);
      return mark.x - previous.x < pitch;
    });
    if (run.length >= 3 || tight) out.push({ type: 'cluster', kind: head.kind, members: run });
    else for (const mark of run) out.push({ type: 'item', mark });
    i = end;
  }
  return out;
}

/**
 * The name a `×N` pill carries.
 *
 * The trailing revision number comes off the first member's label, because the
 * pill stands for all of them: `DFM v1` + three more is `DFM ×4`, not
 * `DFM v1 ×4`.
 */
export function clusterLabel(members: { label: string }[]): string {
  const stem = (members[0]?.label ?? '').replace(/\s*v?\d+$/i, '').trim();
  return `${stem || (members[0]?.label ?? '')} ×${members.length}`;
}

// ─── Label widths ────────────────────────────────────────────────────────────

/**
 * A label's width before the DOM has been asked.
 *
 * 5.6 px per character is about right for the 10 px face these labels use, and
 * the 8 px is the slack two centred lines leave around the longer one. It only
 * has to be close, because the measured width replaces it one layout effect
 * later. It does have to be DETERMINISTIC, so that a server render and a spec
 * asserting on one agree.
 */
export function estimateLabelWidth(label: string, dateText: string): number {
  return Math.max(label.length, dateText.length) * 5.6 + 8;
}

/** Track width assumed before anything has been measured — a server render, or
 *  the first paint before the layout effect runs. */
export const FALLBACK_TRACK_PX = 600;
