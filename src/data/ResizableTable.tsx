import { useState, useRef, useCallback, useMemo } from 'react';
import { useColumnConfig } from './useColumnConfig';
import { useIsMobile } from '../shell/useIsMobile';
import { glassStyle as getGlassStyle } from '../utils/glass';
import apiClient from '../api/client';
import useClickOutside from '../hooks/useClickOutside';
import { useShellAuth } from '../shell/ShellAuth';
import type { ColumnDef, SortState } from './types';

interface ResizableTableProps {
  tableId: string;
  columns: ColumnDef[];
  sort?: SortState;
  onSort?: (field: string) => void;
  footer?: React.ReactNode;
  afterBody?: React.ReactNode;
  /** Permission codename(s) that gate the "Save as default for all users" link
   *  in the column picker. The shell's `useShellAuth().hasAnyPerm` is queried
   *  against this list. Defaults to a single placeholder permission; consumers
   *  with no admin gate can pass `[]` to hide the link entirely. */
  saveDefaultPerms?: string[];
  children: (orderedColumns: (ColumnDef & { width: number })[]) => React.ReactNode;
}

/**
 * Sticky-header, scrollable-body table primitive with:
 * - drag-to-reorder columns (with a blue drop-indicator line)
 * - resize columns by the right-edge handle
 * - hide/show columns via a glass popover picker
 * - admin-only "Save as default for all users" link in the picker
 * - per-user persistence (via the shell-registered apiClient)
 * - mobile-aware selection mode toggle
 */
