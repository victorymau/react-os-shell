/**
 * `TimelineTrack` — the axis both timelines are drawn on.
 *
 * The card-level specs live beside their cards (`milestoneTimeline`,
 * `productionTimeline`); what is asserted here is the contract the two share and
 * neither owns: the shape of the accessible list, the label strategies, the two
 * lanes, the clustering rule, the pending list, and the keyboard and dismissal
 * behaviour the whole thing rests on.
 *
 * The geometry helpers are pure and specified first. Everything after them
 * renders the component, because the claims are about markup and events rather
 * than about arithmetic — and a claim about clustering asserted through the
 * helper alone would not have caught the card wiring it up with the wrong field.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First — installs the DOM globals before react-dom evaluates. Needed even for
// the static renders: `fmtSliderDate` reads the user's date format out of
// localStorage, which does not exist in a bare node process.
import { act, pressKey, render } from './dom';
import { renderToStaticMarkup } from 'react-dom/server';
import TimelineTrack, { type TimelineTrackItem } from '../src/shell/TimelineTrack';
import {
  clusterLabel, clusterMarks, packLabelLanes, TRACK_LABEL_LANE_COUNT,
} from '../src/shell/timelineGeometry';
import { toDayMs } from '../src/shell/timelineDates';
import { withConsoleError } from './capture-console';

const day = (iso: string) => toDayMs(iso)!;

/** A server render, with React's own console noise dropped — see the note in
 *  `milestoneTimeline.test.tsx`: the runner preloads a jsdom into every spec
 *  process, so the layout-effect warning comes back on a static render. */
const staticHtml = (element: React.ReactElement) =>
  withConsoleError(() => renderToStaticMarkup(element)).result;

/** Four milestones over three months, the last of them the current one. */
const ITEMS: TimelineTrackItem[] = [
  { key: 'start', ms: day('2026-01-05'), label: 'Project Initiated' },
  { key: 'd1', ms: day('2026-01-20'), label: 'DFM v1', kind: 'dfm', priority: 1 },
  { key: 'd2', ms: day('2026-01-26'), label: 'DFM v2', kind: 'dfm', priority: 1 },
  { key: 'done', ms: day('2026-03-01'), label: 'Mould Complete', kind: 'completion' },
];
const START = day('2026-01-05');
const END = day('2026-03-01');

const track = (props: Partial<React.ComponentProps<typeof TimelineTrack>> = {}) => (
  <TimelineTrack startMs={START} endMs={END} items={ITEMS} ariaLabel="WM-2208 milestones" {...props} />
);

// ── The accessible shape ────────────────────────────────────────────────────

test('the card is two ordered lists: what happened, and what has not', () => {
  const html = staticHtml(track({
    pending: [{ key: 'p1', label: 'Sample Shipped' }, { key: 'p2', label: 'Production Ready' }],
  }));
  assert.equal((html.match(/<ol/g) ?? []).length, 2, `expected two lists in: ${html}`);
  assert.match(html, /aria-label="WM-2208 milestones"/);
  assert.match(html, /aria-label="Not yet reached"/);
  // The rail, the fill, the ruler, the today tick and the drawn labels all
  // restate the list, so none of them is in the accessibility tree.
  for (const part of ['fill', 'ruler', 'label']) {
    const at = html.indexOf(`data-timeline-part="${part}"`);
    assert.notEqual(at, -1, `${part} missing`);
    assert.match(html.slice(Math.max(0, at - 120), at), /aria-hidden="true"/, `${part} should be hidden`);
  }
});

test('exactly one mark is current, and exactly one is in the tab order', () => {
  // Atlassian's rule: a tracker with no current step is a bug — and two is
  // worse, because a screen reader then reads two places as "you are here".
  const html = staticHtml(track());
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1, 'one tab stop, not nine');
  // The default is the last dated mark; the caller can say otherwise.
  assert.match(html, /aria-current="step"[\s\S]{0,200}data-timeline-key="done"/);
  assert.match(
    staticHtml(track({ currentKey: 'd1' })),
    /aria-current="step"[\s\S]{0,200}data-timeline-key="d1"/,
  );
});

