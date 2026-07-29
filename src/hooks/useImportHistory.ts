import { useCallback, useReducer, useRef } from 'react';

/**
 * Undo/redo for a bulk import, for a list the caller already controls.
 *
 * A bulk import is the one edit to a line-items table that arrives all at once
 * and can't be walked back by hand — fifteen rows land in a purchase order and
 * the only way out is deleting them one by one. This keeps a snapshot of the
 * list from just before each import, so the whole import is one Undo.
 *
 * Scope is deliberately the import, not the table. Typing in a row is cheap to
 * correct and does not push a step; only {@link ImportHistory.commit} does. The
 * caller keeps owning the list — `commit` records the snapshot and then hands
 * `next` straight to the same `onChange` the table already uses.
 *
 *     const history = useImportHistory(items, onChange);
 *     <LineItemsTable
 *       items={items}
 *       onChange={onChange}                                  // hand edits — no step
 *       onBulkImport={async rows => history.commit(toLines(rows))}  // one step
 *     />
 *     <ImportHistoryControls history={history} />
 *
 * Undoing is lossy when the table changed after the import, because the
 * snapshot predates those changes too. The hook reports that as
 * {@link ImportHistory.hasLaterEdits} rather than deciding what to do about it;
 * `ImportHistoryControls` confirms before discarding.
 */

/** Undo depth. Imports are a deliberate, occasional act — nobody stacks 50. */
const HISTORY_LIMIT = 50;

export interface ImportStep<T> {
  /** The list as it stood before this import. */
  items: T[];
  /** What Undo would take back, e.g. `"import of 5 lines"`. */
  label: string;
}

export interface ImportHistoryState<T> {
  past: ImportStep<T>[];
  future: ImportStep<T>[];
}

export type ImportHistoryAction<T> =
  | { type: 'commit'; step: ImportStep<T> }
  | { type: 'undo'; redoStep: ImportStep<T> }
  | { type: 'redo'; undoStep: ImportStep<T> };

export function importHistoryReducer<T>(
  state: ImportHistoryState<T>,
  action: ImportHistoryAction<T>,
): ImportHistoryState<T> {
  switch (action.type) {
    case 'commit': {
      const past = [...state.past, action.step];
      return {
        past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
        // A fresh import is a new branch — anything redone from here is gone.
        future: [],
      };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        future: [action.redoStep, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, action.undoStep],
        future: state.future.slice(1),
      };
    }
  }
}

/** `"import of 5 lines"` — how many rows the import added, when it added any. */
export function describeImport<T>(before: T[], after: T[]): string {
  const added = after.length - before.length;
  if (added === 1) return 'import of 1 line';
  if (added > 1) return `import of ${added} lines`;
  // A merging import can land fewer rows than it carried, or replace them
  // outright; "5 lines" would then name a number the user never sees.
  return 'import';
}

/**
 * Two lists hold the same rows when they are the same length and every row is
 * the very object we last handed over. A caller that rebuilds its rows on the
 * way through reads as edited — which costs a confirmation, never a snapshot.
 */
function sameRows<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((row, i) => row === b[i]);
}

/** The parts of a keydown this matcher reads. */
export interface ImportHotkeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}

const TEXT_ENTRY = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Which import-history action a keydown asks for, or null for none.
 *
 * ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redoes — except while the
 * caret is in a field. Inside an input, a textarea, or a grid cell, ⌘Z means
 * "take back what I just typed", and the browser already does that better than
 * we could; taking the key there would swap a text undo for a six-row one. So
 * the shortcut fires from the form around the fields, not from inside them.
 */
export function matchImportHotkey(e: ImportHotkeyEvent): 'undo' | 'redo' | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;

  const key = e.key.toLowerCase();
  const action = key === 'z' ? (e.shiftKey ? 'redo' : 'undo')
    // Ctrl+Y is the Windows redo. ⌘Y is Mac "history", so leave it alone.
    : key === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey ? 'redo'
    : null;
  if (!action) return null;

  const target = e.target;
  if (target?.isContentEditable) return null;
  if (target?.tagName && TEXT_ENTRY.has(target.tagName.toUpperCase())) return null;

  return action;
}

export interface ImportHistory<T> {
  /** Apply `next` as one undoable step. Use in place of the list's own setter
   *  for a bulk import; `label` defaults to a count of the rows it added. */
  commit: (next: T[], label?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** What Undo/Redo would act on, for a button title. Null when unavailable. */
  undoLabel: string | null;
  redoLabel: string | null;
  /** The list changed after the newest import, so undoing it discards those
   *  changes as well. False whenever `canUndo` is false. */
  hasLaterEdits: boolean;
}

/**
 * @param items    the list as the caller currently holds it
 * @param onChange the caller's own setter — undo and redo drive it
 */
export default function useImportHistory<T>(
  items: T[],
  onChange: (next: T[]) => void,
): ImportHistory<T> {
  const [state, dispatch] = useReducer(
    importHistoryReducer as (s: ImportHistoryState<T>, a: ImportHistoryAction<T>) => ImportHistoryState<T>,
    { past: [], future: [] } as ImportHistoryState<T>,
  );

  // The list exactly as this hook last handed it over. Anything else in `items`
  // arrived from the table itself, i.e. a hand edit after the import.
  const appliedRef = useRef<T[] | null>(null);
  // Reads of `items` from inside a stable callback, without making every
  // callback change identity on each keystroke in the table.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const commit = useCallback((next: T[], label?: string) => {
    const before = itemsRef.current;
    dispatch({ type: 'commit', step: { items: before, label: label ?? describeImport(before, next) } });
    appliedRef.current = next;
    onChange(next);
  }, [onChange]);

  const undo = useCallback(() => {
    const step = state.past[state.past.length - 1];
    if (!step) return;
    // Redo restores what is on screen now, not what the import produced —
    // otherwise edits made after the import would vanish on the round trip.
    dispatch({ type: 'undo', redoStep: { items: itemsRef.current, label: step.label } });
    appliedRef.current = step.items;
    onChange(step.items);
  }, [state.past, onChange]);

  const redo = useCallback(() => {
    const step = state.future[0];
    if (!step) return;
    dispatch({ type: 'redo', undoStep: { items: itemsRef.current, label: step.label } });
    appliedRef.current = step.items;
    onChange(step.items);
  }, [state.future, onChange]);

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  return {
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel: canUndo ? state.past[state.past.length - 1].label : null,
    redoLabel: canRedo ? state.future[0].label : null,
    hasLaterEdits: canUndo && appliedRef.current !== null && !sameRows(appliedRef.current, items),
  };
}
