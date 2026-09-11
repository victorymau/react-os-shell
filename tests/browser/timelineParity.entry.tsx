import { createRoot } from 'react-dom/client';
import MilestoneTimeline, { type Milestone } from '../../src/shell/MilestoneTimeline';
import ProductionTimeline, {
  useProductionTimeline,
  type ProgressItem,
  type TimelineMarker,
  type TimelineReport,
} from '../../src/shell/ProductionTimeline';

/**
 * Both timelines, on the fixtures the redesign was argued over.
 *
 * `?width=` sets the card width — 720 for the ordinary case, 300 to cross the
 * threshold where the axis is abandoned for the vertical variant — and
 * `?theme=dark` stamps the attribute the kit's dark mode keys on.
 */
const params = new URLSearchParams(location.search);
const width = Number(params.get('width') ?? 720);
const dark = params.get('theme') === 'dark';
if (dark) document.documentElement.setAttribute('data-theme', 'dark');
document.body.style.background = dark ? '#1e1e2e' : '#ffffff';
document.body.style.padding = '24px';

/**
 * Mould 001F/1813, as the admin portal passes it: seven dated milestones inside
 * the first eight weeks, three of them on 7 November, then 282 empty days while
 * the customer decides, and two milestones that have not happened at all.
 */
const MOULD: Milestone[] = [
  { key: 'init', label: 'Project Initiated', date: '2025-10-09' },
  { key: 'dfm1', label: 'DFM v1', date: '2025-10-24', kind: 'dfm' },
  { key: 'dfm2', label: 'DFM v2', date: '2025-10-30', kind: 'dfm' },
  { key: 'dfm3', label: 'DFM v3', date: '2025-11-07', kind: 'dfm' },
  { key: 'dfm4', label: 'DFM v4', date: '2025-11-07', kind: 'dfm' },
  // `default` per the milestone spec and a signed drawing to the reader: the
  // glyph is what makes it an amber document rather than an accent disc.
  {
    key: 'dfmok',
    label: 'DFM Confirmed',
    date: '2025-11-07',
    glyph: 'doc',
    phase: 'qa',
    detail: 'Tooling drawings signed off',
    preview: (
      <>
        <span>Rev D · signed off 07/11/2025</span>
        <span>3D model approved · blueprint approved</span>
      </>
    ),
  },
  { key: 'complete', label: 'Mould Complete', date: '2025-12-03', kind: 'completion', phase: 'qa' },
  { key: 'sample', label: 'Sample Shipped', date: null, kind: 'shipment' },
  { key: 'ready', label: 'Production Ready', date: undefined, kind: 'completion' },
];

const part = (n: number): ProgressItem => ({
  id: `pn-${n}`, part_number: `WH-${n}`, description: 'Alloy wheel',
  order_qty: 200, casting: 200, cnc: 40 * n, painting: 30 * n, packing: 20 * n,
  finished_goods: 10 * n, stock_qty: 5 * n,
});

/** Six weekly reports, newest first — the order the hook requires. */
const REPORTS: TimelineReport[] = [
  { id: 'r6', progress_number: 'PP#10145', date: '2026-06-04', est_completion_date: '2026-07-05', items: [part(5)] },
  { id: 'r5', progress_number: 'PP#10144', date: '2026-05-28', est_completion_date: '2026-07-05', items: [part(4)] },
  { id: 'r4', progress_number: 'PP#10143', date: '2026-05-21', est_completion_date: '2026-07-05', items: [part(3)] },
  { id: 'r3', progress_number: 'PP#10142', date: '2026-05-14', est_completion_date: '2026-07-02', items: [part(2)] },
  { id: 'r2', progress_number: 'PP#10141', date: '2026-05-07', est_completion_date: '2026-07-02', items: [part(1)] },
  { id: 'r1', progress_number: 'PP#10140', date: '2026-04-30', est_completion_date: '2026-06-30', items: [part(1)] },
];

const MARKERS: TimelineMarker[] = [
  { id: 'gi-1', date: '2026-05-20', kind: 'inspection', label: 'QC#4471', detail: 'Sample pulled' },
  { id: 'gi-2', date: '2026-06-25', kind: 'shipment', label: 'GI#8802', detail: '1 x 40HQ' },
];

function Production() {
  const snapshot = useProductionTimeline({
    reports: REPORTS,
    poProductionStartDate: '2026-04-23',
    poEstCompletionDate: '2026-07-05',
    poStatus: 'completed',
    poNumber: 'SO#35489',
    markers: MARKERS,
  });
  return (
    <ProductionTimeline
      snapshot={snapshot}
      onPickReport={() => {}}
      onOpenReport={(id) => { document.title = `open:${id}`; }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'flex', flexDirection: 'column', gap: 32, width }}>
    <div data-testid="mould">
      <MilestoneTimeline
        title="Mould development"
        subject="001F/1813"
        milestones={MOULD}
        endDate="2026-09-11"
        phaseLabels={{ qa: 'QA & Sample' }}
      />
    </div>
    <div data-testid="production">
      <Production />
    </div>
  </div>,
);
