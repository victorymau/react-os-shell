/**
 * `useProductionTimeline` + `ProductionTimeline` — the scrubbable production
 * bar, promoted from the admin portal where it shipped with no spec at all.
 *
 * The hook is where the risk is: the visible range, which report the slider
 * is "on", and the per-part interpolation between two reports. Those run in
 * effects and state, so these specs mount in a real DOM (`tests/dom.ts`)
 * through a probe that hands the snapshot back out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First — installs the DOM globals before react-dom evaluates.
import { act, pressKey, render } from './dom';
import { fakeFrames } from './frames';
import { renderToStaticMarkup } from 'react-dom/server';
import { TimelineGlyph, type TimelineGlyphName } from '../src/shell/timelineGlyphs';
import ProductionTimeline, {
  useProductionTimeline,
  calcOverall,
  calcReportOverall,
  type ProgressItem,
  type TimelineReport,
  type TimelineMarker,
  type ProductionTimelineSnapshot,
  type UseProductionTimelineOpts,
} from '../src/shell/ProductionTimeline';
import { type TimelineScrubProgress } from '../src/shell/TimelineTrack';
import { DAY_MS, toDayMs } from '../src/shell/timelineDates';

function item(part_number: string, order_qty: number, casting = 0, cnc = 0, painting = 0): ProgressItem {
  return { id: `${part_number}-${order_qty}`, part_number, description: '', order_qty, casting, cnc, painting, packing: 0, finished_goods: 0, stock_qty: 0 };
}

const R1: TimelineReport = {
  id: 'r1', progress_number: 'PP-1', date: '2026-05-10', est_completion_date: '2026-07-05',
  items: [item('WH-1', 120, 66, 30), item('WH-2', 50, 30, 25)],
};
const R2: TimelineReport = {
  id: 'r2', progress_number: 'PP-2', date: '2026-05-20', est_completion_date: '2026-07-10',
  items: [item('WH-1', 120, 120, 86, 29)],
};
/** DESC by date, as the hook requires. */
const REPORTS = [R2, R1];

const BASE: UseProductionTimelineOpts = {
  reports: REPORTS,
  poProductionStartDate: '2026-05-01',
  poEstCompletionDate: '2026-07-01',
  poStatus: 'in_production',
  poNumber: 'PO-1',
};

const day = (iso: string) => toDayMs(iso)!;

/** Mount the hook and hand its latest snapshot back through `out`. */
function mount(opts: UseProductionTimelineOpts) {
  const out: { snap?: ProductionTimelineSnapshot } = {};
  function Probe({ o }: { o: UseProductionTimelineOpts }) {
    out.snap = useProductionTimeline(o);
    return null;
  }
  const handle = render(<Probe o={opts} />);
  const snap = () => out.snap!;
  const scrubTo = (iso: string) => { act(() => { snap().setScrubMs(day(iso)); }); };
  return { snap, scrubTo, ...handle };
}

test('the range runs from production start to today while the PO is still building', () => {
  const { snap, unmount } = mount(BASE);
  assert.equal(snap().startMs, day('2026-05-01'));
  assert.ok(snap().endMs >= Date.now() - 60_000, 'right edge reaches today');
  assert.ok(snap().totalLeadDays >= 1);
  unmount();
});

test('a post-production PO stops at its estimate, and a later marker stretches the range', () => {
  const { snap, unmount } = mount({ ...BASE, poStatus: 'completed' });
  assert.equal(snap().endMs, day('2026-07-01'), 'PO estimate wins over the last report');
  assert.equal(snap().totalLeadDays, 61);
  unmount();

  const marker: TimelineMarker = { id: 'gi-1', date: '2026-08-01', kind: 'shipment', label: 'GI-1' };
  const later = mount({ ...BASE, poStatus: 'completed', markers: [marker] });
  assert.equal(later.snap().endMs, day('2026-08-01'));
  // Markers are context, not data: the displayed report is untouched.
  assert.equal(later.snap().displayed?.id, 'r2');
  later.unmount();
});

