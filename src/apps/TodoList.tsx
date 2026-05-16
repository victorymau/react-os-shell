import { useMemo, useState } from 'react';
import { useTodoTasks } from './_todoStore';
import type { TodoTask } from './_todoTypes';
import { confirm } from '../shell/ConfirmDialog';

type Filter = 'today' | 'upcoming' | 'all' | 'done';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'today',    label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'all',      label: 'All' },
  { id: 'done',     label: 'Done' },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDueLabel(due: string): string {
  const d = new Date(due + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / (24 * 3600 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0 && diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isOverdue(t: TodoTask): boolean {
  return !t.done && !!t.dueDate && t.dueDate < todayStr();
}

export default function TodoList() {
  const { tasks, addTask, updateTask, removeTask, toggleDone } = useTodoTasks();
  const [filter, setFilter] = useState<Filter>('today');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // ── Filtered view ──
  const today = todayStr();
  const visible = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      // Done tasks always sink to the bottom.
      if (a.done !== b.done) return a.done ? 1 : -1;
      // Overdue first, then today, then by due date, then by createdAt.
      const aOver = isOverdue(a), bOver = isOverdue(b);
      if (aOver !== bOver) return aOver ? -1 : 1;
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    if (filter === 'today') return sorted.filter(t => !t.done && (t.dueDate === today || isOverdue(t)));
    if (filter === 'upcoming') return sorted.filter(t => !t.done && t.dueDate && t.dueDate > today);
    if (filter === 'done') return sorted.filter(t => t.done);
    return sorted;
  }, [tasks, filter, today]);

  const counts = useMemo(() => ({
    today: tasks.filter(t => !t.done && (t.dueDate === today || isOverdue(t))).length,
    upcoming: tasks.filter(t => !t.done && t.dueDate && t.dueDate > today).length,
    all: tasks.filter(t => !t.done).length,
    done: tasks.filter(t => t.done).length,
  }), [tasks, today]);

  // ── Action handlers ──
  const handleAdd = (input: { name: string; dueDate?: string; estimated?: number }) => {
    addTask(input);
    setAdding(false);
  };

  const handleToggle = (id: string) => {
    toggleDone(id);
  };

  const handleEdit = (id: string, patch: Partial<TodoTask>) => {
    updateTask(id, patch);
  };

  const handleDelete = async (id: string) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const ok = await confirm({
      title: 'Delete this task?',
      message: `“${t.name}” will be removed from the Todo List and the Pomodoro widget. This can't be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    removeTask(id);
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header — filter pills + sync chip + add button */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-1">
          {FILTERS.map(f => {
            const count = counts[f.id];
            const active = filter === f.id;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                <span>{f.label}</span>
                <span className={`text-[10px] tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {adding && (
          <AddTaskRow onSubmit={handleAdd} onCancel={() => setAdding(false)} />
        )}
        {visible.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 text-gray-400">
            <svg className="h-10 w-10 mb-2 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
            <p className="text-sm">{filter === 'done' ? 'No completed tasks yet.' : 'Nothing here. Add a task to get started.'}</p>
          </div>
        )}
        {visible.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            editing={editingId === task.id}
            onToggle={() => handleToggle(task.id)}
            onClick={() => setEditingId(editingId === task.id ? null : task.id)}
            onSave={(patch) => { handleEdit(task.id, patch); setEditingId(null); }}
            onDelete={() => handleDelete(task.id)}
            onCancelEdit={() => setEditingId(null)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row + add form
// ─────────────────────────────────────────────────────────────────────

function TaskRow({ task, editing, onToggle, onClick, onSave, onDelete, onCancelEdit }: {
  task: TodoTask;
  editing: boolean;
  onToggle: () => void;
  onClick: () => void;
  onSave: (patch: Partial<TodoTask>) => void;
  onDelete: () => void;
  onCancelEdit: () => void;
}) {
  if (editing) {
    return <EditDrawer task={task} onSave={onSave} onCancel={onCancelEdit} onDelete={onDelete} />;
  }
  const dueLabel = task.dueDate ? fmtDueLabel(task.dueDate) : null;
  const overdue = isOverdue(task);
  const pomos = (task.estimated || task.completed)
    ? `${task.completed ?? 0}/${task.estimated ?? '?'}`
    : null;
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="shrink-0">
        {task.done ? (
          <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 0a10 10 0 100 20 10 10 0 000-20zm-1 14.5l-4.5-4.5 1.4-1.4 3.1 3.1 6.1-6.1 1.4 1.4z" />
          </svg>
        ) : (
          <svg className="h-5 w-5 text-gray-300 hover:text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
          </svg>
        )}
      </button>
      <span className={`flex-1 text-sm truncate ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {task.name || <span className="italic text-gray-400">(untitled)</span>}
      </span>
      {pomos && (
        <span className="shrink-0 text-[11px] tabular-nums text-gray-500" title="Pomodoros completed / estimated">
          🍅 {pomos}
        </span>
      )}
      {dueLabel && (
        <span className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded ${overdue ? 'bg-red-100 text-red-700' : task.dueDate === todayStr() ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          {dueLabel}
        </span>
      )}
    </div>
  );
}

function EditDrawer({ task, onSave, onCancel, onDelete }: {
  task: TodoTask;
  onSave: (patch: Partial<TodoTask>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(task.name);
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [estimated, setEstimated] = useState(task.estimated ?? 0);
  const [notes, setNotes] = useState(task.notes || '');

  const submit = () => onSave({
    name: name.trim(),
    dueDate: dueDate || undefined,
    estimated: estimated > 0 ? estimated : undefined,
    notes: notes.trim() || undefined,
  });

  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Task name"
        className="w-full text-sm font-medium bg-white border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="flex flex-col text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Due
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="mt-0.5 text-sm bg-white border border-gray-200 rounded px-2 py-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </label>
        <label className="flex flex-col text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Est. pomos
          <input type="number" min={0} max={20} value={estimated}
            onChange={e => setEstimated(Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)))}
            className="mt-0.5 text-sm bg-white border border-gray-200 rounded px-2 py-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </label>
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="mt-2 w-full text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
      <div className="flex items-center justify-between mt-2">
        <button onClick={onDelete} className="text-xs text-red-600 hover:text-red-700">
          Delete
        </button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={submit} className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  );
}

function AddTaskRow({ onSubmit, onCancel }: {
  onSubmit: (input: { name: string; dueDate?: string; estimated?: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimated, setEstimated] = useState(0);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      dueDate: dueDate || undefined,
      estimated: estimated > 0 ? estimated : undefined,
    });
  };

  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-blue-50/40">
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="What do you need to do?"
        className="w-full text-sm font-medium bg-white border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <div className="flex items-center gap-2 mt-2">
        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Due
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Est. pomos
          <input type="number" min={0} max={20} value={estimated}
            onChange={e => setEstimated(Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)))}
            className="w-12 text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-right text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </label>
        <div className="flex-1" />
        <button onClick={onCancel} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
        <button onClick={submit} className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700">Add</button>
      </div>
    </div>
  );
}
