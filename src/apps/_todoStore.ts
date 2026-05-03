/**
 * Shared task store — wraps `useShellPrefs()` so the Todo List app, the
 * Pomodoro widget, and the Calendar app all read/write the same array
 * at `prefs.todo_tasks`. Mutations bump `updatedAt` so Google-Tasks
 * sync (when enabled) can use last-write-wins conflict resolution.
 *
 * `migratePomodoroTasksOnce()` is a one-shot escape hatch: when the
 * Pomodoro widget mounts the first time after this refactor, it copies
 * any existing tasks from the legacy `localStorage.pomodoro_tasks` key
 * into the shared store and removes the old key. After that mount it's
 * a no-op.
 */

import { useCallback, useMemo } from 'react';
import { useShellPrefs } from '../shell/ShellPrefs';
import type { TodoTask } from './_todoTypes';

const POMODORO_LEGACY_KEY = 'pomodoro_tasks';
const POMODORO_LEGACY_MIGRATED_FLAG = 'pomodoro_tasks_migrated';

function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface UseTodoTasks {
  tasks: TodoTask[];
  /** Add a new task. Returns the id of the freshly-added task. */
  addTask: (input: Partial<Omit<TodoTask, 'id' | 'createdAt' | 'updatedAt'>> & { name: string }) => string;
  /** Patch any subset of fields on a task by id. `updatedAt` is auto-bumped. */
  updateTask: (id: string, patch: Partial<TodoTask>) => void;
  /** Remove a task by id. Used by both Pomodoro's kebab menu and TodoList's delete action. */
  removeTask: (id: string) => void;
  /** Flip `done`. Same as `updateTask(id, { done: !done })` but faster to type at call sites. */
  toggleDone: (id: string) => void;
  /** Replace the entire list. Used by Google Tasks sync after a pull. */
  setAllTasks: (tasks: TodoTask[]) => void;
}

export function useTodoTasks(): UseTodoTasks {
  const { prefs, save } = useShellPrefs();
  const tasks: TodoTask[] = useMemo(() => {
    const raw = prefs.todo_tasks;
    return Array.isArray(raw) ? (raw as TodoTask[]) : [];
  }, [prefs.todo_tasks]);

  const writeTasks = useCallback((next: TodoTask[]) => {
    save({ todo_tasks: next });
  }, [save]);

  const addTask = useCallback<UseTodoTasks['addTask']>((input) => {
    const id = uid();
    const ts = nowIso();
    const task: TodoTask = {
      done: false,
      ...input,
      // Ensure name is trimmed and id/timestamps overwrite anything the
      // caller might have passed in.
      name: input.name.trim(),
      id,
      createdAt: ts,
      updatedAt: ts,
    };
    writeTasks([...tasks, task]);
    return id;
  }, [tasks, writeTasks]);

  const updateTask = useCallback<UseTodoTasks['updateTask']>((id, patch) => {
    const next = tasks.map(t => t.id === id ? { ...t, ...patch, id: t.id, updatedAt: nowIso() } : t);
    writeTasks(next);
  }, [tasks, writeTasks]);

  const removeTask = useCallback<UseTodoTasks['removeTask']>((id) => {
    writeTasks(tasks.filter(t => t.id !== id));
  }, [tasks, writeTasks]);

  const toggleDone = useCallback<UseTodoTasks['toggleDone']>((id) => {
    const target = tasks.find(t => t.id === id);
    if (!target) return;
    updateTask(id, { done: !target.done });
  }, [tasks, updateTask]);

  return { tasks, addTask, updateTask, removeTask, toggleDone, setAllTasks: writeTasks };
}

/**
 * One-time migration: pull any tasks the Pomodoro widget previously
 * persisted to `localStorage.pomodoro_tasks` into the shared store.
 * Called from PomodoroTimer's mount effect — safe to invoke on every
 * mount, since the migrated flag stays set after the first run.
 *
 * Pass `setAllTasks` from `useTodoTasks()` so the migration can fold
 * the legacy entries in alongside any tasks the user has already added
 * elsewhere (i.e. via the new TodoList app).
 */
export function migratePomodoroTasksOnce(
  currentTasks: TodoTask[],
  setAllTasks: (next: TodoTask[]) => void,
): void {
  try {
    if (localStorage.getItem(POMODORO_LEGACY_MIGRATED_FLAG)) return;
    const raw = localStorage.getItem(POMODORO_LEGACY_KEY);
    if (!raw) {
      localStorage.setItem(POMODORO_LEGACY_MIGRATED_FLAG, '1');
      return;
    }
    const legacy: Array<{ id?: string; name?: string; estimated?: number; completed?: number; done?: boolean }>
      = JSON.parse(raw);
    if (!Array.isArray(legacy) || legacy.length === 0) {
      localStorage.removeItem(POMODORO_LEGACY_KEY);
      localStorage.setItem(POMODORO_LEGACY_MIGRATED_FLAG, '1');
      return;
    }
    const ts = nowIso();
    const migrated: TodoTask[] = legacy
      .filter(t => typeof t?.name === 'string')
      .map(t => ({
        id: t.id || uid(),
        name: String(t.name),
        done: !!t.done,
        estimated: typeof t.estimated === 'number' ? t.estimated : undefined,
        completed: typeof t.completed === 'number' ? t.completed : undefined,
        createdAt: ts,
        updatedAt: ts,
      }));
    // Fold migrated tasks in first so the legacy list keeps its position
    // ahead of anything the user added via the new app.
    const existingIds = new Set(currentTasks.map(t => t.id));
    const additions = migrated.filter(t => !existingIds.has(t.id));
    setAllTasks([...additions, ...currentTasks]);
    localStorage.removeItem(POMODORO_LEGACY_KEY);
    localStorage.setItem(POMODORO_LEGACY_MIGRATED_FLAG, '1');
  } catch {
    // Don't block startup on corrupt localStorage — just mark it migrated.
    try { localStorage.setItem(POMODORO_LEGACY_MIGRATED_FLAG, '1'); } catch {}
  }
}
