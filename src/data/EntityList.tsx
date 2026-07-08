import type { ReactNode, RefObject, Dispatch, SetStateAction, MouseEvent } from 'react';
import { useState } from 'react';
import useTableNav from './useTableNav';
import ResizableTable from './ResizableTable';
import LoadingSpinner from '../shell/LoadingSpinner';
import ListFooter from './ListFooter';
import { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from '../shell/PopupMenu';
import apiClient from '../api/client';
import toast from '../shell/toast';

export interface EntityListColumn {
  key: string;
  label: string;
  defaultWidth?: number;
  minWidth?: number;
  defaultHidden?: boolean;
  sortField?: string;
  headerNode?: ReactNode;
}

/** A page-supplied entry in the right-click bulk menu (e.g. invoice Post /
 *  Cancel). `onClick` receives the currently-selected rows. Set `divider` to
 *  render a separator above the item, `danger` for a destructive tint. */
export interface EntityListContextAction<T = unknown> {
  label: string;
  onClick: (items: T[]) => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

export interface EntityListProps<T> {
  items: T[];
  isLoading: boolean;
  emptyState: ReactNode;
  totalCount?: number;

  tableId: string;
  columns: EntityListColumn[];
  renderCell: (item: T, colKey: string) => ReactNode;
  getRowId?: (item: T) => string | number;

  sort?: { field: string; direction: 'asc' | 'desc' };
  onSort?: (field: string) => void;

  selected: Set<string | number>;
  setSelected: Dispatch<SetStateAction<Set<string | number>>>;

  onRowClick: (item: T) => void;
  onRowHover?: (item: T) => void;
  getRowClassName?: (item: T) => string;

  footerLabel: string;
  footerExtra?: ReactNode;

  // Loose ref type so consumers on React 18 (RefObject<HTMLDivElement>) and
  // React 19 (RefObject<HTMLDivElement | null>) both type-check cleanly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sentinelRef?: RefObject<any>;
  isFetchingNextPage?: boolean;

  /** Perm codenames that gate "Save as default for all users" in the column
   *  picker. Defaults to `['change_numberingconfig']` (admin-portal's proxy
   *  for admin access). Pass `[]` to hide the link entirely. */
  saveDefaultPerms?: string[];

  /** Right-click bulk-action menu. Provide `exportEndpoint` (a list's
   *  `<base>/export_csv/` path, relative to the api base) to get a built-in
   *  "Export selected to CSV" that downloads just the ticked rows (`?ids=`,
   *  honouring the visible/ordered columns). Provide `contextActions` for
   *  domain actions (e.g. invoice Post / Cancel). When neither is set the list
   *  has no context menu — unchanged behaviour. "Clear selection" is always
   *  offered once a menu exists. */
  exportEndpoint?: string;
  exportFilename?: string;
  contextActions?: (items: T[]) => EntityListContextAction<T>[];
}

/**
 * The canonical pageless data grid for both portals. Wraps `<ResizableTable>`
 * with selection-checkbox logic, keyboard navigation, the standardized list
 * footer, an infinite-scroll sentinel hook-up, and a right-click bulk menu.
 *
 * Usage:
 *
 *   const { sort, onSort } = useSort('mid', 'asc', 'suppliers');
 *   const { items, totalCount, isLoading, isFetchingNextPage, sentinelRef } =
 *     useInfiniteScroll<Supplier>({ queryKey: ['suppliers', filters],
 *                                   fetchFn: (p) => getSuppliers(p) });
 *
 *   <EntityList
 *     items={items}
 *     totalCount={totalCount}
 *     isLoading={isLoading}
 *     sentinelRef={sentinelRef}
 *     isFetchingNextPage={isFetchingNextPage}
 *     tableId="suppliers"
 *     columns={SUPPLIER_COLUMNS}
 *     renderCell={(s, k) => …}
 *     sort={sort} onSort={onSort}
 *     selected={selected} setSelected={setSelected}
 *     onRowClick={(s) => openEntity('supplier', s.id, s, s.mid, '/suppliers')}
 *     exportEndpoint="/suppliers/export_csv/" exportFilename="Suppliers.csv"
 *     footerLabel="suppliers"
 *     emptyState={<EmptyState message="No suppliers yet." />}
 *   />
 */
export default function EntityList<T>(props: EntityListProps<T>) {
  const {
    items, isLoading, emptyState, totalCount,
    tableId, columns, renderCell, getRowId = (item: any) => item.id,
    sort, onSort,
    selected, setSelected,
    onRowClick, onRowHover, getRowClassName,
    footerLabel, footerExtra,
    sentinelRef, isFetchingNextPage,
    saveDefaultPerms,
    exportEndpoint, exportFilename = 'export.csv', contextActions,
  } = props;

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const hasMenu = !!exportEndpoint || !!contextActions;

  const toggleItem = (item: T) => {
    setSelected(prev => {
      const next = new Set(prev);
      const id = getRowId(item);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(getRowId)));
  };

  const selectRange = (from: number, to: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      for (let i = from; i <= to; i++) next.add(getRowId(items[i]));
      return next;
    });
  };

  const focusIdx = useTableNav(items, onRowClick, toggleItem, toggleAll, selectRange);

  // Right-click a row → bulk menu. If the row isn't already selected it becomes
  // the selection (standard desktop behaviour); an existing multi-selection is
  // kept. Only fires when the list opted into a menu.
  const handleRowContextMenu = (e: MouseEvent, item: T) => {
    if (!hasMenu) return;
    e.preventDefault();
    const id = getRowId(item);
    if (!selected.has(id)) setSelected(new Set([id]));
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const selectedItems = items.filter(i => selected.has(getRowId(i)));

  // The visible/ordered columns as `key|Label,…` so the export mirrors the grid
  // (ResizableTable persists the live config to localStorage under this key).
  const colsParam = () => {
    const labelByKey = new Map(columns.map(c => [c.key, c.label]));
    try {
      const raw = localStorage.getItem(`col-config-${tableId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { key: string; hidden?: boolean }[];
        const cols = parsed
          .filter(c => !c.hidden && c.key !== '_select' && labelByKey.has(c.key))
          .map(c => `${c.key}|${labelByKey.get(c.key)}`);
        if (cols.length) return cols.join(',');
      }
    } catch { /* fall back to defaults */ }
    return columns.filter(c => !c.defaultHidden).map(c => `${c.key}|${c.label}`).join(',');
  };

  const exportSelected = async () => {
    setMenu(null);
    const ids = [...selected];
    if (!ids.length || !exportEndpoint) return;
    const p = new URLSearchParams({ ids: ids.join(',') });
    const cols = colsParam();
    if (cols) p.set('cols', cols);
    const sep = exportEndpoint.includes('?') ? '&' : '?';
    try {
      const res = await apiClient.get(`${exportEndpoint}${sep}${p}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${ids.length} ${ids.length === 1 ? 'row' : 'rows'}.`);
    } catch {
      toast.error('CSV export failed.');
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (items.length === 0) return <>{emptyState}</>;

  const allSelected = items.length > 0 && selected.size === items.length;

  const fullColumns: EntityListColumn[] = [
    {
      key: '_select',
      label: '',
      defaultWidth: 52,
      minWidth: 52,
      headerNode: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
        />
      ),
    },
    ...columns,
  ];

  const footer = (
    <ListFooter
      selectedCount={selected.size}
      loadedCount={items.length}
      totalCount={totalCount}
      label={footerLabel}
      isFetchingMore={isFetchingNextPage}
      extra={footerExtra}
    />
  );

  const afterBody = sentinelRef ? (
    <>
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <div className="text-center py-3"><span className="text-sm text-gray-500">Loading more...</span></div>
      )}
    </>
  ) : undefined;

  const actions = menu && contextActions ? contextActions(selectedItems) : [];

  return (
    <div className="flex-1 flex flex-col mb-1 bg-white rounded-lg shadow overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col">
        <ResizableTable
          tableId={tableId}
          columns={fullColumns}
          sort={sort}
          onSort={onSort}
          footer={footer}
          afterBody={afterBody}
          saveDefaultPerms={saveDefaultPerms}
        >
          {(cols) => (
            <tbody className="divide-y divide-gray-100">
              {items.map((item, rowIdx) => {
                const id = getRowId(item);
                return (
                  <tr
                    key={id}
                    data-row-idx={rowIdx}
                    className={`cursor-pointer ${focusIdx === rowIdx ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : selected.has(id) ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'} ${getRowClassName?.(item) ?? ''}`}
                    onClick={() => onRowClick(item)}
                    onContextMenu={hasMenu ? (e) => handleRowContextMenu(e, item) : undefined}
                    onMouseEnter={onRowHover ? () => onRowHover(item) : undefined}
                  >
                    {cols.map(col => (
                      <td key={col.key} className="px-4 py-3 whitespace-nowrap text-sm overflow-hidden">
                        {col.key === '_select' ? (
                          <input
                            type="checkbox"
                            checked={selected.has(id)}
                            onClick={e => { e.stopPropagation(); toggleItem(item); }}
                            readOnly
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                          />
                        ) : renderCell(item, col.key)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          )}
        </ResizableTable>
      </div>

      {menu && (
        <PopupMenu portal style={{ left: menu.x, top: menu.y }} onClose={() => setMenu(null)} minWidth={210}>
          <PopupMenuLabel>{selected.size} selected</PopupMenuLabel>
          {exportEndpoint && (
            <PopupMenuItem onClick={exportSelected}>Export selected to CSV</PopupMenuItem>
          )}
          {actions.map((a, i) => (
            <div key={i}>
              {a.divider && <PopupMenuDivider />}
              <PopupMenuItem
                danger={a.danger}
                disabled={a.disabled}
                onClick={() => { setMenu(null); a.onClick(selectedItems); }}
              >
                {a.label}
              </PopupMenuItem>
            </div>
          ))}
          <PopupMenuDivider />
          <PopupMenuItem onClick={() => { setMenu(null); setSelected(new Set()); }}>Clear selection</PopupMenuItem>
        </PopupMenu>
      )}
    </div>
  );
}
