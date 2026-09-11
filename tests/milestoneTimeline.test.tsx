/**
 * `MilestoneTimeline` — lane packing, and undated milestones kept off the track.
 *
 * The bug these specs exist for was not a crash: eight milestones over 337 days
 * with four DFM revisions inside a fortnight rendered every one of those labels
 * at the same place, because lanes were assigned by `i % 2` and nothing in the
 * component had ever measured a label or compared two dates. Two milestones with
 * no date at all were drawn as dots at INTERPOLATED dates — a midpoint and a
 * prev+1 — which reads as a record of something that happened.
 *
 * Lane packing fixed the overprinting and left the other half of the same bug:
 * on mould 001F/1813 those seven dated milestones sit in the first 16% of a
 * 337-day axis and the remaining 282 days are empty, so the lanes were tidying
 * up a cluster that should never have been a cluster. The axis is now piecewise
 * linear, and `compressTimeAxis` has its own specs below.
 *
 * So the claims here are geometric (both helpers are pure, and asserted by
 * extents and by x) and textual (an undated milestone produces no dot, no date
 * and no coordinate).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First — installs the DOM globals before react-dom evaluates. Needed even for
// the static renders: `fmtSliderDate` reads the user's date format out of
// localStorage, which does not exist in a bare node process.
import { act, render } from './dom';
import { renderToStaticMarkup } from 'react-dom/server';
import MilestoneTimeline, {
  compressTimeAxis,
  packLabelLanes,
  LABEL_LANE_COUNT,
  type LabelLaneItem,
  type Milestone,
} from '../src/shell/MilestoneTimeline';
import { DAY_MS, toDayMs, fmtSliderDate } from '../src/shell/timelineDates';
import { withConsoleError } from './capture-console';

const day = (iso: string) => toDayMs(iso)!;

// ── packLabelLanes ──────────────────────────────────────────────────────────

/** The extents the packer itself computes, recomputed here so a lane's
 *  occupancy is checked against geometry rather than against the packer. */
function extents(item: LabelLaneItem, trackPx: number, startMs: number, spanMs: number) {
  const centre = ((item.ms - startMs) / spanMs) * trackPx;
  const left = Math.min(Math.max(centre - item.widthPx / 2, 0), trackPx - item.widthPx);
  return { left, right: left + item.widthPx };
}

/** Fail if any two labels the packer put in one lane share pixels. */
function assertNoOverlapWithinLanes(
  items: LabelLaneItem[],
  lanes: { key: string; lane: number }[],
  trackPx: number,
  startMs: number,
  spanMs: number,
  gapPx = 6,
) {
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (let lane = 0; lane < LABEL_LANE_COUNT; lane++) {
    const inLane = lanes
      .filter((l) => l.lane === lane)
      .map((l) => extents(byKey.get(l.key)!, trackPx, startMs, spanMs))
      .sort((a, b) => a.left - b.left);
    for (let i = 1; i < inLane.length; i++) {
      assert.ok(
        inLane[i].left > inLane[i - 1].right + gapPx,
        `lane ${lane}: label starting at ${inLane[i].left} overlaps one ending at ${inLane[i - 1].right}`,
      );
    }
  }
}

const SPAN = 100 * DAY_MS;

test('a cluster inside 3% of the span is spread over lanes, never stacked', () => {
  // Six labels 60 px wide whose centres are 3.6 px apart. Nothing can share a
  // lane at that spacing, so the packer has to use every lane it has and then
  // admit that the rest do not fit.
  const items: LabelLaneItem[] = Array.from({ length: 6 }, (_, i) => ({
    key: `c${i}`,
    ms: (0.48 + i * 0.006) * SPAN,
    widthPx: 60,
  }));
  const lanes = packLabelLanes(items, 600, 0, SPAN);

  const placed = lanes.filter((l) => l.lane >= 0);
  assert.ok(
    new Set(placed.map((l) => l.lane)).size >= 3,
    `expected at least 3 distinct lanes, got ${JSON.stringify(lanes)}`,
  );
  assert.ok(lanes.some((l) => l.lane === -1), 'and the ones with nowhere left to go collapse');
  assertNoOverlapWithinLanes(items, lanes, 600, 0, SPAN);
});

