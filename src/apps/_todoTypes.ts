/**
 * Shared task data model — used by the TodoList app, the Pomodoro widget,
 * and the Calendar app. Stored in `shellPrefs.todo_tasks` (a single array)
 * so all three views read/write the same source of truth.
 *
 *   • TodoList drives the canonical list (add / edit / delete / sync).
 *   • Pomodoro picks an "active" task by id and bumps its `completed`
 *     count when a focus session ends.
 *   • Calendar shows tasks with `dueDate` as a checkbox badge on the
 *     matching day in the month / week views.
 *
 * Google Tasks sync is opt-in: `gtaskId` and `gtaskListId` are set after
 * the first successful sync, and `syncedAt` records the last round-trip
 * timestamp for last-write-wins conflict resolution.
 */

export interface TodoTask {
  /** Local UUID — stable across renames, used by Pomodoro for active-task pinning. */
  id: string;
  name: string;
  done: boolean;
  /** Optional deadline, formatted YYYY-MM-DD so it sorts as a string. Drives the Calendar badge. */
  dueDate?: string;
  /** Pomodoro estimate (count of focus blocks the user expects to spend). Optional — only set if the user filled it in. */
  estimated?: number;
  /** Pomodoro count completed against this task. Auto-incremented when a focus block ends with this task active. */
  completed?: number;
  /** Free-text notes — surfaced in the Todo edit drawer. */
  notes?: string;

  // ── Google Tasks sync metadata ──
  /** Google Tasks task id, set after first successful sync. */
  gtaskId?: string;
  /** Google Tasks list id (defaults to `@default`). */
  gtaskListId?: string;
  /** ISO timestamp of the last successful sync round-trip. */
  syncedAt?: string;

  /** ISO timestamp — useful for conflict resolution and "recently added" sorting. */
  createdAt: string;
  /** ISO timestamp — bumped on every local mutation. */
  updatedAt: string;
}
