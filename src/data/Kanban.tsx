import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Generic, drag-and-drop Kanban board. Self-contained (native HTML5 DnD, no
 * library) and styled with the same Tailwind utilities + `grid-scroll` class the
 * shell already ships, so consumers get it for free.
 *
 * Group items into columns with `columnOf`, render each card with `renderCard`.
 * Cards can be dragged **between** columns (to change which column they belong
 * to) and **within** a column (to reorder / prioritise). On drop, `onMove(id,
 * toColumn, toIndex)` fires — `toIndex` is the target position within `toColumn`
 * measured against that column's cards *excluding* the dragged one, so the
 * consumer can persist an order (e.g. midpoint between neighbours) that every
 * user then sees. Sort each column by that order via `sortInColumn`.
 *
 * Affordance: a blue **drop-line** shows exactly where the card will land
 * (between two cards, in either the source or a different column), and the
 * target column highlights. The dragged card dims. The insertion point tracks
 * `dragenter` (once per card crossed) so the line stays stable rather than
 * flickering.
 */
export interface KanbanColumn {
  /** Stable column key — what `columnOf` returns and `onMove` receives. */
  value: string;
  label: string;
  /** Tailwind text + bg classes for the column header. */
  accent?: string;
  /** Tailwind bg class for the header dot. */
  dot?: string;
}

export interface KanbanProps<T> {
  items: T[];
  columns: KanbanColumn[];
  columnOf: (item: T) => string;
  getId: (item: T) => string;
  /**
   * Fired on drop. `toColumn` is the destination column's `value`; `toIndex` is
   * the target position within that column measured against its cards
   * **excluding** the dragged card (0 = top). A same-column drop that wouldn't
   * change the order is not reported.
   */
  onMove: (id: string, toColumn: string, toIndex: number) => void;
  /** Inner card content — the card chrome (border, padding, hover) is provided. */
  renderCard: (item: T) => ReactNode;
  onCardClick?: (item: T) => void;
  /** Comparator for ordering within a column — sort by the persisted order field. */
  sortInColumn?: (a: T, b: T) => number;
  isLoading?: boolean;
  loadingText?: string;
  /** Shown when there are no items at all. */
  emptyState?: ReactNode;
  /** Placeholder text inside an empty column. */
  columnEmptyText?: string;
}

interface OverState {
  col: string;
  index: number;
}

