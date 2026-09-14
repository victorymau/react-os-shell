import { useState } from 'react';
import { RadioGroup } from 'react-os-shell';

// RadioGroup — one choice from a short visible list, with the group chrome
// Radio alone leaves to the caller: a role="radiogroup" named by its label,
// and the hint / error / required wiring FormField already owns.

const TERMS = [
  { value: 'net_30', label: 'Net 30', description: 'Due 30 days after the invoice date.' },
  { value: 'net_60', label: 'Net 60', description: 'Due 60 days after the invoice date.' },
  { value: 'prepaid', label: 'Prepaid', description: 'Payment before the goods leave the factory.' },
];

export function WithDescriptions() {
  const [terms, setTerms] = useState('net_30');
  return (
    <div className="max-w-md p-5">
      <RadioGroup
        name="terms"
        label="Payment terms"
        hint="Applies to every order on this account."
        value={terms}
        onChange={setTerms}
        options={TERMS}
      />
    </div>
  );
}

// Horizontal, for two or three short labels. It wraps rather than compressing.
export function Horizontal() {
  const [unit, setUnit] = useState('kg');
  return (
    <div className="max-w-md p-5">
      <RadioGroup
        name="unit"
        label="Weight unit"
        orientation="horizontal"
        value={unit}
        onChange={setUnit}
        options={[
          { value: 'kg', label: 'Kilograms' },
          { value: 'lb', label: 'Pounds' },
          { value: 't', label: 'Tonnes' },
        ]}
      />
    </div>
  );
}

// Nothing chosen yet is a real state, and it is the one a required group fails
// validation in. A disabled option stays legible and unreachable.
export function RequiredAndDisabled() {
  return (
    <div className="max-w-md space-y-6 p-5">
      <RadioGroup
        name="terms-error"
        label="Payment terms"
        required
        error="Choose the terms before saving."
        value={null}
        onChange={() => {}}
        options={TERMS}
      />
      <RadioGroup
        name="ship"
        label="Shipping"
        hint="Air freight is unavailable for this destination."
        value="sea"
        onChange={() => {}}
        options={[
          { value: 'sea', label: 'Sea freight', description: '28–35 days, door to door.' },
          { value: 'air', label: 'Air freight', description: '5–7 days.', disabled: true },
        ]}
      />
    </div>
  );
}
