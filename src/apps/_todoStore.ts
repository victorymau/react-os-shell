/**
 * Shared task store for the Todo List app and the Pomodoro widget — both
 * read/write the same list via `useTodoTasks()`.
 *
 * Two backends:
 *  • Default: `useShellPrefs()` → `prefs.todo_tasks` (per-user prefs blob).
 *  • Opt-in: a consumer-supplied `TodoProvider` registered with
 *    `setShellTodoProvider(...)`. When set, the three apps read/write through
 *    it instead — letting an ERP make the shell's tasks the SAME records as
 *    its own task table, and tag each with a `contextLabel` badge (e.g.
 *    "Deal: Acme"). Mirrors `setShellApiClient`.
 *
 * `migratePomodoroTasksOnce()` folds legacy `localStorage.pomodoro_tasks`
 * into the prefs store on first Pomodoro mount (no-op in provider mode).
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
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

/**
 * A consumer-supplied task backend. Registering one (opt-in) routes every
 * shell task surface through it instead of the prefs blob. Methods map to/from
 * the shell's `TodoTask` shape, including the optional `source`/`contextLabel`.
 */
export interface TodoProvider {
  list(): Promise<TodoTask[]>;
  create(input: Partial<Omit<TodoTask, 'id' | 'createdAt' | 'updatedAt'>> & { name: string }): Promise<TodoTask>;
  update(id: string, patch: Partial<TodoTask>): Promise<TodoTask>;
  remove(id: string): Promise<void>;
}

// ── Module-level provider store (shared across all consumers) ──
let provider: TodoProvider | null = null;
let cache: TodoTask[] = [];
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function setCache(next: TodoTask[]): void {
  cache = next;
  emit();
}

function refresh(): Promise<void> {
  const p = provider;
  if (!p) {
    cache = [];
    loaded = true;
    emit();
    return Promise.resolve();
  }
  inflight = p
    .list()
    .then(rows => {
      if (provider === p) {
        cache = rows;
        loaded = true;
        emit();
      }
    })
    .catch(() => {
      if (provider === p) {
        loaded = true;
        emit();
      }
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Register (or clear with `null`) the backend task provider. Opt-in. */
export function setShellTodoProvider(next: TodoProvider | null): void {
  provider = next;
  cache = [];
  loaded = false;
  if (next) refresh();
  else emit();
}

export function hasShellTodoProvider(): boolean {
  return provider !== null;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (provider && !loaded && !inflight) refresh();
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): TodoTask[] {
  return cache;
}

// ── Prefs-backed implementation (default / fallback) ──
function usePrefsTodoTasks(): UseTodoTasks {
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
    const task: TodoTask = { done: false, ...input, name: input.name.trim(), id, createdAt: ts, updatedAt: ts };
    writeTasks([...tasks, task]);
    return id;
  }, [tasks, writeTasks]);

  const updateTask = useCallback<UseTodoTasks['updateTask']>((id, patch) => {
    writeTasks(tasks.map(t => (t.id === id ? { ...t, ...patch, id: t.id, updatedAt: nowIso() } : t)));
  }, [tasks, writeTasks]);

  const removeTask = useCallback<UseTodoTasks['removeTask']>((id) => {
    writeTasks(tasks.filter(t => t.id !== id));
  }, [tasks, writeTasks]);

  const toggleDone = useCallback<UseTodoTasks['toggleDone']>((id) => {
    const target = tasks.find(t => t.id === id);
    if (target) updateTask(id, { done: !target.done });
  }, [tasks, updateTask]);

  return { tasks, addTask, updateTask, removeTask, toggleDone, setAllTasks: writeTasks };
}

// ── Public hook (provider-aware) ──
export function useTodoTasks(): UseTodoTasks {
  // Both hooks always run (rules of hooks); the active impl is chosen below.
  const prefsImpl = usePrefsTodoTasks();
  const providerTasks = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const addTask = useCallback<UseTodoTasks['addTask']>((input) => {
    const p = provider;
    if (!p) return prefsImpl.addTask(input);
    const tempId = 'tmp-' + uid();
    const ts = nowIso();
    const optimistic: TodoTask = { done: false, ...input, name: input.name.trim(), id: tempId, createdAt: ts, updatedAt: ts };
    setCache([...cache, optimistic]);
    p.create({ ...input, name: input.name.trim() })
      // Merge so server-owned fields win but client-only fields (estimated/
      // completed/notes the backend may not persist) survive the round-trip.
      .then(saved => setCache(cache.map(t => (t.id === tempId ? { ...optimistic, ...saved } : t))))
      .catch(() => setCache(cache.filter(t => t.id !== tempId)));
    return tempId;
  }, [prefsImpl]);

  const updateTask = useCallback<UseTodoTasks['updateTask']>((id, patch) => {
    const p = provider;
    if (!p) return prefsImpl.updateTask(id, patch);
    setCache(cache.map(t => (t.id === id ? { ...t, ...patch, id, updatedAt: nowIso() } : t)));
    p.update(id, patch).catch(() => { refresh(); });
  }, [prefsImpl]);

  const removeTask = useCallback<UseTodoTasks['removeTask']>((id) => {
    const p = provider;
    if (!p) return prefsImpl.removeTask(id);
    const prev = cache;
    setCache(cache.filter(t => t.id !== id));
    p.remove(id).catch(() => setCache(prev));
  }, [prefsImpl]);

  const toggleDone = useCallback<UseTodoTasks['toggleDone']>((id) => {
    if (!provider) return prefsImpl.toggleDone(id);
    const target = cache.find(t => t.id === id);
    if (target) updateTask(id, { done: !target.done });
  }, [prefsImpl, updateTask]);

  const setAllTasks = useCallback<UseTodoTasks['setAllTasks']>((next) => {
    // Provider owns persistence — bulk replace (Google Tasks sync) is a no-op there.
    if (!provider) prefsImpl.setAllTasks(next);
  }, [prefsImpl]);

  if (!hasShellTodoProvider()) return prefsImpl;
  return { tasks: providerTasks, addTask, updateTask, removeTask, toggleDone, setAllTasks };
}

/**
 * One-time migration: pull any tasks the Pomodoro widget previously
 * persisted to `localStorage.pomodoro_tasks` into the shared store.
 * No-op when a provider is registered (the provider owns persistence).
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
    const existingIds = new Set(currentTasks.map(t => t.id));
    const additions = migrated.filter(t => !existingIds.has(t.id));
    setAllTasks([...additions, ...currentTasks]);
    localStorage.removeItem(POMODORO_LEGACY_KEY);
    localStorage.setItem(POMODORO_LEGACY_MIGRATED_FLAG, '1');
  } catch {
    try { localStorage.setItem(POMODORO_LEGACY_MIGRATED_FLAG, '1'); } catch {}
  }
}
