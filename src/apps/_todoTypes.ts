/**
 * Shared task data model — used by the TodoList app, the Pomodoro widget,
 * and the Calendar app. Stored in `shellPrefs.todo_tasks` (a single array)
 * so all three views read/write the same source of truth.
 */

export interface TodoTask {
  /** Local UUID — stable across renames, used by Pomodoro for active-task pinning. */
  id: string;
  name: string;
  done: boolean;
  /** Optional deadline, formatted YYYY-MM-DD so it sorts as a string. Drives the Calendar badge. */
  dueDate?: string;
  /** Pomodoro estimate (count of focus blocks the user expects to spend). */
  estimated?: number;
  /** Pomodoro count completed against this task. */
  completed?: number;
  /** Free-text notes — surfaced in the Todo edit drawer. */
  notes?: string;
  /** ISO timestamp — useful for "recently added" sorting. */
  createdAt: string;
  /** ISO timestamp — bumped on every local mutation. */
  updatedAt: string;
}
