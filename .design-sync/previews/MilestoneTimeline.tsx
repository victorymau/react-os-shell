import { MilestoneTimeline } from 'react-os-shell';
import type { Milestone } from 'react-os-shell';

// MilestoneTimeline — a date-laid timeline of order/production milestones.
// Consumers map their domain data to the generic Milestone shape. A dated
// milestone gets a dot and a label packed into one of four lanes by its
// measured width; an undated one gets no position at all and is listed as
// pending beside the bar.

const MILESTONES: Milestone[] = [
  { key: 'po', label: 'PO Placed', date: '2026-05-02', kind: 'default' },
  { key: 'prod', label: 'In Production', date: '2026-05-20', detail: 'Casting + CNC', kind: 'dfm' },
  { key: 'qc', label: 'QC Passed', date: '2026-06-10', kind: 'testing' },
  { key: 'ship', label: 'Shipped', date: '2026-06-22', detail: 'MSK-2208441', kind: 'shipment' },
  { key: 'deliver', label: 'Delivered', date: null, kind: 'completion' },
];

export function OrderTimeline() {
  return (
    <div className="p-5">
      <MilestoneTimeline
        title="Sales Order SO#27201"
        milestones={MILESTONES}
        summary="On track — delivery expected late June."
      />
    </div>
  );
}

// The shape the lane packing exists for: a 300-day mould programme whose four
// DFM revisions all land inside ten days, two of them on the same day. Under
// the old index-parity stagger every one of those labels drew at the same
// place. The two undated milestones are listed on the right instead of being
// interpolated onto the axis at dates nobody recorded.
const MOULD_MILESTONES: Milestone[] = [
  { key: 'kickoff', label: 'Mould Kickoff', date: '2026-01-05', kind: 'default' },
  { key: 'dfm1', label: 'DFM v1', date: '2026-06-01', kind: 'dfm' },
  { key: 'dfm2', label: 'DFM v2', date: '2026-06-03', kind: 'dfm' },
  { key: 'dfm3', label: 'DFM v3', date: '2026-06-03', detail: 'Same day as v2', kind: 'dfm' },
  { key: 'dfm4', label: 'DFM v4', date: '2026-06-10', kind: 'dfm' },
  { key: 'complete', label: 'Mould Complete', date: '2026-08-14', kind: 'testing', phase: 'qa' },
  { key: 'safety', label: 'Safety Tests', date: '2026-08-20', kind: 'testing', phase: 'qa' },
  { key: 'sample', label: 'Sample Shipped', date: null, kind: 'shipment' },
  { key: 'ready', label: 'Production Ready', date: null, kind: 'completion' },
];

export function MouldDevelopmentTimeline() {
  return (
    <div className="p-5">
      <MilestoneTimeline
        title="Mould Development WM-2208"
        milestones={MOULD_MILESTONES}
        endDate="2026-11-01"
        phaseLabels={{ qa: 'QA & Sample' }}
      />
    </div>
  );
}
