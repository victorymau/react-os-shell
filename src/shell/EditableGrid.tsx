import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface GridColumn {
  key: string;
  title: string;
  width?: number;
  readOnly?: boolean;
  align?: 'left' | 'right' | 'center';
}

export interface EditableGridProps {
  columns: GridColumn[];
  data: string[][];
  onChange: (data: string[][]) => void;
  onColumnsChange?: (columns: GridColumn[]) => void;
  /** Fixed row count — disables add/delete rows */
  fixedRows?: boolean;
  minRows?: number;
  maxHeight?: string;
}

interface CellPos { row: number; col: number }

function rangeContains(anchor: CellPos, end: CellPos, row: number, col: number): boolean {
  const r1 = Math.min(anchor.row, end.row), r2 = Math.max(anchor.row, end.row);
  const c1 = Math.min(anchor.col, end.col), c2 = Math.max(anchor.col, end.col);
  return row >= r1 && row <= r2 && col >= c1 && col <= c2;
}

/**
 * Lightweight editable grid with spreadsheet-like features:
 * - Click + drag to select a range of cells
 * - Ctrl+C / Cmd+C to copy selection as tab-delimited text
 * - Multi-cell paste from spreadsheets (Ctrl+V)
 * - Tab/Enter/Arrow keyboard navigation
 */
