import { useState } from 'react';
import { SidebarNavItem } from 'react-os-shell';

// SidebarNavItem — a pill-style sidebar button with an optional count badge and
// an active state. Count fetching stays in the consuming app.

const BUCKETS = [
  { value: 'all', label: 'All', count: 142 },
  { value: 'open', label: 'Open', count: 38 },
  { value: 'submitted', label: 'Submitted', count: 12 },
  { value: 'shipped', label: 'Shipped', count: 86 },
  { value: 'cancelled', label: 'Cancelled', count: 6 },
];

export function Buckets() {
  const [active, setActive] = useState('open');
  return (
    <div className="p-5 w-64 space-y-0.5">
      {BUCKETS.map(b => (
        <SidebarNavItem
          key={b.value}
          label={b.label}
          count={b.count}
          active={active === b.value}
          onClick={() => setActive(b.value)}
        />
      ))}
    </div>
  );
}
