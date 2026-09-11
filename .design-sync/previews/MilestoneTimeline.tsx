import { MilestoneTimeline } from 'react-os-shell';
import type { Milestone } from 'react-os-shell';

// MilestoneTimeline — a date-laid timeline of order/production milestones.
// Consumers map their domain data to the generic Milestone shape. A dated
// milestone gets a dot and a label packed into one of four lanes by its
// measured width; an undated one gets no position at all and is listed as
// pending beside the bar. The axis is piecewise linear: an idle stretch longer
// than 30% of the track is compressed and marked with a break glyph.

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

// The shape both the lane packing and the compressed axis exist for, copied
// from a real mould: seven dated milestones inside the first eight weeks of a
// 330-day window, three of them on one day, and then 275 days of nothing while
// the customer decides — the window runs to the projected production-ready date
// because the real one is still null.
//
// On a linear axis those seven shared the first sixth of the bar and the two
// milestones that settle anything collapsed to hover-only. Here the eight weeks
// own 70% of the track and the idle tail is capped at 30%, with a break glyph
// on it saying how many days it hides. The two undated milestones are listed on
// the right rather than interpolated onto the axis at dates nobody recorded.
const MOULD_MILESTONES: Milestone[] = [
  { key: 'kickoff', label: 'Project Initiated', date: '2026-01-05', kind: 'default' },
  { key: 'dfm1', label: 'DFM v1', date: '2026-01-20', kind: 'dfm' },
  { key: 'dfm2', label: 'DFM v2', date: '2026-01-26', kind: 'dfm' },
  { key: 'dfm3', label: 'DFM v3', date: '2026-02-03', detail: 'Same day as v4', kind: 'dfm' },
  { key: 'dfm4', label: 'DFM v4', date: '2026-02-03', kind: 'dfm' },
  { key: 'dfmok', label: 'DFM Confirmed', date: '2026-02-03', kind: 'testing', phase: 'qa' },
  { key: 'complete', label: 'Mould Complete', date: '2026-03-01', kind: 'testing', phase: 'qa' },
  { key: 'sample', label: 'Sample Shipped', date: null, kind: 'shipment' },
  { key: 'ready', label: 'Production Ready', date: null, kind: 'completion' },
];

export function MouldDevelopmentTimeline() {
  return (
    <div className="p-5">
      <MilestoneTimeline
        title="Mould Development WM-2208"
        milestones={MOULD_MILESTONES}
        endDate="2026-12-01"
        phaseLabels={{ qa: 'QA & Sample' }}
      />
    </div>
  );
}
