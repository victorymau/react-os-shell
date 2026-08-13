/**
 * DataTable — a presentational table for server-driven lists.
 *
 * It renders and it reports. It does not fetch, it does not sort, and it does
 * not paginate: the caller owns `sort` and `page` and hands back new data. That
 * is the whole design, and it is what makes it usable against a Django list
 * endpoint where the ordering happens in SQL and the rows on screen are one
 * page of a much larger set. A table that sorts its own `data` prop quietly
 * sorts the current page only, which is wrong in a way nobody notices until the
 * second page disagrees with the first.
 *
 * ── Which table is which ──
 * `EditableGrid`   — a spreadsheet. Cells are typed into.
 * `ResizableTable` — persists column widths per user; needs react-query + axios.
 * `EntityList`     — a whole list VIEW: fetching, export, context actions.
 * `DataTable`      — this. Read-only rows, no peers, no data layer.
 *
 * Sort uses the package's own `SortState` rather than a table-specific vocabulary,
 * so `DataTable`, `useSort` and `ResizableTable` all speak the same language and
 * a caller can move between them without a translation layer.
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type UIEvent } from 'react';
import Pagination from './Pagination';
import type { SortState } from './types';

export interface DataTableColumn<T> {
  key: string;
  title: ReactNode;
  /** Read this field when there is no `render`. */
  dataIndex?: keyof T & string;
  render?: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /**
   * The column holds a figure or a code — money, a quantity, a part or order
   * number.
   *
   * Renders it monospaced and right-aligns it by default. The table already
   * sets `tabular-nums`, so the digits line up down the column either way;
   * what this adds is a fixed advance for EVERY character, which is what lets
   * `00620L6N25KMFCBTDTM2QND` be compared against its neighbour by shape, and
   * a decimal point be found at the right edge without reading the number.
   */
  numeric?: boolean;
  /** Px. Also feeds the table's minimum width — see `minWidth`. */
  width?: number;
  /** Single-line with an ellipsis. */
  ellipsis?: boolean;
  /**
   * Pin to the left edge while the table scrolls horizontally. Only useful
   * with `minWidth` set, and only worth it for the columns that identify the
   * row — a part number, a name.
   */
  fixed?: 'left';
  /**
   * Offer a sort control. The FIELD sent to the server is `sortField ?? key`,
   * which is what lets a column named `no` sort by `part_number` without the
   * caller mapping names at the call site.
   */
  sortable?: boolean;
  /**
   * Which way the FIRST click sorts. Defaults to ascending.
   *
   * `desc` is right wherever the interesting end is the top: a price column,
   * a quantity, a date where the newest matters. Making those start ascending
   * costs every user two clicks to see the thing they opened the column for.
   *
   * The cycle is unchanged either way — first click, second click, then back
   * to the server's own ordering.
   */
  sortFirst?: 'asc' | 'desc';
  sortField?: string;
  headerClassName?: string;
}

/**
 * A header spanning several columns — "Debit" over an amount and a balance.
 *
 * The group is not decoration: where two children are both called "Amount",
 * it is the only thing telling them apart, and a screen reader reads it as
 * part of each cell's column context.
 */
export interface DataTableColumnGroup<T> {
  title: ReactNode;
  columns: DataTableColumn<T>[];
  /** Distinct among its siblings. Defaults to the group's index. */
  key?: string;
  headerClassName?: string;
}

/** A leaf column, or a group of them. */
export type DataTableHeader<T> = DataTableColumn<T> | DataTableColumnGroup<T>;

const isGroup = <T,>(h: DataTableHeader<T>): h is DataTableColumnGroup<T> =>
  Array.isArray((h as DataTableColumnGroup<T>).columns);