test('without a production start the left edge is the earliest report', () => {
  const { snap, unmount } = mount({ ...BASE, poProductionStartDate: null });
  assert.equal(snap().startMs, day('2026-05-10'));
  unmount();
});

test('the slider opens on the latest report, shown as fact with the previous report beside it', () => {
  const { snap, unmount } = mount(BASE);
  assert.equal(snap().scrubMs, day('2026-05-20'));
  assert.equal(snap().displayed?.id, 'r2');
  assert.equal(snap().isInterpolated, false);
  assert.equal(snap().prevReport?.id, 'r1');
  assert.equal(snap().prevByPN['WH-1']?.casting, 66);
  unmount();
});

test('between two reports the snapshot is an estimate, lerped per part with the order qty fixed', () => {
  const { snap, scrubTo, unmount } = mount(BASE);
  scrubTo('2026-05-15');
  const s = snap();
  assert.equal(s.isInterpolated, true);
  assert.equal(s.displayed?.progress_number, 'Estimated');
  assert.equal(s.beforeAnchor?.id, 'r1');
  assert.equal(s.nextAfter?.id, 'r2');
  const wh1 = s.displayed!.items!.find(i => i.part_number === 'WH-1')!;
  assert.deepEqual([wh1.order_qty, wh1.casting, wh1.cnc], [120, 93, 58]);
  // A part only the earlier report names is still a row, fading toward 0.
  const wh2 = s.displayed!.items!.find(i => i.part_number === 'WH-2')!;
  assert.deepEqual([wh2.order_qty, wh2.casting], [50, 15]);
  assert.equal(s.displayed?.est_completion_date, '2026-07-07');
  unmount();
});

test('before the first report the anchor is a synthetic zero "Start"', () => {
  const { snap, scrubTo, unmount } = mount(BASE);
  scrubTo('2026-05-05');
  const s = snap();
  assert.equal(s.beforeAnchor?.progress_number, 'Start');
  for (const it of s.beforeAnchor!.items!) {
    assert.equal(it.casting + it.cnc + it.painting + it.packing, 0);
    assert.ok(it.order_qty > 0, 'the build target carries over from the earliest report');
  }
  assert.equal(s.isInterpolated, true);
  // 4 of the 9 days from Start (05-01, 0) to PP-1 (05-10, 66).
  assert.equal(s.displayed!.items!.find(i => i.part_number === 'WH-1')!.casting, 29);
  unmount();
});

test('a current report pins the slider, scrubbing away is detectable, and reset returns to it', () => {
  const { snap, scrubTo, unmount } = mount({ ...BASE, currentReportId: 'r1', currentReportDate: '2026-05-10' });
  assert.equal(snap().scrubMs, day('2026-05-10'));
  assert.equal(snap().scrubbedAway, false);
  assert.equal(snap().currentReportProgressNumber, 'PP-1');
  scrubTo('2026-05-20');
  assert.equal(snap().displayed?.id, 'r2');
  assert.equal(snap().scrubbedAway, true);
  act(() => { snap().resetToCurrent(); });
  assert.equal(snap().scrubMs, day('2026-05-10'));
  assert.equal(snap().scrubbedAway, false);
  unmount();
});

