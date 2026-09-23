/**
 * SessionWindowRestore — reopen the windows the user had open.
 *
 * Window state is in-memory, so logging out — or just pressing F5 — has
 * always meant coming back to an empty desktop with the taskbar cleared.
 * Everything needed to rebuild it already existed: the window manager can
 * open a page window from its route and an entity window from its registry
 * key + id (it does exactly that when restoring a minimised item), and
 * ShellPrefs persists per-user state. This component is just the two wires:
 * it saves the identifying refs of the open windows (never their content),
 * and on a fresh mount with nothing open it replays them.
 *
 * Contracts:
 *  - Off switch: `restore_windows: false` in prefs (Preferences → Behavior).
 *    Default on.
 *  - Restore runs ONCE per mount, and only when no window is already open —
 *    a deep link that opened a window before this ran wins, we never stack
 *    a stale session on top of it.
 *  - Persisting starts only after the restore attempt, and writes only when
 *    the open windows differ from the saved set — the set the restore read,
 *    then the set last written that SETTLED (a save the adapter rejects does
 *    not count, so the next change retries). So a mount, replayed or not, writes nothing
 *    until the user opens or closes a window, and a consumer's adapter
 *    re-rendering (a new `save` each render) writes nothing either.
 *    Saves are debounced — opening five windows writes once.
 *  - The saved refs are read from the prefs available AT MOUNT. The bundled
 *    localStorage adapter is synchronous, so that is simply "the prefs"; a
 *    consumer whose prefs hydrate later misses the restore for that load
 *    rather than restoring at a surprising moment mid-session — and keeps its
 *    saved set, because the empty desktop it mounted onto is not a change.
 *  - Geometry is not session state. Moving or resizing a window changes no
 *    ref, so it writes nothing here; each window's box is Modal's, kept in
 *    browser localStorage (`erp_window_positions`).
 *  - Part-number lookup windows are not restored: they open through a search
 *    round-trip, not the registry, and a stale lookup re-running a search at
 *    login is a surprise rather than a restoration.
 */
import { useEffect, useRef } from 'react';

import { useWindowManager, type MinimizedItem } from './WindowManager';
import { useShellPrefsAdapter } from './ShellPrefs';

export interface SessionWindowRef {
  type: 'page' | 'entity';
  route?: string;
  entityType?: string;
  entityId?: string;
  label?: string;
}

/** The persistable identity of each open window — content never leaves the
 *  window, only the coordinates the registry needs to reopen it. */
export function toSessionRefs(openWindows: MinimizedItem[]): SessionWindowRef[] {
  const refs: SessionWindowRef[] = [];
  for (const w of openWindows) {
    if (w.type === 'page' && w.route) {
      refs.push({ type: 'page', route: w.route });
    } else if (w.entityType && w.entityId && w.type !== 'part_number') {
      refs.push({ type: 'entity', entityType: w.entityType, entityId: w.entityId, label: w.label, route: w.route });
    }
  }
  return refs;
}

/** Whether two ref lists name the same windows in the same order. Compared
 *  field by field, not as JSON: a backend may hand the saved refs back with
 *  their keys reordered (Postgres `jsonb` sorts them), which is no change. */
export function sameSessionRefs(a: SessionWindowRef[], b: SessionWindowRef[]): boolean {
  return a.length === b.length && a.every((r, i) => (
    r.type === b[i].type && r.route === b[i].route && r.entityType === b[i].entityType
    && r.entityId === b[i].entityId && r.label === b[i].label
  ));
}

const SAVE_DEBOUNCE_MS = 800;

export default function SessionWindowRestore() {
  const { openWindows, openEntity, openPage } = useWindowManager();
  // The RAW adapter, not useShellPrefs: this is the one caller that needs a
  // failed write to come back as a rejection, so the write is retried rather
  // than recorded as saved. useShellPrefs swallows it for everyone else.
  const { prefs, save } = useShellPrefsAdapter();
  const restoredRef = useRef(false);
  // The set the prefs hold, as far as this mount knows: what the restore
  // read, then what was last written.
  const savedRef = useRef<SessionWindowRef[]>([]);
  // The refs of the write currently in flight, if any. Without this, a write
  // that has been fired but not yet settled compares different on every render
  // in between, and an adapter that hands over a new `save` each render (all
  // three EFFICIENT portals) would fire a second write for the same set.
  const pendingRef = useRef<SessionWindowRef[] | null>(null);
  // Identifies the most recent write, so one that settles late cannot move
  // `savedRef` back behind a newer one.
  const writeSeq = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Restore, once, at mount ──
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved: SessionWindowRef[] = Array.isArray(prefs.session_windows) ? prefs.session_windows : [];
    savedRef.current = saved;
    if (prefs.restore_windows === false) return;
    if (openWindows.length > 0) return;
    for (const w of saved) {
      if (w.type === 'page' && w.route) openPage(w.route);
      else if (w.type === 'entity' && w.entityType && w.entityId) openEntity(w.entityType, w.entityId, undefined, w.label, w.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist on change, only after the restore attempt ──
  useEffect(() => {
    if (!restoredRef.current) return;
    clearTimeout(saveTimer.current);
    const refs = toSessionRefs(openWindows);
    // The desktop matches the saved set: nothing to write. This is what keeps
    // a mount whose prefs had not arrived from writing its empty desktop over
    // the set it never saw. It runs after the clear, so a window opened and
    // closed again inside the debounce cancels its own pending write.
    if (sameSessionRefs(refs, savedRef.current)) return;
    // Already on its way. Re-arming here is what would write it twice.
    if (pendingRef.current && sameSessionRefs(refs, pendingRef.current)) return;
    saveTimer.current = setTimeout(() => {
      // Advance the saved set when the write SETTLES, not when it is fired. A
      // rejected save must leave `savedRef` on the old set, so the next change
      // still compares different and writes the whole list again rather than
      // the shell believing a lost write landed and never retrying.
      //   - `save` may return void (the bundled localStorage adapter does),
      //     hence Promise.resolve.
      //   - `seq` drops a write that settles out of order, so a slow earlier
      //     write cannot pull `savedRef` back behind a later one.
      //   - A rejection clears `pendingRef` without advancing `savedRef`, so
      //     the next render or window change retries — which is how this
      //     behaved before the set was tracked at all.
      //   - An adapter that swallows its OWN failure resolves either way and
      //     this cannot tell the two apart: it has to let the rejection reach
      //     the shell. Every EFFICIENT portal adapter currently catches before
      //     its `.then()`, so for those this is inert until they are changed.
      const seq = ++writeSeq.current;
      pendingRef.current = refs;
      void Promise.resolve(save({ session_windows: refs }))
        .then(() => {
          if (seq !== writeSeq.current) return;
          savedRef.current = refs;
          pendingRef.current = null;
        })
        .catch(() => { if (seq === writeSeq.current) pendingRef.current = null; });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
  }, [openWindows, save]);

  return null;
}
