import { useState } from 'react';
import {
  Button, Input, Textarea, Select, Checkbox, Radio, FormField,
  Card, StatCard, Avatar, AvatarGroup, Banner, Tabs, Accordion, Tooltip,
  Pagination, Sparkline, BarChart, DonutChart,
  MetricBar, SidebarNavItem, SidebarGroupLabel, type SeverityTone,
} from 'react-os-shell';

/**
 * Showcase for the v3.4.0 UI primitives — form controls, display/layout
 * primitives, and the dependency-free charts. Mirrors the design-sync previews
 * so they can be eyeballed in the running shell (light + dark themes).
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

const SERIES = [4, 6, 5, 8, 7, 11, 9, 13, 12, 16, 14, 18];

/** Severity rolled up per section by the app — the sidebar renders a tone, it
 *  never computes one. `Overview` makes no health claim, so it omits it. */
const SECTIONS: { id: string; label: string; count?: number; severity?: SeverityTone }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'compute', label: 'Compute', count: 3, severity: 'success' },
  { id: 'storage', label: 'Storage', count: 4, severity: 'danger' },
  { id: 'workers', label: 'Workers', count: 6, severity: 'warning' },
];

export default function PrimitivesDemo() {
  const [tab, setTab] = useState('overview');
  const [plan, setPlan] = useState('pro');
  const [agree, setAgree] = useState(true);
  const [country, setCountry] = useState('us');
  const [page, setPage] = useState(3);
  const [section, setSection] = useState('storage');

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

        <Section title="Charts (dependency-free SVG)">
          <div className="flex flex-wrap items-center gap-8">
            <div className="text-blue-600"><Sparkline data={SERIES} width={160} height={40} fill="rgba(37,99,235,0.12)" /></div>
            <div className="w-48 text-emerald-600"><BarChart data={SERIES} height={120} /></div>
            <DonutChart
              size={120} thickness={16} centerLabel={<span className="text-gray-900">100%</span>}
              segments={[{ label: 'Direct', value: 45 }, { label: 'Search', value: 30 }, { label: 'Social', value: 15 }, { label: 'Email', value: 10 }]}
            />
          </div>
        </Section>

        <Section title="Metrics & severity">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 text-sm font-medium text-gray-900">web-01 · ap-southeast-2</div>
              <div className="space-y-3">
                <MetricBar label="CPU" value={23.4} warn={80} crit={90} detail="4 vCPU" />
                <MetricBar label="Memory" value={82.1} warn={80} crit={90} detail="13.1 / 16 GiB" />
                <MetricBar label="Disk" value={94.2} warn={80} crit={90} detail="94.2 / 100 GiB" />
                {/* null is not zero: dashed empty track, never a green sliver. */}
                <MetricBar label="Swap" value={null} warn={80} crit={90} />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-2">
              <SidebarGroupLabel>Sections</SidebarGroupLabel>
              {SECTIONS.map(s => (
                <SidebarNavItem
                  key={s.id}
                  label={s.label}
                  count={s.count}
                  severity={s.severity}
                  active={section === s.id}
                  onClick={() => setSection(s.id)}
                />
              ))}
              <p className="px-2.5 pt-2 text-[11px] italic text-gray-400">
                The marker is the sidebar's alarm surface — a problem several levels down stays
                visible on the item that leads to it.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
