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
 * So the claims here are geometric (the packer is pure, and asserted by extents)
 * and textual (an undated milestone produces no dot, no date and no coordinate).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First — installs the DOM globals before react-dom evaluates. Needed even for
// the static renders: `fmtSliderDate` reads the user's date format out of
// localStorage, which does not exist in a bare node process.
import { act, render } from './dom';
import { renderToStaticMarkup } from 'react-dom/server';
import MilestoneTimeline, {
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

test('the fill stops at the last DATED milestone, on the span the caller pinned', () => {
  // 2025-01-01 to 2025-04-01 is 90 days of a 120-day axis. The two undated
  // milestones must not stretch it, and must not be painted as progress.
  const html = staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={WITH_PENDING} endDate="2025-05-01" />,
  );
  const fill = html.match(/bg-blue-300 rounded-full pointer-events-none" style="width:([^"]+)"/);
  assert.ok(fill, `no fill element in: ${html}`);
  assert.equal(fill[1], '75%');
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

/** Five dated milestones inside a week at the far right of a 166-day axis —
 *  the production shape: four DFM revisions and a test, all in one fortnight. */
const CLUSTER: Milestone[] = [
  { key: 'start', label: 'Kickoff', date: '2025-01-01', onClick: () => {} },
  { key: 'd1', label: 'DFM v1', date: '2025-06-10', kind: 'dfm', onClick: () => {} },
  { key: 'd2', label: 'DFM v2', date: '2025-06-11', kind: 'dfm', onClick: () => {} },
  { key: 'd3', label: 'DFM v3', date: '2025-06-12', kind: 'dfm', onClick: () => {} },
  { key: 'd4', label: 'DFM v4', date: '2025-06-13', kind: 'dfm', onClick: () => {} },
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

  // Four lanes hold four of the five clustered labels; the fifth has nowhere to
  // go, so it is not drawn at all until it is asked for.
  assert.doesNotMatch(visibleText(view.container), /Safety Tests/, 'collapsed to begin with');
  assert.match(visibleText(view.container), /DFM v1/, 'the ones that fit are drawn');
  assert.match(visibleText(view.container), /Sample Shipped/, 'and the undated one is listed');

  const collapsed = dot(view.container, 'Safety Tests');
  // React 18 synthesises mouseenter/leave from the delegated mouseover/mouseout
  // pair, so those are the events a user's pointer actually produces.
  act(() => { collapsed.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })); });
  assert.match(visibleText(view.container), /Safety Tests/, 'revealed on hover');

  act(() => {
    collapsed.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  });
  assert.doesNotMatch(visibleText(view.container), /Safety Tests/, 'hidden again on leave');

  view.unmount();
});

test('keyboard focus reveals it too — a clickable dot is already in the tab order', () => {
  const view = render(<MilestoneTimeline title="Mould Development" milestones={CLUSTER} />);
  const collapsed = dot(view.container, 'Safety Tests');
  assert.equal(collapsed.tagName, 'BUTTON', 'an onClick milestone is a button');

  act(() => { collapsed.focus(); });
  assert.match(visibleText(view.container), /Safety Tests/, 'revealed on focus');
  act(() => { collapsed.blur(); });
  assert.doesNotMatch(visibleText(view.container), /Safety Tests/, 'hidden on blur');

  view.unmount();
});

test('the dot still announces and titles itself whether or not its label is drawn', () => {
  // The reveal is a visual affordance. Nothing about it may be the only route to
  // the fact: the dot carries the label and the date on itself either way.
  const view = render(<MilestoneTimeline title="Mould Development" milestones={CLUSTER} />);
  const collapsed = dot(view.container, 'Safety Tests');
  const shown = fmtSliderDate(day('2025-06-16'));
  assert.equal(shown, '16/06/2025', 'the default date format, with nothing stored');
  assert.equal(collapsed.getAttribute('aria-label'), `Safety Tests on ${shown}`);
  assert.equal(collapsed.getAttribute('title'), `Safety Tests • ${shown}`);
  view.unmount();
});
