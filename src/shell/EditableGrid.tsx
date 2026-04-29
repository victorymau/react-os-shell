import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface GridColumn {
  key: string;
  title: string;
  width?: number;
  readOnly?: boolean;
  align?: 'left' | 'right' | 'center';
}

export type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: 'sm' | 'base' | 'lg' | 'xl';
};

export interface EditableGridProps {
  columns: GridColumn[];
  data: string[][];
  onChange: (data: string[][]) => void;
  onColumnsChange?: (columns: GridColumn[]) => void;
  /** Fixed row count — disables add/delete rows */
  fixedRows?: boolean;
  minRows?: number;
  maxHeight?: string;
  /** Per-cell text styling, keyed by `${row}:${col}`. */
  cellStyles?: Record<string, CellStyle>;
  /** Notifies the parent when the focused/edited cell changes. */
  onFocusChange?: (pos: { row: number; col: number } | null) => void;
  /** Notifies the parent when the selection rectangle changes. */
  onSelectionChange?: (sel: { anchor: { row: number; col: number }; end: { row: number; col: number } } | null) => void;
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
export default function EditableGrid({ columns, data, onChange, onColumnsChange, fixedRows = false, minRows = 15, maxHeight = '260px', cellStyles, onFocusChange, onSelectionChange }: EditableGridProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [focus, setFocus] = useState<CellPos | null>(null);
  useEffect(() => { onFocusChange?.(focus); }, [focus, onFocusChange]);

  // Column resize state
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const resizing = useRef<{ col: number; startX: number; startW: number } | null>(null);

  // Row resize state
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const rowResizing = useRef<{ row: number; startY: number; startH: number } | null>(null);

  // Drag reorder state
  const [dragRow, setDragRow] = useState<number | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);
  const [dragCol, setDragCol] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);

  // Range selection state
  const [selAnchor, setSelAnchor] = useState<CellPos | null>(null);
  const [selEnd, setSelEnd] = useState<CellPos | null>(null);
  useEffect(() => {
    onSelectionChange?.(selAnchor && selEnd ? { anchor: selAnchor, end: selEnd } : null);
  }, [selAnchor, selEnd, onSelectionChange]);
  const dragging = useRef(false);

  // Fill handle state
  const [fillTarget, setFillTarget] = useState<CellPos | null>(null);
  const filling = useRef(false);
  const selRefForFill = useRef<{ a: CellPos | null; e: CellPos | null }>({ a: null, e: null });
  selRefForFill.current = { a: selAnchor, e: selEnd };

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
      // While editing, only intercept when the whole cell text is selected.
      if (target.isContentEditable) {
        if (target.textContent && window.getSelection()?.toString() === target.textContent) {
          e.preventDefault();
          updateCell(row, col, '');
        }
        return;
      }
      // Not editing — clear the selection range (or just this cell).
      e.preventDefault();
      if (selAnchor && selEnd) {
        const r1 = Math.min(selAnchor.row, selEnd.row), r2 = Math.max(selAnchor.row, selEnd.row);
        const c1 = Math.min(selAnchor.col, selEnd.col), c2 = Math.max(selAnchor.col, selEnd.col);
        const next = rows.map(r => [...r]);
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
          if (next[r] && !columns[c]?.readOnly) next[r][c] = '';
        }
        onChange(next);
      } else {
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
  }, [columns, rows, rows.length, updateCell, selAnchor, selEnd, onChange]);

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

  // Row resize
  const getRowHeight = (ri: number) => rowHeights[ri] ?? 28;
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!rowResizing.current) return;
      const diff = e.clientY - rowResizing.current.startY;
      const newH = Math.max(20, rowResizing.current.startH + diff);
      setRowHeights(prev => ({ ...prev, [rowResizing.current!.row]: newH }));
    };
    const handleUp = () => { rowResizing.current = null; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, []);
  const startRowResize = (e: React.MouseEvent, ri: number) => {
    e.preventDefault();
    e.stopPropagation();
    rowResizing.current = { row: ri, startY: e.clientY, startH: getRowHeight(ri) };
    document.body.style.cursor = 'row-resize';
  };

  // Auto-fit column to the widest cell content (data + header).
  const autoFitColumn = useCallback((ci: number) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    let maxW = 0;
    for (const row of rows) {
      const plain = String(row[ci] ?? '').replace(/<[^>]*>/g, '');
      const w = ctx.measureText(plain).width;
      if (w > maxW) maxW = w;
    }
    const headerW = ctx.measureText(columns[ci]?.title ?? '').width;
    if (headerW > maxW) maxW = headerW;
    const finalW = Math.max(40, Math.ceil(maxW + 24));
    setColWidths(prev => ({ ...prev, [ci]: finalW }));
    if (onColumnsChange) {
      const updated = columns.map((c, i) => ({ ...c, width: i === ci ? finalW : (colWidths[i] ?? c.width) }));
      onColumnsChange(updated);
    }
  }, [rows, columns, colWidths, onColumnsChange]);

  // Auto-fit row — reset to the default height (cells use whitespace-nowrap so
  // a single row line is the natural fit).
  const autoFitRow = useCallback((ri: number) => {
    setRowHeights(prev => { const next = { ...prev }; delete next[ri]; return next; });
  }, []);

  // Fill handle — drag the small square at the bottom-right of the selection
  // to copy / extrapolate values into adjacent cells.
  const applyFill = useCallback((target: CellPos) => {
    const { a: sa, e: se } = selRefForFill.current;
    if (!sa || !se) return;
    const r1 = Math.min(sa.row, se.row);
    const r2 = Math.max(sa.row, se.row);
    const c1 = Math.min(sa.col, se.col);
    const c2 = Math.max(sa.col, se.col);

    let nr1 = r1, nr2 = r2, nc1 = c1, nc2 = c2;
    if (target.row > r2) nr2 = target.row;
    else if (target.row < r1) nr1 = target.row;
    if (target.col > c2) nc2 = target.col;
    else if (target.col < c1) nc1 = target.col;

    const selH = r2 - r1 + 1;
    const selW = c2 - c1 + 1;
    const next = rows.map(r => [...r]);
    while (next.length <= nr2) next.push(Array(columns.length).fill(''));
    for (const row of next) while (row.length <= nc2) row.push('');

    // Detect a 1-d numeric arithmetic sequence so vertical/horizontal drags
    // continue the series instead of repeating the pattern.
    function asSeries(values: string[]): { step: number } | null {
      const nums = values.map(v => parseFloat(v));
      if (nums.length < 2 || nums.some(n => Number.isNaN(n))) return null;
      const step = nums[1] - nums[0];
      for (let i = 2; i < nums.length; i++) {
        if (Math.abs((nums[i] - nums[i - 1]) - step) > 1e-9) return null;
      }
      return { step };
    }

    for (let r = nr1; r <= nr2; r++) {
      for (let c = nc1; c <= nc2; c++) {
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) continue; // inside original
        let value: string;
        if (selW === 1 && nc1 === c1 && nc2 === c2) {
          // Vertical fill (same column as selection).
          const colVals = Array.from({ length: selH }, (_, i) => next[r1 + i]?.[c] ?? '');
          const series = asSeries(colVals);
          if (series) {
            const last = parseFloat(next[r2]?.[c] ?? '0');
            const first = parseFloat(next[r1]?.[c] ?? '0');
            const offset = r > r2 ? r - r2 : -(r1 - r);
            value = String((r > r2 ? last : first) + series.step * offset);
          } else {
            const dr = ((r - r1) % selH + selH) % selH;
            value = next[r1 + dr]?.[c] ?? '';
          }
        } else if (selH === 1 && nr1 === r1 && nr2 === r2) {
          // Horizontal fill (same row as selection).
          const rowVals = Array.from({ length: selW }, (_, i) => next[r]?.[c1 + i] ?? '');
          const series = asSeries(rowVals);
          if (series) {
            const last = parseFloat(next[r]?.[c2] ?? '0');
            const first = parseFloat(next[r]?.[c1] ?? '0');
            const offset = c > c2 ? c - c2 : -(c1 - c);
            value = String((c > c2 ? last : first) + series.step * offset);
          } else {
            const dc = ((c - c1) % selW + selW) % selW;
            value = next[r]?.[c1 + dc] ?? '';
          }
        } else {
          // 2-d fill — tile the selection rectangle.
          const dr = ((r - r1) % selH + selH) % selH;
          const dc = ((c - c1) % selW + selW) % selW;
          value = next[r1 + dr]?.[c1 + dc] ?? '';
        }
        next[r][c] = value;
      }
    }

    onChange(next);
    setSelAnchor({ row: nr1, col: nc1 });
    setSelEnd({ row: nr2, col: nc2 });
  }, [rows, columns.length, onChange]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!filling.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const inner = (el as HTMLElement)?.closest?.('[data-row][data-col]') as HTMLElement | null;
      if (!inner) return;
      const r = parseInt(inner.dataset.row!);
      const c = parseInt(inner.dataset.col!);
      setFillTarget({ row: r, col: c });
    };
    const handleUp = () => {
      if (filling.current && fillTarget) applyFill(fillTarget);
      filling.current = false;
      setFillTarget(null);
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [fillTarget, applyFill]);

  const startFill = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    filling.current = true;
    document.body.style.cursor = 'crosshair';
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
                    <div className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize z-20"
                      onMouseDown={(e) => startColResize(e, ci)}
                      onDoubleClick={(e) => { e.stopPropagation(); autoFitColumn(ci); }}
                      title="Drag to resize · double-click to auto-fit"
                    />
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
              <tr key={ri} style={{ height: getRowHeight(ri) }}>
                <td className={`relative px-1 py-1 text-center text-[10px] text-gray-400 border-b border-r border-gray-200 bg-gray-50 select-none cursor-pointer hover:bg-gray-200${rowSelected ? ' !bg-blue-200 !text-gray-700' : ''}${dragOverRow === ri ? ' !bg-blue-100' : ''}`}
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
                  {/* Row resize handle — slim bar at the bottom of the row header */}
                  <div className="absolute -bottom-1 left-0 right-0 h-2 cursor-row-resize z-20"
                    onMouseDown={(e) => startRowResize(e, ri)}
                    onDoubleClick={(e) => { e.stopPropagation(); autoFitRow(ri); }}
                    title="Drag to resize · double-click to auto-fit"
                  />
                </td>
                {columns.map((col, ci) => {
                  const inRange = selAnchor && selEnd && rangeContains(selAnchor, selEnd, ri, ci);
                  const isEditing = editingCell?.row === ri && editingCell?.col === ci && !col.readOnly;
                  const isFocused = focus?.row === ri && focus?.col === ci;
                  const cellStyle = cellStyles?.[`${ri}:${ci}`];
                  const selR2 = selAnchor && selEnd ? Math.max(selAnchor.row, selEnd.row) : -1;
                  const selC2 = selAnchor && selEnd ? Math.max(selAnchor.col, selEnd.col) : -1;
                  const isFillCorner = selAnchor && selEnd && ri === selR2 && ci === selC2;
                  const inFillPreview = filling.current && fillTarget && selAnchor && selEnd && (() => {
                    const r1 = Math.min(selAnchor.row, selEnd.row), r2 = Math.max(selAnchor.row, selEnd.row);
                    const c1 = Math.min(selAnchor.col, selEnd.col), c2 = Math.max(selAnchor.col, selEnd.col);
                    let nr1 = r1, nr2 = r2, nc1 = c1, nc2 = c2;
                    if (fillTarget.row > r2) nr2 = fillTarget.row; else if (fillTarget.row < r1) nr1 = fillTarget.row;
                    if (fillTarget.col > c2) nc2 = fillTarget.col; else if (fillTarget.col < c1) nc1 = fillTarget.col;
                    return ri >= nr1 && ri <= nr2 && ci >= nc1 && ci <= nc2 && !(ri >= r1 && ri <= r2 && ci >= c1 && ci <= c2);
                  })();
                  const fontSizeCls = cellStyle?.fontSize === 'sm' ? 'text-[11px]'
                    : cellStyle?.fontSize === 'lg' ? 'text-sm'
                    : cellStyle?.fontSize === 'xl' ? 'text-base'
                    : 'text-xs';
                  const styleCls = `${cellStyle?.bold ? ' font-bold' : ''}${cellStyle?.italic ? ' italic' : ''}${cellStyle?.underline ? ' underline' : ''}`;
                  return (
                    <td key={ci}
                      className={`relative ${tdCls}${col.readOnly ? ' bg-gray-50 text-gray-500 cursor-default' : ' cursor-cell'}${inRange ? ' !bg-blue-100' : ''}${isFocused && !inRange ? ' ring-2 ring-inset ring-blue-400' : ''}${inFillPreview ? ' !bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
                      onMouseDown={(e) => {
                        // td-level handler so clicks anywhere in the cell (incl. borders) select.
                        if (e.target === e.currentTarget) {
                          handleMouseDown(e, ri, ci);
                          const inner = e.currentTarget.querySelector<HTMLElement>('[data-row][data-col]');
                          inner?.focus();
                        }
                      }}
                      onMouseEnter={() => handleMouseEnter(ri, ci)}
                      onClick={(e) => {
                        if (e.target === e.currentTarget) {
                          const inner = e.currentTarget.querySelector<HTMLElement>('[data-row][data-col]');
                          inner?.focus();
                        }
                      }}
                      onDoubleClick={(e) => {
                        if (e.target === e.currentTarget && !col.readOnly) setEditingCell({ row: ri, col: ci });
                      }}>
                      <div
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        tabIndex={0}
                        data-row={ri}
                        data-col={ci}
                        className={`w-full h-full px-2 py-1 outline-none whitespace-nowrap overflow-hidden ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                        } ${col.readOnly ? 'cursor-default' : 'cursor-cell'} font-mono ${fontSizeCls}${styleCls}`}
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
                      {isFillCorner && (
                        <div
                          onMouseDown={startFill}
                          title="Drag to fill"
                          className="absolute -bottom-[3px] -right-[3px] w-[7px] h-[7px] bg-blue-500 border border-white cursor-crosshair z-30 hover:bg-blue-600"
                        />
                      )}
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
