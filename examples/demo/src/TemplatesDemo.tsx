import { useState } from 'react';
import {
  Tabs,
  DashboardTemplate, DataTablePage, FormLayoutPage, CheckoutTemplate,
  EmailTemplate, ChatTemplate, GalleryTemplate, AuthScreen, ErrorPage,
} from 'react-os-shell';

/**
 * Switcher over the v3.4.0 page templates. Each template is a
 * zero-prop export composed from the kit's primitives; this demo just frames
 * one at a time so they can be eyeballed in the running shell.
 */
const TEMPLATES: { id: string; label: string; render: () => JSX.Element }[] = [
  { id: 'dashboard', label: 'Dashboard', render: () => <DashboardTemplate /> },
  { id: 'table', label: 'Data table', render: () => <DataTablePage /> },
  { id: 'form', label: 'Form', render: () => <FormLayoutPage /> },
  { id: 'checkout', label: 'Checkout', render: () => <CheckoutTemplate /> },
  { id: 'email', label: 'Email', render: () => <EmailTemplate /> },
  { id: 'chat', label: 'Chat', render: () => <ChatTemplate /> },
  { id: 'gallery', label: 'Gallery', render: () => <GalleryTemplate /> },
  { id: 'auth', label: 'Auth', render: () => <AuthScreen mode="login" /> },
  { id: 'error', label: 'Error', render: () => <ErrorPage code={404} /> },
];

export default function TemplatesDemo() {
  const [active, setActive] = useState('dashboard');
  const current = TEMPLATES.find(t => t.id === active) ?? TEMPLATES[0];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 overflow-x-auto border-b border-gray-200 px-3 py-2">
        <Tabs items={TEMPLATES.map(t => ({ id: t.id, label: t.label }))} value={active} onChange={setActive} variant="pill" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {current.render()}
      </div>
    </div>
  );
}
