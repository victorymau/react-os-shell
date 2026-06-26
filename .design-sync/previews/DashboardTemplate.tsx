import { DashboardTemplate } from 'react-os-shell';

// DashboardTemplate — analytics dashboard starter (stat cards + charts + recent
// orders), composed from the kit's primitives. Self-contained; give the wrapper
// a real height since the page fills its container.

export function Dashboard() {
  return (
    <div style={{ height: 760 }}>
      <DashboardTemplate />
    </div>
  );
}
