import { useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { ModalActions, useEnclosingModalId, useIsActiveWindow } from './Modal';
import UndoControls from './UndoControls';
import { UndoContext, type UndoContextValue, type UndoSlice as Slice } from './undoContext';
import { useShellAuth } from './ShellAuth';
import {
  undoReducer,
  emptyUndoState,
  matchUndoHotkey,
  type UndoSnapshot,
  type UndoHotkeyEvent,
} from '../hooks/undoHistory';

export type { UndoContextValue, UndoSlice } from './undoContext';


/**
 * Runaway detection: this many steps in a row, with no pause longer than
 * {@link RUNAWAY_QUIET_MS} between any two of them, is a render loop.
 *
 * Counting per fixed window would be the obvious thing and is the wrong one —
 * a loop slow enough to straddle the window resets the count on every pass and
 * never trips, which is precisely the machine where the hang is worst. A run
 * only resets on a genuine gap, so what trips it is a *sustained* rate rather
 * than a peak, and a slower machine takes longer to get there rather than
 * getting away with it.
 */
const RUNAWAY_LIMIT = 500;
const RUNAWAY_QUIET_MS = 250;

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
  /**
   * The window this stack belongs to — the same stable key its `<Modal>` gets
   * as `windowKey`, which for a `WindowManager` window is `item.id`.
   *
   * This is what keeps ⌘Z inside the window the user is looking at. The
   * provider binds its hotkey on `window`, so every open window's provider sees
   * every keypress; the id is how one of them recognises the press as its own.
   * Without it there is no per-window identity to test and the best available
   * answer is "is any window active", which is true in all of them at once.
   *
   * Omit it for a provider nested inside a `<Modal>` — there the enclosing
   * modal's own context answers the question — or where there are no windows
   * at all.
   */
  windowId?: string;
}

/**
 * Undo/redo for everything in one open form.
 *
 * Wrap a form window in it, register each piece of its state with
 * {@link useUndoable}, and the whole form shares one stack: a field edit, a
 * line added, a bulk import are all steps in the same history, undone newest
 * first. Two open windows have two independent stacks, and passing
 * {@link UndoProviderProps.windowId} is what keeps them independent in
 * practice — see that prop.
 *
 * History is the unsaved edit only. It lives with the mounted provider and
 * dies with it. Both ends of the edit are the caller's to mark: `baseline()`
 * once the record has arrived, so the load is the starting point rather than
 * the first thing ⌘Z takes back, and `clear()` at a save, past which "earlier"
 * is on the server and not something a form can reach.
 *
 * Anyone who may edit the record gets it — it is not a privileged feature, and
 * the user most helped by an undo is the one least sure of what they just did.
 * A reader is the only one it is withheld from, and only because there is
 * nothing for them to take back. Note that `canEdit` is the caller's claim, and
 * the shell-level provider `WindowManager` mounts around every window has no
 * way to make it: it knows nothing about the record inside. That one defaults
 * to enabled, and a read-only form states the fact by nesting its own
 * `<UndoProvider canEdit={false}>`, which shadows it.
 */
