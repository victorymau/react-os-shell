import { MetricBar } from 'react-os-shell';

// MetricBar — a value, a proportional bar and optional warn/crit threshold
// ticks. Thresholds come from the caller (nothing is hardcoded), and a null
// value renders as "no data" — a dashed empty track, never a zero-width bar.

export function MetricRows() {
  return (
    <div className="w-72 space-y-3 p-5">
      <MetricBar label="CPU" value={23.4} warn={80} crit={90} detail="4 vCPU" />
      <MetricBar label="Memory" value={82.1} warn={80} crit={90} detail="13.1 / 16 GiB" />
      <MetricBar label="Disk" value={94.2} warn={80} crit={90} detail="94.2 / 100 GiB" />
    </div>
  );
}

export function NoReading() {
  return (
    <div className="w-72 space-y-3 p-5">
      <MetricBar label="CPU" value={null} warn={80} crit={90} />
      <MetricBar label="Memory" value={null} warn={80} crit={90} />
      {/* A real magnitude with no bounds to judge it: grey fill, no ticks. */}
      <MetricBar label="Disk" value={61.5} detail="61.5 / 100 GiB" />
    </div>
  );
}

export function StatSize() {
  return (
    <div className="flex gap-4 p-5">
      <div className="w-40 rounded-lg border border-gray-200 p-3.5">
        <MetricBar size="md" label="Memory" value={41.8} warn={80} crit={90} detail="6.6 / 16 GiB" />
      </div>
      <div className="w-40 rounded-lg border border-red-300 p-3.5">
        <MetricBar size="md" label="Disk" value={94.2} warn={80} crit={90} detail="94.2 / 100 GiB" />
      </div>
    </div>
  );
}
