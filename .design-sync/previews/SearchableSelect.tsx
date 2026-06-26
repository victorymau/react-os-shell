import { SearchableSelect, StatusBadge, StatusBadgeProvider, type SearchableOption, type SemanticGroup } from 'react-os-shell';

// SearchableSelect is a combobox-style form input: focus and type to filter a
// fixed list, Enter picks a unique match, hover for the clear ×. It supports
// sublabels, a right-adornment slot, allowFreeText, async onSearchChange, and
// a disabled state. These static cells show the closed trigger across variants.

const COUNTRIES: SearchableOption[] = [
  { value: 'de', label: 'Germany', sublabel: 'EU' },
  { value: 'fr', label: 'France', sublabel: 'EU' },
  { value: 'nl', label: 'Netherlands', sublabel: 'EU' },
  { value: 'uk', label: 'United Kingdom', sublabel: 'EMEA' },
  { value: 'us', label: 'United States', sublabel: 'AMER' },
  { value: 'jp', label: 'Japan', sublabel: 'APAC' },
  { value: 'au', label: 'Australia', sublabel: 'APAC' },
];

const ORDERS: SearchableOption[] = [
  { value: 'so-27201', label: 'SO#27201 — Alpine Wheels GmbH', sublabel: 'Jun 02' },
  { value: 'so-27188', label: 'SO#27188 — Kessler Automotive', sublabel: 'May 28' },
  { value: 'so-27165', label: 'SO#27165 — Nordlicht Motors', sublabel: 'May 21' },
];

const GROUPS: Record<string, SemanticGroup> = { in_production: 'active' };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export function EmptyAndSelected() {
  return (
    <div className="p-5 max-w-md space-y-5">
      <Field label="Empty" hint="Placeholder shown until a country is picked.">
        <SearchableSelect value="" onChange={() => {}} options={COUNTRIES} placeholder="Pick a country…" />
      </Field>
      <Field label="Selected">
        <SearchableSelect value="de" onChange={() => {}} options={COUNTRIES} placeholder="Pick a country…" />
      </Field>
    </div>
  );
}

export function WithRightAdornment() {
  return (
    <StatusBadgeProvider groups={GROUPS}>
      <div className="p-5 max-w-md">
        <Field label="Sublabels + right adornment" hint="A status pill rides in the field; sublabels are searchable too.">
          <SearchableSelect
            value="so-27201"
            onChange={() => {}}
            options={ORDERS}
            placeholder="Pick a sales order…"
            rightAdornment={<StatusBadge status="in_production" />}
          />
        </Field>
      </div>
    </StatusBadgeProvider>
  );
}

export function FreeTextAndDisabled() {
  return (
    <div className="p-5 max-w-md space-y-5">
      <Field label="Free text (allowFreeText)" hint="Pick a suggestion or type your own and press Enter.">
        <SearchableSelect
          value="q3-launch"
          onChange={() => {}}
          options={[
            { value: 'urgent', label: 'urgent' },
            { value: 'follow-up', label: 'follow-up' },
            { value: 'q3-launch', label: 'q3-launch' },
          ]}
          placeholder="Add a tag…"
          allowFreeText
        />
      </Field>
      <Field label="Disabled">
        <SearchableSelect value="" onChange={() => {}} options={COUNTRIES} placeholder="Locked while the order is posted" disabled />
      </Field>
    </div>
  );
}
