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
  record: (label: string, coalesceKey: string | null) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  baseline: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  enabled: boolean;
  /** True once any state is registered — the sign that this window has a form
   *  in it and so has something an Undo pair could act on. */
  hasState: boolean;
  /** True while a pair of controls is on screen for this stack without the
   *  form having mounted one — see `UndoControls`, which then yields to it. */
  autoMounted: boolean;
  /** Whoever renders that pair says so here, and takes it back on unmount. */
  claimAutoMount: (on: boolean) => void;
  /** A form's own read-only claim — `useUndoCanEdit(false)` — counted rather
   *  than set, so two components saying it and one leaving do not re-enable. */
  claimReadOnly: (on: boolean) => void;
}

export const UndoContext = createContext<UndoContextValue | null>(null);

export type { UndoSnapshot };
