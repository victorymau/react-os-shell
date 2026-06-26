import { useState } from 'react';
import { Radio } from 'react-os-shell';

// Radio — group several by sharing a `name`; each is controlled via
// checked + onChange(checked).

export function Group() {
  const [plan, setPlan] = useState('pro');
  return (
    <div className="max-w-md space-y-2 p-5">
      <Radio name="plan" checked={plan === 'free'} onChange={() => setPlan('free')} label="Free" description="For personal projects." />
      <Radio name="plan" checked={plan === 'pro'} onChange={() => setPlan('pro')} label="Pro" description="For growing teams." />
      <Radio name="plan" checked={plan === 'team'} onChange={() => setPlan('team')} label="Team" description="Advanced controls." />
    </div>
  );
}