export default function Kanban<T>({
  items,
  columns,
  columnOf,
  getId,
  onMove,
  renderCard,
  onCardClick,
  sortInColumn,
  isLoading = false,
  loadingText = 'Loading…',
  emptyState,
  columnEmptyText = 'Drop here',
}: KanbanProps<T>) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<OverState | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, T[]> = {};
    for (const c of columns) map[c.value] = [];
    for (const it of items) (map[columnOf(it)] ??= []).push(it);
    if (sortInColumn) for (const k of Object.keys(map)) map[k].sort(sortInColumn);
    return map;
  }, [items, columns, columnOf, sortInColumn]);

  const reset = () => {
    setDragId(null);
    setOver(null);
  };

  // FLIP: when the order changes (e.g. on drop), slide each card from its old
  // position to its new one — so the dropped card and the cards making room for
  // it animate into place instead of snapping. Skipped while a drag is active.
  const boardRef = useRef<HTMLDivElement>(null);
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  useLayoutEffect(() => {
    if (dragId !== null) return;
    const board = boardRef.current;
    if (!board) return;
    const next = new Map<string, DOMRect>();
    const moved: [HTMLElement, number, number][] = [];
    board.querySelectorAll<HTMLElement>('[data-kanban-card]').forEach(el => {
      const id = el.dataset.kanbanCard as string;
      const rect = el.getBoundingClientRect();
      next.set(id, rect);
      const prev = prevRects.current.get(id);
      if (prev) {
        const dx = prev.left - rect.left;
        const dy = prev.top - rect.top;
        if (dx || dy) moved.push([el, dx, dy]);
      }
    });
    prevRects.current = next;
    if (!moved.length) return;
    // Invert: jump each moved card back to where it was, with no transition…
    for (const [el, dx, dy] of moved) {
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    // …then play: release to the real position on the next frame so it animates.
    requestAnimationFrame(() => {
      for (const [el] of moved) {
        el.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
        el.style.transform = '';
        el.addEventListener(
          'transitionend',
          () => {
            el.style.transition = '';
            el.style.transform = '';
          },
          { once: true },
        );
      }
    });
    // Re-measure only when the grouping (order/membership) changes or a drag
    // ends — not on every render — so typing/search doesn't thrash layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, dragId]);

  const commitMove = (col: string) => {
    if (dragId && over && over.col === col) {
      const colItems = grouped[col] ?? [];
      const dp = colItems.findIndex(it => getId(it) === dragId); // dragged's pos in this column, or -1
      const sameCol = dp !== -1;
      // Dropping right above or below itself changes nothing.
      const noop = sameCol && (over.index === dp || over.index === dp + 1);
      if (!noop) {
        // `over.index` counts the dragged card while it's still shown; remove it
        // from the count when the drop lands below its current slot.
        const toIndex = sameCol && over.index > dp ? over.index - 1 : over.index;
        onMove(dragId, col, toIndex);
      }
    }
    reset();
  };

  if (isLoading) return <div className="text-sm text-gray-500 p-4">{loadingText}</div>;
  if (items.length === 0) {
    return <>{emptyState ?? <div className="text-sm text-gray-500 p-4">No items.</div>}</>;
  }

  return (
    <div ref={boardRef} className="flex-1 overflow-x-auto grid-scroll">
      <div className="flex gap-3 h-full min-w-max pb-2">
        {columns.map(col => {
          const colItems = grouped[col.value] ?? [];
          const isOver = over !== null && over.col === col.value;
          const dp = dragId !== null ? colItems.findIndex(it => getId(it) === dragId) : -1;
          // The drop-line index, or -1 to hide it (incl. the no-op slots next to the dragged card).
          const lineAt = isOver && !(dp !== -1 && (over!.index === dp || over!.index === dp + 1)) ? over!.index : -1;
          return (
            <div
              key={col.value}
              className={`flex flex-col w-72 shrink-0 rounded-xl bg-gray-50 border transition-colors ${
                isOver ? 'border-blue-400 ring-2 ring-blue-300/60' : 'border-gray-200'
              }`}
              onDragOver={e => {
                // Accept the drop as a *move* so the browser doesn't treat it as
                // cancelled and play the native "fly the drag-image back to its
                // origin" animation — the snap-back the card showed before it
                // jumped to its new slot. Both this and `dropEffect` are needed:
                // preventing the default on dragover marks the column a valid
                // target, `dropEffect` makes the accepted action a move.
                e.preventDefault();
                try {
                  e.dataTransfer.dropEffect = 'move';
                } catch {
                  /* some environments disallow setting this */
                }
              }}
              onDrop={e => {
                // Prevent the default drop handling too, so the drag ends cleanly
                // at the drop point and React re-renders the card straight into
                // its new position — one smooth motion, no snap-back.
                e.preventDefault();
                commitMove(col.value);
              }}
            >
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-t-xl text-sm font-medium ${
                  col.accent ?? 'text-gray-700 bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.dot ?? 'bg-gray-400'}`} />
                  {col.label}
                </span>
                <span className="text-xs opacity-70">{colItems.length}</span>
              </div>
              <div
                className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]"
                // Entering the column's empty area (not a card) targets the end.
                onDragEnter={() =>
                  setOver(prev =>
                    prev && prev.col === col.value && prev.index === colItems.length
                      ? prev
                      : { col: col.value, index: colItems.length },
                  )
                }
              >
                {colItems.map((item, index) => {
                  const id = getId(item);
                  const isDragged = id === dragId;
                  return (
                    <Fragment key={id}>
                      {lineAt === index && <div className="h-0.5 rounded-full bg-blue-500" aria-hidden />}
                      <div
                        data-kanban-card={id}
                        draggable
                        onDragStart={e => {
                          setDragId(id);
                          try {
                            e.dataTransfer.effectAllowed = 'move';
                          } catch {
                            /* some environments disallow setting this */
                          }
                        }}
                        onDragEnter={e => {
                          // Don't let the column's onDragEnter override this precise slot.
                          e.stopPropagation();
                          // Insert *after* this card when dragging it downward onto a
                          // neighbour, *before* it when dragging up — otherwise nudging a
                          // card down by one lands "before its neighbour" = its own slot,
                          // which commitMove treats as a no-op (the same-column reorder bug).
                          const draggedPos = dragId !== null ? colItems.findIndex(it => getId(it) === dragId) : -1;
                          const target = draggedPos !== -1 && draggedPos < index ? index + 1 : index;
                          setOver(prev =>
                            prev && prev.col === col.value && prev.index === target
                              ? prev
                              : { col: col.value, index: target },
                          );
                        }}
                        onDragEnd={reset}
                        onClick={onCardClick ? () => onCardClick(item) : undefined}
                        style={dragId === null ? undefined : { opacity: isDragged ? 0.4 : 1, transition: 'opacity 120ms ease' }}
                        className={`rounded-lg bg-white border border-gray-200 p-3 shadow-sm hover:border-blue-400 hover:shadow transition ${
                          onCardClick ? 'cursor-pointer' : ''
                        }`}
                      >
                        {renderCard(item)}
                      </div>
                    </Fragment>
                  );
                })}
                {colItems.length > 0 && lineAt === colItems.length && (
                  <div className="h-0.5 rounded-full bg-blue-500" aria-hidden />
                )}
                {colItems.length === 0 && (
                  <div
                    className={`text-[11px] text-center rounded-lg transition-all duration-150 ${
                      isOver
                        ? 'border-2 border-dashed border-blue-300 bg-blue-50/50 text-blue-400 py-8'
                        : 'text-gray-400 py-6'
                    }`}
                  >
                    {columnEmptyText}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
