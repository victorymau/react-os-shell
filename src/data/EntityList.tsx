import type { ReactNode, RefObject, Dispatch, SetStateAction } from 'react';
import useTableNav from './useTableNav';
import ResizableTable from './ResizableTable';
import LoadingSpinner from '../shell/LoadingSpinner';
import ListFooter from './ListFooter';

export interface EntityListColumn {
  key: string;
  label: string;
  defaultWidth?: number;
  minWidth?: number;
  defaultHidden?: boolean;
  sortField?: string;
  headerNode?: ReactNode;
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
}

/**
 * The canonical pageless data grid for both portals. Wraps `<ResizableTable>`
 * with selection-checkbox logic, keyboard navigation, the standardized list
 * footer, and an infinite-scroll sentinel hook-up.
 *
 * Usage:
 *
 *   const { sort, onSort } = useSort('mid');
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
  } = props;

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
    </div>
  );
}
