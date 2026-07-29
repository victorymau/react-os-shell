/**
 * Undo/redo for one open form — the pure half.
 *
 * A form window owns a single stack covering everything in it: its fields, its
 * line-items table, a bulk import. One ⌘Z steps back the last thing the user
 * did, whatever part of the form it happened in.
 *
 * The stack holds snapshots, not diffs. A step stores the value of every
 * registered slice **as it was before the change**, so undoing restores the
 * whole form to a coherent moment rather than replaying one slice out of step
 * with the others. Forms are small — a few dozen fields and some line items —
 * so whole-form snapshots stay cheap and the logic stays honest.
 *
 * Scope is the unsaved edit. History lives with the open window and dies with
 * it; nothing here reverses a saved record.
 */

/** Registered slice id → that slice's value at the time of the snapshot. */
export type UndoSnapshot = Record<string, unknown>;

export interface UndoStep {
  /** The form as it stood before this change. Undo restores exactly this. */
  values: UndoSnapshot;
  /** What the step was, for a button title: `"qty"`, `"import of 5 lines"`. */
  label: string;
  /**
   * Consecutive changes sharing a non-null key fold into one step — typing in
   * a field is one Undo, not one per keystroke. Null never folds.
   */
  coalesceKey: string | null;
}

export interface UndoState {
  past: UndoStep[];
  future: UndoStep[];
}

export type UndoAction =
  | { type: 'record'; step: UndoStep }
  | { type: 'undo'; redoStep: UndoStep }
  | { type: 'redo'; undoStep: UndoStep }
  | { type: 'clear' };

/**
 * Depth. Higher than the import-only stack this replaces: typing produces a
 * step per field, so a long form fills it far faster than imports ever did.
 */
export const UNDO_LIMIT = 100;

export const emptyUndoState: UndoState = { past: [], future: [] };

export function undoReducer(state: UndoState, action: UndoAction): UndoState {
  switch (action.type) {
    case 'record': {
      const newest = state.past[state.past.length - 1];
      // Still the same run — the step already holds the value from before the
      // run started, which is what Undo should restore. Keep it and drop the
      // redo branch; recording again would give the value back a keystroke at
      // a time.
      if (
        action.step.coalesceKey !== null &&
        newest?.coalesceKey === action.step.coalesceKey
      ) {
        return state.future.length === 0 ? state : { ...state, future: [] };
      }
      const past = [...state.past, action.step];
      return {
        past: past.length > UNDO_LIMIT ? past.slice(past.length - UNDO_LIMIT) : past,
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
    case 'clear':
      // A save makes the current values the new baseline: there is no longer an
      // earlier state to go back to, because "earlier" is now on the server.
      return state.past.length === 0 && state.future.length === 0 ? state : emptyUndoState;
  }
}

/** The parts of a keydown the matcher reads. */
export interface UndoHotkeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}

const TEXT_ENTRY = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Which action a keydown asks for, or null for none.
 *
 * ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redoes — except while the
 * caret is in a field. Inside an input, a textarea, or a grid cell, ⌘Z means
 * "take back what I just typed", and the browser does that better than we
 * could. Leaving the field ends that run and turns it into one step here, so
 * the next ⌘Z outside the field takes the whole edit back.
 */
export function matchUndoHotkey(e: UndoHotkeyEvent): 'undo' | 'redo' | null {
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
