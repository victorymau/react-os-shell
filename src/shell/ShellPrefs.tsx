/**
 * Shell-side user-preferences surface — the package never owns where prefs
 * live. The consumer supplies a hook returning the current prefs object plus
 * a save callback; the shell reads keys it knows about (theme,
 * taskbar_position, taskbar_size, world_clocks, favorite_documents,
 * desktop_folders, desktop_snap, notepad_notes, …) and patches them.
 *
 * When no provider is mounted, the shell falls back to localStorage scoped
 * by `storageKey` — so the package works out of the box for a backend-less
 * consumer.
 */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export interface ShellPrefsAdapter {
  /** The current prefs object. The shell reads its known keys directly off
   *  this; consumer-private keys are ignored. */
  prefs: Record<string, any>;
  /** Patch a subset of prefs. The shell calls this with shallow diffs. */
  save: (patch: Record<string, any>) => Promise<void> | void;
}

const ShellPrefsContext = createContext<ShellPrefsAdapter | null>(null);

export function ShellPrefsProvider({
  value,
  children,
}: { value: ShellPrefsAdapter; children: ReactNode }) {
  return <ShellPrefsContext.Provider value={value}>{children}</ShellPrefsContext.Provider>;
}

/** Default localStorage-backed adapter — useful when the consumer doesn't
 *  ship a backend. Pass the result into <ShellPrefsProvider value={…}>.
 *
 *  `defaults` are merged behind whatever's already stored, so they only
 *  apply for keys the user hasn't set yet. Useful for opting out of bundled
 *  features (e.g. `{ restore_windows: false }`). Note this is the only way to
 *  turn a default-ON feature off up front; a default-OFF one like
 *  `show_desktop_version` is already off until someone ticks its box. */
export function useLocalStoragePrefs(
  storageKey = 'react-os-shell:prefs',
  defaults?: Record<string, any>,
): ShellPrefsAdapter {
  const [prefs, setPrefs] = useState<Record<string, any>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return { ...(defaults ?? {}), ...stored };
    } catch { return { ...(defaults ?? {}) }; }
  });
  const save = useCallback((patch: Record<string, any>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [storageKey]);
  return { prefs, save };
}

/** Stable no-provider adapter: reads as empty, drops saves. One instance, so
 *  a component with no provider above it is not handed a new `save` (and a new
 *  effect dependency) on every render. */
const NO_PROVIDER: ShellPrefsAdapter = { prefs: {}, save: () => {} };

/** The adapter exactly as the consumer supplied it — its `save` MAY reject.
 *
 *  A consumer whose adapter reports a failed write is how the shell knows a
 *  write did not land, which is what lets `SessionWindowRestore` retry one
 *  rather than record a lost write as saved. That component is the only caller
 *  that wants this; everything else wants `useShellPrefs`. Exported from the
 *  module for it and for the spec, not from the package index. */
export function useShellPrefsAdapter(): ShellPrefsAdapter {
  return useContext(ShellPrefsContext) ?? NO_PROVIDER;
}

/** Returns the active prefs adapter. When no provider is mounted, reads as
 *  empty and silently drops saves — components still render, but persistence
 *  is a no-op.
 *
 *  `save` here NEVER REJECTS. Nearly every caller fires and forgets —
 *  `save({ desktop_bg: bg })` inside an onChange, with the result discarded —
 *  and an adapter that reports a failed write turns each of those into an
 *  unhandled rejection, one per failed PATCH, across the shell and every
 *  consumer. So the rejection is swallowed once here rather than at a dozen
 *  call sites that would each have to remember. `await save(…)` still works;
 *  it just resolves whether or not the write landed.
 *
 *  A caller that must know reads `useShellPrefsAdapter` instead. */
export function useShellPrefs(): ShellPrefsAdapter {
  const { prefs, save: rawSave } = useShellPrefsAdapter();
  const save = useCallback((patch: Record<string, any>) => {
    const result = rawSave(patch);
    // Stay thenable for `await save(…)`, but settled either way. Duck-typed:
    // an adapter may hand back any thenable, not a native Promise.
    return result && typeof (result as Promise<void>).then === 'function'
      ? (result as Promise<void>).catch(() => {})
      : result;
  }, [rawSave]);
  return useMemo(() => ({ prefs, save }), [prefs, save]);
}
