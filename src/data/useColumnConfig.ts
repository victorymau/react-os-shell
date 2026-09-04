import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useShellPrefs } from '../shell/ShellPrefs';
import { useDefaultColumnConfig } from './useDefaultColumnConfig';
import type { ColumnDef } from './types';

interface ColumnState {
  key: string;
  width: number;
  hidden?: boolean;
}

/** Whether two column states are the same arrangement. Used to turn a
 *  re-delivery of unchanged prefs into a no-op rather than a re-render: the
 *  prefs adapter hands the same value back after a refetch, and the effects
 *  below run on every change of it. */
function sameColumns(a: ColumnState[], b: ColumnState[]): boolean {
  return a.length === b.length &&
    a.every((c, i) => c.key === b[i].key && c.width === b[i].width && !!c.hidden === !!b[i].hidden);
}

/** Ensure _select column (if present) is always at index 0 and never hidden */
function pinSelectColumn(cols: ColumnState[]): ColumnState[] {
  const selectIdx = cols.findIndex(c => c.key === '_select');
  if (selectIdx >= 0) {
    const [sel] = cols.splice(selectIdx, 1);
    sel.hidden = false;
    cols.unshift(sel);
  }
  return cols;
}

/**
 * Fold a changed `defaultColumns` back into live column state.
 *
 * `columns` is seeded once, at mount. A consumer whose column list changes
 * WHILE mounted — a comparison period switched on, a mode that reveals extra
 * measures, a permission resolving late — got nothing: the new columns never
 * reached the state, so they never rendered, and the only way to see them was
 * to close the window and open it again. Withdrawn columns had the mirror
 * problem, lingering in state until `orderedColumns` spread an `undefined`
 * definition over them.
 *
 * The user's own decisions win wherever they exist: an existing column keeps
 * its width, its hidden flag and its place in the order. A new one lands
 * beside the column it was DECLARED next to rather than at the far right,
 * because a column that only makes sense next to another — a prior-period
 * figure beside the current one — is useless eleven columns away from it.
 *
 * Returns `prev` unchanged when nothing differs, so a consumer that rebuilds
 * its `ColumnDef[]` array every render causes no re-render.
 */
function reconcileColumns(
  prev: ColumnState[],
  defaultColumns: ColumnDef[],
  withdrawn: Map<string, ColumnState>,
): ColumnState[] {
  const declared = new Set(defaultColumns.map(d => d.key));
  const known = new Set(prev.map(c => c.key));
  const added = defaultColumns.filter(d => !known.has(d.key));
  // `_select` is the grid's own column and is never in the consumer's list.
  const kept = prev.filter(c => c.key === '_select' || declared.has(c.key));
  if (!added.length && kept.length === prev.length) return prev;

  // Remember what the user had done to a column the consumer has withdrawn,
  // so a set that comes back — a comparison toggled off and on again —
  // returns as they left it instead of resetting to the declaration.
  for (const col of prev) {
    if (col.key !== '_select' && !declared.has(col.key)) withdrawn.set(col.key, col);
  }

  const out = [...kept];
  for (const def of added) {
    const at = defaultColumns.indexOf(def);
    // Walk back through the declaration for the nearest column already
    // placed, and land just after it. Consecutive new columns chain, so a
    // declared pair stays a pair.
    let anchor = -1;
    for (let i = at - 1; i >= 0; i -= 1) {
      const idx = out.findIndex(c => c.key === defaultColumns[i].key);
      if (idx >= 0) { anchor = idx; break; }
    }
    out.splice(anchor + 1, 0, withdrawn.get(def.key)
      ?? { key: def.key, width: def.defaultWidth || 150, hidden: def.defaultHidden });
    withdrawn.delete(def.key);
  }
  return pinSelectColumn(out);
}

/**
 * Resizable + reorderable + hideable column state for `<ResizableTable>`.
 *
 * Reads and persists per-user through the `<ShellPrefsProvider>` adapter
 * (`prefs.columns_{tableId}`), with a 1-second debounce on the save, and reads
 * per-viewport admin defaults through the shared
 * `GET /auth/default-columns/{tableId}?viewport=…` probe.
 *
 * The prefs half used to be a raw `GET /auth/me/` fired from a `[tableId]`
 * effect, outside react-query — so every list mount re-fetched the whole user
 * profile (~1.5 MB on prod), on a client with no cache adapter and no in-flight
 * dedupe, and a screen that also renders a column-aware CSV export paid for it
 * twice. The adapter already holds that profile in one cached query, which is
 * the same object the raw GET was reading `preferences` off (SG#00590).
 *
 * Three consequences worth knowing, because this is NOT behaviour-preserving:
 *
 *  - **A `<ShellPrefsProvider>` is now required for server-side persistence.**
 *    Without one, `useShellPrefs()` reads empty and drops saves, so column
 *    config degrades to localStorage-only. All three consumers that render
 *    `<EntityList>`/`<ResizableTable>` mount the provider.
 *  - **Prefs and admin defaults resolve independently**, where the raw pair was
 *    a single `Promise.all`. If the admin default lands while prefs are still
 *    loading it applies first and the user's own config replaces it a beat
 *    later, rather than never showing. `useSort` has always behaved this way;
 *    the two hooks now agree. The precedence that used to be one `if/else if`
 *    is now the `userSavedRef` guard below plus the order the two effects fire
 *    in — `tests/columnConfigDefaultsPrecedence.test.tsx` pins both directions.
 *  - **A failed save is silent here.** The old `useMutation` let a rejected
 *    `PATCH` reach a consumer's global `MutationCache({ onError })` — the admin
 *    portal toasted it. The adapter's `save` owns its own failures now, so a
 *    consumer that wants that toast raises it inside the adapter.
 *
 * What it does NOT require is a `<QueryClientProvider>` — it used to, for the
 * `useMutation`. `useDefaultColumnConfig` falls back to a client the package
 * owns when no provider is mounted.
 */
