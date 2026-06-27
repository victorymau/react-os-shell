import { MilestoneTimeline } from 'react-os-shell';
import type { Milestone } from 'react-os-shell';

// MilestoneTimeline — a date-laid timeline of order/production milestones.
// Consumers map their domain data to the generic Milestone shape; undated
// milestones fall back to their list position.

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