test('the bar names the PO, states its window and lead time, and legends the kinds it has', () => {
  const markers: TimelineMarker[] = [
    { id: 'gi', date: '2026-05-08', kind: 'shipment', label: 'GI-1' },
    { id: 'qc', date: '2026-05-24', kind: 'inspection', label: 'QC-1' },
  ];
  function Bar() {
    const snap = useProductionTimeline({ ...BASE, poStatus: 'completed', markers });
    return <ProductionTimeline snapshot={snap} onPickReport={() => {}} />;
  }
  const { container, unmount } = render(<Bar />);
  const text = container.textContent ?? '';
  // Sentence-case heading, the PO as the card's SUBJECT rather than as part of
  // a sentence: the `heading` prop defaults to "Production progress", where the
  // row this replaced read "PRODUCTION TIMELINE FOR PO-1" in tracked capitals.
  assert.match(text, /Production progress/);
  assert.match(text, /PO-1/);
  // The window's ends, which the scrubber's edge captions used to carry.
  assert.match(text, /01\/05\/2026 → 01\/07\/2026/);
  assert.match(text, /61 days lead time/);
  // The counts that used to sit here ("2 reports · 1 shipment") are gone: the
  // dots are on the bar, the legend below says what each kind is, and the meta
  // line has to leave room for the Play control beside it.
  assert.doesNotMatch(text, /2 reports/);
  assert.match(text, /Showing PP-2/);
  assert.match(text, /Shipment/);
  assert.match(text, /Inspection/);
  assert.equal(container.querySelectorAll('button[aria-label^="PP-"]').length, 2, 'one dot per report');
  unmount();
});

// ── The shipment says it is one ─────────────────────────────────────────────

/** The `d` of every path in a piece of markup, which is what identifies a glyph
 *  without pinning the attribute order two renderers happen to write. */
