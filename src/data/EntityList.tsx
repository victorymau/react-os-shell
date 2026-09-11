import type { ReactNode, RefObject, Dispatch, SetStateAction, MouseEvent } from 'react';
import { useRef, useState } from 'react';
import useTableNav from './useTableNav';
import ResizableTable from './ResizableTable';
import LoadingSpinner from '../shell/LoadingSpinner';
import ListFooter from './ListFooter';
import ListLoadError from './ListLoadError';
import { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from '../shell/PopupMenu';
import { keepsNativeMenu } from '../shell/contextMenuTarget';
import { copyToClipboard, selectionAt, type SelectedText } from '../shell/clipboard';
import { escapeHtml } from '../utils/escapeHtml';
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

  /** When true and no rows have loaded yet, render {@link ListLoadError}
   *  (with a retry) instead of `emptyState` — so a failed fetch reads as an
   *  error, not "nothing here". Wire `useInfiniteScroll`'s `isError`. A
   *  mid-scroll next-page failure (rows already loaded) keeps the list.
   *  Defaults to unset → behaviour unchanged for existing callers. */
  isError?: boolean;
  /** Retry handler for the error state — wire the data source's `refetch`.
   *  It also backs the row menu's Refresh item. */
  onRetry?: () => void;
  /** Heading for the error state, e.g. "Couldn't load candidates". Omit for
   *  {@link ListLoadError}'s generic "Couldn't load this list" — name the
   *  entity where the list has one, so an outage reads as *this* list failing. */
  errorTitle?: string;
  /** Explanatory line under {@link EntityListProps.errorTitle}. Omit for
   *  ListLoadError's generic connection/retry message. */
  errorMessage?: string;

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

  /** Right-click row menu. Every list has one, with nothing to wire: Open (the
   *  row right-clicked), Copy for text selected under the pointer, Copy
   *  `<first column>` and Copy rows (the ticked rows as a table of the visible
   *  columns in their on-screen order, which pastes into a spreadsheet as
   *  cells), Select all, Clear selection, and Refresh when `onRetry` is wired.
   *  Provide `exportEndpoint` (a list's `<base>/export_csv/` path, relative to
   *  the api base) to add "Export selected to CSV", which downloads just the
   *  ticked rows (`?ids=`, honouring the visible/ordered columns). Provide
   *  `contextActions` for domain actions (e.g. invoice Post / Cancel); they sit
   *  between the copy items and the selection items. */
  exportEndpoint?: string;
  exportFilename?: string;
  contextActions?: (items: T[]) => EntityListContextAction<T>[];
}

/** An open row menu: where, over which row, and what it can copy. */
interface RowMenu<T> {
  x: number;
  y: number;
  /** The row right-clicked — what Open opens. */
  item: T;
  /** Text selected under the pointer, when there is some. */
  text: SelectedText | null;
  /** The first visible column, read off the row when the menu opens so it
   *  follows the user's column order. Null when it has no label to name it by. */
  firstColumn: { key: string; label: string } | null;
}

/** A row's data cells in on-screen order — the tick-box column left out, and
 *  only the row's own cells, never those of a table nested inside one. */
function rowCells(row: Element): HTMLElement[] {
  return (Array.from(row.children) as HTMLElement[])
    .filter(td => td.dataset?.colKey !== undefined && td.dataset.colKey !== '_select');
}

/** A cell as the user reads it: the rendered text with whitespace collapsed,
 *  so a badge or a two-line cell stays one spreadsheet cell. `innerText`
 *  follows CSS, so a hidden element is not copied; jsdom has no `innerText`,
 *  hence the fallback. */
