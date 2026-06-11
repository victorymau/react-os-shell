import { useState } from 'react';
import { Kanban } from 'react-os-shell';

/**
 * Demo for the shell's <Kanban> primitive. Tasks live in local state with a
 * float `order` field; dropping a card recomputes that order as the midpoint
 * between its new neighbours — the same pattern a real backend would persist —
 * so you can drag cards between columns AND reorder up/down within a column and
 * watch the drop-line, the column highlight, and the settle (FLIP) animation.
 */
interface Task {
  id: string;
  title: string;
  status: string;
  order: number;
}

const COLUMNS = [
  { value: 'todo', label: 'To Do', accent: 'text-slate-700 bg-slate-100', dot: 'bg-slate-400' },
  { value: 'in_progress', label: 'In Progress', accent: 'text-sky-700 bg-sky-50', dot: 'bg-sky-500' },
  { value: 'review', label: 'Review', accent: 'text-amber-700 bg-amber-50', dot: 'bg-amber-500' },
  { value: 'done', label: 'Done', accent: 'text-green-700 bg-green-50', dot: 'bg-green-500' },
];

const INITIAL: Task[] = [
  { id: 't1', title: 'Design the empty states', status: 'todo', order: 0 },
  { id: 't2', title: 'Write the onboarding copy', status: 'todo', order: 1 },
  { id: 't3', title: 'Audit colour contrast', status: 'todo', order: 2 },
  { id: 't4', title: 'Wire up the search index', status: 'todo', order: 3 },
  { id: 't5', title: 'Build the settings panel', status: 'in_progress', order: 0 },
  { id: 't6', title: 'Drag-and-drop reordering', status: 'in_progress', order: 1 },
  { id: 't7', title: 'Keyboard shortcuts pass', status: 'review', order: 0 },
  { id: 't8', title: 'Set up the CI pipeline', status: 'done', order: 0 },
  { id: 't9', title: 'Pick the icon set', status: 'done', order: 1 },
];

/** Float order to drop at `toIndex` among `siblings` (the dragged card excluded). */
function midpoint(siblings: Task[], toIndex: number): number {
  const before = siblings[toIndex - 1];
  const after = siblings[toIndex];
  if (before && after) return (before.order + after.order) / 2;
  if (before) return before.order + 1;
  if (after) return after.order - 1;
  return 0;
}

let nextId = INITIAL.length + 1;

export default function KanbanDemo() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL);

  const handleAdd = (toColumn: string) => {
    setTasks(prev => {
      // Drop the new card at the top of its column (one below the current min order).
      const minOrder = prev
        .filter(t => t.status === toColumn)
        .reduce((m, t) => Math.min(m, t.order), 0);
      return [
        { id: `t${nextId++}`, title: 'New task', status: toColumn, order: minOrder - 1 },
        ...prev,
      ];
    });
  };

  const handleMove = (id: string, toColumn: string, toIndex: number) => {
    setTasks(prev => {
      const moved = prev.find(t => t.id === id);
      if (!moved) return prev;
      const siblings = prev
        .filter(t => t.status === toColumn && t.id !== id)
        .sort((a, b) => a.order - b.order);
      const order = midpoint(siblings, toIndex);
      return prev.map(t => (t.id === id ? { ...t, status: toColumn, order } : t));
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <h1 className="text-sm font-semibold text-gray-900">Kanban</h1>
        <p className="mt-0.5 text-xs text-gray-500">
          Drag cards between columns, or up and down within a column to reorder. Order is kept in
          local state (a real app would persist the <code>order</code> field).
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <Kanban<Task>
          items={tasks}
          columns={COLUMNS}
          columnOf={t => t.status}
          getId={t => t.id}
          sortInColumn={(a, b) => a.order - b.order}
          onMove={handleMove}
          onAddItem={handleAdd}
          columnEmptyText="Drop tasks here"
          renderCard={t => <div className="text-sm leading-snug text-gray-800">{t.title}</div>}
        />
      </div>
    </div>
  );
}
