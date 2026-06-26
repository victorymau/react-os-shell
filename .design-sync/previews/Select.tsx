import { useState } from 'react';
import { Select } from 'react-os-shell';

// Select — a styled native <select> for short fixed lists. Controlled via
// value + onChange(value). Use SearchableSelect for long/searchable lists.

const COUNTRIES = [
  { value: 'us', label: 'United States' },
  { value: 'de', label: 'Germany' },
  { value: 'jp', label: 'Japan' },
  { value: 'au', label: 'Australia' },
];

export function States() {
  const [a, setA] = useState('de');
  const [b, setB] = useState('');
  return (
    <div className="max-w-md space-y-3 p-5">
      <Select value={a} onChange={setA} options={COUNTRIES} />
      <Select value={b} onChange={setB} options={COUNTRIES} placeholder="Pick a country…" />
      <Select value="" onChange={() => {}} options={COUNTRIES} placeholder="Disabled" disabled />
    </div>
  );
}