test('two milestones on the same day land in different lanes', () => {
  // The whole point of packing by width: same `ms` means the same centre, so
  // one label per lane is the only arrangement that reads.
  const sameDay = 0.5 * SPAN;
  const items: LabelLaneItem[] = [
    { key: 'a', ms: sameDay, widthPx: 60 },
    { key: 'b', ms: sameDay, widthPx: 60 },
  ];
  const lanes = packLabelLanes(items, 600, 0, SPAN);
  assert.equal(lanes.length, 2);
  assert.notEqual(lanes[0].lane, lanes[1].lane, `both in lane ${lanes[0].lane}`);
  assert.ok(lanes.every((l) => l.lane >= 0), 'two labels always fit somewhere');
});

test('well-spread labels ALL take lane 0 — a sparse timeline draws one row', () => {
  // Documented, because "alternating" would be the other defensible answer: the
  // pack is greedy and lane 0 is tried first, so a second lane appears only when
  // the first is genuinely blocked. That is what keeps the card from growing
  // four rows tall for a timeline that never needed them.
  const items: LabelLaneItem[] = [0, 0.25, 0.5, 0.75].map((f, i) => ({
    key: `s${i}`,
    ms: f * SPAN,
    widthPx: 60,
  }));
  const lanes = packLabelLanes(items, 600, 0, SPAN);
  assert.deepEqual(lanes.map((l) => l.lane), [0, 0, 0, 0]);
  assertNoOverlapWithinLanes(items, lanes, 600, 0, SPAN);
});

test('a label wider than the track fits nowhere, in any lane', () => {
  // Not "put it in lane 0, it is empty": a label 900 px wide on a 600 px track
  // runs off both ends of the bar it is labelling, and an empty lane does not
  // make that legible.
  const lanes = packLabelLanes([{ key: 'huge', ms: 0.5 * SPAN, widthPx: 900 }], 600, 0, SPAN);
  assert.deepEqual(lanes, [{ key: 'huge', lane: -1 }]);
});

test('the answer comes back in the order the items arrived', () => {
  // Packing is chronological internally; the caller looks the answer up by key
  // and should not have to care.
  const items: LabelLaneItem[] = [
    { key: 'late', ms: 0.9 * SPAN, widthPx: 40 },
    { key: 'early', ms: 0.1 * SPAN, widthPx: 40 },
  ];
  assert.deepEqual(packLabelLanes(items, 600, 0, SPAN).map((l) => l.key), ['late', 'early']);
});

// ── Undated milestones ──────────────────────────────────────────────────────

/** Four dated milestones (two of them two days apart) and two undated ones. */
const WITH_PENDING: Milestone[] = [
  { key: 'a', label: 'Kickoff', date: '2025-01-01' },
  { key: 'b', label: 'DFM v1', date: '2025-02-10', kind: 'dfm' },
  { key: 'c', label: 'DFM v2', date: '2025-02-12', kind: 'dfm' },
  { key: 'd', label: 'Tooling Done', date: '2025-04-01', kind: 'testing' },
  { key: 'e', label: 'Sample Shipped', date: null, kind: 'shipment' },
  { key: 'f', label: 'Production Ready', date: undefined, kind: 'completion' },
];

/**
 * A server render, with React's own console noise dropped.
 *
 * The component measures its labels in a layout effect, and React's server
 * renderer prints a `useLayoutEffect does nothing on the server` warning for
 * every such render. The component already picks `useEffect` where there is no
 * `document`, which is what a real server render looks like — but the runner
 * preloads a jsdom into EVERY spec process (`scripts/test-dom-preload.mjs`), so
 * in here the DOM branch is taken and the warning comes back. Dropping it keeps
 * an expected line out of the output, where it reads as a failure.
 */
const staticHtml = (element: React.ReactElement) =>
  withConsoleError(() => renderToStaticMarkup(element)).result;

/** The right-hand block, which is where a pending milestone is listed. */
function rightBlock(html: string): string {
  const at = html.lastIndexOf('text-left shrink-0');
  assert.notEqual(at, -1, `no right-hand block in: ${html}`);
  return html.slice(at);
}

