import { createContext, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef } from 'react';
import { useModalActive } from './Modal';
import {
  undoReducer,
  emptyUndoState,
  matchUndoHotkey,
  type UndoSnapshot,
  type UndoHotkeyEvent,
} from '../hooks/undoHistory';

interface Slice {
  /** The value as this slice last saw it — the "before" of a pending change. */
  getLast: () => unknown;
  /** Pre-arm the slice so a value it is about to receive is not recorded. */
  setLast: (v: unknown) => void;
  apply: (v: unknown) => void;
}

interface UndoContextValue {
  register: (id: string, slice: Slice) => void;
  unregister: (id: string) => void;
  record: (label: string, coalesceKey: string | null) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

const UndoContext = createContext<UndoContextValue | null>(null);

/**
 * Undo/redo for everything in one open form.
 *
 * Wrap a form window in it, register each piece of its state with
 * {@link useUndoable}, and the whole form shares one stack: a field edit, a
 * line added, a bulk import are all steps in the same history, undone newest
 * first. Two open windows have two independent stacks, so ⌘Z never reaches
 * across into a window the user is not looking at.
 *
 * History is the unsaved edit only. It lives with the mounted provider and
 * dies with it, and `clear()` ends it at a save — past that point "earlier" is
 * on the server, and taking it back is not something a form can do.
 */
export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(undoReducer, emptyUndoState);
  const slices = useRef(new Map<string, Slice>());

  // One user action can move several slices in the same commit — a bulk import
  // fills the line items and resets the grid. Their effects all run before the
  // microtask, so the first one captures the snapshot and the rest join it,
  // making one step out of one action.
  const pending = useRef<{ values: UndoSnapshot; label: string; coalesceKey: string | null } | null>(null);

  const snapshot = useCallback((): UndoSnapshot => {
    const values: UndoSnapshot = {};
    for (const [id, slice] of slices.current) values[id] = slice.getLast();
    return values;
  }, []);

  const register = useCallback((id: string, slice: Slice) => { slices.current.set(id, slice); }, []);
  const unregister = useCallback((id: string) => { slices.current.delete(id); }, []);

  const record = useCallback((label: string, coalesceKey: string | null) => {
    if (pending.current) return;
    pending.current = { values: snapshot(), label, coalesceKey };
    queueMicrotask(() => {
      const step = pending.current;
      pending.current = null;
      if (step) dispatch({ type: 'record', step });
    });
  }, [snapshot]);

  /** Restore a snapshot, pre-arming each slice so the change is not recorded. */
  const applyValues = useCallback((values: UndoSnapshot) => {
    for (const [id, value] of Object.entries(values)) {
      const slice = slices.current.get(id);
      if (!slice) continue;
      slice.setLast(value);
      slice.apply(value);
    }
  }, []);

  const undo = useCallback(() => {
    const step = state.past[state.past.length - 1];
    if (!step) return;
    const redoStep = { values: snapshot(), label: step.label, coalesceKey: null };
    applyValues(step.values);
    dispatch({ type: 'undo', redoStep });
  }, [state.past, snapshot, applyValues]);

  const redo = useCallback(() => {
    const step = state.future[0];
    if (!step) return;
    const undoStep = { values: snapshot(), label: step.label, coalesceKey: null };
    applyValues(step.values);
    dispatch({ type: 'redo', undoStep });
  }, [state.future, snapshot, applyValues]);

  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  // Bound here rather than on the buttons, so the keys work in a form that
  // shows no controls at all. Only the frontmost window answers.
  const isActive = useModalActive();
  const keyed = useRef({ undo, redo, canUndo, canRedo });
  keyed.current = { undo, redo, canUndo, canRedo };
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      const action = matchUndoHotkey(e as unknown as UndoHotkeyEvent);
      if (!action) return;
      const k = keyed.current;
      // Nothing to step to — leave the key to whatever else wants it rather
      // than swallowing it into a no-op.
      if (action === 'undo' ? !k.canUndo : !k.canRedo) return;
      e.preventDefault();
      if (action === 'undo') k.undo(); else k.redo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive]);

  const value = useMemo<UndoContextValue>(() => ({
    register, unregister, record, undo, redo, clear, canUndo, canRedo,
    undoLabel: canUndo ? state.past[state.past.length - 1].label : null,
    redoLabel: canRedo ? state.future[0].label : null,
  }), [register, unregister, record, undo, redo, clear, canUndo, canRedo, state.past, state.future]);

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
}

export interface UndoControlsApi {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** What Undo/Redo would act on, for a button title. Null when unavailable. */
  undoLabel: string | null;
  redoLabel: string | null;
  /** End the history — call after a successful save. */
  clear: () => void;
}

/**
 * The enclosing form's undo stack, for custom UI or to `clear()` on save.
 * Everything is inert outside an {@link UndoProvider}.
 */
export function useUndo(): UndoControlsApi {
  const ctx = useContext(UndoContext);
  const noop = useCallback(() => {}, []);
  return {
    undo: ctx?.undo ?? noop,
    redo: ctx?.redo ?? noop,
    clear: ctx?.clear ?? noop,
    canUndo: ctx?.canUndo ?? false,
    canRedo: ctx?.canRedo ?? false,
    undoLabel: ctx?.undoLabel ?? null,
    redoLabel: ctx?.redoLabel ?? null,
  };
}

export interface UndoableOptions {
  /** Names the step in a button title: `"qty"`, `"line items"`. */
  label: string;
  /**
   * Consecutive changes sharing a key fold into one step — pass the field name
   * so a run of typing is one Undo rather than one per keystroke. Omit for a
   * change that is already whole, like a bulk import or a deleted row.
   */
  coalesceKey?: string | null;
}

/**
 * Put one piece of the form's state under the window's undo stack.
 *
 * `value` is watched; when it changes, the form as it stood beforehand becomes
 * a step. `apply` puts a value back — the same setter the form already uses.
 *
 *     const [items, setItems] = useState<Line[]>([]);
 *     useUndoable(items, setItems, { label: 'line items' });
 *
 * Registering more than one slice is the point: a step snapshots all of them
 * together, so undoing restores a coherent form rather than one slice out of
 * step with the rest.
 */
export function useUndoable<T>(value: T, apply: (next: T) => void, opts: UndoableOptions) {
  const ctx = useContext(UndoContext);
  const id = useId();
  const last = useRef(value);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!ctx) return;
    ctx.register(id, {
      getLast: () => last.current,
      setLast: v => { last.current = v as T; },
      apply: v => applyRef.current(v as T),
    });
    return () => ctx.unregister(id);
  }, [ctx, id]);

  const { label, coalesceKey = null } = opts;
  useEffect(() => {
    if (!ctx) return;
    if (Object.is(value, last.current)) return;
    // Record before moving `last`: the snapshot the provider takes reads this
    // slice through `getLast`, and must see the value from before the change.
    ctx.record(label, coalesceKey);
    last.current = value;
  });
}