export function useColumnConfig(tableId: string, defaultColumns: ColumnDef[]) {
  const { prefs, save } = useShellPrefs();
  const prefKey = `columns_${tableId}`;
  const userSaved = prefs[prefKey];
  const { defaultConfig } = useDefaultColumnConfig(tableId);

  const [columns, setColumns] = useState<ColumnState[]>(() => {
    const cached = localStorage.getItem(`col-config-${tableId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ColumnState[];
        const existing = new Set(parsed.map(c => c.key));
        const merged = pinSelectColumn([
          ...parsed.filter(c => defaultColumns.some(d => d.key === c.key)),
          // `hidden: d.defaultHidden` matches the server-prefs merge below.
          // A column added to the consumer's ColumnDef list since this cache
          // was written has no entry in it, so its `defaultHidden` is the
          // only opinion there is.
          ...defaultColumns.filter(d => !existing.has(d.key)).map(d => ({ key: d.key, width: d.defaultWidth || 150, hidden: d.defaultHidden })),
        ]);
        return merged;
      } catch { /* fall through */ }
    }
    return pinSelectColumn(defaultColumns.map(d => ({ key: d.key, width: d.defaultWidth || 150, hidden: d.defaultHidden })));
  });

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const resizingRef = useRef<{ idx: number; startX: number; startWidth: number } | null>(null);

  // A change made in THIS mount always wins over an async restore below —
  // needed now that the restore effects are keyed on values that can arrive
  // (or be re-delivered by a refetch) long after mount. Same guard `useSort`
  // has always carried.
  const touchedRef = useRef(false);
  const userSavedRef = useRef(userSaved);
  userSavedRef.current = userSaved;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const persistColumns = useCallback((cols: ColumnState[]) => {
    touchedRef.current = true;
    localStorage.setItem(`col-config-${tableId}`, JSON.stringify(cols));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Through the adapter, not a raw `PATCH /auth/me/`: the adapter patches the
    // cached profile optimistically and invalidates it, so the value the
    // restore effect below reads back is the one we just saved. A raw PATCH
    // left that cache stale, and the next window opened would have restored the
    // pre-change columns over the fresh ones.
    saveTimer.current = setTimeout(() => { void saveRef.current({ [prefKey]: cols }); }, 1000);
  }, [tableId, prefKey]);

  // The debounce deliberately outlives unmount, as it always has: resizing a
  // column and closing the window inside the second must still reach the
  // server. `saveRef` keeps the adapter callback reachable for that; the
  // adapter's own work (cache write + PATCH) is not tied to this component.

  // The user's own saved config. It arrives from the prefs adapter, which is
  // backed by the consumer's single cached `/auth/me/` query — no request of
  // our own. Adapters resolve async, so a window opened before prefs land
  // starts on the localStorage/`ColumnDef` state and picks this up after.
  useEffect(() => {
    if (touchedRef.current || !Array.isArray(userSaved)) return;
    const existing = new Set(userSaved.map((c: any) => c.key));
    const merged = pinSelectColumn([
      // Copied, not referenced: `pinSelectColumn` writes `hidden` on the entry
      // it pins, and these objects belong to the consumer's cached profile now.
      ...userSaved.filter((c: any) => defaultColumns.some(d => d.key === c.key)).map((c: any) => ({ ...c })),
      ...defaultColumns.filter(d => !existing.has(d.key)).map(d => ({ key: d.key, width: d.defaultWidth || 150, hidden: d.defaultHidden })),
    ]);
    setColumns(prev => (sameColumns(prev, merged) ? prev : merged));
    localStorage.setItem(`col-config-${tableId}`, JSON.stringify(merged));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, userSaved]);

  // The admin-saved default — only consulted while the user has no config of
  // their own, exactly as the `else if` it replaces did. Read through the ref
  // so this reflects whatever prefs have resolved by the time the probe lands;
  // if they resolve later still, the effect above overrides.
  useEffect(() => {
    if (touchedRef.current || Array.isArray(userSavedRef.current)) return;
    const visible = defaultConfig?.visible_columns;
    // Non-empty system defaults — apply them. (An empty array is treated
    // as "no admin opinion" and we leave the initial useState value alone,
    // which uses the per-column `defaultHidden` flag from each ColumnDef.)
    if (!Array.isArray(visible) || visible.length === 0) return;
    const visibleSet = new Set(visible);
    const systemCols = pinSelectColumn(defaultColumns.map(d => ({
      key: d.key,
      width: d.defaultWidth || 150,
      hidden: !visibleSet.has(d.key),
    })));
    setColumns(prev => (sameColumns(prev, systemCols) ? prev : systemCols));
    localStorage.setItem(`col-config-${tableId}`, JSON.stringify(systemCols));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, defaultConfig]);

  // Follow the consumer's column list for as long as this stays mounted.
  // Deliberately NOT persisted: a column set that comes and goes with a UI
  // toggle would otherwise PATCH the user's profile on every flip. The
  // existing persist paths — resize, drag, hide, reset — still capture it the
  // moment the user actually decides something.
  const withdrawnRef = useRef(new Map<string, ColumnState>());
  useEffect(() => {
    setColumns(prev => reconcileColumns(prev, defaultColumns, withdrawnRef.current));
  }, [defaultColumns]);

  const visibleColumns = columns.filter(c => !c.hidden);

  const onResizeStart = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const visCol = visibleColumns[idx];
    const realIdx = columns.findIndex(c => c.key === visCol.key);
    resizingRef.current = { idx: realIdx, startX: e.clientX, startWidth: columns[realIdx].width };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const { idx: i, startX, startWidth } = resizingRef.current;
      const minW = defaultColumns.find(d => d.key === columns[i].key)?.minWidth || 30;
      const newWidth = Math.max(minW, startWidth + ev.clientX - startX);
      setColumns(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], width: newWidth };
        return updated;
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      resizingRef.current = null;
      setColumns(prev => { persistColumns(prev); return prev; });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [columns, visibleColumns, defaultColumns, persistColumns]);

  const onDragStart = useCallback((idx: number) => {
    setDraggedIdx(idx);
  }, []);

  const onDragOver = useCallback((visIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdx === null) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let gap = e.clientX < rect.left + rect.width / 2 ? visIdx : visIdx + 1;
    const vis = columns.filter(c => !c.hidden);
    if (vis[0]?.key === '_select' && gap === 0) gap = 1;
    setDropGap(gap);
  }, [draggedIdx, columns]);

  const onDrop = useCallback((_visIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdx === null || dropGap === null) {
      setDraggedIdx(null);
      setDropGap(null);
      return;
    }
    if (dropGap === draggedIdx || dropGap === draggedIdx + 1) {
      setDraggedIdx(null);
      setDropGap(null);
      return;
    }
    setColumns(prev => {
      const visible = prev.filter(c => !c.hidden);
      const moved = visible[draggedIdx];
      if (!moved) return prev;
      const fromReal = prev.findIndex(c => c.key === moved.key);
      let toReal: number;
      if (dropGap < visible.length) {
        toReal = prev.findIndex(c => c.key === visible[dropGap].key);
      } else {
        toReal = prev.findIndex(c => c.key === visible[visible.length - 1].key) + 1;
      }
      const updated = [...prev];
      const [item] = updated.splice(fromReal, 1);
      updated.splice(toReal > fromReal ? toReal - 1 : toReal, 0, item);
      persistColumns(updated);
      return updated;
    });
    setDraggedIdx(null);
    setDropGap(null);
  }, [draggedIdx, dropGap, persistColumns]);

  const onDragEnd = useCallback(() => {
    setDraggedIdx(null);
    setDropGap(null);
  }, []);

  const toggleColumn = useCallback((key: string) => {
    setColumns(prev => {
      const updated = prev.map(c => c.key === key ? { ...c, hidden: !c.hidden } : c);
      if (updated.filter(c => !c.hidden).length === 0) return prev;
      persistColumns(updated);
      return updated;
    });
  }, [persistColumns]);

  const resetColumns = useCallback(() => {
    // Carry `defaultHidden` through, exactly as the initial state and the
    // server-prefs merge above do. Dropping it made Reset un-hide every
    // column the consumer had hidden by default — and reset persists, to
    // localStorage and then to the user's profile, so nothing healed it on a
    // later load (BG#00576).
    const defaults = pinSelectColumn(defaultColumns.map(d => ({
      key: d.key,
      width: d.defaultWidth || 150,
      hidden: d.defaultHidden,
    })));
    setColumns(defaults);
    persistColumns(defaults);
  }, [defaultColumns, persistColumns]);

  const orderedColumns = visibleColumns.map(c => {
    const def = defaultColumns.find(d => d.key === c.key);
    return { ...def!, width: c.width };
  }).filter(Boolean);

  const allColumns = columns.map(c => {
    const def = defaultColumns.find(d => d.key === c.key);
    return { key: c.key, label: def?.label || c.key, hidden: !!c.hidden };
  });

  return {
    orderedColumns,
    allColumns,
    onResizeStart,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    toggleColumn,
    resetColumns,
    draggedIdx,
    dropGap,
  };
}
