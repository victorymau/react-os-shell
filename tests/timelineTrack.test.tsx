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
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// First — installs the DOM globals before react-dom evaluates. Needed even for
// the static renders: `fmtSliderDate` reads the user's date format out of
// localStorage, which does not exist in a bare node process.
import { act, pressKey, render } from './dom';
import { renderToStaticMarkup } from 'react-dom/server';
import TimelineTrack, {
  type TimelineTrackItem, type TimelineTrackThumb,
} from '../src/shell/TimelineTrack';
import {
  clusterLabel, clusterMarks, compressTimeAxis, packLabelLanes, TRACK_LABEL_LANE_COUNT,
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

// ── The stylesheet the component leans on ───────────────────────────────────

test('every class the track names has a rule in ui.css', () => {
  // The component draws from named parts rather than utility strings, which
  // makes a dozen absolutely-positioned bands readable — and makes a typo or a
  // forgotten rule invisible: an unstyled part is a `div` with no position and
  // no size, so it does not render wrong, it renders as nothing. The phase
  // bracket shipped exactly that way, and no assertion about markup could see
  // it, because the markup was right.
  const root = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..');
  const source = readFileSync(join(root, 'src/shell/TimelineTrack.tsx'), 'utf-8');
  const sheet = readFileSync(join(root, 'src/ui.css'), 'utf-8');
  const declared = new Set([
    ...[...sheet.matchAll(/\.(rosh-tl-[a-z-]+)/g)].map((m) => m[1]),
    ...[...sheet.matchAll(/@keyframes (rosh-tl-[a-z-]+)/g)].map((m) => m[1]),
    // A custom property the component writes and the sheet reads.
    ...[...sheet.matchAll(/var\((--rosh-tl-[a-z-]+)/g)].map((m) => m[1].slice(2)),
  ]);
  const used = new Set([...source.matchAll(/rosh-tl-[a-z-]+/g)].map((m) => m[0]));
  const missing = [...used].filter((name) => !declared.has(name)).sort();
  assert.deepEqual(missing, [], `classes with no rule in ui.css: ${missing.join(', ')}`);
});

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

test('a pixel on the track reports the date that pixel stands for', () => {
  // The thumb's half of the mapping. Without it a drag across a compressed
  // stretch would report a linear reading of a non-linear bar, and the date
  // chip would disagree with the dot the thumb is sitting on.
  const axis = compressTimeAxis(
    [day('2025-10-09'), day('2025-10-24'), day('2025-12-03'), day('2026-09-11')],
    600,
  );
  assert.equal(axis.msByPx(0), day('2025-10-09'));
  assert.equal(axis.msByPx(600), day('2026-09-11'));
  assert.equal(axis.msByPx(-50), day('2025-10-09'), 'off the end is the end, not an extrapolation');
  assert.equal(axis.msByPx(9999), day('2026-09-11'));
  for (const iso of ['2025-10-24', '2025-12-03']) {
    assert.equal(axis.msByPx(axis.xByMs(day(iso))), day(iso), `${iso} does not survive the round trip`);
  }
  let previous = -Infinity;
  for (let x = 0; x <= 600; x += 10) {
    const ms = axis.msByPx(x);
    assert.ok(ms >= previous, `px ${x} went backwards in time`);
    previous = ms;
  }
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

// ── The scrubber's stops ────────────────────────────────────────────────────

/** Four reports, a week apart, on a window that runs a fortnight past them. */
const REPORT_ITEMS: TimelineTrackItem[] = [
  { key: 'r1', ms: day('2026-05-01'), label: 'PP#10140', kind: 'report' },
  { key: 'r2', ms: day('2026-05-08'), label: 'PP#10141', kind: 'report' },
  { key: 'r3', ms: day('2026-05-15'), label: 'PP#10142', kind: 'report' },
  { key: 'r4', ms: day('2026-05-22'), label: 'PP#10143', kind: 'report' },
];
const REPORT_STOPS = REPORT_ITEMS.map((item) => item.ms);

/** A controlled scrubber over those reports, reporting every value it is asked
 *  for — the point of most of these specs is which value that is. */
function scrubber(overrides: Partial<TimelineTrackThumb> = {}, props: Partial<React.ComponentProps<typeof TimelineTrack>> = {}) {
  const seen: number[] = [];
  let value = day('2026-05-08');
  const view = render(
    <TimelineTrack
      startMs={day('2026-05-01')} endMs={day('2026-06-05')}
      items={REPORT_ITEMS} labels="active" ariaLabel="Production reports"
      thumb={{
        valueMs: value,
        stops: REPORT_STOPS,
        valueText: (ms) => `${REPORT_ITEMS.find((i) => i.ms === ms)?.label ?? '?'} · ${ms}`,
        onChange: (ms) => { seen.push(ms); },
        ...overrides,
      }}
      {...props}
    />,
  );
  const thumb = () => view.container.querySelector<HTMLElement>('[data-timeline-part="thumb"]')!;
  const move = (to: number) => {
    value = to;
    view.rerender(
      <TimelineTrack
        startMs={day('2026-05-01')} endMs={day('2026-06-05')}
        items={REPORT_ITEMS} labels="active" ariaLabel="Production reports"
        thumb={{
          valueMs: value,
          stops: REPORT_STOPS,
          valueText: (ms) => `${REPORT_ITEMS.find((i) => i.ms === ms)?.label ?? '?'} · ${ms}`,
          onChange: (ms) => { seen.push(ms); },
          ...overrides,
        }}
        {...props}
      />,
    );
  };
  return { ...view, seen, thumb, move };
}

test('the arrows walk the thumb from report to report, and say which one it is on', () => {
  // A day step is the wrong unit for a bar whose facts arrive weekly: six
  // presses to reach the next report, five of them on dates nobody filed.
  const { thumb, seen, move, unmount } = scrubber();
  assert.equal(thumb().getAttribute('aria-valuetext'), `PP#10141 · ${day('2026-05-08')}`);
  assert.equal(thumb().getAttribute('aria-valuenow'), '1', 'the INDEX of the stop, not a day count');
  assert.equal(thumb().getAttribute('aria-valuemax'), '3');

  const press = (key: string) => act(() => {
    thumb().dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
  press('ArrowRight');
  assert.deepEqual(seen, [day('2026-05-15')], 'one report forward, not one day');
  move(seen[seen.length - 1]);
  assert.equal(thumb().getAttribute('aria-valuetext'), `PP#10142 · ${day('2026-05-15')}`);

  press('End');
  assert.equal(seen[seen.length - 1], day('2026-05-22'), 'End is the last report, not the right edge');
  move(seen[seen.length - 1]);
  press('ArrowRight');
  assert.equal(seen.length, 2, 'and there is nowhere past the last one to go');
  unmount();
});

test('a drag settles on the nearest report, never between two', () => {
  const { container, seen, thumb, unmount } = scrubber();
  const hit = container.querySelector<HTMLElement>('[data-timeline-part="hit"]')!;
  // The track is the 600px fallback under jsdom, which measures nothing, and
  // the window is 35 days: a pointer two thirds of the way along is 2026-05-24,
  // closest to the last report.
  // A MouseEvent under a pointer event's NAME: React listens for the native
  // `pointerdown`, and jsdom has no PointerEvent constructor to build one with.
  const at = (clientX: number, type: string) => act(() => {
    hit.dispatchEvent(new window.MouseEvent(type, { clientX, bubbles: true }));
  });
  at(400, 'pointerdown');
  at(410, 'pointermove');
  at(410, 'pointerup');
  assert.ok(seen.length > 0, 'the drag reported something');
  for (const ms of seen) {
    assert.ok(REPORT_STOPS.includes(ms), `${ms} is not a report date`);
  }
  assert.equal(seen[seen.length - 1], day('2026-05-22'), 'released between two, settled on the nearer');
  // And the disc is drawn where the caller's value maps to — a controlled
  // thumb that moved on its own would be a second source of truth.
  const r2 = container.querySelector<HTMLElement>('[data-timeline-key="r2"]')!;
  assert.equal(thumb().style.left, r2.style.left, 'the thumb sits on the report it is showing');
  unmount();
});

test('the label above the thumb opens the document; the dot only selects it', () => {
  const opened: string[] = [];
  const picked: string[] = [];
  const items = REPORT_ITEMS.map((item) => ({ ...item, onOpen: () => opened.push(item.key) }));
  const view = render(
    <TimelineTrack
      startMs={day('2026-05-01')} endMs={day('2026-06-05')}
      items={items} labels="active" activeKey="r2" ariaLabel="Production reports"
      onActivate={(key) => picked.push(key)}
      thumb={{ valueMs: day('2026-05-08'), stops: REPORT_STOPS, onChange: () => {} }}
    />,
  );
  const open = view.container.querySelector<HTMLElement>('[data-timeline-part="open"]')!;
  assert.equal(open.tagName, 'BUTTON');
  assert.equal(open.getAttribute('aria-label'), 'Open PP#10141');
  act(() => { open.click(); });
  assert.deepEqual(opened, ['r2']);
  assert.deepEqual(picked, [], 'opening the document is not picking the dot');

  const dot = view.container.querySelector<HTMLElement>('[data-timeline-key="r3"]')!;
  act(() => { dot.click(); });
  assert.deepEqual(picked, ['r3']);
  view.unmount();
});

test('without a handler the label is text, because a dead link is worse than none', () => {
  const html = staticHtml(track({
    labels: 'active', activeKey: 'd1',
    thumb: { valueMs: day('2026-01-20'), onChange: () => {} },
  }));
  assert.doesNotMatch(html, /data-timeline-part="open"/);
  assert.match(html, /data-timeline-part="label"/);
});

// ── Preview, zoom, and the entrance ─────────────────────────────────────────

test('a preview is rendered inside the popover, with a way out of it', () => {
  const opened: string[] = [];
  const items: TimelineTrackItem[] = ITEMS.map((item) => (item.key === 'd1'
    ? {
      ...item,
      preview: <span data-testid="preview-body">v1 · feedback 12/01 · 3D model pending</span>,
      onOpen: () => opened.push(item.key),
    }
    : item));
  const view = render(track({ items }));
  const dot = dots(view.container).find((d) => d.dataset.timelineKey === 'd1')!;
  act(() => { dot.focus(); });

  const tip = view.container.querySelector('[role="tooltip"]')!;
  assert.ok(tip.querySelector('[data-timeline-part="preview"]'), 'the consumer\'s card, not a second line of text');
  assert.match(tip.textContent ?? '', /3D model pending/);
  assert.match(tip.textContent ?? '', /DFM v1/, 'under the mark\'s own label');

  const openButton = tip.querySelector<HTMLElement>('[data-timeline-part="bubble-open"]')!;
  act(() => { openButton.click(); });
  assert.deepEqual(opened, ['d1']);

  pressKey('Escape');
  assert.equal(view.container.querySelector('[role="tooltip"]'), null, 'Escape dismisses it');
  view.unmount();
});

test('hovering a cluster pill magnifies its stretch and gives the members their labels', () => {
  // The pill answers "four of what, and when" without a click: the axis opens
  // around the run, the members spread far enough apart to carry a label each,
  // and the rest of the bar pays for it.
  const dense: TimelineTrackItem[] = [
    { key: 'a', ms: day('2026-01-05'), label: 'Project Initiated' },
    { key: 'd1', ms: day('2026-01-20'), label: 'DFM v1', kind: 'dfm', priority: 1 },
    { key: 'd2', ms: day('2026-01-21'), label: 'DFM v2', kind: 'dfm', priority: 1 },
    { key: 'd3', ms: day('2026-01-22'), label: 'DFM v3', kind: 'dfm', priority: 1 },
    { key: 'z', ms: day('2026-03-01'), label: 'Mould Complete', kind: 'completion' },
  ];
  const view = render(track({ items: dense, axis: 'compressed' }));
  const at = (key: string) => Number(
    view.container.querySelector<HTMLElement>(`[data-timeline-key="${key}"]`)!.style.left.replace('px', ''),
  );
  const before = [at('d1'), at('d2'), at('d3')];
  assert.ok(
    before[1] - before[0] < 56,
    `the run starts at the axis floor, too tight for a label each: ${JSON.stringify(before)}`,
  );

  const pill = view.container.querySelector<HTMLElement>('[data-timeline-part="cluster"]')!;
  const pillLeft = pill.style.left;
  act(() => { pill.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })); });

  const after = [at('d1'), at('d2'), at('d3')];
  assert.ok(after[1] - after[0] > before[1] - before[0] + 8, `members did not spread: ${JSON.stringify(after)}`);
  assert.ok(after[1] - after[0] >= 28, `below the floor a label cannot be drawn: ${JSON.stringify(after)}`);
  assert.ok(after[2] - after[1] >= 28, `below the floor a label cannot be drawn: ${JSON.stringify(after)}`);
  assert.equal(pill.style.left, pillLeft, 'the pill itself stays put under the pointer that opened it');
  const labels = Array.from(view.container.querySelectorAll('[data-timeline-part="label"]'))
    .map((el) => el.textContent ?? '');
  assert.ok(labels.some((text) => text.startsWith('DFM v')), `no member label while zoomed: ${JSON.stringify(labels)}`);

  act(() => { pill.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true })); });
  assert.deepEqual([at('d1'), at('d2'), at('d3')], before, 'and it closes again on the way out');
  view.unmount();
});

