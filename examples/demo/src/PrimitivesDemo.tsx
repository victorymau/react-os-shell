import { useState } from 'react';
import {
  Button, Input, Textarea, Select, Checkbox, Radio, FormField,
  Card, StatCard, Avatar, AvatarGroup, Banner, Tabs, Accordion, Tooltip,
  Pagination,
} from 'react-os-shell';

/**
 * Showcase for the v3.4.0 UI primitives — form controls plus the display/layout
 * primitives. Mirrors the design-sync previews so they can be eyeballed in the
 * running shell (light + dark themes).
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

export default function PrimitivesDemo() {
  const [tab, setTab] = useState('overview');
  const [plan, setPlan] = useState('pro');
  const [agree, setAgree] = useState(true);
  const [country, setCountry] = useState('us');
  const [page, setPage] = useState(3);

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-8">
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button loading>Saving…</Button>
            <Button size="sm" leftIcon={<span aria-hidden>＋</span>}>New</Button>
          </div>
        </Section>

        <Section title="Form controls">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Email" htmlFor="p-email" required hint="We'll never share it.">
              <Input id="p-email" type="email" defaultValue="alice@acme.co" />
            </FormField>
            <FormField label="Country" htmlFor="p-country">
              <Select
                id="p-country" value={country} onChange={setCountry}
                options={[{ value: 'us', label: 'United States' }, { value: 'de', label: 'Germany' }, { value: 'jp', label: 'Japan' }]}
              />
            </FormField>
            <FormField label="Bio" htmlFor="p-bio" className="sm:col-span-2">
              <Textarea id="p-bio" autoGrow defaultValue="Product designer at Acme." />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Checkbox checked={agree} onChange={setAgree} label="Email me updates" />
            <div className="flex gap-4">
              <Radio name="p-plan" checked={plan === 'free'} onChange={() => setPlan('free')} label="Free" />
              <Radio name="p-plan" checked={plan === 'pro'} onChange={() => setPlan('pro')} label="Pro" />
              <Radio name="p-plan" checked={plan === 'team'} onChange={() => setPlan('team')} label="Team" />
            </div>
          </div>
        </Section>

        <Section title="Cards & stats">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Revenue" value="$38.2k" delta={{ value: '12%', direction: 'up' }} />
            <StatCard label="Orders" value="1,204" delta={{ value: '4%', direction: 'up' }} />
            <StatCard label="Customers" value="892" delta={{ value: '2%', direction: 'down' }} />
            <StatCard label="Refunds" value="$1.1k" delta={{ value: '0%', direction: 'flat' }} />
          </div>
          <Card header="Team plan" footer={<div className="flex justify-end"><Button size="sm">Upgrade</Button></div>}>
            <p className="text-sm text-gray-600">Unlimited projects, priority support, and SSO.</p>
          </Card>
        </Section>

        <Section title="Avatars">
          <div className="flex items-center gap-4">
            <Avatar size="sm" name="Alice Nguyen" status="online" />
            <Avatar size="md" name="Marco Reyes" status="busy" />
            <Avatar size="lg" name="Priya Patel" status="away" />
            <AvatarGroup max={3} size="md">
              <Avatar size="md" name="Alice Nguyen" />
              <Avatar size="md" name="Marco Reyes" />
              <Avatar size="md" name="Priya Patel" />
              <Avatar size="md" name="Tom Becker" />
              <Avatar size="md" name="Sara Lind" />
            </AvatarGroup>
          </div>
        </Section>

        <Section title="Banners">
          <div className="space-y-3">
            <Banner tone="info" title="Heads up">A new version is available.</Banner>
            <Banner tone="success" title="Saved">Your changes were published.</Banner>
            <Banner tone="warning" title="Usage limit near">You've used 90% of your quota.</Banner>
            <Banner tone="danger" title="Payment failed" onDismiss={() => {}}>Update your card to continue.</Banner>
          </div>
        </Section>

        <Section title="Tabs & accordion">
          <Tabs
            value={tab} onChange={setTab}
            items={[{ id: 'overview', label: 'Overview' }, { id: 'activity', label: 'Activity' }, { id: 'settings', label: 'Settings' }]}
          />
          <p className="text-sm text-gray-600">Showing the “{tab}” panel.</p>
          <Accordion
            defaultOpenIds={['a']}
            items={[
              { id: 'a', title: 'What is included?', content: 'Unlimited projects and priority support.' },
              { id: 'b', title: 'Can I change plans later?', content: 'Yes, anytime from billing settings.' },
            ]}
          />
        </Section>

        <Section title="Tooltip & pagination">
          <div className="flex items-center gap-4">
            <Tooltip content="Saves to the cloud"><Button variant="secondary" size="sm">Hover me</Button></Tooltip>
            <Pagination page={page} pageCount={12} onPageChange={setPage} showEdges />
          </div>
        </Section>
      </div>
    </div>
  );
}
