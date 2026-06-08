import { useMemo, useState } from 'react';
import type { CSSProperties, DragEvent, ReactNode } from 'react';

/**
 * Generic, drag-and-drop Kanban board. Self-contained (native HTML5 DnD, no
 * library) and styled with the same Tailwind utilities + `grid-scroll` class the
 * shell already ships, so consumers get it for free.
 *
 * Group items into columns with `columnOf`, render each card with `renderCard`,
 * and handle moves with `onMove(id, toColumn)`. Drops only change a card's
 * column; within-column order is presentational (optionally via `sortInColumn`).
 *
 * Drag affordance: as a card is dragged over a *different* column, the cards at
 * and below the hovered position slide down (CSS transform transition) to open a
 * gap the size of the dragged card, and the column highlights. The dragged card
 * is dimmed. Insertion index tracks `dragenter` (once per card crossed) rather
 * than `dragover` (every few ms) so the gap stays stable instead of oscillating.
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
  /** Called when a card is dropped on a column (its own `value`). */
  onMove: (id: string, toColumn: string) => void;
  /** Inner card content — the card chrome (border, padding, hover) is provided. */
  renderCard: (item: T) => ReactNode;
  onCardClick?: (item: T) => void;
  /** Optional comparator for ordering within a column. */
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
  const [fromCol, setFromCol] = useState<string | null>(null);
  const [gap, setGap] = useState(0);
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
    setFromCol(null);
    setOver(null);
  };
  const isActive = (col: string) => over !== null && over.col === col && fromCol !== col;

  if (isLoading) return <div className="text-sm text-gray-500 p-4">{loadingText}</div>;
  if (items.length === 0) {
    return <>{emptyState ?? <div className="text-sm text-gray-500 p-4">No items.</div>}</>;
  }

  return (
    <div className="flex-1 overflow-x-auto grid-scroll">
      <div className="flex gap-3 h-full min-w-max pb-2">
        {columns.map(col => {
          const colItems = grouped[col.value] ?? [];
          const active = isActive(col.value);
          return (
            <div
              key={col.value}
              className={`flex flex-col w-72 shrink-0 rounded-xl bg-gray-50 border transition-colors ${
                active ? 'border-blue-400 ring-2 ring-blue-300/60' : 'border-gray-200'
              }`}
              onDragOver={e => e.preventDefault()}
              onDragEnter={() =>
                setOver(prev => (prev && prev.col === col.value ? prev : { col: col.value, index: colItems.length }))
              }
              onDrop={() => {
                if (dragId) onMove(dragId, col.value);
                reset();
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
                style={{ paddingBottom: active ? gap + 8 : 8, transition: 'padding-bottom 160ms ease' }}
              >
                {colItems.map((item, index) => {
                  const id = getId(item);
                  const shift = active && over !== null && index >= over.index ? gap : 0;
                  const style: CSSProperties =
                    dragId === null
                      ? {}
                      : {
                          transform: `translateY(${shift}px)`,
                          transition: 'transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 120ms ease',
                          opacity: id === dragId ? 0.4 : 1,
                        };
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={e => {
                        setDragId(id);
                        setFromCol(col.value);
                        setGap(Math.round(e.currentTarget.getBoundingClientRect().height) + 8);
                        try {
                          e.dataTransfer.effectAllowed = 'move';
                        } catch {
                          /* some environments disallow setting this */
                        }
                      }}
                      onDragEnter={e => {
                        // Keep the column's onDragEnter from overriding this precise index.
                        e.stopPropagation();
                        setOver(prev =>
                          prev && prev.col === col.value && prev.index === index ? prev : { col: col.value, index },
                        );
                      }}
                      onDragEnd={reset}
                      onClick={onCardClick ? () => onCardClick(item) : undefined}
                      style={style}
                      className={`rounded-lg bg-white border border-gray-200 p-3 shadow-sm hover:border-blue-400 hover:shadow transition ${
                        onCardClick ? 'cursor-pointer' : ''
                      }`}
                    >
                      {renderCard(item)}
                    </div>
                  );
                })}
                {colItems.length === 0 && (
                  <div
                    className={`text-[11px] text-center rounded-lg transition-all duration-150 ${
                      active
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