test('every dot is a button, whether or not the caller gave it a handler', () => {
  // Not decoration: a dot that is not focusable cannot show its tooltip to a
  // keyboard user, and the tooltip is where the full label and date live.
  const html = staticHtml(track());
  assert.equal((html.match(/data-timeline-node="item"/g) ?? []).length, 4);
  assert.equal(
    (html.match(/<button[^>]*data-timeline-node/g) ?? []).length, 4,
    `every mark on the rail is a button: ${html}`,
  );
});

// ── Pending ─────────────────────────────────────────────────────────────────

test('the pending list names the next thing and folds the rest onto a button', () => {
  const pending = ['First', 'Second', 'Third', 'Fourth'].map((label) => ({ key: label, label }));
  const html = staticHtml(track({ pending }));
  assert.match(html, /<b>Next · <\/b>First/, 'the first pending thing is what happens next');
  assert.match(html, /Second/);
  assert.doesNotMatch(html, /Third/, 'two rows, then a fold');
  assert.match(html, /<button[^>]*>\+2 more<\/button>/, 'and the fold is a control, not a title');
});

test('an undated thing never gets a date, because there is not one', () => {
  const html = staticHtml(track({ items: [], pending: [{ key: 'p', label: 'Production Ready' }] }));
  const at = html.indexOf('data-timeline-part="pending"');
  assert.doesNotMatch(html.slice(at), /\d{2}\/\d{2}\/\d{4}/);
  assert.doesNotMatch(html, /data-timeline-node/, 'and no dot on the rail');
});

// ── Axis modes ──────────────────────────────────────────────────────────────

test('a compressed axis marks the idle stretch it cut; a linear one has none to mark', () => {
  // Same data, same window: the difference is entirely the axis mode, which is
  // what lets one primitive serve a mould programme and a production order.
  const idle: TimelineTrackItem[] = [
    { key: 'a', ms: day('2025-10-09'), label: 'Project Initiated' },
    { key: 'b', ms: day('2025-10-24'), label: 'DFM v1', kind: 'dfm', priority: 1 },
    { key: 'c', ms: day('2025-12-03'), label: 'Mould Complete', kind: 'completion' },
  ];
  const props = { items: idle, startMs: day('2025-10-09'), endMs: day('2026-09-11') };

  const compressed = staticHtml(track({ ...props, axis: 'compressed' }));
  assert.equal((compressed.match(/data-timeline-part="break"/g) ?? []).length, 1);
  assert.match(compressed, /282 days/, 'and it says what it hides');

  const linear = staticHtml(track({ ...props, axis: 'linear' }));
  assert.doesNotMatch(linear, /data-timeline-part="break"/, 'a linear axis hides nothing');
  // Proof the two really are different axes rather than the same one twice.
  const x = (html: string) => html.match(/data-timeline-key="c"[^>]*style="[^"]*left:([0-9.]+)px/)?.[1];
  assert.notEqual(x(compressed), x(linear));
  assert.ok(Number(x(compressed)) > 3 * Number(x(linear)), `${x(compressed)} vs ${x(linear)}`);
});

// ── Lanes and clusters ──────────────────────────────────────────────────────

test('labels take two lanes and no more', () => {
  // Four lanes resolve the overlap at the cost of ~112px of card height and an
  // eye that zig-zags across four rows to read one week — which was the
  // "crammed" complaint itself. Clustering absorbs what the other two held.
  assert.equal(TRACK_LABEL_LANE_COUNT, 2);
  const html = staticHtml(track());
  const tops = new Set(
    [...html.matchAll(/data-timeline-part="label"[^>]*style="[^"]*top:([0-9.]+)px/g)].map((m) => m[1]),
  );
  assert.ok(tops.size <= 2, `labels landed on ${tops.size} rows: ${[...tops].join(', ')}`);
  assert.ok(tops.size > 0, 'and at least one label is drawn');
});

