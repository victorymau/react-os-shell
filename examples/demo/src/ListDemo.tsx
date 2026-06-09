import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EntityList, type EntityListColumn } from 'react-os-shell';

/**
 * Demo for the shell's <EntityList> primitive — the resizable, sortable data
 * grid behind every list view in the app. Click a header to sort, drag a column
 * border to resize (widths persist per `tableId`), tick rows to select, and
 * click a row to "open" it. Data is static local state here; a real app feeds
 * it a fetched page and wires the sticky footer to infinite scroll.
 */
interface Person {
  id: number;
  name: string;
  role: string;
  department: string;
  status: 'Active' | 'Onboarding' | 'On leave';
  joined: string; // ISO date
}

const PEOPLE: Person[] = [
  { id: 1, name: 'Ava Thompson', role: 'Product Designer', department: 'Design', status: 'Active', joined: '2023-02-14' },
  { id: 2, name: 'Liam Chen', role: 'Frontend Engineer', department: 'Engineering', status: 'Active', joined: '2022-09-01' },
  { id: 3, name: 'Sofia Garcia', role: 'Engineering Manager', department: 'Engineering', status: 'Active', joined: '2021-05-20' },
  { id: 4, name: 'Noah Patel', role: 'Data Analyst', department: 'Operations', status: 'Onboarding', joined: '2026-05-04' },
  { id: 5, name: 'Mia Rossi', role: 'Account Executive', department: 'Sales', status: 'Active', joined: '2024-01-08' },
  { id: 6, name: 'Ethan Walker', role: 'Backend Engineer', department: 'Engineering', status: 'On leave', joined: '2023-11-30' },
  { id: 7, name: 'Isabella Nguyen', role: 'Content Strategist', department: 'Marketing', status: 'Active', joined: '2022-03-17' },
  { id: 8, name: 'Lucas Müller', role: 'DevOps Engineer', department: 'Engineering', status: 'Active', joined: '2024-08-12' },
  { id: 9, name: 'Amelia Davis', role: 'UX Researcher', department: 'Design', status: 'Onboarding', joined: '2026-04-21' },
  { id: 10, name: 'Oliver Brown', role: 'Sales Manager', department: 'Sales', status: 'Active', joined: '2020-10-05' },
  { id: 11, name: 'Charlotte Kim', role: 'Finance Lead', department: 'Operations', status: 'Active', joined: '2021-07-19' },
  { id: 12, name: 'James Wilson', role: 'Support Specialist', department: 'Support', status: 'On leave', joined: '2023-06-26' },
];

const COLUMNS: EntityListColumn[] = [
  { key: 'name', label: 'Name', defaultWidth: 200, sortField: 'name' },
  { key: 'role', label: 'Role', defaultWidth: 200, sortField: 'role' },
  { key: 'department', label: 'Department', defaultWidth: 160, sortField: 'department' },
  { key: 'status', label: 'Status', defaultWidth: 130, sortField: 'status' },
  { key: 'joined', label: 'Joined', defaultWidth: 130, sortField: 'joined' },
];

const STATUS_STYLES: Record<Person['status'], string> = {
  Active: 'bg-green-100 text-green-700',
  Onboarding: 'bg-sky-100 text-sky-700',
  'On leave': 'bg-amber-100 text-amber-700',
};

export default function ListDemo() {
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({ field: 'name', direction: 'asc' });
  const [lastOpened, setLastOpened] = useState<Person | null>(null);

  const items = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...PEOPLE].sort((a, b) => {
      const av = String(a[sort.field as keyof Person]);
      const bv = String(b[sort.field as keyof Person]);
      return av.localeCompare(bv, undefined, { numeric: true }) * dir;
    });
  }, [sort]);

  const onSort = (field: string) =>
    setSort(prev =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );

  const renderCell = (p: Person, key: string): ReactNode => {
    switch (key) {
      case 'name':
        return <span className="font-medium text-gray-900">{p.name}</span>;
      case 'status':
        return (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[p.status]}`}>
            {p.status}
          </span>
        );
      case 'joined':
        return (
          <span className="text-gray-500">
            {new Date(p.joined).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        );
      case 'role':
        return p.role;
      case 'department':
        return p.department;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <h1 className="text-sm font-semibold text-gray-900">List</h1>
        <p className="mt-0.5 text-xs text-gray-500">
          The shell&apos;s <code>EntityList</code> — click a header to sort, drag a column edge to resize, tick
          rows to select.{' '}
          {lastOpened ? (
            <>
              Last opened: <span className="font-medium text-gray-700">{lastOpened.name}</span>.
            </>
          ) : (
            'Click a row to “open” it.'
          )}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <EntityList<Person>
          tableId="demo.people"
          items={items}
          isLoading={false}
          columns={COLUMNS}
          renderCell={renderCell}
          sort={sort}
          onSort={onSort}
          selected={selected}
          setSelected={setSelected}
          onRowClick={setLastOpened}
          footerLabel={`${items.length} people${selected.size ? ` · ${selected.size} selected` : ''}`}
          emptyState={<div className="p-4 text-sm text-gray-500">No people.</div>}
        />
      </div>
    </div>
  );
}