export function UndoProvider({ children, canEdit = true, perms, windowId }: UndoProviderProps) {
  const [state, dispatch] = useReducer(undoReducer, emptyUndoState);
  const slices = useRef(new Map<string, Slice>());
  // How many slices are registered, as state rather than the map's size: the
  // map is a ref and changes to it do not render, and "does this window have a
  // form in it" is exactly what the footer needs to re-render on.
  const [sliceCount, setSliceCount] = useState(0);
  const hasState = sliceCount > 0;
  // Read-only claims from inside the form — `useUndoCanEdit(false)`. Counted,
  // so two components claiming it and one unmounting leaves the other's claim
  // standing. This is how a form whose state lives in the same component as
  // its markup says "read-only" to the provider WindowManager mounted above it:
  // nesting a `<UndoProvider canEdit={false}>` in its JSX would only cover the
  // children, while its own hooks would keep registering with the outer stack.
  const [readOnlyClaims, setReadOnlyClaims] = useState(0);
  const { hasAnyPerm } = useShellAuth();

  // Read-only means nothing to take back. Gating here rather than on the
  // buttons keeps a stale ⌘Z from stepping a form the user may not change.
  const enabled = canEdit && readOnlyClaims === 0 && (perms && perms.length > 0 ? hasAnyPerm(perms) : true);

  // One user action can move several slices in the same commit — a bulk import
  // fills the line items and resets the grid. Their effects all run before the
  // microtask, so the first one captures the snapshot and the rest join it,
  // making one step out of one action.
  const pending = useRef<{ values: UndoSnapshot; label: string; coalesceKey: string | null } | null>(null);

  // Set while a `baseline()` is settling — see it further down.
  const suspended = useRef(false);

  const snapshot = useCallback((): UndoSnapshot => {
    const values: UndoSnapshot = {};
    for (const [id, slice] of slices.current) values[id] = slice.getLast();
    return values;
  }, []);

  const register = useCallback((id: string, slice: Slice) => {
    if (!slices.current.has(id)) setSliceCount(c => c + 1);
    slices.current.set(id, slice);
  }, []);
  const unregister = useCallback((id: string) => {
    if (slices.current.delete(id)) setSliceCount(c => c - 1);
  }, []);
  const claimReadOnly = useCallback((on: boolean) => { setReadOnlyClaims(c => c + (on ? 1 : -1)); }, []);
  // Whether a pair of Undo/Redo controls is on screen for this stack without
  // the form having mounted one. Two renderers can put it there — see the
  // return below and `Modal`'s footer — and `UndoControls` reads this to stand
  // down when it is, so a form still carrying its own mount shows one pair.
  const [autoMountClaims, setAutoMountClaims] = useState(0);
  const autoMounted = autoMountClaims > 0;
  const claimAutoMount = useCallback((on: boolean) => { setAutoMountClaims(c => c + (on ? 1 : -1)); }, []);

  // Runaway guard. A slice registered with a value that is freshly allocated
  // on every render — `useUndoable(rows.filter(r => r.on), ...)` rather than a
  // piece of state — has a new identity every time the provider re-renders,
  // and every recorded step re-renders the provider. That is a closed loop
  // running at render speed: it locks the tab rather than merely being slow,
  // and it presents as a browser hang with no clue as to which slice did it.
  // No sequence of human actions produces this many steps this fast, so the
  // rate is a sound tell. Trip once, say which slice and why, and stop
  // recording — a dead undo stack and a console error can be diagnosed.
  const runaway = useRef({ last: 0, count: 0, tripped: false });

  const record = useCallback((label: string, coalesceKey: string | null) => {
    if (!enabled || suspended.current || pending.current) return;
    const r = runaway.current;
    if (r.tripped) return;
    const now = Date.now();
    if (now - r.last > RUNAWAY_QUIET_MS) r.count = 0;
    r.last = now;
    if (++r.count > RUNAWAY_LIMIT) {
      r.tripped = true;
      console.error(
        `[react-os-shell] UndoProvider: "${label}" recorded ${RUNAWAY_LIMIT} undo steps with no ` +
        'pause between them, which no user action can do. The value passed to useUndoable for ' +
        'this slice is almost certainly rebuilt on every render (a .map/.filter/object literal ' +
        'in the call) rather than held in state, so it reads as changed every time — and since ' +
        'recording a step re-renders the form, that is a loop. Undo recording is now off for ' +
        'this form to keep the tab responsive.',
      );
      return;
    }
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

  /**
   * Drop the history and make wherever the form is going to be the starting
   * point.
   *
   * The awkward moment is a form filled from an async fetch. The record
   * arriving is a state change like any other, so every slice records it, and
   * the user's first ⌘Z hands back the empty form they were looking at before
   * it loaded. Clearing after the fact does not fix that on its own, because
   * the values assigned alongside the call have not landed yet — they arrive in
   * the commit this schedules, and record on the way in.
   *
   * So it suspends recording rather than only clearing: the slices still take
   * the loaded values as their own starting point (`useUndoable` moves `last`
   * whether or not a step came of it), they just do not call it an edit. The
   * effect below lifts the suspension once that commit's slices have run —
   * child effects before parent — which is one commit, exactly, and no timer.
   *
   * The one thing it asks of a caller is to assign in the same effect:
   *
   *     useEffect(() => {
   *       if (!data) return;
   *       setName(data.name); setQty(data.qty);
   *       baseline();
   *     }, [data]);
   *
   * React batches those into one commit, so the order within the effect does
   * not matter. Assigning in a *different* effect from the `baseline()` call
   * does, and would leave the load recorded.
   */
  const [baselineToken, setBaselineToken] = useState(0);

  const baseline = useCallback(() => {
    suspended.current = true;
    pending.current = null;
    setBaselineToken(t => t + 1);
    dispatch({ type: 'clear' });
  }, []);

  useEffect(() => {
    if (!suspended.current) return;
    suspended.current = false;
    pending.current = null;
    dispatch({ type: 'clear' });
  }, [baselineToken]);

  // Same operation, named for the other end of the edit. Kept distinct at the
  // call site because "clear on save" and "baseline on load" are different
  // facts about the form, and a reader of either line should not have to work
  // out which one was meant.
  const clear = baseline;

  const canUndo = enabled && state.past.length > 0;
  const canRedo = enabled && state.future.length > 0;

  // Bound here rather than on the buttons, so the keys work in a form that
  // shows no controls at all. The listener is on `window`, so every open
  // window's provider sees every press — `windowId` is what makes exactly one
  // of them answer.
  const isActive = useIsActiveWindow(windowId);
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
    register, unregister, record, undo, redo, clear, baseline, canUndo, canRedo, enabled,
    hasState, autoMounted, claimAutoMount, claimReadOnly,
    undoLabel: canUndo ? state.past[state.past.length - 1].label : null,
    redoLabel: canRedo ? state.future[0].label : null,
  }), [register, unregister, record, undo, redo, clear, baseline, canUndo, canRedo, enabled,
    hasState, autoMounted, claimAutoMount, claimReadOnly, state.past, state.future]);

  // The controls are the shell's to show, not the form's to remember. A stack
  // with state in it and a user who may edit gets its Undo/Redo pair in the
  // window footer, left slot, without the form mounting anything. Which
  // component puts it there depends on where the provider sits: one mounted
  // inside a window — a form's own `<UndoProvider canEdit=…>` — portals it
  // through `ModalActions` like any other footer action, here. The one
  // `WindowManager` mounts sits ABOVE the `<Modal>` and has no footer to reach,
  // so there the Modal reads this context and renders the pair itself.
  const insideModal = useEnclosingModalId() !== '';
  const showsOwnControls = insideModal && enabled && hasState;
  useEffect(() => {
    if (!showsOwnControls) return;
    claimAutoMount(true);
    return () => claimAutoMount(false);
  }, [showsOwnControls, claimAutoMount]);

  return (
    <UndoContext.Provider value={value}>
      {showsOwnControls && <ModalActions position="left"><UndoControls auto /></ModalActions>}
      {children}
    </UndoContext.Provider>
  );
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
  /**
   * Make the form as it stands the starting point, discarding the history.
   *
   * Call it once the record has arrived from the server. State filled from a
   * fetch is a change like any other as far as the slices are concerned, so
   * without this the load itself is the oldest step and the user's first ⌘Z
   * empties the form they were just given:
   *
   *     const { data } = useQuery(...);
   *     const { baseline } = useUndo();
   *     useEffect(() => { if (data) baseline(); }, [data, baseline]);
   *
   * Worth calling on every arrival, not just the first: a window kept open
   * across a refetch, or one whose entity changes underneath it, wants the
   * same treatment, and the call is idempotent for a form nobody has touched.
   */
  baseline: () => void;
  /** False when the user may not edit this record, so custom UI can hide
   *  itself the way `UndoControls` does. */
  enabled: boolean;
  /** True once the form has registered any state — the window has something
   *  an Undo could act on, and the shell shows the controls for it. */
  hasState: boolean;
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
    baseline: ctx?.baseline ?? noop,
    canUndo: ctx?.canUndo ?? false,
    canRedo: ctx?.canRedo ?? false,
    undoLabel: ctx?.undoLabel ?? null,
    redoLabel: ctx?.redoLabel ?? null,
    enabled: ctx?.enabled ?? false,
    hasState: ctx?.hasState ?? false,
  };
}

