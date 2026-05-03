/**
 * Google Tasks REST helpers — used by the Todo List app to two-way sync
 * with `tasks.googleapis.com`. Mirrors the lightweight pattern used by
 * Calendar.tsx (no SDK, just `fetch` + bearer token).
 *
 *   • `fetchGoogleTasks(token)` — pull all tasks from the user's
 *     `@default` list and map them to local `TodoTask` shape.
 *   • `pushGoogleTask(token, task)` — POST (new) or PATCH (existing).
 *   • `deleteGoogleTask(token, gtaskId, listId?)` — DELETE.
 *
 * Conflict policy is last-write-wins on `updated` timestamps, owned by
 * the caller (TodoList.tsx). These helpers just talk HTTP.
 */

import type { TodoTask } from './_todoTypes';

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const DEFAULT_LIST = '@default';

interface GoogleTaskPayload {
  id?: string;
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string;       // RFC 3339 timestamp — Google stores due as a date-only field but in datetime form
  updated?: string;
  completed?: string;
  deleted?: boolean;
}

interface GoogleTasksListResponse {
  items?: GoogleTaskPayload[];
}

/** Convert YYYY-MM-DD → RFC 3339 timestamp at noon UTC (Google's
 *  expected representation for date-only `due`). */
function dueToIso(date: string | undefined): string | undefined {
  if (!date) return undefined;
  return `${date}T12:00:00.000Z`;
}

/** Convert RFC 3339 → YYYY-MM-DD. */
function dueFromIso(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  return iso.slice(0, 10);
}

function mapFromGoogle(g: GoogleTaskPayload, listId: string, ts: string): TodoTask {
  return {
    id: `gtask-${g.id}`,
    name: g.title || '',
    done: g.status === 'completed',
    dueDate: dueFromIso(g.due),
    notes: g.notes,
    gtaskId: g.id,
    gtaskListId: listId,
    syncedAt: ts,
    createdAt: g.updated || ts,
    updatedAt: g.updated || ts,
  };
}

function mapToGoogle(task: TodoTask): GoogleTaskPayload {
  return {
    title: task.name,
    notes: task.notes,
    status: task.done ? 'completed' : 'needsAction',
    due: dueToIso(task.dueDate),
  };
}

export async function fetchGoogleTasks(token: string, listId: string = DEFAULT_LIST): Promise<TodoTask[]> {
  const res = await fetch(`${TASKS_API}/lists/${listId}/tasks?showCompleted=true&showHidden=false&maxResults=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google Tasks fetch failed: ${res.status}`);
  const data: GoogleTasksListResponse = await res.json();
  const ts = new Date().toISOString();
  return (data.items || []).filter(g => !g.deleted && g.id).map(g => mapFromGoogle(g, listId, ts));
}

/** POST a new task or PATCH an existing one (decided by `task.gtaskId`).
 *  Returns the merged TodoTask with `gtaskId` / `gtaskListId` / `syncedAt` populated. */
export async function pushGoogleTask(token: string, task: TodoTask): Promise<TodoTask> {
  const listId = task.gtaskListId || DEFAULT_LIST;
  const payload = mapToGoogle(task);
  const isUpdate = !!task.gtaskId;
  const url = isUpdate
    ? `${TASKS_API}/lists/${listId}/tasks/${task.gtaskId}`
    : `${TASKS_API}/lists/${listId}/tasks`;
  const res = await fetch(url, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Google Tasks push failed: ${res.status}`);
  const g: GoogleTaskPayload = await res.json();
  const ts = new Date().toISOString();
  return {
    ...task,
    gtaskId: g.id,
    gtaskListId: listId,
    syncedAt: ts,
  };
}

export async function deleteGoogleTask(token: string, gtaskId: string, listId: string = DEFAULT_LIST): Promise<void> {
  const res = await fetch(`${TASKS_API}/lists/${listId}/tasks/${gtaskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 means "already gone" — treat as success.
  if (!res.ok && res.status !== 404) throw new Error(`Google Tasks delete failed: ${res.status}`);
}