test('an undated milestone gets no dot, no date, and a line in the pending list', () => {
  const html = staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={WITH_PENDING} endDate="2025-05-01" />,
  );

  // One dot per DATED milestone and not one more. The dots are the only thing
  // in this component carrying aria-label, so counting them counts dots.
  assert.equal((html.match(/aria-label="/g) ?? []).length, 4, `dot count in: ${html}`);
  assert.doesNotMatch(html, /aria-label="Sample Shipped/, 'no dot for an undated milestone');
  assert.doesNotMatch(html, /aria-label="Production Ready/);
  // The old rendering announced a fabricated position as "not reached yet".
  assert.doesNotMatch(html, /not reached yet/, 'no interpolated placeholder survives');

  const right = rightBlock(html);
  assert.match(right, /Sample Shipped/);
  assert.match(right, /Production Ready/);
  assert.match(right, /italic text-gray-400/, 'listed in the pending voice');
  assert.doesNotMatch(
    right,
    /\d{2}\/\d{2}\/\d{4}/,
    'a pending milestone has no date to print — that was the interpolation bug',
  );
});

test('the fill stops at the last DATED milestone, on the axis the caller pinned', () => {
  // 2025-01-01 to 2025-04-01 is 90 days of a 120-day axis, and 75% was the
  // answer while the axis was linear. It is not any more: the fill ends where
  // the last dated milestone SITS, on the same compressed mapping the dots and
  // labels use. What has not changed is that the two undated milestones neither
  // stretch the axis nor get painted as progress.
  const html = staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={WITH_PENDING} endDate="2025-05-01" />,
  );
  const axis = compressTimeAxis(
    ['2025-01-01', '2025-02-10', '2025-02-12', '2025-04-01', '2025-05-01'].map(day),
    600,
  );
  const fill = html.match(/bg-blue-300 rounded-full pointer-events-none" style="width:([^"]+)"/);
  assert.ok(fill, `no fill element in: ${html}`);
  assert.equal(fill[1], `${axis.xByMs(day('2025-04-01'))}px`);
  assert.ok(
    axis.xByMs(day('2025-04-01')) < 600,
    'and stops short of the right edge the caller pinned',
  );
});

test('with nothing pending the last dated label keeps the right edge; with pending it joins the lanes', () => {
  const dated = WITH_PENDING.filter((m) => m.date);

  const edged = rightBlock(staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={dated} endDate="2025-05-01" />,
  ));
  assert.match(edged, /Tooling Done/, 'the last dated label is the right edge, as it always was');
  assert.match(edged, /\d{2}\/\d{2}\/\d{4}/, 'with its date');

  const pushed = rightBlock(staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={WITH_PENDING} endDate="2025-05-01" />,
  ));
  assert.doesNotMatch(pushed, /Tooling Done/, 'the pending list owns the block instead');
});

test('with nothing dated the axis stays empty and everything is pending', () => {
  const html = staticHtml(
    <MilestoneTimeline
      title="Mould Development"
      milestones={[
        { key: 'a', label: 'Kickoff', date: null },
        { key: 'b', label: 'DFM v1', date: null },
      ]}
    />,
  );
  assert.doesNotMatch(html, /aria-label="/, 'nothing has a coordinate, so nothing has a dot');
  assert.doesNotMatch(html, /bg-blue-300/, 'and no fill claims progress');
  const right = rightBlock(html);
  assert.match(right, /Kickoff/);
  assert.match(right, /DFM v1/);
});

test('the pending list caps at three lines and says how many it folded', () => {
  const many: Milestone[] = [
    { key: 'a', label: 'Kickoff', date: '2025-01-01' },
    ...['One', 'Two', 'Three', 'Four', 'Five'].map((n) => ({ key: n, label: `Step ${n}`, date: null })),
  ];
  const right = rightBlock(staticHtml(<MilestoneTimeline title="Mould Development" milestones={many} />));
  for (const n of ['One', 'Two', 'Three']) assert.match(right, new RegExp(`Step ${n}`));
  assert.match(right, /\+2 more/);
  assert.match(right, /title="Step Four, Step Five"/, 'the folded ones are still readable');
  assert.doesNotMatch(right, />Step Four</, 'but not as a fourth line');
});

// ── Collapsed labels reveal on hover and focus ──────────────────────────────

/**
 * Five DFM revisions on ONE day, and a test six days later.
 *
 * The shape a compressed axis cannot rescue: spreading the stretches between
 * DATES buys room for five milestones spread over a fortnight, which is why the
 * fortnight version of this fixture no longer collapses anything. One date is
 * still one coordinate though, so the fifth revision has nowhere to go however
 * much room the axis hands out — and the reveal on hover is what it gets
 * instead. `DFM v5` is the one: the test packs first (it is not a revision), and
 * same-day revisions are packed in the caller's order.
 */
const CLUSTER: Milestone[] = [
  { key: 'start', label: 'Kickoff', date: '2025-01-01', onClick: () => {} },
  { key: 'd1', label: 'DFM v1', date: '2025-06-10', kind: 'dfm', onClick: () => {} },
  { key: 'd2', label: 'DFM v2', date: '2025-06-10', kind: 'dfm', onClick: () => {} },
  { key: 'd3', label: 'DFM v3', date: '2025-06-10', kind: 'dfm', onClick: () => {} },
  { key: 'd4', label: 'DFM v4', date: '2025-06-10', kind: 'dfm', onClick: () => {} },
  { key: 'd5', label: 'DFM v5', date: '2025-06-10', kind: 'dfm', onClick: () => {} },
  { key: 'safety', label: 'Safety Tests', date: '2025-06-16', kind: 'testing', onClick: () => {} },
  { key: 'ship', label: 'Sample Shipped', date: null, kind: 'shipment' },
];

/**
 * The text a sighted user can actually read.
 *
 * The measuring row is a full copy of every candidate label, `aria-hidden` and
 * off-layout, so a plain `textContent` says every label is on screen — including
 * the collapsed one whose whole point is that it is not.
 */
function visibleText(container: Element): string {
  const clone = container.cloneNode(true) as Element;
  for (const hidden of Array.from(clone.querySelectorAll('[aria-hidden="true"]'))) hidden.remove();
  return clone.textContent ?? '';
}

/** The dot announced with `label`. */
function dot(container: Element, label: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[aria-label^="${label}"]`);
  assert.ok(found, `no dot announced as "${label}"`);
  return found;
}

test('a collapsed label reveals on hover and hides again on leave', () => {
  const view = render(<MilestoneTimeline title="Mould Development" milestones={CLUSTER} />);

  // Four lanes hold four of the five same-day labels; the fifth has nowhere to
  // go, so it is not drawn at all until it is asked for.
  assert.doesNotMatch(visibleText(view.container), /DFM v5/, 'collapsed to begin with');
  assert.match(visibleText(view.container), /DFM v1/, 'the ones that fit are drawn');
  assert.match(visibleText(view.container), /Safety Tests/, 'as is the one that is not a revision');
  assert.match(visibleText(view.container), /Sample Shipped/, 'and the undated one is listed');

  const collapsed = dot(view.container, 'DFM v5');
  // React 18 synthesises mouseenter/leave from the delegated mouseover/mouseout
  // pair, so those are the events a user's pointer actually produces.
  act(() => { collapsed.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })); });
  assert.match(visibleText(view.container), /DFM v5/, 'revealed on hover');

  act(() => {
    collapsed.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  });
  assert.doesNotMatch(visibleText(view.container), /DFM v5/, 'hidden again on leave');

  view.unmount();
});

test('keyboard focus reveals it too — a clickable dot is already in the tab order', () => {
  const view = render(<MilestoneTimeline title="Mould Development" milestones={CLUSTER} />);
  const collapsed = dot(view.container, 'DFM v5');
  assert.equal(collapsed.tagName, 'BUTTON', 'an onClick milestone is a button');

  act(() => { collapsed.focus(); });
  assert.match(visibleText(view.container), /DFM v5/, 'revealed on focus');
  act(() => { collapsed.blur(); });
  assert.doesNotMatch(visibleText(view.container), /DFM v5/, 'hidden on blur');

  view.unmount();
});

test('the dot still announces and titles itself whether or not its label is drawn', () => {
  // The reveal is a visual affordance. Nothing about it may be the only route to
  // the fact: the dot carries the label and the date on itself either way.
  const view = render(<MilestoneTimeline title="Mould Development" milestones={CLUSTER} />);
  const collapsed = dot(view.container, 'DFM v5');
  const shown = fmtSliderDate(day('2025-06-10'));
  assert.equal(shown, '10/06/2025', 'the default date format, with nothing stored');
  assert.equal(collapsed.getAttribute('aria-label'), `DFM v5 on ${shown}`);
  assert.equal(collapsed.getAttribute('title'), `DFM v5 • ${shown}`);
  view.unmount();
});

// ── Lane priority ───────────────────────────────────────────────────────────

test('lanes go to the milestones that settle something, not to the revisions', () => {
  // Six labels 60 px wide whose centres are 1.2 px apart: four lanes, six
  // labels, and nothing can share a lane, so two of them cannot be drawn at
  // all. Which two is the whole question. The four DFM revisions are EARLIER
  // than the two milestones a reader opens the card for, so on date order alone
  // the revisions take every lane and "DFM Confirmed" and "Mould Complete" are
  // the two that vanish — which is what production looked like.
  const labelled = (key: string, at: number, priority: number): LabelLaneItem =>
    ({ key, ms: at * SPAN, widthPx: 60, priority });
  const revisions = ['v1', 'v2', 'v3', 'v4'];
  const keyOnes = ['confirmed', 'complete'];

  const byDateAlone = packLabelLanes([
    ...revisions.map((key, i) => labelled(key, 0.5 + i * 0.0002, 0)),
    ...keyOnes.map((key, i) => labelled(key, 0.5008 + i * 0.0002, 0)),
  ], 600, 0, SPAN);
  assert.deepEqual(
    byDateAlone.filter((l) => l.lane === -1).map((l) => l.key),
    keyOnes,
    'without a priority the revisions win on being earlier',
  );

  const byPriority = packLabelLanes([
    ...revisions.map((key, i) => labelled(key, 0.5 + i * 0.0002, 1)),
    ...keyOnes.map((key, i) => labelled(key, 0.5008 + i * 0.0002, 0)),
  ], 600, 0, SPAN);
  for (const key of keyOnes) {
    const lane = byPriority.find((l) => l.key === key)!.lane;
    assert.ok(lane >= 0, `${key} should have a lane, got ${lane}`);
  }
  assert.equal(
    byPriority.filter((l) => l.lane === -1).length, 2,
    'two labels still collapse — they are just the right two now',
  );
  assert.ok(
    byPriority.filter((l) => l.lane === -1).every((l) => revisions.includes(l.key)),
    'and both are revisions',
  );
});

test('inside a priority tier the order is still chronological', () => {
  // Greedy packing only reads as a left-to-right arrangement while a tier is in
  // date order; the tiers themselves are what jump backwards.
  const items: LabelLaneItem[] = [
    { key: 'late', ms: 0.6 * SPAN, widthPx: 60, priority: 0 },
    { key: 'early', ms: 0.1 * SPAN, widthPx: 60, priority: 0 },
  ];
  const lanes = packLabelLanes(items, 600, 0, SPAN);
  // Both fit lane 0; the claim is that the EARLY one was placed first, which is
  // only visible when they compete — so make them compete.
  const tight: LabelLaneItem[] = [
    { key: 'late', ms: 0.502 * SPAN, widthPx: 60, priority: 0 },
    { key: 'early', ms: 0.5 * SPAN, widthPx: 60, priority: 0 },
  ];
  assert.deepEqual(lanes.map((l) => l.lane), [0, 0]);
  assert.deepEqual(
    packLabelLanes(tight, 600, 0, SPAN),
    [{ key: 'late', lane: 1 }, { key: 'early', lane: 0 }],
    'the earlier label took lane 0 even though it arrived second',
  );
});

test('a caller with a piecewise axis passes x, and the linear fallback is ignored', () => {
  // `startMs` / `spanMs` compute a centre for a caller whose axis is linear.
  // This component's is not, and a label packed against the linear centre would
  // sit somewhere its own dot is not.
  const items: LabelLaneItem[] = [
    { key: 'a', ms: 0.02 * SPAN, widthPx: 60, xPx: 100 },
    { key: 'b', ms: 0.04 * SPAN, widthPx: 60, xPx: 300 },
  ];
  // On the linear axis both centres are inside 12 px of each other and the
  // second label has to take a second lane. On the axis the caller actually
  // drew, they are 200 px apart and both fit the first.
  assert.deepEqual(packLabelLanes(items, 600, 0, SPAN).map((l) => l.lane), [0, 0]);
  assert.deepEqual(
    packLabelLanes(items.map(({ xPx, ...rest }) => rest), 600, 0, SPAN).map((l) => l.lane),
    [0, 1],
  );
});

// ── compressTimeAxis ────────────────────────────────────────────────────────

const TRACK = 600;

/** Anchor times for mould 001F/1813 — see `MOULD_001F` below. */
const O1F_ANCHORS = [
  '2025-10-09', '2025-10-24', '2025-10-30',
  '2025-11-07', '2025-11-07', '2025-11-07',
  '2025-12-03', '2026-09-11',
].map(day);

test('evenly spaced anchors keep their proportions — compression only bites when the axis is lumpy', () => {
  const anchors = [0, 25, 50, 75, 100].map((d) => d * DAY_MS);
  const axis = compressTimeAxis(anchors, TRACK);
  assert.deepEqual(axis.xs, [0, 150, 300, 450, TRACK]);
  assert.ok(axis.gaps.every((g) => !g.compressed), 'nothing was cut, so nothing is marked');
});

test('a 55-day cluster and a 282-day tail: the cluster gets the track, the tail gets its cap', () => {
  const axis = compressTimeAxis(O1F_ANCHORS, TRACK);
  const cluster = axis.xByMs(day('2025-12-03'));
  const tail = TRACK - cluster;
  assert.ok(
    cluster >= 0.55 * TRACK,
    `the 55 days that hold every milestone should own most of the track, got ${cluster}px`,
  );
  // Half a pixel of tolerance: the widths are scaled floats, and the claim is
  // about what a reader sees, not about the last bit of a double.
  assert.ok(
    tail <= 0.3 * TRACK + 0.5,
    `the empty 282 days may own no more than 30% of the track, got ${tail}px`,
  );
  // For contrast: on `(ms - startMs) / span` the cluster owned 98 px of 600.
  assert.ok(cluster > 300, 'and a linear axis gave it 98');
});

test('two anchors a day apart are held 48 px apart, before the track is filled', () => {
  // 1 day of 337 is 1.8 px on a 600 px track — two dates drawn as one. The floor
  // is what the lanes are packing against, so it is asserted where it is applied:
  // after the clamp, before the widths are scaled to fill the track.
  const axis = compressTimeAxis([0, DAY_MS, 337 * DAY_MS], TRACK);
  assert.ok(axis.gaps[0].wantPx < 2, `a linear axis gives it ${axis.gaps[0].wantPx}px`);
  assert.ok(
    axis.gaps[0].clampedPx >= 48,
    `the floor should have raised it to 48, got ${axis.gaps[0].clampedPx}`,
  );
});

test('anchors on the same day are one anchor, and therefore one coordinate', () => {
  const sameDay = day('2025-11-07');
  const axis = compressTimeAxis([day('2025-10-09'), sameDay, sameDay, sameDay, day('2025-12-03')], TRACK);
  assert.equal(axis.anchorsMs.length, 3, 'three distinct days, whatever was passed in');
  assert.equal(axis.xByMs(sameDay), axis.xs[1]);
  assert.equal(axis.gaps.length, 2, 'and no zero-width stretch between a day and itself');
});

test('the interpolator is monotone, and pinned to both ends of the track', () => {
  const axis = compressTimeAxis(O1F_ANCHORS, TRACK);
  assert.equal(axis.xByMs(O1F_ANCHORS[0]), 0);
  assert.equal(axis.xByMs(O1F_ANCHORS[O1F_ANCHORS.length - 1]), TRACK);
  // Off both ends it clamps rather than extrapolating: a date outside the window
  // has no coordinate, and running off the bar is not one.
  assert.equal(axis.xByMs(day('2020-01-01')), 0);
  assert.equal(axis.xByMs(day('2030-01-01')), TRACK);

  let previous = -1;
  for (let d = 0; d <= 337; d++) {
    const x = axis.xByMs(O1F_ANCHORS[0] + d * DAY_MS);
    assert.ok(x >= previous, `day ${d} went backwards: ${x} after ${previous}`);
    assert.ok(x >= 0 && x <= TRACK, `day ${d} landed off the track at ${x}`);
    previous = x;
  }
});

test('an axis with nothing to compress still answers', () => {
  // A helper that throws on a degenerate axis is a helper the component has to
  // guard at every call site.
  const point = compressTimeAxis([day('2025-10-09')], TRACK);
  assert.deepEqual(point.gaps, []);
  assert.equal(point.xByMs(day('2025-10-09')), 0);
  assert.equal(compressTimeAxis([], TRACK).xByMs(Date.now()), 0);
  assert.equal(compressTimeAxis(O1F_ANCHORS, 0).xByMs(day('2025-11-07')), 0);
});

test('one stretch may exceed the cap when there is nowhere else for the track to go', () => {
  // Two stretches cannot cover a track at 30% each, and an axis that stops
  // three fifths of the way along is not an axis. The cap gives, and the
  // stretch stops claiming it was compressed once it is no longer short.
  const axis = compressTimeAxis([0, DAY_MS, 337 * DAY_MS], TRACK);
  assert.equal(axis.xs[axis.xs.length - 1], TRACK);
  assert.ok(axis.gaps[1].px > 0.3 * TRACK, 'the cap had to give');
  assert.ok(axis.gaps[1].compressed, 'and 336 days in 300 px is still a compression');
  assert.ok(!axis.gaps[0].compressed, 'while one day in 300 px is not');
});

// ── The production shape, rendered ──────────────────────────────────────────

/**
 * Mould 001F/1813, as the admin portal passes it.
 *
 * Seven dated milestones inside eight weeks, three of them on 7 November, and
 * then nothing for the next 282 days while the customer decides. `endDate` is
 * the day the card was read, because `production_ready_date` is null — which is
 * what put 282 empty days on the right of the bar.
 */
const MOULD_001F: Milestone[] = [
  { key: 'init', label: 'Project Initiated', date: '2025-10-09' },
  { key: 'dfm1', label: 'DFM v1', date: '2025-10-24', kind: 'dfm' },
  { key: 'dfm2', label: 'DFM v2', date: '2025-10-30', kind: 'dfm' },
  { key: 'dfm3', label: 'DFM v3', date: '2025-11-07', kind: 'dfm' },
  { key: 'dfm4', label: 'DFM v4', date: '2025-11-07', kind: 'dfm' },
  { key: 'dfmok', label: 'DFM Confirmed', date: '2025-11-07', kind: 'testing' },
  { key: 'complete', label: 'Mould Complete', date: '2025-12-03', kind: 'testing' },
  { key: 'sample', label: 'Sample Shipped', date: null, kind: 'shipment' },
  { key: 'ready', label: 'Production Ready', date: null, kind: 'completion' },
];
const MOULD_001F_END = '2026-09-11';

/** The axis the component builds for that fixture, rebuilt here so the spec
 *  asserts against the helper's own answer instead of a pasted float. 600 px is
 *  the width the component assumes before anything has been measured, which is
 *  every static render and every jsdom one. */
const MOULD_001F_AXIS = compressTimeAxis(
  [day('2025-10-09'), ...O1F_ANCHORS.slice(1, -1), day(MOULD_001F_END)],
  TRACK,
);

/** The lane labels actually drawn. The chip a `LaneRow` renders is the only
 *  thing in this markup with that class pair — the off-layout measuring copy has
 *  no `absolute`, and a dot carries its label in attributes, not as text. */
const laneLabelCount = (html: string) =>
  (html.match(/-translate-x-1\/2 text-center text-\[10px\] leading-tight/g) ?? []).length;

test('001F/1813 renders every label in a lane, and marks the tail it compressed', () => {
  const html = staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={MOULD_001F} endDate={MOULD_001F_END} />,
  );

  // Six lane candidates: everything dated except the first, which is the inline
  // label on the left. On the linear axis two of them collapsed to hover-only.
  assert.equal(laneLabelCount(html), 6, `every dated label should have a lane, in: ${html}`);
  for (const label of ['DFM v1', 'DFM v2', 'DFM v3', 'DFM v4', 'DFM Confirmed', 'Mould Complete']) {
    assert.match(html, new RegExp(label));
  }

  // One break glyph, on the 282-day tail. The four stretches that were only
  // WIDENED to the floor are not marked: they read as short already, and a glyph
  // there would describe a distortion nobody can see.
  assert.equal((html.match(/Gap compressed:/g) ?? []).length, 1, 'exactly one stretch was cut');
  assert.match(html, /title="Gap compressed: 282 days"/);

  // The fill comes off the same mapping as everything else.
  const fill = html.match(/bg-blue-300 rounded-full pointer-events-none" style="width:([^"]+)"/);
  assert.ok(fill, `no fill element in: ${html}`);
  assert.equal(fill[1], `${MOULD_001F_AXIS.xByMs(day('2025-12-03'))}px`);
  assert.ok(
    MOULD_001F_AXIS.xByMs(day('2025-12-03')) > 0.55 * TRACK,
    'and the reached part of the programme is most of the bar, not a sixth of it',
  );
});

test('today gets its tick off the same mapping', () => {
  // Around the clock rather than on fixed dates, because the tick exists only
  // while the axis runs PAST today: 001F pins `endDate` to today itself, so
  // there is nothing to the right of it to mark.
  const iso = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
  const html = staticHtml(
    <MilestoneTimeline
      title="Mould Development"
      milestones={[
        { key: 'init', label: 'Project Initiated', date: iso(-300) },
        { key: 'dfm1', label: 'DFM v1', date: iso(-292), kind: 'dfm' },
        { key: 'complete', label: 'Mould Complete', date: iso(-280), kind: 'testing' },
      ]}
      endDate={iso(30)}
    />,
  );
  const tick = html.match(/style="left:([0-9.]+)px" title="Today/);
  assert.ok(tick, `no today tick in: ${html}`);
  const x = Number(tick[1]);
  assert.ok(x > 0 && x < TRACK, `today should sit inside the track, got ${x}px`);
  // It sits inside the 310-day stretch the axis compressed, which is the point:
  // the tick is interpolated on the same piecewise mapping as everything else
  // rather than on `(todayMs - startMs) / span`, so it lands between the
  // milestone before it and the right edge, not at 85% of a linear bar.
  const lastMilestone = html.match(/style="width:([0-9.]+)px"/);
  assert.ok(lastMilestone, 'the fill marks the last milestone');
  assert.ok(x > Number(lastMilestone[1]), `today is after the last milestone, got ${x}px`);
});

test('the component gives its lanes to the key milestones, not the revisions', () => {
  // Five labels on ONE day: one coordinate, four lanes, so one of them cannot be
  // drawn. It has to be a revision — which is the case the priority exists for,
  // wired through the component rather than asserted on the packer alone.
  const sameDay: Milestone[] = [
    { key: 'init', label: 'Project Initiated', date: '2025-10-09' },
    { key: 'dfm1', label: 'DFM v1', date: '2025-11-07', kind: 'dfm' },
    { key: 'dfm2', label: 'DFM v2', date: '2025-11-07', kind: 'dfm' },
    { key: 'dfm3', label: 'DFM v3', date: '2025-11-07', kind: 'dfm' },
    { key: 'dfm4', label: 'DFM v4', date: '2025-11-07', kind: 'dfm' },
    { key: 'complete', label: 'Mould Complete', date: '2025-11-07', kind: 'testing' },
    { key: 'ready', label: 'Production Ready', date: null, kind: 'completion' },
  ];
  const view = render(
    <MilestoneTimeline title="Mould Development" milestones={sameDay} endDate={MOULD_001F_END} />,
  );
  const text = visibleText(view.container);
  assert.match(text, /Mould Complete/, 'the milestone that settles something is drawn');
  const drawn = ['DFM v1', 'DFM v2', 'DFM v3', 'DFM v4'].filter((label) => text.includes(label));
  assert.equal(drawn.length, 3, `three of the four revisions fit, got ${JSON.stringify(drawn)}`);
  view.unmount();
});