/**
 * Tell the enclosing stack whether this record may be edited right now.
 *
 * `enabled` is otherwise the provider's own claim (`canEdit`, `perms`), and
 * the provider `WindowManager` mounts around every window makes none — it
 * knows nothing about the record inside. A form that does know says so here:
 *
 *     useUndoCanEdit(!isLocked);
 *
 * and while the value is false the stack records nothing, ⌘Z is left to the
 * browser, and the footer shows no controls. Prefer this over nesting a
 * `<UndoProvider canEdit={false}>` in the form's JSX: that shadows the stack
 * for the *children* only, while the form's own `useUndoableState` calls —
 * made in the same component, above the nested provider in the tree — keep
 * registering with the outer one, which stays enabled. The nested provider
 * remains right for a read-only *child* subtree.
 */
export function useUndoCanEdit(canEdit: boolean) {
  const ctx = useContext(UndoContext);
  const claim = ctx?.claimReadOnly;
  useEffect(() => {
    if (!claim || canEdit) return;
    claim(true);
    return () => claim(false);
  }, [claim, canEdit]);
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
 *
 * `value` must be the state itself, not something derived from it on the way
 * in. A change is detected by identity, so `useUndoable(rows.filter(r => r.on),
 * ...)` hands over a new array on every render and reads as a change every
 * time — and since recording a step re-renders the provider, that closes a
 * loop at render speed. The provider trips a runaway guard and says so rather
 * than letting the tab hang, but the fix is at the call site: register the
 * state, and derive from it afterwards.
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
  // `value` alone, deliberately. The context object is a new identity after
  // every recorded step — it carries `canUndo` — so listing it here would run
  // this effect on each one; it is read through a ref instead. `label` and
  // `coalesceKey` are what a change would be *called*, not a change in
  // themselves, and neither should provoke a step.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const optsRef = useRef({ label, coalesceKey });
  optsRef.current = { label, coalesceKey };
  useEffect(() => {
    const c = ctxRef.current;
    if (!c) return;
    if (Object.is(value, last.current)) return;
    // Record before moving `last`: the snapshot the provider takes reads this
    // slice through `getLast`, and must see the value from before the change.
    c.record(optsRef.current.label, optsRef.current.coalesceKey);
    last.current = value;
  }, [value]);
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