const paths = (html: string) => [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

const glyphPaths = (name: TimelineGlyphName) =>
  paths(renderToStaticMarkup(<TimelineGlyph name={name} />));

test('a shipment is a diamond with a truck in it, on the rail and in the legend', () => {
  // "The shipment does not show" (Henry, 2026-09-15, translated). It had no
  // glyph: once every kind was painted in the one accent, the note above
  // `KIND_STYLES` — the glyph is what tells the kinds apart — left the shipment
  // as the kind that had nothing to tell them with, and on a scrubber it is not
  // captioned either unless the pointer is on it.
  const markers: TimelineMarker[] = [
    { id: 'gi', date: '2026-05-08', kind: 'shipment', label: 'GI-1' },
    { id: 'qc', date: '2026-05-24', kind: 'inspection', label: 'QC-1' },
  ];
  function Bar() {
    const snap = useProductionTimeline({ ...BASE, poStatus: 'completed', markers });
    return <ProductionTimeline snapshot={snap} onPickReport={() => {}} />;
  }
  const { container, unmount } = render(<Bar />);

  const truck = glyphPaths('truck');
  assert.ok(truck.length >= 2, 'the truck glyph draws nothing');

  const diamond = container.querySelector('.rosh-tl-node.is-diamond');
  assert.ok(diamond, 'no shipment dot on the rail');
  assert.deepEqual(paths(diamond.innerHTML), truck, 'the shipment dot is a bare diamond again');

  // And it is not the inspection's flask: two kinds, two glyphs, one colour.
  const disc = container.querySelector('[aria-label^="QC-1"]');
  assert.ok(disc);
  assert.deepEqual(paths(disc.innerHTML), glyphPaths('flask'));
  assert.notDeepEqual(paths(diamond.innerHTML), paths(disc.innerHTML));

  // The legend draws from the same file, so a chip cannot describe a shape the
  // rail stopped drawing.
  const chip = [...container.querySelectorAll('.rosh-tl-legend > span')]
    .find((span) => (span.textContent ?? '').includes('Shipment'));
  assert.ok(chip, 'no shipment chip in the legend');
  assert.deepEqual(paths(chip.innerHTML), truck, 'the legend chip is still a bare diamond');
  unmount();
});

test('a marker may name its own glyph, for two shipments that are not the same event', () => {
  const markers: TimelineMarker[] = [
    { id: 'gi', date: '2026-05-08', kind: 'shipment', label: 'GI-1' },
    { id: 'sample', date: '2026-05-24', kind: 'shipment', label: 'Samples', glyph: 'doc' },
  ];
  function Bar() {
    const snap = useProductionTimeline({ ...BASE, poStatus: 'completed', markers });
    return <ProductionTimeline snapshot={snap} onPickReport={() => {}} />;
  }
  const { container, unmount } = render(<Bar />);
  assert.deepEqual(paths(container.querySelector('[aria-label^="GI-1"]')!.innerHTML), glyphPaths('truck'));
  assert.deepEqual(paths(container.querySelector('[aria-label^="Samples"]')!.innerHTML), glyphPaths('doc'));
  // Both are still shipments — the override is the glyph, not the shape.
  assert.equal(container.querySelectorAll('.rosh-tl-node.is-diamond').length, 2);
  unmount();
});

// ── Playback ────────────────────────────────────────────────────────────────

test('Play rewinds to the first report and travels to the next, one pixel at a time', () => {
  // The card's half of the change: the button owns `playing` and the position of
  // the thumb is the track's business. What is asserted here is the wiring —
  // that a press rewinds, that the status line under the bar changes when the
  // thumb ARRIVES somewhere and not while it is on its way, and that a second
  // press freezes rather than settles.
  const frames = fakeFrames();
  function Bar() {
    const snap = useProductionTimeline({ ...BASE, poStatus: 'completed' });
    return <ProductionTimeline snapshot={snap} onPickReport={() => {}} />;
  }
  const view = render(<Bar />);
  const at = (selector: string) => view.container.querySelector<HTMLElement>(selector)!;
  const play = () => at('.rosh-tl-play');
  const status = () => at('.rosh-tl-status').textContent ?? '';
  const thumbLeft = () => parseFloat(at('[data-timeline-part="thumb"]').style.left);
  const dotLeft = (label: string) =>
    parseFloat(view.container.querySelector<HTMLElement>(`[aria-label^="${label}"]`)!.style.left);

  try {
    assert.match(status(), /Showing PP-2/, 'the card opens on the latest report');
    act(() => { play().click(); });
    assert.equal(play().textContent, 'Pause');
    assert.equal(play().getAttribute('aria-pressed'), 'true');
    assert.match(status(), /Showing PP-1/, 'a fresh run rewinds to the first report');
    assert.equal(thumbLeft(), dotLeft('PP-1'));

    frames.until(() => thumbLeft() > dotLeft('PP-1'), 'the thumb never set off');
    frames.run(3, 16);
    const travelling = thumbLeft();
    assert.ok(travelling < dotLeft('PP-2'), 'it is between the two reports');
    assert.match(status(), /Showing PP-1/, 'the status line does not tick while the thumb moves');
    assert.doesNotMatch(status(), /Estimated/, 'and it never shows an interpolated snapshot');

    // Pause: the thumb stays where it was, which is nowhere a report sits.
    act(() => { play().click(); });
    assert.equal(play().textContent, 'Play');
    frames.run(20, 16);
    assert.equal(thumbLeft(), travelling, 'a pause freezes it mid-glide');
    assert.match(status(), /Showing PP-1/);

    // Resume from there, arrive, and stop at the last report.
    act(() => { play().click(); });
    frames.run(2, 16);
    assert.ok(thumbLeft() > travelling, 'it carried on from where it froze');
    frames.until(() => /Showing PP-2/.test(status()), 'the thumb never reached the second report');
    assert.equal(thumbLeft(), dotLeft('PP-2'));
    frames.until(() => play().textContent === 'Play', 'playback never ended', { budget: 800 });
    assert.equal(play().getAttribute('aria-pressed'), 'false');
  } finally {
    frames.restore();
    view.unmount();
  }
});

test('the bar plays on the clock, not on the frame rate', () => {
  // The customer portal, embedded and idle on 2026-09-14, gave the card a frame
  // every second or so and the thumb sat on its first report for eight seconds:
  // playback advanced by frame deltas clamped to 100ms, so a 700ms rest cost
  // seven frames whatever the clock said. Three frames here, spanning eight
  // seconds — and under the frame-paced version that is 300ms of playback.
  const frames = fakeFrames();
  function Bar() {
    const snap = useProductionTimeline({ ...BASE, poStatus: 'completed' });
    return <ProductionTimeline snapshot={snap} onPickReport={() => {}} />;
  }
  const view = render(<Bar />);
  const at = (selector: string) => view.container.querySelector<HTMLElement>(selector)!;
  const play = () => at('.rosh-tl-play');
  const status = () => at('.rosh-tl-status').textContent ?? '';

  try {
    act(() => { play().click(); });
    assert.match(status(), /Showing PP-1/);
    frames.frame(16);
    assert.match(status(), /Showing PP-1/, 'the first reading only anchors the rest');
    frames.frame(4_000);
    assert.match(status(), /Showing PP-1/, 'the rest is over, and an arrival is a separate event');
    frames.frame(4_000);
    assert.match(status(), /Showing PP-2/, 'three frames and eight seconds got it there');
    assert.equal(play().textContent, 'Play', 'the last report ends the run');
  } finally {
    frames.restore();
    view.unmount();
  }
});

test('onScrubProgress lets a consumer table follow the thumb between two reports', () => {
  // Henry, 2026-09-14: the quantities under the bar have to move with the thumb
  // rather than waiting for it to land. The card does not draw that table — the
  // consumer does — so it forwards the track's in-flight fraction, keyed by
  // report id, and the consumer interpolates its own figures on it.
  const frames = fakeFrames();
  const seen: (TimelineScrubProgress | null)[] = [];
  function Bar() {
    const snap = useProductionTimeline({ ...BASE, poStatus: 'completed' });
    return (
      <ProductionTimeline snapshot={snap} onPickReport={() => {}}
        onScrubProgress={(state) => { seen.push(state); }} />
    );
  }
  const view = render(<Bar />);
  const at = (selector: string) => view.container.querySelector<HTMLElement>(selector)!;
  const play = () => at('.rosh-tl-play');
  const status = () => at('.rosh-tl-status').textContent ?? '';

  try {
    act(() => { play().click(); });
    frames.run(8, 16);
    // `.length`, not a deepEqual against `[]`: node's assert would narrow `seen`
    // to `never[]` for the rest of the spec.
    assert.equal(seen.length, 0, 'the rest is not a journey');

    frames.until(() => seen.length > 0, 'nothing was reported in flight');
    frames.run(3, 16);
    const flight = seen.filter((state): state is TimelineScrubProgress => state !== null);
    assert.ok(flight.length >= 3, `only ${flight.length} frames reported`);
    for (const state of flight) {
      // The report IDs, which is what `onPickReport` and the snapshot speak.
      assert.equal(state.fromKey, 'r1');
      assert.equal(state.toKey, 'r2');
      assert.ok(state.t > 0 && state.t < 1, `t=${state.t} is not between the two`);
      assert.ok(state.ms > day('2026-05-10') && state.ms < day('2026-05-20'), 'the date is between them too');
    }
    assert.match(status(), /Showing PP-1/, 'and the status line has not ticked over');

    frames.until(() => /Showing PP-2/.test(status()), 'the thumb never arrived');
    assert.equal(seen.at(-1), null, 'arriving is the end of the journey');
  } finally {
    frames.restore();
    view.unmount();
  }
});

// ── The popover a consumer fills ────────────────────────────────────────────

/** The dot announced with `label`. */
function reportDot(container: Element, label: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[aria-label^="${label}"]`);
  assert.ok(found, `no dot announced as "${label}"`);
  return found;
}

const hover = (el: Element) => act(() => {
  // React synthesises mouseenter from the delegated mouseover, so that is the
  // event a real pointer produces.
  el.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
});

/** Mount the card over a given report list, with the window pinned so the
 *  assertions are about the popover rather than about today. */
function bar(props: Partial<React.ComponentProps<typeof ProductionTimeline>> & { reports: TimelineReport[] }) {
  const { reports, ...rest } = props;
  function Bar() {
    const snap = useProductionTimeline({ ...BASE, poStatus: 'completed', reports });
    return <ProductionTimeline snapshot={snap} onPickReport={() => {}} {...rest} />;
  }
  return render(<Bar />);
}

test("a report's own preview fills its popover, by hover and by focus alike", () => {
  // A report used to be the one mark on the rail that could not show its
  // document: `TimelineTrackItem.preview` and `TimelineMarker.preview` both
  // reached the bubble, and the scrubber built its items without ever passing
  // one on. So a portal could give a shipment a card and not a PP report.
  const withPreview: TimelineReport = {
    ...R2,
    preview: <span data-testid="pp2-preview">Casting 120/120 · CNC 86/120</span>,
  };
  const view = bar({ reports: [withPreview, R1] });

  hover(reportDot(view.container, 'PP-2'));
  const hovered = view.container.querySelector('[role="tooltip"]')!;
  assert.ok(hovered.querySelector('[data-timeline-part="preview"]'), "the consumer's card, not a second line of text");
  assert.match(hovered.textContent ?? '', /CNC 86\/120/);
  // The popover prints these two itself, which is exactly why the d.ts tells a
  // portal to leave them out of the preview it supplies.
  assert.match(hovered.textContent ?? '', /PP-2/, "under the report's own number");
  assert.match(hovered.textContent ?? '', /20\/05\/2026/, 'and its date line');

  pressKey('Escape');
  assert.equal(view.container.querySelector('[role="tooltip"]'), null, 'Escape dismisses it');

  act(() => { reportDot(view.container, 'PP-2').focus(); });
  assert.match(
    view.container.querySelector('[role="tooltip"]')?.textContent ?? '',
    /CNC 86\/120/,
    'reachable without a pointer, like every other bubble on the track',
  );
  view.unmount();
});

test('renderReportPreview fills the reports that carry none, and never overrides one that does', () => {
  // The convenience for a caller whose reports arrive straight off an API:
  // copying the list to attach one field to each is the thing it saves. It
  // loses to a preview somebody attached deliberately.
  const withPreview: TimelineReport = {
    ...R2,
    preview: <span>its own card</span>,
  };
  const asked: string[] = [];
  const view = bar({
    reports: [withPreview, R1],
    renderReportPreview: (report) => {
      asked.push(report.progress_number);
      return <span>fallback for {report.progress_number}</span>;
    },
  });

  act(() => { reportDot(view.container, 'PP-1').focus(); });
  assert.match(
    view.container.querySelector('[role="tooltip"]')?.textContent ?? '',
    /fallback for PP-1/,
    'a report with no preview of its own gets the one the card builds',
  );

  pressKey('Escape');
  act(() => { reportDot(view.container, 'PP-2').focus(); });
  const pinned = view.container.querySelector('[role="tooltip"]')?.textContent ?? '';
  assert.match(pinned, /its own card/);
  assert.doesNotMatch(pinned, /fallback for PP-2/, 'the item-level preview wins');
  // Asked about the report that needed one and never about the one that did
  // not — as a SET, because how many times the card renders is not a promise.
  assert.deepEqual([...new Set(asked)], ['PP-1']);
  view.unmount();
});

// ── Marks too close to be drawn apart ───────────────────────────────────────

test('two reports a day apart fold into one mark, and the scrubber still reaches both', () => {
  // "Marks that are too close overlap each other" (Henry, 2026-09-15,
  // translated, on a customer's order with two shipments a few days apart). A
  // day is ten pixels on this window, and a report ring is sixteen: one of the
  // two was drawn under the other, where it could not be hovered, read or
  // counted. Folding is a DRAWING decision and nothing else — the thumb still
  // has a stop on each of them, and each still activates its own report.
  const near1: TimelineReport = { ...R1, id: 'n1', progress_number: 'PP-9', date: '2026-05-20' };
  const near2: TimelineReport = { ...R2, id: 'n2', progress_number: 'PP-10', date: '2026-05-21' };
  const picked: string[] = [];
  const view = bar({ reports: [near2, near1], onPickReport: (id) => picked.push(id) });
  const at = (selector: string) => view.container.querySelector<HTMLElement>(selector);
  const items = () => view.container.querySelectorAll<HTMLElement>('[data-timeline-node="item"]');

  const fold = at('[data-timeline-node="fold"]');
  assert.ok(fold, 'the two reports are still drawn on top of each other');
  assert.equal(fold.getAttribute('data-timeline-count'), '2');
  assert.match(fold.getAttribute('aria-label') ?? '', /PP-9 · 20\/05\/2026, PP-10 · 21\/05\/2026/);
  assert.equal(items().length, 0, 'and neither is drawn twice');
  assert.equal(
    fold.closest('li')?.getAttribute('aria-current'), 'step',
    '"you are here" is on the fold that holds the current report',
  );

  // The slider is untouched: two stops, and the thumb is on the later report.
  const slider = at('[role="slider"]')!;
  assert.equal(slider.getAttribute('aria-valuemax'), '1', 'both reports are still stops');
  assert.match(slider.getAttribute('aria-valuetext') ?? '', /^PP-10 · /);
  pressKey('ArrowLeft', { target: slider });
  assert.match(at('.rosh-tl-status')!.textContent ?? '', /Showing PP-9/, 'the arrows still step reports');

  // Opening the fold spreads the run and hands each report back its own dot.
  act(() => { fold.click(); });
  const open = items();
  assert.equal(open.length, 2, 'the fold opened into its members');
  const xs = [...open].map((dot) => parseFloat(dot.style.left));
  assert.ok(xs[1] - xs[0] >= 16, `the members are still ${xs[1] - xs[0]}px apart after opening`);
  act(() => { open[0].click(); });
  assert.deepEqual(picked, ['n1'], 'and a member activates its own report');
  view.unmount();
});

// ── Whose identity the bar prints ───────────────────────────────────────────

test('reportLabel renames the report everywhere the bar states its identity', () => {
  // "The customer portal must not show the standalone production-progress
  // identity anywhere" (Henry, 2026-09-15, translated). `PP#10147` is an
  // internal document number, and the card was printing it in six places on a
  // window about the customer's own order — the caption over the thumb, the
  // popover header, the dot's accessible name and title, the slider's value
  // text, and the status line. All six read the same two strings, so one
  // function reaches all six.
  const view = bar({ reports: REPORTS, reportLabel: (report) => `Update ${report.date}` });
  const { container } = view;
  const text = container.textContent ?? '';

  assert.match(text, /Showing Update 2026-05-20/, 'the status line');
  assert.ok(container.querySelector('[aria-label^="Update 2026-05-20"]'), "the dot's accessible name");
  assert.match(
    container.querySelector('[role="slider"]')!.getAttribute('aria-valuetext') ?? '',
    /^Update 2026-05-20 · /,
    'what a screen reader reads for the slider value',
  );
  assert.match(
    container.querySelector('[data-timeline-part="label"]')?.textContent ?? '',
    /Update 2026-05-20/,
    'the one caption a scrubber draws',
  );
  // The whole point: the number is nowhere on the card.
  assert.doesNotMatch(text, /PP-/, `the report number survived somewhere: ${text}`);
  view.unmount();

  // And the admin window, which passes none of this, is untouched.
  const plain = bar({ reports: REPORTS });
  assert.match(plain.container.textContent ?? '', /Showing PP-2/);
  assert.ok(plain.container.querySelector('[aria-label^="PP-2"]'), 'the default is progress_number');
  plain.unmount();
});

