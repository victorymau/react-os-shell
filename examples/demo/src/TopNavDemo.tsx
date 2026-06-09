import { useState } from 'react';
import { TopNav, type TopNavItem } from 'react-os-shell';

/**
 * Demo for the shell's <TopNav> primitive — a horizontal tab bar with an
 * optional brand on the left and actions on the right. Controlled: the active
 * tab gets an accent underline. Tabs can carry an icon, a badge (e.g. a count),
 * and be disabled. The window registers with `flushBody: true` so the bar runs
 * edge-to-edge under the title bar.
 */
const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const TABS: TopNavItem[] = [
  { key: 'overview', label: 'Overview', icon: icon('M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L21.75 12M4.5 9.75v9.75a.75.75 0 00.75.75H9V15a.75.75 0 01.75-.75h4.5A.75.75 0 0115 15v5.25h3.75a.75.75 0 00.75-.75V9.75') },
  { key: 'analytics', label: 'Analytics', icon: icon('M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z') },
  { key: 'reports', label: 'Reports', icon: icon('M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'), badge: 3 },
  { key: 'team', label: 'Team', icon: icon('M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z') },
  { key: 'archived', label: 'Archived', icon: icon('M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'), disabled: true },
];

const CONTENT: Record<string, { title: string; body: string }> = {
  overview: { title: 'Overview', body: 'A snapshot of the workspace. The active tab gets the accent underline; click another tab to switch panes — TopNav is controlled, so the parent owns which key is active.' },
  analytics: { title: 'Analytics', body: 'Charts and trends would live here. Tabs accept any React node for their label and an optional 4×4 icon, shown before the label.' },
  reports: { title: 'Reports', body: 'This tab carries a badge (3) — pass any node as `badge` to surface a count, a dot, or a “New” pill after the label.' },
  team: { title: 'Team', body: 'Members and roles. The right-hand `actions` slot is pinned to the far edge — drop buttons, a search box, or an avatar there.' },
  archived: { title: 'Archived', body: '' },
};

export default function TopNavDemo() {
  const [active, setActive] = useState('overview');
  const c = CONTENT[active] ?? CONTENT.overview;

  return (
    <div className="flex h-full flex-col">
      <TopNav
        items={TABS}
        activeKey={active}
        onSelect={setActive}
        brand={
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">A</span>
            <span>Acme</span>
          </>
        }
        actions={
          <>
            <button className="rounded-md px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-100">Search</button>
            <button className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700">New project</button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <h1 className="text-lg font-semibold text-gray-900">{c.title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600">{c.body}</p>
        <p className="mt-6 border-t border-gray-100 pt-3 text-[11px] italic text-gray-400">
          Active tab: <code>{active}</code>. The “Archived” tab is <code>disabled</code>.
        </p>
      </div>
    </div>
  );
}
