import { createRoot } from 'react-dom/client';
import Button from '../../src/forms/Button';
import { applyThemePrefs } from '../../src/hooks/useTheme';
import ProductionTimeline, {
  useProductionTimeline,
  type ProgressItem,
  type TimelineMarker,
  type TimelineReport,
} from '../../src/shell/ProductionTimeline';

/**
 * A primary `Button` and a `ProductionTimeline` on the same page, so the
 * check can compare the bar's blue against the theme's blue as the browser
 * actually computes them.
 *
 * `?theme=dark` stamps the attribute the kit's dark mode keys on, and
 * `?accent=%237c3aed` runs the page through `applyThemePrefs` — the same
 * imperative path `useTheme` and the shell's Customization panel take, which
 * stamps `data-custom-accent` and the `--accent-*` scale inline on <html>.
 */
const params = new URLSearchParams(location.search);
const dark = params.get('theme') === 'dark';
const accent = params.get('accent');
applyThemePrefs({ theme: dark ? 'dark' : 'light', accent_color: accent });
document.body.style.background = dark ? '#1e1e2e' : '#ffffff';
document.body.style.padding = '24px';

const part = (n: number): ProgressItem => ({
  id: `pn-${n}`, part_number: `WH-${n}`, description: 'Alloy wheel',
  order_qty: 200, casting: 200, cnc: 40 * n, painting: 30 * n, packing: 20 * n,
  finished_goods: 10 * n, stock_qty: 5 * n,
});

/** Four weekly reports, newest first — the order the hook requires. */
const REPORTS: TimelineReport[] = [
  { id: 'r4', progress_number: 'PP#10143', date: '2026-05-21', est_completion_date: '2026-07-05', items: [part(3)] },
  { id: 'r3', progress_number: 'PP#10142', date: '2026-05-14', est_completion_date: '2026-07-02', items: [part(2)] },
  { id: 'r2', progress_number: 'PP#10141', date: '2026-05-07', est_completion_date: '2026-07-02', items: [part(1)] },
  { id: 'r1', progress_number: 'PP#10140', date: '2026-04-30', est_completion_date: '2026-06-30', items: [part(1)] },
];

/** A shipment (the diamond) and an inspection (the flask disc): the two kind
 *  marks that are painted from a `--tl-*` token rather than from a utility. */
const MARKERS: TimelineMarker[] = [
  { id: 'gi-1', date: '2026-05-05', kind: 'inspection', label: 'QC#4471', detail: 'Sample pulled' },
  { id: 'gi-2', date: '2026-05-18', kind: 'shipment', label: 'GI#8802', detail: '1 x 40HQ' },
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
  return <ProductionTimeline snapshot={snapshot} onPickReport={() => {}} />;
}

createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'flex', flexDirection: 'column', gap: 32, width: 720 }}>
    <div data-testid="reference-button">
      <Button variant="primary">Save</Button>
    </div>
    <div data-testid="production">
      <Production />
    </div>
  </div>,
);
