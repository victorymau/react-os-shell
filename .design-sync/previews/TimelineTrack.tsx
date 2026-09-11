import { TimelineTrack } from 'react-os-shell';
import type { TimelineTrackItem } from 'react-os-shell';

// TimelineTrack — the time axis both of the kit's timelines are drawn on.
// MilestoneTimeline is this with lane labels and a compressed axis;
// ProductionTimeline is this with a thumb and one active label. Reach for it
// directly when a domain needs a dated sequence on a bar and neither of those
// two cards is the right wrapper.
//
// What it draws: a rail with a fill, a date ruler (month ticks always, week
// ticks where they fit, a month label only where one clears its neighbour),
// dots whose shape and colour say what kind of event they are, labels packed
// into two lanes, `xN` pills for runs of the same kind, a today tick, and the
// undated things listed beside the track rather than placed on it.

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

// The dense case, copied from a real mould: seven dated milestones inside the
// first eight weeks of a 337-day window, three of them on one day, then 282
// days of nothing while the customer decides. On a linear axis all seven share
// the first sixth of the bar; `axis="compressed"` caps that idle tail at 30% of
// the track and marks it with a break glyph saying how many days it hides.
//
// `priority` is doing two jobs at once, and they are the same judgement: a lane
// goes to a low number first, and anything ABOVE zero is an ordinary dot that
// may fold into a pill with its same-kind neighbours. The four DFM revisions
// are one step reported four times, so they become `DFM x4` and the two
// milestones that settle something keep their labels.
const MOULD: TimelineTrackItem[] = [
  { key: 'init', ms: day(2025, 10, 9), label: 'Project Initiated' },
  { key: 'dfm1', ms: day(2025, 10, 24), label: 'DFM v1', kind: 'dfm', priority: 1 },
  { key: 'dfm2', ms: day(2025, 10, 30), label: 'DFM v2', kind: 'dfm', priority: 1 },
  { key: 'dfm3', ms: day(2025, 11, 7), label: 'DFM v3', kind: 'dfm', priority: 1 },
  { key: 'dfm4', ms: day(2025, 11, 7), label: 'DFM v4', kind: 'dfm', priority: 1 },
  { key: 'dfmok', ms: day(2025, 11, 7), label: 'DFM Confirmed', kind: 'testing', detail: 'Tooling drawings signed off' },
  { key: 'done', ms: day(2025, 12, 3), label: 'Mould Complete', kind: 'testing' },
];

export function DenseProgramme() {
  return (
    <div className="p-5">
      <div className="border border-gray-200 rounded-lg bg-gray-50 px-4 pt-3 pb-4">
        <div className="flex items-baseline gap-2 flex-wrap mb-3.5">
          <h4 className="text-[13px] font-semibold text-gray-800">Mould development</h4>
          <p className="text-xs text-gray-500 tabular-nums">001F/1813 · 337 days</p>
        </div>
        <TimelineTrack
          axis="compressed"
          labels="lanes"
          items={MOULD}
          pending={[
            { key: 'sample', label: 'Sample Shipped', kind: 'shipment' },
            { key: 'ready', label: 'Production Ready', kind: 'completion' },
          ]}
          startMs={day(2025, 10, 9)}
          endMs={day(2026, 9, 11)}
          todayMs={day(2026, 9, 11)}
          ariaLabel="001F/1813 milestones"
        />
      </div>
    </div>
  );
}

// The sparse case, and the reason the lanes are not always two rows tall: four
// well-spread milestones need no clustering, no break glyph and no second lane,
// so the card stays short. Same component, same props — only the data is calm.
const ORDER: TimelineTrackItem[] = [
  { key: 'po', ms: day(2026, 5, 2), label: 'PO Placed' },
  { key: 'prod', ms: day(2026, 5, 20), label: 'In Production', kind: 'dfm', priority: 1, detail: 'Casting + CNC' },
  { key: 'qc', ms: day(2026, 6, 10), label: 'QC Passed', kind: 'testing' },
  { key: 'ship', ms: day(2026, 6, 22), label: 'Shipped', kind: 'shipment', detail: 'MSK-2208441' },
];

export function SparseOrder() {
  return (
    <div className="p-5">
      <div className="border border-gray-200 rounded-lg bg-gray-50 px-4 pt-3 pb-4">
        <div className="flex items-baseline gap-2 flex-wrap mb-3.5">
          <h4 className="text-[13px] font-semibold text-gray-800">Sales order SO#27201</h4>
          <p className="text-xs text-gray-500 tabular-nums">51 days lead time</p>
        </div>
        <TimelineTrack
          axis="linear"
          labels="lanes"
          items={ORDER}
          startMs={day(2026, 5, 2)}
          endMs={day(2026, 6, 22)}
          ariaLabel="SO#27201 milestones"
        />
      </div>
    </div>
  );
}
