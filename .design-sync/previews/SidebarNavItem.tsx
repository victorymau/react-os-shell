import { useState } from 'react';
import { SidebarNavItem, type SeverityTone } from 'react-os-shell';

// SidebarNavItem — a pill-style sidebar button with an optional count badge, an
// optional severity marker and an active state. Count fetching and the severity
// rollup both stay in the consuming app.

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

// The sidebar as an alarm surface: each section carries the worst severity of
// what's inside it, so a problem several levels down is visible without opening
// anything. Sections that make no health claim (Overview) simply omit it.
const SECTIONS: { value: string; label: string; count?: number; severity?: SeverityTone }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'compute', label: 'Compute', count: 3, severity: 'success' },
  { value: 'storage', label: 'Storage', count: 4, severity: 'danger' },
  { value: 'workers', label: 'Workers', count: 6, severity: 'warning' },
  { value: 'database', label: 'Database', count: 2, severity: 'success' },
];

export function Severity() {
  const [active, setActive] = useState('storage');
  return (
    <div className="p-5 w-64 space-y-0.5">
      {SECTIONS.map(s => (
        <SidebarNavItem
          key={s.value}
          label={s.label}
          count={s.count}
          severity={s.severity}
          active={active === s.value}
          onClick={() => setActive(s.value)}
        />
      ))}
    </div>
  );
}

// A severity normally arrives from a backend rollup, where the compiler cannot
// follow it. A token outside `success | warning | danger` therefore has to be a
// render state of its own: grey dot, red edge, the token named in the tooltip
// and to a screen reader, and one console line. It must never render as
// nothing — this item is often the only place a deep alarm surfaces, so a
// marker that vanishes on a typo turns the safety feature into the outage.
const STALE_ROLLUP = [
  { value: 'compute', label: 'Compute', count: 3, severity: 'success' },
  // The operational dialect, and the displayed word round-tripped back in.
  { value: 'storage', label: 'Storage', count: 4, severity: 'crit' },
  { value: 'workers', label: 'Workers', count: 6, severity: 'critical' },
];

export function UnknownSeverity() {
  return (
    <div className="p-5 w-64 space-y-0.5">
      {STALE_ROLLUP.map(s => (
        <SidebarNavItem
          key={s.value}
          label={s.label}
          count={s.count}
          // Deliberately unchecked: this story exists to show the fallback.
          severity={s.severity as SeverityTone}
          active={false}
          onClick={() => {}}
        />
      ))}
    </div>
  );
}