export default function EditableGrid({ columns, data, onChange, onColumnsChange, fixedRows = false, minRows = 15, maxHeight = '260px' }: EditableGridProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [focus, setFocus] = useState<CellPos | null>(null);

  // Column resize state
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const resizing = useRef<{ col: number; startX: number; startW: number } | null>(null);

  // Drag reorder state
  const [dragRow, setDragRow] = useState<number | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);

  // Range selection state
  const [selAnchor, setSelAnchor] = useState<CellPos | null>(null);
  const [selEnd, setSelEnd] = useState<CellPos | null>(null);
  const dragging = useRef(false);

  const hasRange = selAnchor && selEnd && (selAnchor.row !== selEnd.row || selAnchor.col !== selEnd.col);

  // Ensure minimum rows
  const rows = [...data];
  if (!fixedRows) {
    while (rows.length < minRows) rows.push(Array(columns.length).fill(''));
  }

  const updateCell = useCallback((row: number, col: number, value: string) => {
    const next = rows.map(r => [...r]);
    while (next.length <= row) next.push(Array(columns.length).fill(''));
    while (next[row].length < columns.length) next[row].push('');
    next[row][col] = value;
    onChange(next);
  }, [rows, columns.length, onChange]);

  // Mouse drag selection
  const handleMouseDown = useCallback((e: React.MouseEvent, row: number, col: number) => {
    if (e.button !== 0) return;
    // Commit the currently focused cell's value before moving
    const active = document.activeElement as HTMLElement;
    if (active?.dataset?.row && active?.dataset?.col) {
      const ar = parseInt(active.dataset.row);
      const ac = parseInt(active.dataset.col);
      const val = active.textContent || '';
      if (val !== (rows[ar]?.[ac] || '')) {
        const next = rows.map(r => [...r]);
        if (next[ar]) { next[ar][ac] = val; onChange(next); }
      }
    }
    dragging.current = true;
    if (e.shiftKey && selAnchor) {
      // Shift+click: extend selection from anchor to clicked cell
      setSelEnd({ row, col });
    } else {
      setSelAnchor({ row, col });
      setSelEnd({ row, col });
    }
  }, [rows, onChange, selAnchor]);

  const handleMouseEnter = useCallback((row: number, col: number) => {
    if (dragging.current) {
      setSelEnd({ row, col });
    }
  }, []);

  useEffect(() => {
    const handleMouseUp = () => { dragging.current = false; };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Copy selection with Ctrl+C / Cmd+C
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;
      if (!selAnchor || !selEnd) return;
      // Don't intercept if user has text selected within a cell
      const nativeSel = window.getSelection();
      if (nativeSel && nativeSel.toString().length > 0 && !hasRange) return;

      const r1 = Math.min(selAnchor.row, selEnd.row), r2 = Math.max(selAnchor.row, selEnd.row);
      const c1 = Math.min(selAnchor.col, selEnd.col), c2 = Math.max(selAnchor.col, selEnd.col);

      const text = [];
      for (let r = r1; r <= r2; r++) {
        const rowCells = [];
        for (let c = c1; c <= c2; c++) {
          rowCells.push(rows[r]?.[c] || '');
        }
        text.push(rowCells.join('\t'));
      }
      const tsv = text.join('\n');
      if (tsv) {
        e.preventDefault();
        navigator.clipboard.writeText(tsv);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selAnchor, selEnd, rows, hasRange]);

  // Global paste — works even when cell is selected but not editing
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (!focus) return;
      // Don't intercept if already in an editable element
      const active = document.activeElement as HTMLElement;
      if (active?.isContentEditable) return;
      // Only intercept if focus is inside our grid
      if (!tableRef.current?.contains(active)) return;

      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      e.preventDefault();
      const pastedRows = text.split('\n').filter(l => l).map(line => line.split('\t'));
      const next = rows.map(r => [...r]);

      for (let r = 0; r < pastedRows.length; r++) {
        const targetRow = focus.row + r;
        while (next.length <= targetRow) next.push(Array(columns.length).fill(''));
        while (next[targetRow].length < columns.length) next[targetRow].push('');
        for (let c = 0; c < pastedRows[r].length; c++) {
          const targetCol = focus.col + c;
          if (targetCol >= columns.length) break;
          if (columns[targetCol].readOnly) continue;
          next[targetRow][targetCol] = pastedRows[r][c].trim();
        }
      }
      onChange(next);

      // Select the pasted range
      setSelAnchor({ row: focus.row, col: focus.col });
      setSelEnd({ row: Math.min(focus.row + pastedRows.length - 1, next.length - 1), col: Math.min(focus.col + (pastedRows[0]?.length || 1) - 1, columns.length - 1) });
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [focus, rows, columns, onChange]);

  // Handle paste — supports multi-cell paste from spreadsheets (when in edit mode)
  const handlePaste = useCallback((e: React.ClipboardEvent, startRow: number, startCol: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const pastedRows = text.split('\n').map(line => line.split('\t'));
    if (pastedRows.length <= 1 && pastedRows[0]?.length <= 1) return;

    e.preventDefault();
    const next = rows.map(r => [...r]);

    for (let r = 0; r < pastedRows.length; r++) {
      const targetRow = startRow + r;
      while (next.length <= targetRow) next.push(Array(columns.length).fill(''));
      while (next[targetRow].length < columns.length) next[targetRow].push('');
      for (let c = 0; c < pastedRows[r].length; c++) {
        const targetCol = startCol + c;
        if (targetCol >= columns.length) break;
        if (columns[targetCol].readOnly) continue;
        next[targetRow][targetCol] = pastedRows[r][c].trim();
      }
    }

    onChange(next);
  }, [rows, columns, onChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, row: number, col: number) => {
    let nextRow = row;
    let nextCol = col;

    if (e.key === 'Tab') {
      e.preventDefault();
      nextCol = e.shiftKey ? col - 1 : col + 1;
      if (nextCol >= columns.length) { nextCol = 0; nextRow = row + 1; }
      if (nextCol < 0) { nextCol = columns.length - 1; nextRow = row - 1; }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      nextRow = e.shiftKey ? row - 1 : row + 1;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextRow = row + 1;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextRow = row - 1;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextCol = col - 1;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextCol = col + 1;
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const target = e.target as HTMLElement;
      if (target.textContent && window.getSelection()?.toString() === target.textContent) {
        e.preventDefault();
        updateCell(row, col, '');
      }
      return;
    } else {
      return;
    }

    // Skip read-only columns
    while (nextCol >= 0 && nextCol < columns.length && columns[nextCol].readOnly) {
      nextCol += e.key === 'Tab' && e.shiftKey ? -1 : 1;
    }

    if (nextRow >= 0 && nextRow < rows.length && nextCol >= 0 && nextCol < columns.length) {
      const cell = tableRef.current?.querySelector(`[data-row="${nextRow}"][data-col="${nextCol}"]`) as HTMLElement;
      if (cell) {
        cell.focus({ preventScroll: true });
        cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        setFocus({ row: nextRow, col: nextCol });
        setEditingCell(null);
        setSelAnchor({ row: nextRow, col: nextCol });
        setSelEnd({ row: nextRow, col: nextCol });
      }
    }
  }, [columns, rows.length, updateCell]);

  // Add rows when typing in the last row
  const ensureRows = useCallback((row: number) => {
    if (fixedRows) return;
    if (row >= rows.length - 2) {
      const next = rows.map(r => [...r]);
      for (let i = 0; i < 5; i++) next.push(Array(columns.length).fill(''));
      onChange(next);
    }
  }, [fixedRows, rows, columns.length, onChange]);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: { label: string; onClick: () => void }[] } | null>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [ctxMenu]);

  const insertRow = useCallback((at: number) => {
    const next = rows.map(r => [...r]);
    next.splice(at, 0, Array(columns.length).fill(''));
    onChange(next);
  }, [rows, columns.length, onChange]);

  const deleteRow = useCallback((at: number) => {
    if (rows.length <= 1) return;
    const next = rows.filter((_, i) => i !== at);
    onChange(next);
  }, [rows, onChange]);

  const insertCol = useCallback((at: number) => {
    const next = rows.map(r => { const nr = [...r]; nr.splice(at, 0, ''); return nr; });
    onChange(next);
  }, [rows, onChange]);

  const deleteCol = useCallback((at: number) => {
    if (columns.length <= 1) return;
    const next = rows.map(r => { const nr = [...r]; nr.splice(at, 1); return nr; });
    onChange(next);
  }, [rows, columns.length, onChange]);

  const handleRowCtx = useCallback((e: React.MouseEvent, ri: number) => {
    e.preventDefault();
    if (fixedRows) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, items: [
      { label: `Insert row above`, onClick: () => { insertRow(ri); setCtxMenu(null); } },
      { label: `Insert row below`, onClick: () => { insertRow(ri + 1); setCtxMenu(null); } },
      { label: `Delete row ${ri + 1}`, onClick: () => { deleteRow(ri); setCtxMenu(null); } },
    ]});
  }, [fixedRows, insertRow, deleteRow]);

  const handleColCtx = useCallback((e: React.MouseEvent, ci: number) => {
    e.preventDefault();
    if (fixedRows) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, items: [
      { label: `Insert column left`, onClick: () => { insertCol(ci); setCtxMenu(null); } },
      { label: `Insert column right`, onClick: () => { insertCol(ci + 1); setCtxMenu(null); } },
      { label: `Delete column ${columns[ci]?.title || ci + 1}`, onClick: () => { deleteCol(ci); setCtxMenu(null); } },
    ]});
  }, [fixedRows, columns, insertCol, deleteCol]);

  // Column resize
  const getColWidth = (ci: number) => colWidths[ci] ?? columns[ci]?.width ?? 150;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const diff = e.clientX - resizing.current.startX;
      const newW = Math.max(40, resizing.current.startW + diff);
      setColWidths(prev => ({ ...prev, [resizing.current!.col]: newW }));
    };
    const handleMouseUp = () => {
      if (resizing.current && onColumnsChange) {
        const updated = columns.map((c, i) => ({ ...c, width: colWidths[i] ?? c.width }));
        updated[resizing.current.col] = { ...updated[resizing.current.col], width: colWidths[resizing.current.col] ?? columns[resizing.current.col].width };
        onColumnsChange(updated);
      }
      resizing.current = null;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [columns, colWidths, onColumnsChange]);

  const startColResize = (e: React.MouseEvent, ci: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { col: ci, startX: e.clientX, startW: getColWidth(ci) };
    document.body.style.cursor = 'col-resize';
  };

  // Row drag reorder
  const handleRowDragStart = (ri: number) => setDragRow(ri);
  const handleRowDragOver = (e: React.DragEvent, ri: number) => { e.preventDefault(); setDragOverRow(ri); };
  const handleRowDrop = (ri: number) => {
    if (dragRow === null || dragRow === ri) { setDragRow(null); setDragOverRow(null); return; }
    const next = rows.map(r => [...r]);
    const [moved] = next.splice(dragRow, 1);
    next.splice(ri, 0, moved);
    onChange(next);
    setDragRow(null);
    setDragOverRow(null);
  };

  // Column drag reorder
  const handleColDragStart = (ci: number) => setDragCol(ci);
  const handleColDragOver = (e: React.DragEvent, ci: number) => { e.preventDefault(); setDragOverCol(ci); };
  const handleColDrop = (ci: number) => {
    if (dragCol === null || dragCol === ci) { setDragCol(null); setDragOverCol(null); return; }
    const next = rows.map(r => {
      const nr = [...r];
      const [moved] = nr.splice(dragCol, 1);
      nr.splice(ci, 0, moved);
      return nr;
    });
    onChange(next);
    if (onColumnsChange) {
      const newCols = [...columns];
      const [moved] = newCols.splice(dragCol, 1);
      newCols.splice(ci, 0, moved);
      onColumnsChange(newCols);
    }
    setDragCol(null);
    setDragOverCol(null);
  };

  // Virtual scrolling — only render visible rows + buffer
  const ROW_HEIGHT = 28;
  const BUFFER = 20;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);

  // Measure actual container height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerHeight(el.clientHeight || 800);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Only virtualize if there are many rows (>100), otherwise render all
  const useVirtualization = rows.length > 100;
  const visibleStart = useVirtualization ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER) : 0;
  const visibleEnd = useVirtualization ? Math.min(rows.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER) : rows.length;
  const visibleRows = useMemo(() => rows.slice(visibleStart, visibleEnd), [rows, visibleStart, visibleEnd]);
  const topPad = visibleStart * ROW_HEIGHT;
  const bottomPad = (rows.length - visibleEnd) * ROW_HEIGHT;

  const thCls = 'px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase bg-gray-100 border-b border-r border-gray-200 select-none';
  const tdCls = 'px-0 py-0 border-b border-r border-gray-200 text-sm';

  return (
    <div ref={containerRef} className="border border-gray-300 rounded overflow-scroll grid-scroll"
      style={{ maxHeight, height: maxHeight }}
      onScroll={(e) => setScrollTop((e.target as HTMLElement).scrollTop)}>
        <table ref={tableRef} className="border-collapse select-none" style={{ tableLayout: 'fixed', minWidth: 36 + columns.reduce((s, c) => s + (getColWidth(columns.indexOf(c))), 0) }}>
          <colgroup>
            <col style={{ width: 36 }} />
            {columns.map((c, ci) => <col key={c.key} style={{ width: getColWidth(ci) }} />)}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={thCls + ' text-center w-9 cursor-pointer hover:bg-gray-200'}
                onClick={() => { setSelAnchor({ row: 0, col: 0 }); setSelEnd({ row: rows.length - 1, col: columns.length - 1 }); }}
                title="Select all">#</th>
              {columns.map((c, ci) => {
                const colSelected = selAnchor && selEnd && Math.min(selAnchor.col, selEnd.col) <= ci && ci <= Math.max(selAnchor.col, selEnd.col)
                  && Math.min(selAnchor.row, selEnd.row) === 0 && Math.max(selAnchor.row, selEnd.row) === rows.length - 1;
                return (
                  <th key={c.key} className={`${thCls} cursor-pointer hover:bg-gray-200 relative${colSelected ? ' !bg-blue-200' : ''}${dragOverCol === ci ? ' !bg-blue-100' : ''}`}
                    style={{ width: getColWidth(ci) }}
                    draggable
                    onDragStart={() => handleColDragStart(ci)}
                    onDragOver={(e) => handleColDragOver(e, ci)}
                    onDrop={() => handleColDrop(ci)}
                    onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                    onClick={(e) => {
                      if (e.shiftKey && selAnchor) {
                        setSelEnd({ row: rows.length - 1, col: ci });
                      } else {
                        setSelAnchor({ row: 0, col: ci }); setSelEnd({ row: rows.length - 1, col: ci });
                      }
                    }}
                    onContextMenu={(e) => handleColCtx(e, ci)}>
                    {c.title}
                    {/* Resize handle — thin edge, wider hover target */}
                    <div className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize z-20 group"
                      onMouseDown={(e) => startColResize(e, ci)}>
                      <div className="absolute right-[3px] top-0 bottom-0 w-[2px] group-hover:bg-blue-400" />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && <tr style={{ height: topPad }} />}
            {visibleRows.map((row, vi) => {
              const ri = visibleStart + vi;
              const rowSelected = selAnchor && selEnd && Math.min(selAnchor.row, selEnd.row) <= ri && ri <= Math.max(selAnchor.row, selEnd.row)
                && Math.min(selAnchor.col, selEnd.col) === 0 && Math.max(selAnchor.col, selEnd.col) === columns.length - 1;
              return (
              <tr key={ri}>
                <td className={`px-1 py-1 text-center text-[10px] text-gray-400 border-b border-r border-gray-200 bg-gray-50 select-none cursor-pointer hover:bg-gray-200${rowSelected ? ' !bg-blue-200 !text-gray-700' : ''}${dragOverRow === ri ? ' !bg-blue-100' : ''}`}
                  draggable
                  onDragStart={() => handleRowDragStart(ri)}
                  onDragOver={(e) => handleRowDragOver(e, ri)}
                  onDrop={() => handleRowDrop(ri)}
                  onDragEnd={() => { setDragRow(null); setDragOverRow(null); }}
                  onClick={(e) => {
                    if (e.shiftKey && selAnchor) {
                      setSelEnd({ row: ri, col: columns.length - 1 });
                    } else {
                      setSelAnchor({ row: ri, col: 0 }); setSelEnd({ row: ri, col: columns.length - 1 });
                    }
                  }}
                  onContextMenu={(e) => handleRowCtx(e, ri)}>
                  {ri + 1}
                </td>
                {columns.map((col, ci) => {
                  const inRange = selAnchor && selEnd && rangeContains(selAnchor, selEnd, ri, ci);
                  const isEditing = editingCell?.row === ri && editingCell?.col === ci && !col.readOnly;
                  const isFocused = focus?.row === ri && focus?.col === ci;
                  return (
                    <td key={ci} className={`${tdCls}${col.readOnly ? ' bg-gray-50 text-gray-500' : ''}${inRange ? ' !bg-blue-100' : ''}${isFocused && !inRange ? ' ring-2 ring-inset ring-blue-400' : ''}`}>
                      <div
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        tabIndex={0}
                        data-row={ri}
                        data-col={ci}
                        className={`w-full h-full px-2 py-1 outline-none ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                        } ${col.readOnly ? 'cursor-default' : 'cursor-cell'} font-mono text-xs`}
                        onMouseDown={(e) => handleMouseDown(e, ri, ci)}
                        onMouseEnter={() => handleMouseEnter(ri, ci)}
                        onDoubleClick={() => { if (!col.readOnly) setEditingCell({ row: ri, col: ci }); }}
                        onFocus={() => {
                          setFocus({ row: ri, col: ci });
                          if (!dragging.current) {
                            setSelAnchor({ row: ri, col: ci });
                            setSelEnd({ row: ri, col: ci });
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.currentTarget.textContent || '';
                          if (val !== (row[ci] || '')) updateCell(ri, ci, val);
                          setEditingCell(null);
                        }}
                        onInput={() => ensureRows(ri)}
                        onPaste={(e) => handlePaste(e, ri, ci)}
                        onKeyDown={(e) => {
                          // Start editing on any printable key — clear cell and type
                          if (!isEditing && !col.readOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                            e.preventDefault();
                            updateCell(ri, ci, e.key);
                            setEditingCell({ row: ri, col: ci });
                            // Place cursor at end after React re-renders
                            requestAnimationFrame(() => {
                              const el = tableRef.current?.querySelector(`[data-row="${ri}"][data-col="${ci}"]`) as HTMLElement;
                              if (el) {
                                el.focus();
                                const range = document.createRange();
                                range.selectNodeContents(el);
                                range.collapse(false);
                                const sel = window.getSelection();
                                sel?.removeAllRanges();
                                sel?.addRange(range);
                              }
                            });
                            return;
                          }
                          handleKeyDown(e, ri, ci);
                        }}
                        dangerouslySetInnerHTML={{ __html: row[ci] || '' }}
                      />
                    </td>
                  );
                })}
              </tr>
              );
            })}
            {bottomPad > 0 && <tr style={{ height: bottomPad }} />}
          </tbody>
        </table>

      {/* Context menu — portalled to body to avoid overflow clipping */}
      {ctxMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onPointerDown={() => setCtxMenu(null)} />
          <div className="fixed z-[201] bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            {ctxMenu.items.map((item, i) => (
              <button key={i} onPointerDown={e => { e.stopPropagation(); item.onClick(); }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
