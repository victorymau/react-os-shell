import { createContext } from 'react';
import type { UndoSnapshot } from '../hooks/undoHistory';

/**
 * The undo stack's context object, in a module of its own.
 *
 * `UndoProvider` reads `useIsActiveWindow` from `Modal`, and `Modal` now reads
 * the stack to put Undo/Redo in a window's footer. Holding the context here,
 * where neither side is imported, is what lets both read it without the two
 * modules importing each other.
 */
export interface UndoSlice {
  /** The value as this slice last saw it — the "before" of a pending change. */
  getLast: () => unknown;
  /** Pre-arm the slice so a value it is about to receive is not recorded. */
  setLast: (v: unknown) => void;
  apply: (v: unknown) => void;
}

export interface UndoContextValue {
  register: (id: string, slice: UndoSlice) => void;
  unregister: (id: string) => void;
  /** `change` is the slice's before/after; while a baseline settles it is what
   *  decides whether a record landed (a value differing by content) or the
   *  same one came round again in a fresh object. */
  record: (label: string, coalesceKey: string | null, change?: { prev: unknown; next: unknown }) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  /** `key` names the record, so a switch to another one drops the history —
   *  see `useUndo().baseline`. */
  baseline: (key?: string | number | null) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  enabled: boolean;
  /** True once any state is registered — the sign that this window has a form
   *  in it and so has something an Undo pair could act on. */
  hasState: boolean;
  /** True while the form has mounted its own `<UndoControls />` somewhere —
   *  the shell then leaves the footer alone, so a form written before the
   *  shell did this keeps its pair where it put it, and shows one. */
  handMounted: boolean;
  /** A hand-mounted `UndoControls` says so here, and takes it back on unmount. */
  claimOwnMount: (on: boolean) => void;
  /** A form's own read-only claim — `useUndoCanEdit(false)` — counted rather
   *  than set, so two components saying it and one leaving do not re-enable. */
  claimReadOnly: (on: boolean) => void;
  /** True while a form has said `useUndoCanEdit(true)` — the window edits in
   *  place and may be edited, which the shell cannot tell from a detail view
   *  that merely holds state. It is what lets the footer show the pair outside
   *  an editing state (draft, duplicate, Edit mode). */
  declaredEditable: boolean;
  claimEditable: (on: boolean) => void;
}

export const UndoContext = createContext<UndoContextValue | null>(null);

export type { UndoSnapshot };