/** The card with a current report, so the reset affordance has somewhere to go.
 *  Clicking another dot is what scrubs away from it — the same gesture a reader
 *  makes. */
function withCurrent(rest: Partial<React.ComponentProps<typeof ProductionTimeline>> = {}) {
  function Bar() {
    const snap = useProductionTimeline({
      ...BASE, poStatus: 'completed', currentReportId: 'r2', currentReportDate: '2026-05-20',
    });
    return <ProductionTimeline snapshot={snap} onPickReport={() => {}} {...rest} />;
  }
  const view = render(<Bar />);
  // The earliest report, by position rather than by name: the name is what half
  // of these specs are changing.
  act(() => { view.container.querySelectorAll<HTMLElement>('[data-timeline-node="item"]')[0].click(); });
  const reset = () => view.container
    .querySelector('.rosh-tl-head-actions button:not(.rosh-tl-play)');
  return { ...view, reset };
}

test('the reset button names the current report the same way, and resetLabel replaces it', () => {
  const plain = withCurrent();
  assert.equal(plain.reset()?.textContent, 'Back to PP-2', 'the default admin wording');
  plain.unmount();

  const renamed = withCurrent({ reportLabel: (report) => `Update ${report.date}` });
  assert.equal(
    renamed.reset()?.textContent, 'Back to Update 2026-05-20',
    'the button names the report the way the rest of the bar does',
  );
  renamed.unmount();

  // A portal that has hidden the identity says where the button goes instead.
  const named = withCurrent({ reportLabel: () => 'Progress report', resetLabel: 'Back to latest' });
  assert.equal(named.reset()?.textContent, 'Back to latest');
  named.unmount();
});

