import { createContext, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { useModalActive } from './Modal';
import { useShellAuth } from './ShellAuth';
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
  enabled: boolean;
}

const UndoContext = createContext<UndoContextValue | null>(null);

export interface UndoProviderProps {
  children: React.ReactNode;
  /**
   * Whether this user may edit the record. Undo is offered to everyone who
   * can — it is not gated on role or seniority — and withheld from a reader
   * only because they have nothing to take back. Defaults to true.
   */
  canEdit?: boolean;
  /**
   * Permission codes that count as "may edit", checked through
   * `ShellAuthProvider`. Combined with `canEdit`, so a form that already knows
   * it is read-only stays read-only whatever the codes say. Omit to rely on
   * `canEdit` alone.
   */
  perms?: string[];
}

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
 *
 * Anyone who may edit the record gets it — it is not a privileged feature, and
 * the user most helped by an undo is the one least sure of what they just did.
 * A reader is the only one it is withheld from, and only because there is
 * nothing for them to take back.
 */
export function UndoProvider({ children, canEdit = true, perms }: UndoProviderProps) {
  const [state, dispatch] = useReducer(undoReducer, emptyUndoState);
  const slices = useRef(new Map<string, Slice>());
  const { hasAnyPerm } = useShellAuth();

  // Read-only means nothing to take back. Gating here rather than on the
  // buttons keeps a stale ⌘Z from stepping a form the user may not change.
  const enabled = canEdit && (perms && perms.length > 0 ? hasAnyPerm(perms) : true);

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
    if (!enabled || pending.current) return;
    pending.current = { values: snapshot(), label, coalesceKey };
    queueMicrotask(() => {
      const step = pending.current;
      pending.current = null;
      if (step) dispatch({ type: 'record', step });
    });
  }, [enabled, snapshot]);

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

  const canUndo = enabled && state.past.length > 0;
  const canRedo = enabled && state.future.length > 0;

  // Bound here rather than on the buttons, so the keys work in a form that
  // shows no controls at all. Only the frontmost window answers.
  const isActive = useModalActive();
  const keyed = useRef({ undo, redo, canUndo, canRedo });
  keyed.current = { undo, redo, canUndo, canRedo };
  useEffect(() => {
    if (!isActive || !enabled) return;
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
  }, [isActive, enabled]);

  const value = useMemo<UndoContextValue>(() => ({
    register, unregister, record, undo, redo, clear, canUndo, canRedo, enabled,
    undoLabel: canUndo ? state.past[state.past.length - 1].label : null,
    redoLabel: canRedo ? state.future[0].label : null,
  }), [register, unregister, record, undo, redo, clear, canUndo, canRedo, enabled, state.past, state.future]);

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
  /** False when the user may not edit this record, so custom UI can hide
   *  itself the way `UndoControls` does. */
  enabled: boolean;
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
    enabled: ctx?.enabled ?? false,
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

/**
 * `useState`, with the value in the window's undo stack.
 *
 * Written to be a rename rather than an extra line, because the forms this is
 * for hold their state in dozens of separate `useState` calls — one of them has
 * forty-three. Adopting a form is then a per-line edit:
 *
 *     const [supplier, setSupplier] = useState('');
 *     const [supplier, setSupplier] = useUndoableState('', { label: 'supplier' });
 *
 * Which also makes the choice legible: state left as plain `useState` is state
 * deliberately kept out of the history. Keep it that way for anything that is
 * not the user's input — a search box, fetched data, validation output, an
 * initialisation guard. Undoing those puts stale results back on screen, and a
 * reverted guard can re-fire the effect it exists to suppress.
 *
 * Pass `coalesceKey` for anything typed into, so a run of keystrokes is one
 * Undo; the field's own name is the obvious key.
 */
export function useUndoableState<T>(
  initial: T | (() => T),
  opts: UndoableOptions,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  // Restore through the updater form, so a T that is itself a function is set
  // rather than called.
  useUndoable(value, next => setValue(() => next), opts);
  return [value, setValue];
}
