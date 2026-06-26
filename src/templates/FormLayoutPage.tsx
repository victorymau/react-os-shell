/**
 * FormLayoutPage — a settings/profile form screen: grouped Cards of FormFields
 * wrapping the kit's inputs (Input, Textarea, Select, Checkbox, Radio), with a
 * sticky-feeling action row. The canonical "real form" reference.
 */
import { useState } from 'react';
import Card from '../shell/Card';
import Button from '../forms/Button';
import Input from '../forms/Input';
import Textarea from '../forms/Textarea';
import Select from '../forms/Select';
import Checkbox from '../forms/Checkbox';
import Radio from '../forms/Radio';
import FormField from '../forms/FormField';

export default function FormLayoutPage() {
  const [plan, setPlan] = useState('pro');
  const [newsletter, setNewsletter] = useState(true);
  const [country, setCountry] = useState('us');

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6">
      <form className="mx-auto max-w-2xl space-y-5" onSubmit={e => e.preventDefault()}>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Account settings</h1>
          <p className="text-sm text-gray-500">Update your profile and preferences.</p>
        </div>

        <Card header="Profile">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="First name" htmlFor="fn" required>
                <Input id="fn" defaultValue="Alice" />
              </FormField>
              <FormField label="Last name" htmlFor="ln" required>
                <Input id="ln" defaultValue="Nguyen" />
              </FormField>
            </div>
            <FormField label="Email" htmlFor="email" hint="We'll never share your email.">
              <Input id="email" type="email" defaultValue="alice@acme.co" />
            </FormField>
            <FormField label="Bio" htmlFor="bio" hint="Brief description for your profile.">
              <Textarea id="bio" autoGrow defaultValue="Product designer at Acme." />
            </FormField>
          </div>
        </Card>

        <Card header="Preferences">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Country" htmlFor="country">
                <Select
                  value={country}
                  onChange={setCountry}
                  options={[
                    { value: 'us', label: 'United States' },
                    { value: 'de', label: 'Germany' },
                    { value: 'jp', label: 'Japan' },
                  ]}
                />
              </FormField>
              <FormField label="Plan">
                <div className="space-y-1.5 pt-1">
                  <Radio name="plan" checked={plan === 'free'} onChange={() => setPlan('free')} label="Free" />
                  <Radio name="plan" checked={plan === 'pro'} onChange={() => setPlan('pro')} label="Pro" />
                  <Radio name="plan" checked={plan === 'team'} onChange={() => setPlan('team')} label="Team" />
                </div>
              </FormField>
            </div>
            <Checkbox checked={newsletter} onChange={setNewsletter} label="Email me product updates" description="Occasional news — no more than once a month." />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary">Cancel</Button>
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </div>
  );
}
