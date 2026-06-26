import { useState } from 'react';
import { Tabs } from 'react-os-shell';

// Tabs — controlled in-content tab strip. The consumer renders the active
// panel. `underline` (default) and `pill` (accent-filled) variants.

const ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
];

export function Underline() {
  const [v, setV] = useState('overview');
  return (
    <div className="max-w-lg p-5">
      <Tabs items={ITEMS} value={v} onChange={setV} />
      <p className="mt-3 text-sm text-gray-600">Showing the “{v}” panel.</p>
    </div>
  );
}

export function Pill() {
  const [v, setV] = useState('activity');
  return (
    <div className="max-w-lg p-5">
      <Tabs items={ITEMS} value={v} onChange={setV} variant="pill" />
    </div>
  );
}