test('a lane count of two is honoured by the packer that places them', () => {
  const items = [0, 1, 2, 3].map((i) => ({ key: `k${i}`, ms: i, widthPx: 60, xPx: 300 }));
  const lanes = packLabelLanes(items, 600, 0, 4, { laneCount: 2 });
  assert.deepEqual(lanes.map((l) => l.lane), [0, 1, -1, -1], 'two fit, the rest collapse');
  assert.deepEqual(
    packLabelLanes(items, 600, 0, 4).map((l) => l.lane),
    [0, 1, 2, 3],
    'and the packer still defaults to four for a caller that wants them',
  );
});

test('three of a kind in a row always fold; two fold only when they would collide', () => {
  const mark = (key: string, x: number, kind: string, collapsible = true) =>
    ({ key, x, kind, collapsible, widthPx: 40 });
  // Three reports of one step is one step, however much room the axis hands out:
  // four labels saying almost the same word is noise even when they fit.
  assert.deepEqual(
    clusterMarks([mark('a', 0, 'dfm'), mark('b', 200, 'dfm'), mark('c', 400, 'dfm')]).map((g) => g.type),
    ['cluster'],
  );
  // Two is different: `DFM ×2` tells the reader strictly less than two labels do.
  assert.deepEqual(
    clusterMarks([mark('a', 0, 'dfm'), mark('b', 200, 'dfm')]).map((g) => g.type),
    ['item', 'item'],
  );
  assert.deepEqual(
    clusterMarks([mark('a', 0, 'dfm'), mark('b', 12, 'dfm')]).map((g) => g.type),
    ['cluster'],
  );
  // `×N` over two kinds would be a lie about what happened.
  assert.deepEqual(
    clusterMarks([mark('a', 0, 'dfm'), mark('b', 8, 'testing'), mark('c', 16, 'dfm')]).map((g) => g.type),
    ['item', 'item', 'item'],
  );
  // A run interrupted by a milestone that settles something is two runs, and
  // that milestone is never inside either: the reader opened the card for it.
  const interrupted = clusterMarks([
    mark('a', 0, 'dfm'), mark('b', 8, 'dfm'), mark('c', 16, 'dfm'),
    mark('key', 24, 'dfm', false),
    mark('d', 32, 'dfm'), mark('e', 40, 'dfm'), mark('f', 48, 'dfm'),
  ]);
  assert.deepEqual(interrupted.map((g) => g.type), ['cluster', 'item', 'cluster']);
  const first = interrupted[0];
  assert.equal(first.type === 'cluster' && first.members.map((m) => m.key).join(','), 'a,b,c');
});

test('the pill is named for the step, not for the first revision of it', () => {
  assert.equal(clusterLabel([{ label: 'DFM v1' }, { label: 'DFM v2' }]), 'DFM ×2');
  assert.equal(clusterLabel([{ label: 'Sample 3' }, { label: 'Sample 4' }]), 'Sample ×2');
  assert.equal(clusterLabel([{ label: 'Inspection' }, { label: 'Inspection' }]), 'Inspection ×2');
});