export interface DataTableProps<T> {
  columns: DataTableHeader<T>[];
  data: T[];
  /** Stable identity per row. A string names a field; a function computes it. */
  rowKey: (keyof T & string) | ((row: T, index: number) => string);
  /** Current sort, or null. Controlled — this component never sorts `data`. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Server pagination. Omit entirely for an unpaginated or infinite list. */
  pagination?: { page: number; pageCount: number; onPageChange: (page: number) => void };
  /**
   * Names the table for assistive technology, rendered as a visually hidden
   * `<caption>`.
   *
   * A table with no name is announced as "table" and nothing else, so a page
   * with two of them — the invoice lines and the payments against it — gives a
   * screen-reader user two identical landmarks and no way to tell which is
   * which. The heading above it is not enough: table navigation jumps between
   * tables, not through the prose around them.
   */
  caption?: string;
  loading?: boolean;
  bordered?: boolean;
  size?: 'sm' | 'md';
  /**
   * Minimum table width in px. Below it the table scrolls horizontally instead
   * of crushing columns. Usually the sum of the columns' widths.
   */
  minWidth?: number;
  rowClassName?: (row: T, index: number) => string;
  onRow?: (row: T, index: number) => { onClick?: () => void; className?: string };
  emptyText?: ReactNode;
  /** Rendered under the rows — an infinite-scroll sentinel, a totals strip. */
  footer?: ReactNode;
  /**
   * Windowed rendering for large LOADED datasets. Pagination and infinite
   * scroll bound what is fetched; this bounds what is RENDERED — a few
   * thousand loaded rows otherwise all get DOM, and every sort or filter
   * re-lays-out the lot. The wrapper becomes a vertical scroll container of
   * `height` px, only the rows near the viewport exist in the DOM (padded to
   * the full scroll height by two spacer rows), and the header pins to the
   * top of the scroll.
   *
   * `rowHeight` is a promise, not a measurement: every row is rendered at
   * exactly that height (the scroll math depends on it), so `ellipsis` your
   * long columns rather than letting them wrap. Off-screen rows are absent
   * for assistive technology too — same trade every windowed list makes.
   */
  virtualized?: { height: number; rowHeight: number; overscan?: number };
  className?: string;
}

const PAD: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-1.5',
  md: 'px-3 py-2',
};

const ALIGN: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

function SortIcon({ direction }: { direction: 'asc' | 'desc' | null }) {
  // Both arrows always render; the inactive one is dimmed. A control that
  // appears only once sorted gives no hint that sorting is available at all.
  return (
    <span className="ml-1 inline-flex flex-col leading-none" aria-hidden="true">
      <svg className={`h-2 w-2 ${direction === 'asc' ? 'text-gray-700' : 'text-gray-300'}`} viewBox="0 0 8 5" fill="currentColor">
        <path d="M4 0L8 5H0z" />
      </svg>
      <svg className={`h-2 w-2 ${direction === 'desc' ? 'text-gray-700' : 'text-gray-300'}`} viewBox="0 0 8 5" fill="currentColor">
        <path d="M4 5L0 0h8z" />
      </svg>
    </span>
  );
}

