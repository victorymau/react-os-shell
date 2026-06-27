import { useState } from 'react';
import { FilterBar } from 'react-os-shell';
import type { FilterOption } from 'react-os-shell';

// FilterBar — a horizontal row of filter controls. Short lists render a native
// <select>; long lists (>8 options) get a glass searchable dropdown. A "Clear
// filters" button appears once any filter is active.

const FILTERS: FilterOption[] = [
  { label: 'Status', field: 'status', options: [
    { value: 'open', label: 'Open' },
    { value: 'in_production', label: 'In Production' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'cancelled', label: 'Cancelled' },
  ] },
  { label: 'Warehouse', field: 'warehouse', options: [
    { value: 'syd', label: 'Sydney' }, { value: 'mel', label: 'Melbourne' },
    { value: 'bne', label: 'Brisbane' }, { value: 'per', label: 'Perth' },
    { value: 'adl', label: 'Adelaide' }, { value: 'cbr', label: 'Canberra' },
    { value: 'hba', label: 'Hobart' }, { value: 'drw', label: 'Darwin' },
    { value: 'ntl', label: 'Newcastle' }, { value: 'gld', label: 'Gold Coast' },
  ] },
];

export function Filters() {
  const [values, setValues] = useState<Record<string, string>>({ status: 'open' });
  return (
    <div className="p-5">
      <FilterBar
        filters={FILTERS}
        values={values}
        onChange={(field, value) => setValues(v => { const n = { ...v }; if (value) n[field] = value; else delete n[field]; return n; })}
        onClear={() => setValues({})}
      />
    </div>
  );
}
