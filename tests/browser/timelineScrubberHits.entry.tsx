import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProductionTimeline, {
  useProductionTimeline,
  type ProgressItem,
  type TimelineMarker,
  type TimelineReport,
} from '../../src/shell/ProductionTimeline';

/**
 * A production scrubber with all three kinds of mark on it, and a log of what
 * the marks did.
 *
 * The claim this page exists to test cannot be made in jsdom: whether a POINTER
 * arriving at a mark's own pixels reaches the mark. jsdom has no layout and no
 * hit testing, so a spec there dispatches `mouseover` straight at the button and
 * passes however the stage is stacked — which is exactly how a full-width hit
 * strip drawn over every dot went unnoticed.
 *
 * Everything the check needs to read is in the DOM: the log below the bar is
 * what a mark's `onClick` / `onOpen` wrote, so a click that did not reach the
 * mark is an empty line rather than a callback nobody counted.
 */
const part = (n: number): ProgressItem => ({
  id: `pn-${n}`, part_number: `WH-${n}`, description: 'Alloy wheel',
  order_qty: 200, casting: 200, cnc: 40 * n, painting: 30 * n, packing: 20 * n,
  finished_goods: 10 * n, stock_qty: 5 * n,
});

/**
 * Three reports, newest first — the order the hook requires — spread far enough
 * apart that a 16 px dot, a 35 px gap and a press on the bare rail between two
 * of them are each unambiguous at this page's width.
 */
const REPORTS: TimelineReport[] = [
  {
    id: 'r3', progress_number: 'PP#10142', date: '2026-06-19',
    est_completion_date: '2026-07-05', items: [part(3)],
  },
  {
    id: 'r2', progress_number: 'PP#10141', date: '2026-05-22',
    est_completion_date: '2026-07-02', items: [part(2)],
  },
  {
    id: 'r1', progress_number: 'PP#10140', date: '2026-05-01',
    est_completion_date: '2026-06-30', items: [part(1)],
    preview: <span>Casting 200/200 · CNC 40/200</span>,
  },
];

function Page() {
  const [log, setLog] = useState<string[]>([]);
  const note = (entry: string) => setLog((prev) => [...prev, entry]);

  /** An inspection and a shipment, both carrying the popover a portal supplies. */
  const markers: TimelineMarker[] = [
    {
      id: 'qc-1', date: '2026-05-08', kind: 'inspection', label: 'QC#4471',
      detail: 'Sample pulled',
      preview: <span>Dimensional check · 8 of 8 passed</span>,
      onClick: (marker) => note(`click:${marker.id}`),
    },
    {
      id: 'gi-1', date: '2026-06-05', kind: 'shipment', label: 'GI#8802',
      detail: '1 x 40HQ',
      preview: <span>1 x 40HQ to Port Botany</span>,
      onClick: (marker) => note(`click:${marker.id}`),
    },
    // Two shipments a day apart — ten pixels on this window, where a mark is
    // sixteen. Drawn as themselves, one is printed over the other.
    {
      id: 'gi-2a', date: '2026-05-28', kind: 'shipment', label: 'GI#8810',
      detail: '2 x 20GP',
      preview: <span>2 x 20GP to Fremantle</span>,
      onClick: (marker) => note(`click:${marker.id}`),
    },
    {
      id: 'gi-2b', date: '2026-05-29', kind: 'shipment', label: 'GI#8811',
      detail: '1 x 40HQ',
      preview: <span>1 x 40HQ to Fremantle</span>,
      onClick: (marker) => note(`click:${marker.id}`),
    },
  ];

  const snapshot = useProductionTimeline({
    reports: REPORTS,
    poProductionStartDate: '2026-04-23',
    // Completed, so the right edge is this date rather than today: every
    // coordinate the check measures has to be the same next year.
    poEstCompletionDate: '2026-07-05',
    poStatus: 'completed',
    poNumber: 'SO#35489',
    markers,
  });

  return (
    <div style={{ width: 760 }}>
      <div data-testid="production">
        <ProductionTimeline
          snapshot={snapshot}
          onPickReport={(id) => note(`pick:${id}`)}
          onOpenMarker={(marker) => note(`open:${marker.id}`)}
        />
      </div>
      <pre data-testid="log" style={{ marginTop: 16, fontSize: 12 }}>{log.join('\n')}</pre>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Page />);
