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
import { fakeFrames, withReducedMotion } from './frames';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TimelineTrack, {
  type TimelineScrubProgress, type TimelineTrackItem, type TimelineTrackThumb,
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

// ── Playback ────────────────────────────────────────────────────────────────

/**
 * A scrubber played the way the card plays it: the caller owns `playing`, and
 * moves the value when the track says the thumb has ARRIVED somewhere.
 *
 * The thumb's `left` is read as a number rather than compared as a string,
 * because the whole claim is that it takes values no report sits on.
 */
function playback(overrides: Partial<React.ComponentProps<typeof TimelineTrack>> = {}) {
  const arrived: string[] = [];
  const activated: string[] = [];
  /** Every in-flight fraction the track handed out, in order, nulls included. */
  const progress: (TimelineScrubProgress | null)[] = [];
  let stops = 0;
  let control!: { play: () => void; pause: () => void };
  function Harness() {
    const [value, setValue] = useState(REPORT_ITEMS[0].ms);
    const [playing, setPlaying] = useState(false);
    control = { play: () => act(() => setPlaying(true)), pause: () => act(() => setPlaying(false)) };
    return (
      <TimelineTrack
        startMs={day('2026-05-01')} endMs={day('2026-06-05')}
        items={REPORT_ITEMS} labels="active" ariaLabel="Production reports"
        activeKey={REPORT_ITEMS.find((item) => item.ms === value)?.key ?? null}
        onActivate={(key) => activated.push(key)}
        thumb={{
          valueMs: value,
          stops: REPORT_STOPS,
          onChange: setValue,
          valueText: (ms) => `${REPORT_ITEMS.find((i) => i.ms === ms)?.label ?? 'between'} · ${ms}`,
        }}
        playback={{
          playing,
          onArrive: (key, ms) => { arrived.push(key); setValue(ms); },
          onProgress: (state) => { progress.push(state); },
          onStop: () => { stops += 1; setPlaying(false); },
        }}
        {...overrides}
      />
    );
  }
  const view = render(<Harness />);
  const at = (selector: string) => view.container.querySelector<HTMLElement>(selector)!;
  return {
    ...view,
    arrived,
    activated,
    progress,
    stopped: () => stops,
    play: () => control.play(),
    pause: () => control.pause(),
    thumbLeft: () => parseFloat(at('[data-timeline-part="thumb"]').style.left),
    chip: () => at('[data-timeline-part="chip"]').textContent ?? '',
    valueText: () => at('[data-timeline-part="thumb"]').getAttribute('aria-valuetext') ?? '',
    fillWidth: () => parseFloat(at('[data-timeline-part="fill"]').style.width),
    dotLeft: (key: string) => parseFloat(at(`[data-timeline-key="${key}"]`).style.left),
    label: () => at('[data-timeline-part="label"]').textContent ?? '',
  };
}

test('Play glides the thumb between two reports rather than jumping it', () => {
  // Henry, watching the customer portal on 2026-09-14: "the playback should
  // glide smoothly and continuously, not jump from node to node". The bar
  // stepped from report to report with a 120ms CSS transition and a timer,
  // which reads as a thumb that teleports and a chip that changes its mind —
  // never as travel.
  const frames = fakeFrames();
  const view = playback();
  try {
    assert.equal(view.thumbLeft(), view.dotLeft('r1'), 'it starts on the first report');
    view.play();

    // It rests on the report it is leaving before it sets off: the reader has
    // just been given a snapshot and needs a moment to read it.
    frames.run(10, 16);
    assert.equal(view.thumbLeft(), view.dotLeft('r1'), 'the dwell holds it on the report');
    assert.deepEqual(view.arrived, []);

    frames.until(() => view.thumbLeft() > view.dotLeft('r1'), 'the thumb never set off');
    // Five consecutive frames, each further along than the last and none of them
    // on a report — which is the whole difference from the step it replaced.
    const path: number[] = [];
    for (let i = 0; i < 5; i++) { frames.frame(16); path.push(view.thumbLeft()); }
    for (let i = 1; i < path.length; i++) {
      assert.ok(path[i] > path[i - 1], `frame ${i} did not advance: ${path.join(' → ')}`);
    }
    for (const x of path) {
      assert.ok(x > view.dotLeft('r1') && x < view.dotLeft('r2'), `${x} is not between the two reports`);
    }
    // The fill follows the thumb rather than the value behind it.
    assert.ok(Math.abs(view.fillWidth() - view.thumbLeft()) < 0.01);

    // The chip is a real date between the two reports, read back through the
    // axis — and the status line's source, the active label, has not moved.
    assert.notEqual(view.chip(), '');
    assert.ok(/2026/.test(view.chip()), `the chip stopped saying a date: ${view.chip()}`);
    assert.match(view.label(), /PP#10140/, 'the label still names the report the thumb left');
    assert.deepEqual(view.arrived, [], 'nothing has arrived anywhere mid-glide');

    frames.until(() => view.arrived.length > 0, 'the thumb never arrived');
    assert.deepEqual(view.arrived, ['r2']);
    assert.equal(view.thumbLeft(), view.dotLeft('r2'), 'and it landed exactly on the report');
    assert.match(view.valueText(), /PP#10141/, 'the slider now reads the report it is on');
    assert.match(view.label(), /PP#10141/);

    // On through the bar: every report, once, in order, and then it stops.
    frames.until(() => view.stopped() > 0, 'playback never ended', { budget: 800 });
    assert.deepEqual(view.arrived, ['r2', 'r3', 'r4']);
    assert.equal(view.thumbLeft(), view.dotLeft('r4'));
    // Arriving is not activating. `onActivate` is what a CLICK means, and both
    // portals navigate on it — the admin window swaps itself to the report. A
    // playback that fired it per stop would walk the user through four windows.
    assert.deepEqual(view.activated, []);
  } finally {
    frames.restore();
    view.unmount();
  }
});

test('Pause freezes the thumb mid-glide, and Play carries on from there', () => {
  const frames = fakeFrames();
  const view = playback();
  try {
    view.play();
    frames.until(() => view.thumbLeft() > view.dotLeft('r1'), 'the thumb never set off');
    frames.run(3, 16);
    const frozen = view.thumbLeft();
    const chip = view.chip();

    view.pause();
    assert.equal(frames.armed, 0, 'the loop was cancelled rather than left running');
    frames.run(20, 16);
    assert.equal(view.thumbLeft(), frozen, 'a pause is a freeze, not a settle onto a report');
    assert.equal(view.chip(), chip, 'and the chip freezes with it');
    assert.deepEqual(view.arrived, []);

    view.play();
    frames.run(2, 16);
    assert.ok(view.thumbLeft() > frozen, 'resume carried on from where it froze');
    assert.ok(view.thumbLeft() < view.dotLeft('r2'), 'on the same segment, not the next one');
    frames.until(() => view.arrived.length > 0, 'the resumed glide never arrived');
    assert.deepEqual(view.arrived, ['r2']);
  } finally {
    frames.restore();
    view.unmount();
  }
});

test('a drag cancels playback: two hands on one thumb is one too many', () => {
  const frames = fakeFrames();
  const view = playback();
  try {
    view.play();
    frames.until(() => view.thumbLeft() > view.dotLeft('r1'), 'the thumb never set off');

    const hit = view.container.querySelector<HTMLElement>('[data-timeline-part="hit"]')!;
    const pointer = (clientX: number, type: string) => act(() => {
      hit.dispatchEvent(new window.MouseEvent(type, { clientX, bubbles: true }));
    });
    pointer(400, 'pointerdown');
    pointer(400, 'pointerup');

    assert.equal(view.stopped(), 1, 'the caller was told to put the button back to Play');
    assert.equal(frames.armed, 0);
    // The thumb is back under the magnet: on a report, where a released drag
    // leaves it, and not at the pixel the tween had reached.
    const resting = view.thumbLeft();
    assert.ok(
      REPORT_ITEMS.some((item) => Math.abs(view.dotLeft(item.key) - resting) < 0.01),
      `the thumb settled at ${resting}, which is no report`,
    );
    frames.run(20, 16);
    assert.equal(view.thumbLeft(), resting, 'and nothing is still driving it');
    assert.deepEqual(view.arrived, []);
  } finally {
    frames.restore();
    view.unmount();
  }
});

test('under reduced motion playback is the step it always was', () => {
  // Not "no playback": the thumb still walks the reports and the snapshot still
  // changes. What goes is the travel between them — read at mount, as the rest
  // of the card's motion is.
  const stillness = withReducedMotion();
  const frames = fakeFrames();
  const view = playback();
  try {
    view.play();
    const seen = new Set<number>();
    frames.until(() => view.arrived.length > 0, 'the stepped walk never arrived', { budget: 200 });
    for (let i = 0; i < 40; i++) { seen.add(view.thumbLeft()); frames.frame(16); }
    const stops = REPORT_ITEMS.map((item) => view.dotLeft(item.key));
    for (const x of seen) {
      assert.ok(
        stops.some((stop) => Math.abs(stop - x) < 0.01),
        `the thumb was at ${x}, which is between two reports: reduced motion asked for no travel`,
      );
    }
    frames.until(() => view.stopped() > 0, 'the stepped walk never ended', { budget: 800 });
    assert.deepEqual(view.arrived, ['r2', 'r3', 'r4'], 'every report, once, in order');
  } finally {
    frames.restore();
    stillness();
    view.unmount();
  }
});

test('playback keeps its own time: a rest is 700ms, not seven frames', () => {
  // The bug this replaces. Playback advanced by frame deltas clamped to 100ms,
  // so a 700ms rest needed seven frames and a leg needed five — fine at 60fps
  // and unbounded anywhere else. In the customer portal, embedded and idle, the
  // thumb sat on its first report for EIGHT SECONDS (2026-09-14, `.rosh-tl-thumb`
  // style.left sampled every 50ms: 8.8px at 0ms, still 8.8px at 8,031ms).
  //
  // Three frames here, spanning eight seconds. Under the frame-paced version
  // that is 300ms of playback and the thumb has not left the first report.
  const frames = fakeFrames();
  const view = playback();
  try {
    view.play();
    frames.frame(16);
    assert.deepEqual(view.arrived, [], 'the first reading only anchors the rest');
    assert.equal(view.thumbLeft(), view.dotLeft('r1'));

    frames.frame(4_000);
    assert.deepEqual(view.arrived, [], 'a rest that is over is not an arrival');
    assert.equal(
      view.thumbLeft(), view.dotLeft('r1'),
      'the glide was spent while nobody was being shown it',
    );

    frames.frame(4_000);
    assert.deepEqual(view.arrived, ['r2'], 'one frame past the rest and the leg, and it is there');
    assert.equal(view.thumbLeft(), view.dotLeft('r2'));

    // And the backlog walks forward at a pace somebody can read: a gap of four
    // seconds a frame is three legs' worth of time, and each frame still
    // announces at most one report. Announcing four at once announces none.
    for (let i = 0; i < 6 && view.stopped() === 0; i++) {
      const before = view.arrived.length;
      frames.frame(4_000);
      assert.ok(view.arrived.length - before <= 1, `frame ${i} announced ${view.arrived.length - before} reports`);
    }
    assert.deepEqual(view.arrived, ['r2', 'r3', 'r4']);
    assert.equal(view.stopped(), 1);
  } finally {
    frames.restore();
    view.unmount();
  }
});

test('a pause keeps what is left of the rest rather than spending it', () => {
  // The rest is measured against the clock, and the clock runs through a pause.
  // So the pause has to drop the reading the remainder was taken at, or 25
  // seconds of a paused card resume a 700ms rest as no rest at all — the thumb
  // would set off the instant the button was pressed.
  const frames = fakeFrames();
  const view = playback();
  try {
    view.play();
    frames.frame(16);
    frames.frame(300);
    assert.equal(view.thumbLeft(), view.dotLeft('r1'), '400ms of the rest still to run');

    view.pause();
    assert.equal(frames.armed, 0, 'the loop was cancelled rather than left running');
    frames.run(5, 5_000);

    view.play();
    frames.frame(16);
    frames.frame(300);
    assert.equal(view.thumbLeft(), view.dotLeft('r1'), 'the paused rest resumed as no rest at all');
    assert.deepEqual(view.arrived, []);
    frames.frame(200);
    frames.frame(600);
    assert.deepEqual(view.arrived, ['r2'], 'and then it went, on time');
  } finally {
    frames.restore();
    view.unmount();
  }
});

test('onProgress hands out the journey, and null at both ends of it', () => {
  // Henry, 2026-09-14: while the thumb travels between two reports the
  // quantities in the table below have to travel too, rather than waiting for
  // the arrival and jumping. The kit does not draw that table, so it hands out
  // the fraction — the EASED one, the number that places the disc, so the
  // figures and the disc agree about where they are.
  const frames = fakeFrames();
  const view = playback();
  try {
    view.play();
    frames.run(10, 16);
    // `.length` rather than a deepEqual against `[]`: node's assert narrows its
    // first argument to the second's type, and `never[]` is not a useful type for
    // the rest of this spec to read the array as.
    assert.equal(view.progress.length, 0, 'a thumb at rest is not in flight');

    frames.until(() => view.progress.length > 0, 'nothing was ever reported in flight');
    frames.run(4, 16);
    assert.deepEqual(view.arrived, [], 'still crossing');
    const flight = view.progress.filter((state): state is TimelineScrubProgress => state !== null);
    assert.ok(flight.length >= 4, `only ${flight.length} frames of a 490ms glide reported`);
    for (const state of flight) {
      assert.equal(state.fromKey, 'r1');
      assert.equal(state.toKey, 'r2');
      assert.ok(state.t > 0 && state.t < 1, `t=${state.t} is not between two reports`);
    }
    for (let i = 1; i < flight.length; i++) {
      assert.ok(flight[i].t >= flight[i - 1].t, `the fraction went back at ${i}`);
    }
    // The same number that draws the disc: t of the way between the two dots IS
    // where the thumb is.
    const now = view.progress.at(-1);
    assert.ok(now, 'the last frame of a glide reported nothing');
    const x = view.dotLeft('r1') + (view.dotLeft('r2') - view.dotLeft('r1')) * now.t;
    assert.ok(Math.abs(x - view.thumbLeft()) < 0.01, `t places the thumb at ${x}, it is at ${view.thumbLeft()}`);

    // Arrival ends the journey: the consumer's table goes back to reading the
    // snapshot it was just handed.
    frames.until(() => view.arrived.length > 0, 'it never arrived');
    assert.equal(view.progress.at(-1), null, 'arriving is not a journey');

    // So does a pause, and so does the end of the run.
    frames.until(() => view.progress.at(-1) !== null, 'the next glide never set off');
    view.pause();
    assert.equal(view.progress.at(-1), null, 'a frozen thumb is not in flight');
    view.play();
    frames.until(() => view.stopped() > 0, 'playback never ended', { budget: 800 });
    assert.equal(view.progress.at(-1), null);

    // And nothing is said twice: a consumer interpolating a table on this
    // re-renders on every call.
    for (let i = 1; i < view.progress.length; i++) {
      assert.ok(
        view.progress[i] !== null || view.progress[i - 1] !== null,
        `two nulls in a row at ${i}`,
      );
    }
  } finally {
    frames.restore();
    view.unmount();
  }
});

test('a drag reports where the hand is, and lets go on release', () => {
  // The other way the thumb sits between two reports. The disc snaps to the
  // nearest one as the drag goes, so the pointer is the only continuous thing
  // there is to report — and a consumer's table follows the hand.
  const view = playback();
  try {
    const hit = view.container.querySelector<HTMLElement>('[data-timeline-part="hit"]')!;
    const pointer = (clientX: number, type: string) => act(() => {
      hit.dispatchEvent(new window.MouseEvent(type, { clientX, bubbles: true }));
    });
    const half = (view.dotLeft('r1') + view.dotLeft('r2')) / 2;
    pointer(half, 'pointerdown');
    pointer(half, 'pointermove');
    const state = view.progress.at(-1);
    assert.ok(state, 'the drag reported nothing');
    assert.equal(state.fromKey, 'r1');
    assert.equal(state.toKey, 'r2');
    // Linear, not eased: there is no curve in a hand. Halfway along a linear
    // axis is halfway through the week between the two reports.
    assert.ok(Math.abs(state.t - 0.5) < 0.02, `halfway across reported t=${state.t}`);

    // On to the next pair, and the neighbours change with it.
    const later = (view.dotLeft('r2') + view.dotLeft('r3')) / 2;
    pointer(later, 'pointermove');
    assert.equal(view.progress.at(-1)?.fromKey, 'r2');
    assert.equal(view.progress.at(-1)?.toKey, 'r3');

    pointer(later, 'pointerup');
    assert.equal(view.progress.at(-1), null, 'the release is the end of it');
  } finally {
    view.unmount();
  }
});

test('under reduced motion there is no journey to report', () => {
  const stillness = withReducedMotion();
  const frames = fakeFrames();
  const view = playback();
  try {
    view.play();
    frames.until(() => view.stopped() > 0, 'the stepped walk never ended', { budget: 800 });
    assert.deepEqual(view.arrived, ['r2', 'r3', 'r4'], 'the walk stays');
    assert.equal(view.progress.length, 0, 'and the travel it would have reported goes');
  } finally {
    frames.restore();
    stillness();
    view.unmount();
  }
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
