import { useEffect, useRef, useState } from 'react';
import { useShellPrefs } from '../shell/ShellPrefs';
import apiClient, { isShellApiClientConfigured } from '../api/client';
import type { SortState } from './types';

/** Guard for values restored from prefs / localStorage / the backend —
 *  anything that isn't a well-formed `{ field, direction }` is ignored. */
function isValidSort(v: unknown): v is SortState {
  const s = v as SortState | null | undefined;
  return !!s && typeof s.field === 'string' && s.field.length > 0 &&
    (s.direction === 'asc' || s.direction === 'desc');
}

/**
 * Sort-state hook used by list pages. Returns:
 * - `sort` — current `{ field, direction }`
 * - `onSort(field)` — toggle direction if same field, else activate asc
 * - `ordering` — DRF-style string (`'-mid'` for desc, `'mid'` for asc) ready
 *    to drop into a query-string param.
 *
 * Pass `tableId` (the same id the list gives `<ResizableTable>`/`<EntityList>`)
 * to persist the user's choice alongside their column config. Restore order:
 * per-user pref (`prefs.sort_{tableId}` via the ShellPrefs adapter) → the
 * admin-saved default on `/auth/default-columns/{tableId}/` → the page's
 * `defaultField`/`defaultDir`. localStorage mirrors the last-applied value so
 * the first render (before async prefs arrive) already uses the last-known
 * sort instead of flashing the default and refetching. Without `tableId` the
 * hook is pure in-memory state, exactly as before.
 */
export function useSort(defaultField: string, defaultDir: 'asc' | 'desc' = 'asc', tableId?: string) {
  const { prefs, save } = useShellPrefs();
  const prefKey = tableId ? `sort_${tableId}` : null;

  const [sort, setSort] = useState<SortState>(() => {
    if (prefKey) {
      if (isValidSort(prefs[prefKey])) return prefs[prefKey];
      try {
        const cached = JSON.parse(localStorage.getItem(`sort-config-${tableId}`) || 'null');
        if (isValidSort(cached)) return cached;
      } catch { /* fall through */ }
    }
    return { field: defaultField, direction: defaultDir };
  });

  // A click this mount always wins over any async restore below.
  const touchedRef = useRef(false);
  const savedPref = prefKey ? prefs[prefKey] : undefined;
  const savedRef = useRef(savedPref);
  savedRef.current = savedPref;

  // Per-user pref — prefs adapters load async, so a window opened before they
  // arrive starts on the default; apply the pref when it turns up.
  useEffect(() => {
    if (touchedRef.current || !isValidSort(savedPref)) return;
    setSort(prev =>
      prev.field === savedPref.field && prev.direction === savedPref.direction ? prev : savedPref,
    );
    try { localStorage.setItem(`sort-config-${tableId}`, JSON.stringify(savedPref)); } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, (savedPref as SortState | undefined)?.field, (savedPref as SortState | undefined)?.direction]);

  // Admin-saved default — only consulted while the user has no pref of their
  // own (the per-user branch above overrides it whenever prefs resolve later).
  useEffect(() => {
    if (!tableId || !isShellApiClientConfigured()) return;
    // Same viewport heuristic as useColumnConfig, so the sort default rides
    // the same per-viewport row the column defaults live on.
    const viewport: 'desktop' | 'mobile' =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
        ? 'mobile' : 'desktop';
    apiClient.get(`/auth/default-columns/${tableId}/`, { params: { viewport } })
      .then(res => {
        const dflt = res?.data?.sort;
        if (touchedRef.current || isValidSort(savedRef.current) || !isValidSort(dflt)) return;
        setSort(dflt);
        try { localStorage.setItem(`sort-config-${tableId}`, JSON.stringify(dflt)); } catch { /* ignore */ }
      })
      .catch(() => { /* no admin default — keep the page default */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const onSort = (field: string) => {
    touchedRef.current = true;
    const next: SortState =
      sort.field === field
        ? { field, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' };
    setSort(next);
    if (prefKey) {
      try { localStorage.setItem(`sort-config-${tableId}`, JSON.stringify(next)); } catch { /* ignore */ }
      void save({ [prefKey]: next });
    }
  };

  const ordering = sort.direction === 'desc' ? `-${sort.field}` : sort.field;

  return { sort, onSort, ordering };
}
