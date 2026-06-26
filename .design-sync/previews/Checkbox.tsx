import { useState } from 'react';
import { Checkbox } from 'react-os-shell';

// Checkbox — controlled via checked + onChange(checked). With a label/description
// it renders a clickable row; the fill follows the active accent.

export function WithLabels() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div className="max-w-md space-y-3 p-5">
      <Checkbox checked={a} onChange={setA} label="Email me product updates" description="No more than once a month." />
      <Checkbox checked={b} onChange={setB} label="Enable two-factor auth" />
      <Checkbox checked onChange={() => {}} disabled label="Required (locked)" />
    </div>
  );
}
