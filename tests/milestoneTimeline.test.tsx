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
import { act, pressKey, render } from './dom';
import { renderToStaticMarkup } from 'react-dom/server';
import MilestoneTimeline, { type Milestone } from '../src/shell/MilestoneTimeline';
// The geometry moved out of the card and into the primitive both timelines are
// drawn on, so the pure helpers are specified where they now live.
import {
  compressTimeAxis,
  packLabelLanes,
  LABEL_LANE_COUNT,
  type LabelLaneItem,
} from '../src/shell/timelineGeometry';
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

/** The pending column, which is where an undated milestone is listed. */
function pendingBlock(html: string): string {
  const at = html.indexOf('data-timeline-part="pending"');
  assert.notEqual(at, -1, `no pending block in: ${html}`);
  return html.slice(at);
}

/** One per dot drawn on the rail. Dots are the only nodes the track marks as
 *  items, so counting them counts dots — and unlike the `aria-label` count this
 *  replaced, it does not move when a list or a thumb gains a name. */
const dotCount = (html: string) => (html.match(/data-timeline-node="item"/g) ?? []).length;

/** One per label actually drawn in a lane. */
const laneLabelCount = (html: string) => (html.match(/data-timeline-part="label"/g) ?? []).length;

/** The fill bar's width, as the style attribute states it. */
function fillWidth(html: string): string {
  const hit = html.match(/data-timeline-part="fill"[^>]*style="[^"]*width:([^";]+)"/);
  assert.ok(hit, `no fill element in: ${html}`);
  return hit[1];
}

test('an undated milestone gets no dot, no date, and a line in the pending list', () => {
  const html = staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={WITH_PENDING} endDate="2025-05-01" />,
  );

  // One dot per DATED milestone and not one more.
  assert.equal(dotCount(html), 4, `dot count in: ${html}`);
  assert.doesNotMatch(html, /aria-label="Sample Shipped/, 'no dot for an undated milestone');
  assert.doesNotMatch(html, /aria-label="Production Ready/);
  // The old rendering announced a fabricated position as "not reached yet".
  assert.doesNotMatch(html, /not reached yet/, 'no interpolated placeholder survives');

  const pending = pendingBlock(html);
  assert.match(pending, /Sample Shipped/);
  assert.match(pending, /Production Ready/);
  assert.match(pending, /Next · /, 'and the first of them is named as what happens next');
  assert.doesNotMatch(
    pending,
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
  assert.equal(fillWidth(html), `${axis.xByMs(day('2025-04-01'))}px`);
  assert.ok(
    axis.xByMs(day('2025-04-01')) < 600,
    'and stops short of the right edge the caller pinned',
  );
});

test('the pending column exists only when something is pending', () => {
  const dated = WITH_PENDING.filter((m) => m.date);

  const noneePending = staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={dated} endDate="2025-05-01" />,
  );
  assert.doesNotMatch(noneePending, /data-timeline-part="pending"/, 'nothing pending, no column');
  assert.match(noneePending, /Tooling Done/, 'and the last dated milestone keeps a label of its own');

  const pending = pendingBlock(staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={WITH_PENDING} endDate="2025-05-01" />,
  ));
  assert.doesNotMatch(pending, /Tooling Done/, 'a dated milestone is never listed as pending');
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
  assert.equal(dotCount(html), 0, 'nothing has a coordinate, so nothing has a dot');
  assert.doesNotMatch(html, /data-timeline-part="fill"/, 'and no fill claims progress');
  const pending = pendingBlock(html);
  assert.match(pending, /Kickoff/);
  assert.match(pending, /DFM v1/);
});

test('the pending list caps at two rows and offers the rest on a real button', () => {
  // A `title` was the old answer and it is invisible on touch, which made the
  // folded milestones unreachable on the device most likely to be reading them.
  const many: Milestone[] = [
    { key: 'a', label: 'Kickoff', date: '2025-01-01' },
    ...['One', 'Two', 'Three', 'Four', 'Five'].map((n) => ({ key: n, label: `Step ${n}`, date: null })),
  ];
  const pending = pendingBlock(staticHtml(<MilestoneTimeline title="Mould Development" milestones={many} />));
  for (const n of ['One', 'Two']) assert.match(pending, new RegExp(`Step ${n}`));
  assert.doesNotMatch(pending, /Step Three/, 'the third is folded, not drawn');
  assert.match(pending, /<button[^>]*>\+3 more<\/button>/, 'and the fold is a control, not a tooltip');
});

// ── Clusters, and the labels that still do not fit ──────────────────────────

/**
 * Five DFM revisions on ONE day, and a test six days later.
 *
 * The shape a compressed axis cannot rescue: spreading the stretches between
 * DATES buys room for five milestones spread over a fortnight, but one date is
 * still one coordinate, so five labels on 10 June have nowhere to go however
 * much room the axis hands out. Five same-kind dots in a row is also five
 * reports of ONE step, which is what the `×N` pill is for.
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
 * Three unlike kinds on one day: nothing to fold (a `×N` over three different
 * kinds would be a lie), two lanes, so the third label has nowhere to go and
 * collapses to a reveal.
 */
const UNLIKE_SAME_DAY: Milestone[] = [
  { key: 'start', label: 'Kickoff', date: '2025-01-01' },
  { key: 'safety', label: 'Safety Tests', date: '2025-06-10', kind: 'testing', onClick: () => {} },
  { key: 'ship', label: 'Sample Shipped', date: '2025-06-10', kind: 'shipment', onClick: () => {} },
  { key: 'ready', label: 'Production Ready', date: '2025-06-10', kind: 'completion', onClick: () => {} },
];

/** The names actually drawn in a lane. The lane labels are `aria-hidden` (the
 *  list of dots already says all of it), so `textContent` cannot answer this —
 *  and neither can it tell a drawn label from the off-layout measuring copy. */
function drawnLabels(container: Element): string[] {
  return Array.from(container.querySelectorAll('[data-timeline-part="label"] .rosh-tl-name'))
    .map((el) => el.textContent ?? '');
}

/** The dot announced with `label`. */
function dot(container: Element, label: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[aria-label^="${label}"]`);
  assert.ok(found, `no dot announced as "${label}"`);
  return found;
}

const hover = (el: Element) => act(() => {
  // React 18 synthesises mouseenter/leave from the delegated mouseover/mouseout
  // pair, so those are the events a user's pointer actually produces.
  el.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
});
const unhover = (el: Element) => act(() => {
  el.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
});

test('a run of same-kind revisions folds into one pill, and every member keeps its dot', () => {
  const view = render(<MilestoneTimeline title="Mould Development" milestones={CLUSTER} />);

  const labels = drawnLabels(view.container);
  assert.deepEqual(labels.filter((l) => l.startsWith('DFM')), [], 'no revision draws a label of its own');
  const pill = view.container.querySelector('[data-timeline-part="cluster"]');
  assert.ok(pill, 'the five revisions are one pill');
  assert.match(pill.textContent ?? '', /DFM ×5/);
  assert.ok(labels.includes('Safety Tests'), 'the milestone that is not a revision keeps its label');

  // The pill never lies about position: every member is still a dot on the rail
  // at its own coordinate, and still announces itself.
  for (const n of [1, 2, 3, 4, 5]) {
    assert.ok(dot(view.container, `DFM v${n}`), `DFM v${n} keeps its dot`);
  }
  view.unmount();
});

test('the pill opens a popover listing every member, and Escape closes it', () => {
  const view = render(<MilestoneTimeline title="Mould Development" milestones={CLUSTER} />);
  const pill = view.container.querySelector<HTMLElement>('[data-timeline-part="cluster"]')!;
  const popover = () => view.container.querySelector('[data-timeline-part="cluster-popover"]');

  assert.equal(popover(), null, 'closed to begin with');
  assert.equal(pill.getAttribute('aria-expanded'), 'false');

  // Hover previews it without pinning it.
  hover(pill);
  assert.ok(popover(), 'hover previews the members');
  assert.equal(pill.getAttribute('aria-expanded'), 'false', 'a preview is not an expansion');
  unhover(pill);
  assert.equal(popover(), null);

  act(() => { pill.click(); });
  const open = popover();
  assert.ok(open, 'click pins it');
  assert.equal(pill.getAttribute('aria-expanded'), 'true');
  assert.equal(pill.getAttribute('aria-controls'), open.id, 'and says which region it controls');
  for (const n of [1, 2, 3, 4, 5]) assert.match(open.textContent ?? '', new RegExp(`DFM v${n}`));
  assert.match(open.textContent ?? '', /10\/06\/2025/, 'each member with its date');

  // WCAG 1.4.13: dismissible without moving the pointer or the focus.
  pressKey('Escape');
  assert.equal(popover(), null, 'Escape closes it');
  view.unmount();
});

test('a label that fits no lane reveals on hover and hides again on leave', () => {
  const view = render(<MilestoneTimeline title="Mould Development" milestones={UNLIKE_SAME_DAY} />);
  const drawn = drawnLabels(view.container);
  const collapsedLabel = ['Safety Tests', 'Sample Shipped', 'Production Ready']
    .find((label) => !drawn.includes(label));
  assert.ok(collapsedLabel, `two lanes hold two of the three, got ${JSON.stringify(drawn)}`);

  const reveal = () => view.container.querySelector('[data-timeline-part="reveal"]');
  assert.equal(reveal(), null, 'collapsed to begin with');

  const collapsed = dot(view.container, collapsedLabel);
  hover(collapsed);
  assert.match(reveal()?.textContent ?? '', new RegExp(collapsedLabel), 'revealed on hover');
  unhover(collapsed);
  assert.equal(reveal(), null, 'hidden again on leave');
  view.unmount();
});

test('keyboard focus reveals it too — a dot is a button whether or not it is clickable', () => {
  const view = render(<MilestoneTimeline title="Mould Development" milestones={UNLIKE_SAME_DAY} />);
  const drawn = drawnLabels(view.container);
  const collapsedLabel = ['Safety Tests', 'Sample Shipped', 'Production Ready']
    .find((label) => !drawn.includes(label))!;
  const collapsed = dot(view.container, collapsedLabel);
  assert.equal(collapsed.tagName, 'BUTTON');

  act(() => { collapsed.focus(); });
  assert.ok(view.container.querySelector('[data-timeline-part="reveal"]'), 'revealed on focus');
  act(() => { collapsed.blur(); });
  assert.equal(view.container.querySelector('[data-timeline-part="reveal"]'), null, 'hidden on blur');
  view.unmount();
});

test('the dot still announces and titles itself whether or not its label is drawn', () => {
  // The reveal and the pill are visual affordances. Nothing about either may be
  // the only route to the fact: the dot carries the label and the date itself.
  const view = render(<MilestoneTimeline title="Mould Development" milestones={CLUSTER} />);
  const folded = dot(view.container, 'DFM v5');
  const shown = fmtSliderDate(day('2025-06-10'));
  assert.equal(shown, '10/06/2025', 'the default date format, with nothing stored');
  assert.equal(folded.getAttribute('aria-label'), `DFM v5 · ${shown}`);
  assert.equal(folded.getAttribute('title'), `DFM v5 • ${shown}`);
  view.unmount();
});

test('a milestone opens its document from the popover, and onClick is only the fallback', () => {
  // Two different acts: `onClick` selects the dot on the bar, `onOpen` opens
  // the drawing behind it. `Milestone` declared only the first, so a portal
  // that wanted the popover's Open button had to hand it the selection handler
  // and let the two be one thing.
  const opened: string[] = [];
  const clicked: string[] = [];
  const milestones: Milestone[] = [
    { key: 'start', label: 'Kickoff', date: '2025-01-01' },
    {
      key: 'dfm',
      label: 'DFM Confirmed',
      date: '2025-03-04',
      kind: 'dfm',
      preview: <span data-testid="dfm-preview">v4 · signed 04/03 · tooling released</span>,
      onClick: () => clicked.push('dfm'),
      onOpen: () => opened.push('dfm'),
    },
  ];
  const view = render(<MilestoneTimeline title="Mould Development" milestones={milestones} />);

  act(() => { dot(view.container, 'DFM Confirmed').focus(); });
  const tip = view.container.querySelector('[role="tooltip"]')!;
  assert.ok(tip.querySelector('[data-timeline-part="preview"]'), "the consumer's preview, forwarded by the card");
  // Printed by the popover itself, above whatever the preview says.
  assert.match(tip.textContent ?? '', /DFM Confirmed/);
  assert.match(tip.textContent ?? '', /04\/03\/2025/);

  const open = tip.querySelector<HTMLElement>('[data-timeline-part="bubble-open"]')!;
  act(() => { open.click(); });
  assert.deepEqual(opened, ['dfm']);
  assert.deepEqual(clicked, [], 'Open opens the document; it does not re-select the dot');

  pressKey('Escape');
  view.unmount();
});

test('a milestone with only onClick still gets an Open button, wired to it', () => {
  // The fallback is what keeps every card written before `onOpen` existed
  // working: without it, adding the prop would have silently taken the Open
  // footer away from all of them.
  const clicked: string[] = [];
  const milestones: Milestone[] = [
    { key: 'start', label: 'Kickoff', date: '2025-01-01' },
    { key: 'ship', label: 'Sample Shipped', date: '2025-03-04', kind: 'shipment', onClick: () => clicked.push('ship') },
  ];
  const view = render(<MilestoneTimeline title="Mould Development" milestones={milestones} />);

  act(() => { dot(view.container, 'Sample Shipped').focus(); });
  const open = view.container.querySelector<HTMLElement>('[data-timeline-part="bubble-open"]')!;
  act(() => { open.click(); });
  assert.deepEqual(clicked, ['ship']);

  pressKey('Escape');
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

test('a stretch over the share is CUT to a notch, and the rest gets the track', () => {
  // Not squeezed — cut. A stretch holding more than 30% of the window's time
  // loses its proportion entirely and becomes a fixed 48 px notch; everything
  // left shares the remaining 552 px at one honest density. The alternative,
  // capping it at 30% of the TRACK, still spent 180 px saying "nothing
  // happened" and still squashed what did.
  const axis = compressTimeAxis([0, DAY_MS, 337 * DAY_MS], TRACK);
  assert.equal(axis.xs[axis.xs.length - 1], TRACK);
  assert.ok(Math.abs(axis.gaps[1].px - 48) < 0.5, `the tail is a notch, got ${axis.gaps[1].px}px`);
  assert.ok(axis.gaps[1].compressed, 'and it says so, because that piece of bar keeps no time');
  assert.ok(!axis.gaps[0].compressed, 'while the day that holds both dates does');
  assert.ok(axis.gaps[0].px > 0.9 * TRACK, 'and it gets everything the notch left');
});

test('a stretch under the share is never touched, however lopsided the bar', () => {
  // The threshold is a share of TIME, not of track: 25, 25, 30 and 20 days of a
  // 100-day window are all at or under it, so the axis stays proportional and
  // the 30-day stretch keeps being half again as long as the 20-day one. A rule
  // that reached for the widest stretch on every bar would flatten that out.
  const axis = compressTimeAxis([0, 25 * DAY_MS, 50 * DAY_MS, 80 * DAY_MS, 100 * DAY_MS], TRACK);
  assert.ok(axis.gaps.every((gap) => !gap.compressed), 'nothing crossed the threshold');
  assert.deepEqual(axis.gaps.map((gap) => Math.round(gap.px)), [150, 150, 180, 120]);
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

test('001F/1813 folds the revisions, labels the rest, and marks the tail it compressed', () => {
  const html = staticHtml(
    <MilestoneTimeline title="Mould Development" milestones={MOULD_001F} endDate={MOULD_001F_END} />,
  );

  // Three labels and one pill, where a linear axis with four lanes drew six
  // labels and collapsed two of them to hover-only.
  assert.equal(laneLabelCount(html), 3, `expected three lane labels, in: ${html}`);
  for (const label of ['Project Initiated', 'DFM Confirmed', 'Mould Complete']) {
    assert.match(html, new RegExp(label));
  }
  assert.equal((html.match(/data-timeline-part="cluster"/g) ?? []).length, 1, 'one pill');
  assert.match(html, /DFM ×4/, 'and it says how many revisions it stands for');
  // Every revision still has its own dot, at its own date.
  for (const n of [1, 2, 3, 4]) assert.match(html, new RegExp(`aria-label="DFM v${n} · `));

  // One break glyph, on the 282-day tail. The four stretches that were only
  // WIDENED to the floor are not marked: they read as short already, and a glyph
  // there would describe a distortion nobody can see.
  assert.equal((html.match(/data-timeline-part="break"/g) ?? []).length, 1, 'exactly one stretch was cut');
  assert.match(html, /282 days/, 'and it says how many days it hides');

  // The fill comes off the same mapping as everything else.
  assert.equal(fillWidth(html), `${MOULD_001F_AXIS.xByMs(day('2025-12-03'))}px`);
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
  const tick = html.match(/class="rosh-tl-todayline[^"]*" style="left:([0-9.]+)px/);
  assert.ok(tick, `no today tick in: ${html}`);
  const x = Number(tick[1]);
  assert.ok(x > 0 && x < TRACK, `today should sit inside the track, got ${x}px`);
  // It sits inside the 310-day stretch the axis compressed, which is the point:
  // the tick is interpolated on the same piecewise mapping as everything else
  // rather than on `(todayMs - startMs) / span`, so it lands between the
  // milestone before it and the right edge, not at 85% of a linear bar.
  assert.ok(
    x > Number(fillWidth(html).replace('px', '')),
    `today is after the last milestone, got ${x}px`,
  );
});

test('the card gives its lanes to the milestones that settle something', () => {
  // Five labels on ONE day: one coordinate, two lanes. The four revisions are
  // one step reported four times, so they fold into a pill and the milestone a
  // reader opened the card for keeps its label.
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
  const labels = drawnLabels(view.container);
  assert.ok(labels.includes('Mould Complete'), `the key milestone is drawn, got ${JSON.stringify(labels)}`);
  assert.deepEqual(labels.filter((l) => l.startsWith('DFM v')), [], 'and no revision competes with it');
  assert.match(
    view.container.querySelector('[data-timeline-part="cluster"]')?.textContent ?? '',
    /DFM ×4/,
  );
  view.unmount();
});