export default function DataTable<T>({
  columns, data, rowKey, sort = null, onSortChange, pagination, caption, loading = false,
  bordered = false, size = 'md', minWidth, rowClassName, onRow, emptyText = 'Nothing to show',
  footer, virtualized, className = '',
}: DataTableProps<T>) {
  const keyOf = (row: T, i: number): string =>
    typeof rowKey === 'function' ? rowKey(row, i) : String(row[rowKey]);

  // ── Row window ──
  // `startRow` is the only scroll-derived state, and it is a row index, not a
  // pixel offset: the setter bails until the scroll crosses a row boundary, so
  // a table not being scrolled re-renders nothing.
  const [startRow, setStartRow] = useState(0);
  const overscan = virtualized?.overscan ?? 6;
  const onBodyScroll = virtualized
    ? (e: UIEvent<HTMLDivElement>) => {
        const next = Math.max(0, Math.floor(e.currentTarget.scrollTop / virtualized.rowHeight) - overscan);
        setStartRow(prev => (prev === next ? prev : next));
      }
    : undefined;
  const windowSize = virtualized
    ? Math.ceil(virtualized.height / virtualized.rowHeight) + overscan * 2
    : data.length;
  const start = virtualized ? Math.min(startRow, Math.max(0, data.length - windowSize)) : 0;
  const end = Math.min(data.length, start + windowSize);
  const topPad = virtualized ? start * virtualized.rowHeight : 0;
  const bottomPad = virtualized ? (data.length - end) * virtualized.rowHeight : 0;

  // The grouped header's SECOND row pins below the first, which means knowing
  // the first row's height — measured, because it depends on `size` and on
  // whatever the group titles wrap to.
  const headRowRef = useRef<HTMLTableRowElement>(null);
  const [headRowH, setHeadRowH] = useState(0);
  useLayoutEffect(() => {
    if (!virtualized) return;
    const h = headRowRef.current?.offsetHeight ?? 0;
    setHeadRowH(prev => (prev === h ? prev : h));
  });

  const fieldOf = (col: DataTableColumn<T>) => col.sortField ?? col.key;

  const directionFor = (col: DataTableColumn<T>): 'asc' | 'desc' | null =>
    sort && sort.field === fieldOf(col) ? sort.direction : null;

  const toggleSort = (col: DataTableColumn<T>) => {
    if (!onSortChange) return;
    const field = fieldOf(col);
    const current = directionFor(col);
    // First → second → unsorted. The third state matters: without it there is
    // no way back to the server's own default ordering once a column is
    // clicked. Which way "first" goes is the column's to say — see sortFirst.
    const first = col.sortFirst ?? 'asc';
    const second = first === 'asc' ? 'desc' : 'asc';
    if (current === null) onSortChange({ field, direction: first });
    else if (current === first) onSortChange({ field, direction: second });
    else onSortChange(null);
  };

  // Every rendering below the header row works on the LEAVES: a group has no
  // cells of its own, only a span over its children's.
  const leaves: DataTableColumn<T>[] = columns.flatMap(h => (isGroup(h) ? h.columns : [h]));
  const grouped = columns.some(isGroup);

  const cellBase = `${PAD[size]} ${size === 'sm' ? 'text-xs' : 'text-sm'}`;

  /**
   * One header cell. Shared by both header rows so a grouped table's leaves
   * are drawn by the same code as an ungrouped table's — the sort button, the
   * aria-sort, the pinning and the alignment are not worth having twice.
   */
  const headerCell = (col: DataTableColumn<T>, ci: number, rowSpan: number, topOffset = 0) => {
    const dir = directionFor(col);
    // A figures column right-aligns unless the caller says otherwise: the
    // decimal point is the thing being compared, and it only lines up at the
    // right edge.
    const align = ALIGN[col.align ?? (col.numeric ? 'right' : 'left')];
    const pinned = col.fixed === 'left';
    return (
      <th
        key={col.key}
        scope="col"
        rowSpan={rowSpan > 1 ? rowSpan : undefined}
        // aria-sort is what a screen reader announces; the arrows are
        // decorative and marked so.
        // `none` rather than nothing on a sortable column: it is how a screen
        // reader knows the column CAN be sorted. Omitted, the only columns
        // that announce themselves as sortable are the ones already sorted.
        aria-sort={
          dir === 'asc' ? 'ascending'
          : dir === 'desc' ? 'descending'
          : col.sortable && onSortChange ? 'none'
          : undefined
        }
        style={{
          width: col.width,
          ...(pinned ? { left: offsets[ci] ?? 0 } : {}),
          // A virtualized header pins to the top of the vertical scroll; one
          // sticky box can hold both axes, so a pinned column's header corner
          // stays put in both directions.
          ...(virtualized ? { top: topOffset } : {}),
        }}
        className={[
          cellBase, align,
          'font-semibold uppercase tracking-wide text-gray-500',
          size === 'sm' ? 'text-[10px]' : 'text-xs',
          pinned
            ? (virtualized ? 'sticky z-20 bg-gray-50' : 'sticky z-10 bg-gray-50')
            : (virtualized ? 'sticky z-10 bg-gray-50' : ''),
          col.headerClassName ?? '',
        ].filter(Boolean).join(' ')}
      >
        {col.sortable && onSortChange ? (
          <button
            type="button"
            onClick={() => toggleSort(col)}
            className={`inline-flex items-center font-semibold uppercase tracking-wide hover:text-gray-700 ${align}`}
          >
            {col.title}
            <SortIcon direction={dir} />
          </button>
        ) : col.title}
      </th>
    );
  };
  // Running totals of the widths to the left of each fixed column, so a second
  // pinned column sits flush against the first instead of on top of it.
  let fixedOffset = 0;
  const offsets = leaves.map(col => {
    if (col.fixed !== 'left') return null;
    const at = fixedOffset;
    fixedOffset += col.width ?? 0;
    return at;
  });

  return (
    <div className={className}>
      <div
        onScroll={onBodyScroll}
        style={virtualized ? { maxHeight: virtualized.height } : undefined}
        className={`relative overflow-x-auto ${virtualized ? 'overflow-y-auto' : ''} ${bordered ? 'rounded-lg border border-gray-200' : ''}`.trim()}
      >
        {loading && (
          // An overlay rather than replacing the rows: the table keeps its
          // height and its scroll position, so re-sorting does not throw the
          // page around under the user.
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/60 pt-8" role="status" aria-live="polite">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
            <span className="sr-only">Loading</span>
          </div>
        )}
        <table className="w-full border-collapse tabular-nums" style={minWidth ? { minWidth } : undefined}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr ref={headRowRef} className="border-b border-gray-200 bg-gray-50">
              {columns.map((h, hi) => {
                if (isGroup(h)) {
                  return (
                    <th
                      key={h.key ?? `group-${hi}`}
                      scope="colgroup"
                      colSpan={h.columns.length}
                      style={virtualized ? { top: 0 } : undefined}
                      className={[
                        cellBase, 'text-center',
                        'font-semibold uppercase tracking-wide text-gray-500',
                        size === 'sm' ? 'text-[10px]' : 'text-xs',
                        'border-b border-gray-200',
                        virtualized ? 'sticky z-10 bg-gray-50' : '',
                        h.headerClassName ?? '',
                      ].filter(Boolean).join(' ')}
                    >
                      {h.title}
                    </th>
                  );
                }
                // A leaf beside a group spans both header rows, so its label
                // sits level with the group's children rather than floating
                // above an empty cell.
                return headerCell(h, leaves.indexOf(h), grouped ? 2 : 1);
              })}
            </tr>
            {grouped && (
              <tr className="border-b border-gray-200 bg-gray-50">
                {columns.flatMap(h => (isGroup(h) ? h.columns : [])).map(col =>
                  headerCell(col, leaves.indexOf(col), 1, headRowH),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {data.length === 0 && !loading ? (
              <tr>
                <td colSpan={leaves.length} className={`${cellBase} py-10 text-center text-gray-500`}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              <>
              {/* Spacer rows stand in for everything scrolled out of the
                * window, so the scrollbar's size and position tell the truth
                * about the whole dataset. aria-hidden: they are geometry, not
                * data. */}
              {topPad > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={leaves.length} style={{ height: topPad, padding: 0, border: 0 }} />
                </tr>
              )}
              {data.slice(start, end).map((row, si) => {
                const i = start + si;
                const rowProps = onRow?.(row, i);
                return (
                  <tr
                    key={keyOf(row, i)}
                    style={virtualized ? { height: virtualized.rowHeight } : undefined}
                    onClick={rowProps?.onClick}
                    // A clickable row that only answers a mouse is unreachable
                    // for everyone else — there is no other control in it to
                    // tab to. Focusable, and Enter or Space opens it, which is
                    // what the pointer does.
                    {...(rowProps?.onClick
                      ? {
                          tabIndex: 0,
                          onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                            // Only the row's OWN key presses. A keydown from a
                            // control inside a cell bubbles up here, so without
                            // this an Edit button answered with Enter fired the
                            // button AND opened the row — and the
                            // preventDefault below ate the space bar of any
                            // text input in the table.
                            if (e.target !== e.currentTarget) return;
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            // Space scrolls the page otherwise, and the row the
                            // user was aiming at leaves the screen.
                            e.preventDefault();
                            rowProps.onClick?.();
                          },
                        }
                      : {})}
                    className={[
                      'border-b border-gray-100 last:border-b-0',
                      rowProps?.onClick
                        ? 'cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400'
                        : '',
                      rowClassName?.(row, i) ?? '',
                      rowProps?.className ?? '',
                    ].filter(Boolean).join(' ')}
                  >
                    {leaves.map((col, ci) => {
                      const pinned = col.fixed === 'left';
                      return (
                        <td
                          key={col.key}
                          style={pinned ? { left: offsets[ci] ?? 0 } : undefined}
                          className={[
                            cellBase, ALIGN[col.align ?? (col.numeric ? 'right' : 'left')],
                            col.numeric ? 'font-mono' : '', 'text-gray-900',
                            col.ellipsis ? 'max-w-0 truncate' : '',
                            // A pinned cell needs its own background or the
                            // scrolling columns show through it.
                            pinned ? 'sticky z-10 bg-white' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          {col.render
                            ? col.render(row, i)
                            : col.dataIndex
                              ? (row[col.dataIndex] as ReactNode)
                              : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {bottomPad > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={leaves.length} style={{ height: bottomPad, padding: 0, border: 0 }} />
                </tr>
              )}
              </>
            )}
          </tbody>
        </table>
        {footer}
      </div>
      {pagination && pagination.pageCount > 1 && (
        <div className="mt-3 flex justify-end">
          <Pagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            onPageChange={pagination.onPageChange}
          />
        </div>
      )}
    </div>
  );
}