test('calcOverall weights the four in-flight stages, capped per stage', () => {
  // Weighted sums of binary fractions: compare to the nearest thousandth.
  const near = (actual: number, expected: number, msg?: string) =>
    assert.ok(Math.abs(actual - expected) < 1e-3, msg ?? `${actual} ≈ ${expected}`);
  near(calcOverall(item('WH-1', 100, 100, 50)), 30);
  near(calcOverall(item('WH-1', 100, 150)), 20, 'over-reporting a stage does not exceed its weight');
  assert.equal(calcOverall(item('WH-1', 0, 10)), 0, 'no build target, no progress');
  near(calcReportOverall({ items: [item('A', 100, 100), item('B', 100)] }), 10);
  assert.equal(calcReportOverall(null), 0);
});

test('toDayMs rejects an implausible year rather than stretching the axis to it', () => {
  assert.equal(toDayMs('0202-12-20'), null);
  assert.equal(toDayMs('garbage'), null);
  assert.equal(toDayMs(''), null);
  assert.equal(toDayMs('2026-05-01'), Date.UTC(2026, 4, 1));
  assert.equal(DAY_MS, 86400000);
});

// ── The start anchor ────────────────────────────────────────────────────────

test('the bar says where the window opens, not where the first report landed', () => {
  // "The timeline must start at zero, not at the first production report"
  // (Henry, 2026-09-14, watching the customer portal). The window opens on the
  // PO's production start date — 1 May here — and the first report is nine days
  // in, which on a two-month axis is close enough to the left end to read as
  // the beginning of the programme.
  const view = bar({ reports: REPORTS });
  const caption = view.container.querySelector('[data-timeline-part="start-caption"]');
  assert.ok(caption, 'no start caption on the production bar');
  assert.equal(caption!.textContent, 'Start · 01/05/2026');
  assert.ok(view.container.querySelector('.rosh-tl-start'), 'and a ring stands on the origin');
  // Nothing was filed that day, so the ring stays closed: the nearest report is
  // a tenth of the axis away.
  assert.equal(view.container.querySelector('.rosh-tl-start.is-around'), null);
  view.unmount();
});

test('the start anchor moves no report and adds no rung to the slider', () => {
  const view = bar({ reports: REPORTS });
  const slider = view.container.querySelector('[role="slider"]')!;
  assert.equal(slider.getAttribute('aria-valuemax'), '1', 'two reports, indices 0..1');
  assert.equal(
    view.container.querySelectorAll('[data-timeline-node="item"]').length, 2,
    'and the ordered list is still the reports',
  );
  view.unmount();
});

test('a caller may write the caption itself — edgeCaptions goes straight through', () => {
  const view = bar({
    reports: REPORTS,
    edgeCaptions: { start: 'Start · PO issued', end: 'Contractual delivery' },
  });
  assert.equal(
    view.container.querySelector('[data-timeline-part="start-caption"]')?.textContent,
    'Start · PO issued',
  );
  assert.equal(
    view.container.querySelector('[data-timeline-part="end-caption"]')?.textContent,
    'Contractual delivery',
  );
  view.unmount();
});