test('zoomRange magnifies the same stretch without a pointer', () => {
  const dense: TimelineTrackItem[] = [
    { key: 'a', ms: day('2026-01-05'), label: 'Project Initiated' },
    { key: 'd1', ms: day('2026-01-20'), label: 'DFM v1', kind: 'dfm', priority: 1 },
    { key: 'd2', ms: day('2026-01-21'), label: 'DFM v2', kind: 'dfm', priority: 1 },
    { key: 'd3', ms: day('2026-01-22'), label: 'DFM v3', kind: 'dfm', priority: 1 },
    { key: 'z', ms: day('2026-03-01'), label: 'Mould Complete', kind: 'completion' },
  ];
  const plain = staticHtml(track({ items: dense, axis: 'compressed' }));
  const zoomed = staticHtml(track({
    items: dense, axis: 'compressed', zoomRange: [day('2026-01-20'), day('2026-01-22')],
  }));
  const at = (html: string, key: string) => Number(
    html.match(new RegExp(`data-timeline-key="${key}"[^>]*style="[^"]*left:([0-9.]+)px`))![1],
  );
  assert.ok(
    at(zoomed, 'd3') - at(zoomed, 'd1') > at(plain, 'd3') - at(plain, 'd1') + 20,
    'a consumer can offer the zoom as an action rather than as a hover',
  );
});

test('the entrance plays again on a fresh mount — every window open, not once a session', () => {
  // The gate is the identity of the mark set against RE-renders. A gate that
  // remembered across mounts would mean a card animates the first time a user
  // opens the window and never again, which is the complaint that started this.
  const first = render(track());
  assert.ok(dots(first.container).every((d) => d.className.includes('rosh-tl-pop')));
  first.unmount();

  const second = render(track());
  assert.ok(
    dots(second.container).every((d) => d.className.includes('rosh-tl-pop')),
    'the second mount drew a card with no entrance',
  );
  second.unmount();
});
