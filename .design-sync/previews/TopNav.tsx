import { TopNav, type TopNavItem } from 'react-os-shell';

// TopNav is a horizontal tab bar with an optional brand (left) and actions
// (right). The active key gets the accent underline. Tabs can carry an icon,
// a badge (a count or pill), and a disabled flag.

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const HOME = 'M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L21.75 12M4.5 9.75v9.75a.75.75 0 00.75.75H9V15a.75.75 0 01.75-.75h4.5A.75.75 0 0115 15v5.25h3.75a.75.75 0 00.75-.75V9.75';
const BARS = 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z';
const DOC = 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z';
const TEAM = 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z';

const brand = (
  <>
    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">A</span>
    <span>Acme</span>
  </>
);

const actions = (
  <>
    <button className="rounded-md px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-100">Search</button>
    <button className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700">New project</button>
  </>
);

export function WithBrandAndActions() {
  const items: TopNavItem[] = [
    { key: 'overview', label: 'Overview', icon: icon(HOME) },
    { key: 'analytics', label: 'Analytics', icon: icon(BARS) },
    { key: 'reports', label: 'Reports', icon: icon(DOC), badge: 3 },
    { key: 'team', label: 'Team', icon: icon(TEAM) },
    { key: 'archived', label: 'Archived', icon: icon(DOC), disabled: true },
  ];
  return (
    <div className="p-5">
      <TopNav items={items} activeKey="analytics" brand={brand} actions={actions} />
    </div>
  );
}

export function PlainTabs() {
  const items: TopNavItem[] = [
    { key: 'general', label: 'General' },
    { key: 'members', label: 'Members' },
    { key: 'billing', label: 'Billing' },
    { key: 'advanced', label: 'Advanced' },
  ];
  return (
    <div className="p-5">
      <TopNav items={items} activeKey="general" />
    </div>
  );
}

export function WithBadges() {
  const items: TopNavItem[] = [
    { key: 'inbox', label: 'Inbox', badge: 12 },
    { key: 'mentions', label: 'Mentions', badge: 3 },
    { key: 'archived', label: 'Archived' },
  ];
  return (
    <div className="p-5">
      <TopNav items={items} activeKey="inbox" />
    </div>
  );
}
