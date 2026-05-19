import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { ColumnDef } from './types';

interface ColumnState {
  key: string;
  width: number;
  hidden?: boolean;
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
 * Resizable + reorderable + hideable column state for `<ResizableTable>`.
 *
 * Persists per-user via `PATCH /auth/me/` (`preferences.columns_{tableId}`)
 * with a 1-second debounce, and per-viewport admin defaults via
 * `GET /auth/default-columns/{tableId}?viewport=…`. The consumer wires these
 * endpoints on its backend; the shell's `apiClient` proxy resolves to the
 * consumer-registered axios instance (`setShellApiClient`).
 */
export function useColumnConfig(tableId: string, defaultColumns: ColumnDef[]) {
  const [columns, setColumns] = useState<ColumnState[]>(() => {
    const cached = localStorage.getItem(`col-config-${tableId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ColumnState[];
        const existing = new Set(parsed.map(c => c.key));
        const merged = pinSelectColumn([
          ...parsed.filter(c => defaultColumns.some(d => d.key === c.key)),
          ...defaultColumns.filter(d => !existing.has(d.key)).map(d => ({ key: d.key, width: d.defaultWidth || 150 })),
        ]);
        return merged;
      } catch { /* fall through */ }
    }
    return pinSelectColumn(defaultColumns.map(d => ({ key: d.key, width: d.defaultWidth || 150, hidden: d.defaultHidden })));
  });

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const resizingRef = useRef<{ idx: number; startX: number; startWidth: number } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMut = useMutation({
    mutationFn: (cols: ColumnState[]) =>
      apiClient.patch('/auth/me/', {
        preferences: { [`columns_${tableId}`]: cols },
      }),
  });

  const persistColumns = useCallback((cols: ColumnState[]) => {
    localStorage.setItem(`col-config-${tableId}`, JSON.stringify(cols));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMut.mutate(cols), 1000);
  }, [tableId, saveMut]);

  useEffect(() => {
    // Pick the viewport once at mount, using the same query as `useIsMobile`
    // so the column-defaults split lines up with the rest of the UI's mobile
    // affordances. Refresh covers users who resize past the breakpoint
    // mid-session.
    const viewport: 'desktop' | 'mobile' =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
        ? 'mobile' : 'desktop';

    Promise.all([
      apiClient.get('/auth/me/').catch(() => null),
      apiClient.get(`/auth/default-columns/${tableId}/`, { params: { viewport } }).catch(() => null),
    ]).then(([userRes, defaultRes]) => {
      const prefs = userRes?.data?.preferences;
      const userSaved = prefs?.[`columns_${tableId}`];

      if (userSaved && Array.isArray(userSaved)) {
        const existing = new Set(userSaved.map((c: any) => c.key));
        const merged = pinSelectColumn([
          ...userSaved.filter((c: any) => defaultColumns.some(d => d.key === c.key)),
          ...defaultColumns.filter(d => !existing.has(d.key)).map(d => ({ key: d.key, width: d.defaultWidth || 150, hidden: d.defaultHidden })),
        ]);
        setColumns(merged);
        localStorage.setItem(`col-config-${tableId}`, JSON.stringify(merged));
      } else if (Array.isArray(defaultRes?.data?.visible_columns) && defaultRes.data.visible_columns.length > 0) {
        // Non-empty system defaults — apply them. (An empty array is treated
        // as "no admin opinion" and we leave the initial useState value alone,
        // which uses the per-column `defaultHidden` flag from each ColumnDef.)
        const visibleSet = new Set(defaultRes.data.visible_columns as string[]);
        const systemCols = pinSelectColumn(defaultColumns.map(d => ({
          key: d.key,
          width: d.defaultWidth || 150,
          hidden: !visibleSet.has(d.key),
        })));
        setColumns(systemCols);
        localStorage.setItem(`col-config-${tableId}`, JSON.stringify(systemCols));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

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
    const defaults = defaultColumns.map(d => ({ key: d.key, width: d.defaultWidth || 150 }));
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
