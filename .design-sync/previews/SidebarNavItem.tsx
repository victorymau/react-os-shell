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

// A 16px glyph before the label and a slot after the count. The icon repeats
// what the same destination shows in the Start menu, so one place looks like
// one place; the trailing slot carries what the count cannot say — a plan
// chip, an "leaves the shell" mark, a sync state.
//
// The glyph is a step quieter than the words it introduces: gray-400 against
// the label's gray-700, blue-600 against the active row's blue-700.

function BoxGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function UsersGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5-2m-2 4H2v-2a3 3 0 015-2m10-4a3 3 0 10-6 0 3 3 0 006 0zm5-3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ReportsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6m3 6V7m3 10v-3M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
    </svg>
  );
}

function ExternalMark() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5m0-5l-8 8M17 14v5H5V7h5" />
    </svg>
  );
}

export function IconsAndTrailing() {
  const [active, setActive] = useState('inventory');
  return (
    <div className="p-5 w-64 space-y-0.5">
      <SidebarNavItem
        label="Inventory" icon={<BoxGlyph />} count={214}
        active={active === 'inventory'} onClick={() => setActive('inventory')}
      />
      <SidebarNavItem
        label="Customers" icon={<UsersGlyph />} count={38}
        active={active === 'customers'} onClick={() => setActive('customers')}
      />
      <SidebarNavItem
        label="Reports" icon={<ReportsGlyph />}
        trailing={<span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Beta</span>}
        active={active === 'reports'} onClick={() => setActive('reports')}
      />
      <SidebarNavItem
        label="Status page" trailing={<ExternalMark />}
        active={active === 'status'} onClick={() => setActive('status')}
      />
      {/* Both slots and a severity at once — icon, then dot, then label, then
          count, then the chip. The dot stays against the label whatever else
          is on the row. */}
      <SidebarNavItem
        label="Warehouse sync" icon={<BoxGlyph />} severity="warning" count={2}
        trailing={<span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-600">AU</span>}
        active={active === 'sync'} onClick={() => setActive('sync')}
      />
    </div>
  );
}

// `label` is a ReactNode, so an item can carry the markup its own name needs —
// here the legal suffix set back from the trading name it is filed under. Only
// a plain string gets the truncation tooltip: there is no text to read out of a
// node without walking it, and `title="[object Object]"` is worse than none.
export function NodeLabels() {
  return (
    <div className="p-5 w-64 space-y-0.5">
      <SidebarNavItem
        label={<><span className="font-medium">Northline</span> <span className="text-gray-400">Wheels Pty Ltd</span></>}
        count={12} active={false} onClick={() => {}}
      />
      <SidebarNavItem
        label={<><span className="font-medium">Apex</span> <span className="text-gray-400">Automotive</span></>}
        count={4} active onClick={() => {}}
      />
      {/* A long plain-string label: `min-w-0 truncate` ellipses it and keeps
          the count on the row, and the whole name is on the title. */}
      <SidebarNavItem
        label="Melbourne South Distribution Centre" count={81} active={false} onClick={() => {}}
      />
    </div>
  );
}
