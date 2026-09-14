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

// An option can carry a `description` — a second muted line shown in the OPEN
// list only, for a label that is a term the user has to already know. The
// trigger stays one line, which is why this static capture shows the label
// alone: open the list in the live desktop to see the second line.
const TERMS = [
  { value: 'net_30', label: 'Net 30', description: 'Due 30 days after the invoice date.' },
  { value: 'net_60', label: 'Net 60', description: 'Due 60 days after the invoice date.' },
  { value: 'prepaid', label: 'Prepaid', description: 'Payment before the goods leave the factory.' },
];

export function OptionDescriptions() {
  const [terms, setTerms] = useState('net_30');
  return (
    <div className="max-w-md p-5">
      <Select value={terms} onChange={setTerms} options={TERMS} />
    </div>
  );
}
