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
    { id: 'gi', date: '2026-05-12', kind: 'shipment', label: 'GI-1' },
    { id: 'qc', date: '2026-05-13', kind: 'inspection', label: 'QC-1' },
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
