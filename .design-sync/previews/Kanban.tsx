import { Kanban } from 'react-os-shell';

// Kanban lays items into columns (columnOf maps an item to a column value),
// sorts within a column via sortInColumn, and provides the card chrome —
// renderCard supplies only the inner content. onMove/onAddItem are wired in a
// real app; here the board is a populated static composition.

interface Task {
  id: string;
  title: string;
  status: string;
  order: number;
  tag: string;
}

const COLUMNS = [
  { value: 'todo', label: 'To Do', accent: 'text-slate-700 bg-slate-100', dot: 'bg-slate-400' },
  { value: 'in_progress', label: 'In Progress', accent: 'text-sky-700 bg-sky-50', dot: 'bg-sky-500' },
  { value: 'review', label: 'Review', accent: 'text-amber-700 bg-amber-50', dot: 'bg-amber-500' },
  { value: 'done', label: 'Done', accent: 'text-green-700 bg-green-50', dot: 'bg-green-500' },
];

const TASKS: Task[] = [
  { id: 't1', title: 'Design the empty states', status: 'todo', order: 0, tag: 'Design' },
  { id: 't2', title: 'Write the onboarding copy', status: 'todo', order: 1, tag: 'Content' },
  { id: 't3', title: 'Audit colour contrast', status: 'todo', order: 2, tag: 'A11y' },
  { id: 't5', title: 'Build the settings panel', status: 'in_progress', order: 0, tag: 'Frontend' },
  { id: 't6', title: 'Drag-and-drop reordering', status: 'in_progress', order: 1, tag: 'Frontend' },
  { id: 't7', title: 'Keyboard shortcuts pass', status: 'review', order: 0, tag: 'Frontend' },
  { id: 't8', title: 'Set up the CI pipeline', status: 'done', order: 0, tag: 'Infra' },
  { id: 't9', title: 'Pick the icon set', status: 'done', order: 1, tag: 'Design' },
];

const TAG_STYLE: Record<string, string> = {
  Design: 'bg-purple-100 text-purple-700',
  Content: 'bg-blue-100 text-blue-700',
  A11y: 'bg-rose-100 text-rose-700',
  Frontend: 'bg-sky-100 text-sky-700',
  Infra: 'bg-emerald-100 text-emerald-700',
};

export function PopulatedBoard() {
  return (
    <div className="flex flex-col p-5" style={{ height: 460 }}>
      <Kanban<Task>
        items={TASKS}
        columns={COLUMNS}
        columnOf={t => t.status}
        getId={t => t.id}
        sortInColumn={(a, b) => a.order - b.order}
        onMove={() => {}}
        onAddItem={() => {}}
        columnEmptyText="Drop tasks here"
        renderCard={t => (
          <div className="space-y-1.5">
            <div className="text-sm leading-snug text-gray-800">{t.title}</div>
            <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${TAG_STYLE[t.tag] ?? 'bg-gray-100 text-gray-600'}`}>
              {t.tag}
            </span>
          </div>
        )}
      />
    </div>
  );
}

export function SimpleBoard() {
  const items: Task[] = [
    { id: 'b1', title: 'Renew TLS certificate', status: 'todo', order: 0, tag: '' },
    { id: 'b2', title: 'Rotate API keys', status: 'todo', order: 1, tag: '' },
    { id: 'b3', title: 'Migrate staging DB', status: 'in_progress', order: 0, tag: '' },
    { id: 'b4', title: 'Archive Q1 reports', status: 'done', order: 0, tag: '' },
  ];
  return (
    <div className="flex flex-col p-5" style={{ height: 380 }}>
      <Kanban<Task>
        items={items}
        columns={COLUMNS.filter(c => c.value !== 'review')}
        columnOf={t => t.status}
        getId={t => t.id}
        sortInColumn={(a, b) => a.order - b.order}
        onMove={() => {}}
        columnEmptyText="Drop tasks here"
        renderCard={t => <div className="text-sm leading-snug text-gray-800">{t.title}</div>}
      />
    </div>
  );
}
