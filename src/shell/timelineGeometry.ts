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

/** No single stretch of axis may own more than this share of the track. A
 *  mould whose last milestone was ten months ago is the case: on a linear axis
 *  that one idle stretch takes 84% of the bar and squeezes every real date into
 *  the first sixth of it. */
const DEFAULT_MAX_GAP_SHARE = 0.3;

/** Slack below this is float noise, not space left to hand out. */
const FILL_EPSILON = 1e-6;

/** A gap has to be narrower than its time deserves by more than half a pixel
 *  before we tell the user it was compressed. */
const COMPRESSED_EPSILON = 0.5;

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
  /** Its width after the min/max clamp, before the track is filled. */
  clampedPx: number;
  /** Its width in the end. */
  px: number;
  /** True when the ceiling took width off this stretch AND it is still narrower
   *  than its time deserves — i.e. this piece of axis lies about how long it
   *  lasted, and the user has to be told so. */
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
  /** True while `ms` falls strictly inside a stretch the ceiling cut. Nothing
   *  is drawn there — a cut is where time is NOT shown, so a ruler tick or a
   *  month label inside one would be labelling a coordinate that has no date. */
  inCut: (ms: number) => boolean;
}

export interface CompressTimeAxisOptions {
  /** Narrowest a stretch may be before the track is filled. Default 48 px. */
  minGapPx?: number;
  /** Widest a stretch may be. Default 30% of the track. */
  maxGapPx?: number;
}

/**
 * Scale the clamped stretches so they fill the track exactly.
 *
 * Shrinking is uniform: every stretch takes the same factor, so one already at
 * the ceiling only gets smaller and the ceiling still holds.
 *
 * Growing cannot be uniform. Scaling a stretch that was just capped at 30% of
 * the track back up past 30% would undo the compression this axis exists for,
 * which is exactly what a uniform `trackWidthPx / sum` does when the clamped
 * widths come to less than the track. So the slack goes only to the stretches
 * still below the ceiling, split in proportion to the time each one holds, and
 * whatever a pass could not place (a stretch hit the ceiling part way through)
 * is offered round again.
 *
 * When every stretch is at the ceiling and slack is STILL left — an axis of one
 * or two stretches, where 30% each cannot cover the track — the ceiling has to
 * give, because an axis that stops two thirds of the way along is not an axis.
 * The uniform scale-up is the last resort, and a stretch that grows past its
 * own wanted width that way stops reporting itself as compressed.
 */
function fillTrack(clampedPx: number[], weights: number[], track: number, ceiling: number): number[] {
  const px = clampedPx.slice();
  const sum = px.reduce((a, b) => a + b, 0);
  if (sum <= 0) return px;
  if (sum > track) return px.map((width) => (width * track) / sum);

  let slack = track - sum;
  // Bounded: a pass either exhausts the slack or pins one more stretch to the
  // ceiling, and there are only so many stretches.
  for (let pass = 0; pass <= px.length && slack > FILL_EPSILON; pass++) {
    const open: number[] = [];
    let weightTotal = 0;
    for (let i = 0; i < px.length; i++) {
      if (px[i] >= ceiling - FILL_EPSILON) continue;
      open.push(i);
      weightTotal += Math.max(weights[i], 0);
    }
    if (open.length === 0) break;
    let used = 0;
    for (const i of open) {
      const share = weightTotal > 0
        ? (slack * Math.max(weights[i], 0)) / weightTotal
        : slack / open.length;
      const next = Math.min(ceiling, px[i] + share);
      used += next - px[i];
      px[i] = next;
    }
    if (used <= FILL_EPSILON) break;
    slack -= used;
  }

  if (slack > FILL_EPSILON) {
    const pinned = px.reduce((a, b) => a + b, 0);
    if (pinned > 0) return px.map((width) => (width * track) / pinned);
  }
  return px;
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
 * So each stretch between two consecutive anchors is sized by how much time it
 * holds, then clamped: at least `minGapPx` wide, so two dates a week apart are
 * still two dates; at most `maxGapPx`, so one idle stretch cannot own the bar.
 * The clamped widths are then scaled to fill the track exactly — see
 * `fillTrack` for why that is not one multiplication.
 *
 * Anchors are de-duplicated, which is what makes three milestones on one day
 * one coordinate rather than three that happen to coincide.
 *
 * Pass `maxGapPx: Infinity` for a plain linear axis: no stretch is ever capped,
 * the floor still holds, and everything else on the card keeps reading its
 * coordinate off the same mapping. That is what the production scrubber asks
 * for, because a supplier's reports arrive weekly and a week is not an idle
 * stretch to hide.
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
  const ceiling = opts.maxGapPx ?? DEFAULT_MAX_GAP_SHARE * track;
  // A floor above the ceiling is not a range, and the ceiling is the claim that
  // matters: it keeps an idle stretch from owning the bar, where the floor only
  // asks for room for a label.
  const floor = Math.min(opts.minGapPx ?? DEFAULT_MIN_GAP_PX, ceiling);

  const wantPx: number[] = [];
  const clampedPx: number[] = [];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const want = ((anchors[i + 1] - anchors[i]) / totalMs) * track;
    wantPx.push(want);
    clampedPx.push(Math.min(Math.max(want, floor), ceiling));
  }

  const px = fillTrack(clampedPx, wantPx, track, ceiling);
  const xs = [0];
  for (let i = 0; i < px.length; i++) xs.push(xs[i] + px[i]);
  // A dozen additions of floats leave the last anchor a hair short of the
  // track, and `xByMs(endMs) === trackWidthPx` is a claim callers lean on — the
  // fill bar's full width, the right edge of a phase bracket.
  xs[xs.length - 1] = track;

  const gaps: AxisGap[] = xs.slice(0, -1).map((fromPx, i) => {
    const width = xs[i + 1] - fromPx;
    return {
      fromMs: anchors[i],
      toMs: anchors[i + 1],
      gapMs: anchors[i + 1] - anchors[i],
      fromPx,
      toPx: xs[i + 1],
      wantPx: wantPx[i],
      clampedPx: clampedPx[i],
      px: width,
      compressed:
        clampedPx[i] < wantPx[i] - COMPRESSED_EPSILON
        && width < wantPx[i] - COMPRESSED_EPSILON,
    };
  });

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