export default function ResizableTable({
  tableId,
  columns,
  sort,
  onSort,
  footer,
  afterBody,
  saveDefaultPerms = ['change_numberingconfig'],
  children,
}: ResizableTableProps) {
  const isMobile = useIsMobile();
  const [selectionMode, setSelectionMode] = useState(false);
  // Strip the `_select` column on mobile (unless selection mode is on) so it
  // doesn't take up scarce screen real estate.
  const effectiveColumns = useMemo(
    () => (isMobile && !selectionMode ? columns.filter(c => c.key !== '_select') : columns),
    [columns, isMobile, selectionMode],
  );
  const {
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
  } = useColumnConfig(tableId, effectiveColumns);
  const { hasAnyPerm } = useShellAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [savedDefault, setSavedDefault] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isAdmin = saveDefaultPerms.length > 0 && hasAnyPerm(saveDefaultPerms);

  useClickOutside(pickerRef, useCallback(() => { if (pickerOpen) setPickerOpen(false); }, [pickerOpen]));

  const totalWidth = orderedColumns.reduce((sum, col) => sum + col.width, 0);
  const colWidths = orderedColumns.map(col => `${(col.width / totalWidth) * 100}%`);

  const saveAsDefault = async () => {
    setSavingDefault(true);
    const visibleKeys = allColumns.filter(c => !c.hidden).map(c => c.key);
    const viewport = isMobile ? 'mobile' : 'desktop';
    // Capture the sort the admin is looking at too, so "default for all
    // users" covers ordering as well as columns. Lists that don't wire a
    // `sort` prop omit the key and leave any previously-saved sort alone.
    const payload: Record<string, unknown> = { visible_columns: visibleKeys };
    if (sort) payload.sort = sort;
    try {
      await apiClient
        .patch(`/auth/default-columns/${tableId}/`, payload, { params: { viewport } })
        .catch(() =>
          apiClient.post('/auth/default-columns/', { table_id: tableId, viewport, ...payload }),
        );
      setSavedDefault(true);
      setTimeout(() => setSavedDefault(false), 2000);
    } catch { /* ignore */ }
    setSavingDefault(false);
  };

  const supportsSelection = useMemo(() => columns.some(c => c.key === '_select'), [columns]);

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${isMobile ? '-mx-4' : ''}`}>
      {/* Fixed header */}
      <table className="w-full divide-y divide-gray-200 shrink-0" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {orderedColumns.map((col, i) => (
            <col key={col.key} style={{ width: colWidths[i] }} />
          ))}
        </colgroup>
        <thead className="bg-gray-50">
          <tr>
            {orderedColumns.map((col, idx) => {
              const colDef = columns.find(c => c.key === col.key);
              const sortField = colDef?.sortField ?? (col.key !== '_select' ? col.key : undefined);
              const isSorted = sort && sortField && sort.field === sortField;
              const isFixed = col.key === '_select';
              return (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase select-none relative ${draggedIdx === idx ? 'bg-blue-50' : ''}`}
                  draggable={!isFixed}
                  onDragStart={isFixed ? undefined : () => onDragStart(idx)}
                  onDragOver={isFixed ? undefined : (e) => onDragOver(idx, e)}
                  onDrop={isFixed ? undefined : (e) => onDrop(idx, e)}
                  onDragEnd={isFixed ? undefined : onDragEnd}
                  style={isFixed ? undefined : { cursor: 'grab' }}
                >
                  <span
                    className={`${isFixed ? '' : 'truncate pr-3'} block ${sortField && onSort ? 'cursor-pointer hover:text-gray-700' : ''}`}
                    onClick={sortField && onSort ? (e) => { e.stopPropagation(); onSort(sortField); } : undefined}
                  >
                    {col.headerNode ?? col.label}
                    {isSorted && <span className="ml-1">{sort!.direction === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                  {!isFixed && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-center z-10"
                      onMouseDown={(e) => onResizeStart(idx, e)}
                      style={{ marginRight: -8 }}
                    >
                      <div className="w-0.5 h-full bg-gray-200 hover:bg-blue-500 transition-colors" />
                    </div>
                  )}
                  {dropGap === idx && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 z-20 pointer-events-none" />
                  )}
                  {idx === orderedColumns.length - 1 && dropGap === orderedColumns.length && (
                    <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-blue-500 z-20 pointer-events-none" />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
      </table>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0">
        <table className="w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {orderedColumns.map((col, i) => (
              <col key={col.key} style={{ width: colWidths[i] }} />
            ))}
          </colgroup>
          {children(orderedColumns as any)}
        </table>
        {afterBody}
      </div>

      {/* Footer */}
      {footer !== undefined && (
        <div className="border-t border-gray-200 px-4 py-2 text-sm text-gray-500 shrink-0 flex items-center justify-between">
          <span>{footer}</span>
          <div className="flex items-center gap-3 relative" ref={pickerRef}>
            {isMobile && supportsSelection && (
              <button
                onClick={() => setSelectionMode(s => !s)}
                className={`text-[11px] px-2 py-0.5 rounded ${selectionMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 border border-gray-300'}`}
                title={selectionMode ? 'Hide selection column' : 'Show selection column'}
              >
                {selectionMode ? 'Done' : 'Select'}
              </button>
            )}
            <button onClick={resetColumns} className="text-[10px] text-gray-400 hover:text-gray-600">Reset</button>
            <button onClick={() => setPickerOpen(!pickerOpen)} className="text-gray-400 hover:text-gray-600" title="Choose columns">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </button>
            {pickerOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-52 rounded-2xl z-50 py-1 max-h-80 overflow-y-auto" style={getGlassStyle()}>
                <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">Columns</p>
                {allColumns.filter(col => col.key !== '_select').map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!col.hidden}
                      onChange={() => toggleColumn(col.key)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                    />
                    {col.label}
                  </label>
                ))}
                {isAdmin && (
                  <div className="border-t border-gray-100 mt-1 pt-1 px-3 pb-1">
                    <button onClick={saveAsDefault} disabled={savingDefault}
                      className={`text-[10px] w-full text-center py-1 rounded ${savedDefault ? 'text-green-600' : 'text-gray-500 hover:text-blue-600'}`}>
                      {savingDefault ? '...' : savedDefault ? 'Saved as default' : 'Save as default for all users'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
