/**
 * DataTablePage — a list/table screen: a toolbar (search + filter + action), a
 * static data table with status pills and row actions, and a Pagination footer.
 * Uses plain table markup (not the react-query-backed ResizableTable/EntityList)
 * so it renders standalone in design-sync.
 */
import { useState } from 'react';
import StatusBadge, { StatusBadgeProvider } from '../shell/StatusBadge';
import type { SemanticGroup } from '../shell/StatusBadge';
import Card from '../shell/Card';
import Button from '../forms/Button';
import Input from '../forms/Input';
import Select from '../forms/Select';
import Pagination from '../data/Pagination';

const GROUPS: Record<string, SemanticGroup> = {
  active: 'success', invited: 'queued', suspended: 'danger', pending: 'pending',
};

const ROWS = [
  { name: 'Alice Nguyen', email: 'alice@acme.co', role: 'Admin', status: 'active' },
  { name: 'Marco Reyes', email: 'marco@acme.co', role: 'Editor', status: 'invited' },
  { name: 'Priya Patel', email: 'priya@acme.co', role: 'Editor', status: 'active' },
  { name: 'Tom Becker', email: 'tom@acme.co', role: 'Viewer', status: 'suspended' },
  { name: 'Sara Lind', email: 'sara@acme.co', role: 'Viewer', status: 'pending' },
  { name: 'Yuki Tanaka', email: 'yuki@acme.co', role: 'Editor', status: 'active' },
];

export default function DataTablePage() {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');

  return (
    <StatusBadgeProvider groups={GROUPS}>
      <div className="h-full overflow-auto bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold text-gray-900">Members</h1>
            <Button size="sm">Invite member</Button>
          </div>

          <Card padded={false}>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
              <div className="min-w-48 flex-1">
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search members…" leftIcon={<SearchIcon />} />
              </div>
              <div className="w-40">
                <Select
                  value={role}
                  onChange={setRole}
                  placeholder="All roles"
                  options={[
                    { value: 'admin', label: 'Admin' },
                    { value: 'editor', label: 'Editor' },
                    { value: 'viewer', label: 'Viewer' },
                  ]}
                />
              </div>
              <Button variant="secondary" size="sm">Filter</Button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ROWS.map(r => (
                  <tr key={r.email} className="text-gray-700 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <div className="text-xs text-gray-400">{r.email}</div>
                    </td>
                    <td className="px-4 py-2.5">{r.role}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm">Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-gray-100 p-3">
              <span className="text-xs text-gray-400">Showing 1–6 of 48</span>
              <Pagination page={page} pageCount={8} onPageChange={setPage} showEdges />
            </div>
          </Card>
        </div>
      </div>
    </StatusBadgeProvider>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="9" r="6" /><path d="M14 14l3 3" strokeLinecap="round" />
    </svg>
  );
}
