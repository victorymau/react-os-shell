/**
 * Global-search demo wiring — a small in-memory "directory" of people and
 * projects, two SearchProviders that query it, and the ModalRegistryEntry
 * definitions so a clicked result opens a real entity window.
 *
 * Flow being showcased: ⌘K → type → results from both providers merge →
 * Enter/click → WindowManager.openEntity → the demo api client (see
 * demoApiClient.ts) resolves `GET /people/:id/` → the registry entry's
 * render() draws the detail modal.
 */
import { StatusBadge, type SearchConfig, type SearchResult } from 'react-os-shell';

export interface DirectoryPerson {
  id: number;
  name: string;
  role: string;
  department: string;
  email: string;
  status: 'active' | 'pending';
}

export interface DirectoryProject {
  id: number;
  name: string;
  owner: string;
  status: 'draft' | 'in_production' | 'approved' | 'overdue';
  due: string;
  summary: string;
}

export const DIRECTORY_PEOPLE: DirectoryPerson[] = [
  { id: 1, name: 'Ava Thompson', role: 'Product Designer', department: 'Design', email: 'ava@example.com', status: 'active' },
  { id: 2, name: 'Liam Chen', role: 'Frontend Engineer', department: 'Engineering', email: 'liam@example.com', status: 'active' },
  { id: 3, name: 'Sofia Garcia', role: 'Engineering Manager', department: 'Engineering', email: 'sofia@example.com', status: 'active' },
  { id: 4, name: 'Noah Patel', role: 'Data Analyst', department: 'Operations', email: 'noah@example.com', status: 'pending' },
  { id: 5, name: 'Mia Rossi', role: 'Account Executive', department: 'Sales', email: 'mia@example.com', status: 'active' },
  { id: 6, name: 'Ethan Walker', role: 'Backend Engineer', department: 'Engineering', email: 'ethan@example.com', status: 'active' },
  { id: 7, name: 'Isabella Nguyen', role: 'Content Strategist', department: 'Marketing', email: 'isabella@example.com', status: 'active' },
  { id: 8, name: 'Lucas Müller', role: 'DevOps Engineer', department: 'Engineering', email: 'lucas@example.com', status: 'pending' },
];

export const DIRECTORY_PROJECTS: DirectoryProject[] = [
  { id: 101, name: 'Website redesign', owner: 'Ava Thompson', status: 'in_production', due: '2026-07-15', summary: 'New marketing site on the refreshed brand system.' },
  { id: 102, name: 'Mobile app v2', owner: 'Sofia Garcia', status: 'draft', due: '2026-09-01', summary: 'Navigation rewrite plus offline-first sync layer.' },
  { id: 103, name: 'Billing migration', owner: 'Ethan Walker', status: 'overdue', due: '2026-05-30', summary: 'Move invoicing to the new ledger service.' },
  { id: 104, name: 'Q3 launch campaign', owner: 'Isabella Nguyen', status: 'approved', due: '2026-08-20', summary: 'Cross-channel campaign for the summer release.' },
];

const matches = (q: string, ...fields: string[]) =>
  fields.some(f => f.toLowerCase().includes(q.toLowerCase()));

/** Two providers so the merged-results behaviour is visible: the shell calls
 *  every provider in parallel and concatenates whatever comes back. */
export const DEMO_SEARCH: SearchConfig = {
  placeholder: 'Search people and projects…',
  providers: [
    async (q): Promise<SearchResult[]> =>
      DIRECTORY_PEOPLE
        .filter(p => matches(q, p.name, p.role, p.department))
        .map(p => ({
          type: 'Person',
          label: p.name,
          sub: `${p.role} · ${p.department}`,
          entity_type: 'person',
          entity_id: String(p.id),
        })),
    async (q): Promise<SearchResult[]> =>
      DIRECTORY_PROJECTS
        .filter(p => matches(q, p.name, p.owner, p.summary))
        .map(p => ({
          type: 'Project',
          label: p.name,
          sub: `${p.owner} · due ${p.due}`,
          entity_type: 'project',
          entity_id: String(p.id),
        })),
  ],
  typeIcons: {
    Person: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    Project: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m-12 0c-1.069.16-1.837 1.094-1.837 2.175v3.783c0 .627.285 1.22.75 1.661m16.5 0a48.667 48.667 0 01-16.5 0m12.75-9.928V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.884m7.5 0a48.11 48.11 0 00-7.5 0',
  },
};

const field = (label: string, value: ReactNodeLike) => (
  <div>
    <dt className="text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
    <dd className="text-sm text-gray-800 mt-0.5">{value}</dd>
  </div>
);
type ReactNodeLike = string | JSX.Element;

/** Entity windows the search results open into (registered in App.tsx). */
export const DEMO_ENTITY_WINDOWS = {
  person: {
    endpoint: '/people/',
    queryKey: 'person',
    size: 'sm',
    title: (p: DirectoryPerson) => p?.name ?? 'Person',
    render: (p: DirectoryPerson) => (
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-base font-semibold">
            {(p?.name ?? '?').split(' ').map(s => s[0]).slice(0, 2).join('')}
          </span>
          <div>
            <div className="text-base font-semibold text-gray-900">{p?.name}</div>
            <div className="text-xs text-gray-500">{p?.role}</div>
          </div>
          <span className="ml-auto"><StatusBadge status={p?.status ?? 'pending'} /></span>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {field('Department', p?.department ?? '—')}
          {field('Email', p?.email ?? '—')}
        </dl>
      </div>
    ),
  },
  project: {
    endpoint: '/projects/',
    queryKey: 'project',
    size: 'sm',
    title: (p: DirectoryProject) => p?.name ?? 'Project',
    render: (p: DirectoryProject) => (
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-semibold text-gray-900">{p?.name}</div>
          <StatusBadge status={p?.status ?? 'draft'} />
        </div>
        <p className="text-sm text-gray-600 mb-4">{p?.summary}</p>
        <dl className="grid grid-cols-2 gap-3">
          {field('Owner', p?.owner ?? '—')}
          {field('Due', p?.due ?? '—')}
        </dl>
      </div>
    ),
  },
};
