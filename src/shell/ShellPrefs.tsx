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
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

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
 *  features (e.g. `{ show_desktop_version: false }`). */
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

/** Returns the active prefs adapter. When no provider is mounted, returns a
 *  no-op adapter that reads as empty and silently drops saves — components
 *  still render, but persistence is a no-op. */
export function useShellPrefs(): ShellPrefsAdapter {
  const ctx = useContext(ShellPrefsContext);
  if (ctx) return ctx;
  return { prefs: {}, save: () => {} };
}