function cellText(td: HTMLElement): string {
  const raw = typeof td.innerText === 'string' ? td.innerText : td.textContent ?? '';
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * The canonical pageless data grid for both portals. Wraps `<ResizableTable>`
 * with selection-checkbox logic, keyboard navigation, the standardized list
 * footer, an infinite-scroll sentinel hook-up, and a right-click row menu.
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
    isError, onRetry, errorTitle, errorMessage,
    tableId, columns, renderCell, getRowId = (item: any) => item.id,
    sort, onSort,
    selected, setSelected,
    onRowClick, onRowHover, getRowClassName,
    footerLabel, footerExtra,
    sentinelRef, isFetchingNextPage,
    saveDefaultPerms,
    exportEndpoint, exportFilename = 'export.csv', contextActions,
  } = props;

  const [menu, setMenu] = useState<RowMenu<T> | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

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

  // Right-click a row → the row menu. If the row isn't already selected it
  // becomes the selection (standard desktop behaviour); an existing
  // multi-selection is kept. The browser keeps its own menu wherever the
  // shell-wide one leaves it — a text field or an image inside a row, a
  // `data-native-context-menu` subtree — and on Shift+right-click. Everywhere
  // else the event is claimed, so `ShellContextMenu` stands down over a row.
  const handleRowContextMenu = (e: MouseEvent<HTMLTableRowElement>, item: T) => {
    if (e.shiftKey || keepsNativeMenu(e.target)) return;
    e.preventDefault();
    const id = getRowId(item);
    if (!selected.has(id)) setSelected(new Set([id]));
    // The first column as the user has arranged it, read off the row itself.
    const key = rowCells(e.currentTarget)[0]?.dataset.colKey;
    const label = key ? columns.find(c => c.key === key)?.label : undefined;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      item,
      text: selectionAt(e.target),
      firstColumn: key && label ? { key, label } : null,
    });
  };

  const selectedItems = items.filter(i => selected.has(getRowId(i)));

  // The ticked rows as the user sees them: the visible columns in their
  // on-screen order, read off the rendered cells. Reading the DOM rather than
  // calling `renderCell` again is the point — a cell renders a badge, a link or
  // a formatted amount, and a copy should hold what is on screen, not an id or
  // an ISO date.
  const selectedTable = () => {
    const rows = [...(bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row-idx]') ?? [])]
      .filter(tr => {
        const it = items[Number(tr.dataset.rowIdx)];
        return it !== undefined && selected.has(getRowId(it));
      });
    const keys = rows.length ? rowCells(rows[0]).map(td => td.dataset.colKey ?? '') : [];
    const labelByKey = new Map(columns.map(c => [c.key, c.label]));
    return {
      keys,
      header: keys.map(k => labelByKey.get(k) ?? k),
      body: rows.map(tr => rowCells(tr).map(cellText)),
    };
  };

  const copyRows = () => {
    setMenu(null);
    const { header, body } = selectedTable();
    if (!body.length) return;
    const text = [header, ...body].map(cells => cells.join('\t')).join('\n');
    const html = '<table><thead><tr>'
      + header.map(h => `<th>${escapeHtml(h)}</th>`).join('')
      + '</tr></thead><tbody>'
      + body.map(cells => `<tr>${cells.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')
      + '</tbody></table>';
    void copyToClipboard(body.length === 1 ? 'Row' : `${body.length} rows`, text, html);
  };

  const copyColumn = (column: { key: string; label: string }) => {
    setMenu(null);
    const { keys, body } = selectedTable();
    const at = keys.indexOf(column.key);
    if (at < 0 || !body.length) return;
    void copyToClipboard(column.label, body.map(cells => cells[at]).join('\n'));
  };

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
      // `ids.length` is what we ASKED for, not what came back. The backend caps
      // every list export (`MAX_EXPORT_ROWS` in efficient/mixins.py) and reports
      // the cut on `X-Truncated` / `X-Row-Count`, where the count is the rows
      // actually in the file. Announcing the request count without reading them
      // states a number the file does not contain (BG#00477). Axios lowercases
      // response header names. When the headers are absent — an older backend,
      // or a cross-origin response that does not expose them — this falls
      // through to the unchanged success message.
      const headers = res.headers ?? {};
      const rowCount = Number(headers['x-row-count']);
      if (String(headers['x-truncated']) === 'true') {
        const kept = Number.isFinite(rowCount) ? `${rowCount} of ${ids.length}` : `only some of the ${ids.length}`;
        toast.notify(`Exported ${kept} rows. The server capped this export, so the file is incomplete.`);
        return;
      }
      toast.success(`Exported ${ids.length} ${ids.length === 1 ? 'row' : 'rows'}.`);
    } catch {
      toast.error('CSV export failed.');
    }
  };

  if (isLoading) return <LoadingSpinner />;
  // A failed initial fetch (no rows) reads as an error with retry, not the
  // empty state. Once rows exist, a later next-page failure keeps the list.
  // `title`/`message` default inside ListLoadError, so passing undefined here
  // keeps the generic copy for callers that don't name their entity.
  if (isError && items.length === 0) {
    return <ListLoadError title={errorTitle} message={errorMessage} onRetry={onRetry} />;
  }
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

  let rowMenu: ReactNode = null;
  if (menu) {
    const { x, y, item, text, firstColumn } = menu;
    const actions = contextActions ? contextActions(selectedItems) : [];
    const count = selectedItems.length;
    const close = () => setMenu(null);
    const moreExist = totalCount !== undefined && totalCount > items.length;
    rowMenu = (
      <PopupMenu portal style={{ left: x, top: y }} onClose={close} minWidth={210}>
        <PopupMenuLabel>{selected.size} selected</PopupMenuLabel>
        <PopupMenuItem className="font-medium" onClick={() => { close(); onRowClick(item); }}>Open</PopupMenuItem>
        <PopupMenuDivider />
        {text && (
          <PopupMenuItem onClick={() => { close(); void copyToClipboard('Text', text.text, text.html); }}>Copy</PopupMenuItem>
        )}
        {firstColumn && (
          <PopupMenuItem onClick={() => copyColumn(firstColumn)}>Copy {firstColumn.label}</PopupMenuItem>
        )}
        <PopupMenuItem disabled={count === 0} onClick={copyRows}>
          {count === 1 ? 'Copy row' : `Copy ${count} rows`}
        </PopupMenuItem>
        {exportEndpoint && (
          <PopupMenuItem onClick={exportSelected}>Export selected to CSV</PopupMenuItem>
        )}
        {actions.map((a, i) => (
          <div key={i}>
            {/* The page's actions get a divider of their own; one it asked for
                on its first action is that same line, not a second one. */}
            {(a.divider || i === 0) && <PopupMenuDivider />}
            <PopupMenuItem
              danger={a.danger}
              disabled={a.disabled}
              onClick={() => { close(); a.onClick(selectedItems); }}
            >
              {a.label}
            </PopupMenuItem>
          </div>
        ))}
        <PopupMenuDivider />
        {!allSelected && (
          <PopupMenuItem onClick={() => { close(); setSelected(new Set(items.map(getRowId))); }}>
            {moreExist ? `Select all ${items.length} loaded` : 'Select all'}
          </PopupMenuItem>
        )}
        <PopupMenuItem onClick={() => { close(); setSelected(new Set()); }}>Clear selection</PopupMenuItem>
        {onRetry && (
          <PopupMenuItem onClick={() => { close(); onRetry(); }}>Refresh</PopupMenuItem>
        )}
      </PopupMenu>
    );
  }

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
            <tbody ref={bodyRef} className="divide-y divide-gray-100">
              {items.map((item, rowIdx) => {
                const id = getRowId(item);
                return (
                  <tr
                    key={id}
                    data-row-idx={rowIdx}
                    className={`cursor-pointer ${focusIdx === rowIdx ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : selected.has(id) ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'} ${getRowClassName?.(item) ?? ''}`}
                    onClick={() => onRowClick(item)}
                    onContextMenu={(e) => handleRowContextMenu(e, item)}
                    onMouseEnter={onRowHover ? () => onRowHover(item) : undefined}
                  >
                    {cols.map(col => (
                      <td key={col.key} data-col-key={col.key} className="px-4 py-3 whitespace-nowrap text-sm overflow-hidden">
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

      {rowMenu}
    </div>
  );
}
