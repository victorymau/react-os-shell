import { StatCard } from 'react-os-shell';

// StatCard — the dashboard metric tile: label, big value, optional trend delta.

export function Grid() {
  return (
    <div className="grid max-w-3xl grid-cols-2 gap-4 p-5 sm:grid-cols-4">
      <StatCard label="Revenue" value="$38.2k" delta={{ value: '12%', direction: 'up' }} />
      <StatCard label="Orders" value="1,204" delta={{ value: '4%', direction: 'up' }} />
      <StatCard label="Customers" value="892" delta={{ value: '2%', direction: 'down' }} />
      <StatCard label="Refunds" value="$1.1k" delta={{ value: '0%', direction: 'flat' }} />
    </div>
  );
}