test('the scrubber draws one label, not a lane full of them', () => {
  // `labels="active"` is the whole difference between the two bars: the thumb
  // already says where you are, so a second row of labels is noise.
  const html = staticHtml(track({ labels: 'active', activeKey: 'd1', thumb: { valueMs: day('2026-01-20'), onChange: () => {} } }));
  assert.equal((html.match(/data-timeline-part="label"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-timeline-part="cluster"/, 'and nothing folds where nothing is labelled');
  assert.match(html, /role="slider"/);
  assert.match(html, /data-timeline-part="chip"/);
});

// ── Behaviour ───────────────────────────────────────────────────────────────

const dots = (container: Element) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-timeline-node]'));

test('one tab stop, and the arrows walk the rail', () => {
  const view = render(track());
  const all = dots(view.container);
  assert.equal(all.filter((d) => d.tabIndex === 0).length, 1);

  const current = all.find((d) => d.tabIndex === 0)!;
  act(() => { current.focus(); });
  assert.equal(document.activeElement, current);

  const press = (key: string) => act(() => {
    current.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
  // ArrowLeft from the last mark reaches the one before it, and Home jumps to
  // the first — nine tab stops in one card is worse than one composite.
  press('ArrowLeft');
  assert.equal((document.activeElement as HTMLElement).dataset.timelineKey, 'd2');
  act(() => {
    document.activeElement!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  });
  assert.equal((document.activeElement as HTMLElement).dataset.timelineKey, 'start');
  view.unmount();
});

test('a tooltip appears on focus, is dismissible with Escape, and describes its dot', () => {
  // WCAG 1.4.13 — and `aria-describedby` on the dot, because a screen reader
  // announces the description of the element that HAS focus.
  const view = render(track());
  const dot = dots(view.container).find((d) => d.dataset.timelineKey === 'd1')!;
  act(() => { dot.focus(); });

  const tip = view.container.querySelector('[role="tooltip"]');
  assert.ok(tip, 'shown on focus, not on hover alone');
  assert.equal(dot.getAttribute('aria-describedby'), tip.id);
  assert.match(tip.textContent ?? '', /DFM v1/);

  pressKey('Escape');
  assert.equal(view.container.querySelector('[role="tooltip"]'), null, 'Escape dismisses it');
  view.unmount();
});

test('the entrance plays once and a hover does not restart it', () => {
  // `hoveredKey` is state, so the card re-renders on every pointer move. A
  // reveal gated on anything but the mark set would re-animate the whole thing
  // each time — and one gated on "did we mount" would be torn off mid-flight by
  // the measuring pass, which sets state before the first paint.
  const view = render(track());
  const snapshot = () => dots(view.container).map((d) => `${d.className}|${d.style.animationDelay}`);
  const before = snapshot();
  assert.ok(before.every((s) => s.includes('rosh-tl-pop')), `entrance classes missing: ${before}`);
  assert.ok(before.some((s) => s.includes('|28ms') || s.includes('|56ms')), `no stagger: ${before}`);

  const dot = dots(view.container)[1];
  act(() => { dot.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })); });
  assert.deepEqual(snapshot(), before, 'a hover changed an animation class or a delay');
  view.unmount();
});

test('motion={false} draws the same card with nothing animating', () => {
  const html = staticHtml(track({ motion: false }));
  assert.doesNotMatch(html, /rosh-tl-(pop|fade|draw)/, `an animation class survived: ${html}`);
  assert.doesNotMatch(html, /animation-delay/);
  // The card is still the card.
  assert.equal((html.match(/data-timeline-node="item"/g) ?? []).length, 4);
  assert.match(html, /data-timeline-part="fill"/);
});

test('the thumb lights the marks it crosses, and nothing it has not reached', () => {
  // A scrub that passes four reports should read as four events rather than as
  // a bar getting longer.
  let value = day('2026-01-05');
  const view = render(track({ labels: 'active', thumb: { valueMs: value, onChange: () => {} } }));
  const lit = () => dots(view.container)
    .filter((d) => d.classList.contains('is-hit'))
    .map((d) => d.dataset.timelineKey);
  assert.deepEqual(lit(), [], 'nothing is lit before the thumb has moved');

  value = day('2026-01-26');
  view.rerender(track({ labels: 'active', thumb: { valueMs: value, onChange: () => {} } }));
  assert.deepEqual(lit(), ['d1', 'd2'], 'the two it passed, and not the one ahead of it');
  view.unmount();
});

test('activating a dot tells the caller which one, by key', () => {
  const picked: string[] = [];
  const view = render(track({ onActivate: (key) => picked.push(key) }));
  const dot = dots(view.container).find((d) => d.dataset.timelineKey === 'd2')!;
  act(() => { dot.click(); });
  assert.deepEqual(picked, ['d2']);
  view.unmount();
});
