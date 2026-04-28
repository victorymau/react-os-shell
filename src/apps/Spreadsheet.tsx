import { useState, useCallback, useRef } from 'react';
import EditableGrid from '../shell/EditableGrid';
import type { GridColumn } from '../shell/EditableGrid';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEFAULT_COLS = 10;
const DEFAULT_ROWS = 30;

function colLabel(i: number): string {
  if (i < 26) return ALPHA[i];
  return ALPHA[Math.floor(i / 26) - 1] + ALPHA[i % 26];
}

function makeColumns(count: number): GridColumn[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `col_${i}`,
    title: colLabel(i),
    width: 100,
  }));
}

function makeEmptyData(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(''));
}

interface Sheet {
  id: string;
  name: string;
  columns: GridColumn[];
  data: string[][];
}

function newSheet(name: string): Sheet {
  return {
    id: crypto.randomUUID(),
    name,
    columns: makeColumns(DEFAULT_COLS),
    data: makeEmptyData(DEFAULT_ROWS, DEFAULT_COLS),
  };
}

function parseCSV(text: string): string[][] {
  return text.split('\n').map(line => {
    if (line.includes('\t')) return line.split('\t').map(s => s.trim());
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { parts.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    parts.push(current.trim());
    return parts;
  }).filter(r => r.some(c => c.trim()));
}

export default function Spreadsheet() {
  const [sheets, setSheets] = useState<Sheet[]>([newSheet('Sheet 1')]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [title, setTitle] = useState('Untitled');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTab, setEditingTab] = useState<number | null>(null);
  const [tabName, setTabName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [addColCount, setAddColCount] = useState('1');
  const [addRowCount, setAddRowCount] = useState('10');

  const active = sheets[activeIdx] || sheets[0];
  const data = active.data;
  const columns = active.columns;

  const updateActiveSheet = useCallback((update: Partial<Sheet>) => {
    setSheets(prev => prev.map((s, i) => i === activeIdx ? { ...s, ...update } : s));
  }, [activeIdx]);

  const handleChange = useCallback((newData: string[][]) => {
    // Sync column count if rows were inserted/deleted with different column counts
    const maxCols = newData.reduce((m, r) => Math.max(m, r.length), 0);
    if (maxCols !== columns.length) {
      updateActiveSheet({ data: newData, columns: makeColumns(maxCols) });
    } else {
      updateActiveSheet({ data: newData });
    }
  }, [updateActiveSheet, columns.length]);

  // Tab management
  const addSheet = () => {
    const name = `Sheet ${sheets.length + 1}`;
    setSheets(prev => [...prev, newSheet(name)]);
    setActiveIdx(sheets.length);
  };

  const removeSheet = (idx: number) => {
    if (sheets.length <= 1) return;
    setSheets(prev => prev.filter((_, i) => i !== idx));
    if (activeIdx >= idx && activeIdx > 0) setActiveIdx(activeIdx - 1);
  };

  const renameSheet = (idx: number, name: string) => {
    setSheets(prev => prev.map((s, i) => i === idx ? { ...s, name } : s));
    setEditingTab(null);
  };

  // Add columns to active sheet
  const addColumns = (count: number) => {
    const newColCount = columns.length + count;
    updateActiveSheet({
      columns: makeColumns(newColCount),
      data: data.map(row => [...row, ...Array(count).fill('')]),
    });
  };

  // Add rows to active sheet
  const addRows = (count: number) => {
    updateActiveSheet({
      data: [...data, ...Array.from({ length: count }, () => Array(columns.length).fill(''))],
    });
  };

  // Clear active sheet
  const handleClear = () => {
    updateActiveSheet({
      columns: makeColumns(DEFAULT_COLS),
      data: makeEmptyData(DEFAULT_ROWS, DEFAULT_COLS),
    });
  };

  // Export as CSV
  const exportCSV = () => {
    const csv = data
      .filter(row => row.some(c => c.trim()))
      .map(row => row.map(cell => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
          return `"${cell.replace(/"/g, '""')}"`;
        return cell;
      }).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'spreadsheet'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import CSV / XLSX
  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.(csv|tsv|txt|xlsx|xls|ods)$/i, '');

    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      // XLSX — dynamic import
      const byteArr = new Uint8Array(await file.arrayBuffer());
      const XLSX = await import('xlsx');
      const wb = XLSX.read(byteArr, { type: 'array' });
      const newSheets: Sheet[] = wb.SheetNames.map(sn => {
        const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
        const maxCols = Math.max(DEFAULT_COLS, rows.reduce((m, r) => Math.max(m, r.length), 0));
        const padded = rows.map(r => { const nr = r.map(c => String(c ?? '')); while (nr.length < maxCols) nr.push(''); return nr; });
        while (padded.length < DEFAULT_ROWS) padded.push(Array(maxCols).fill(''));
        return { id: crypto.randomUUID(), name: sn, columns: makeColumns(maxCols), data: padded };
      });
      setSheets(newSheets);
      setActiveIdx(0);
      setTitle(name);
    } else {
      // CSV/TSV
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) return;
      const maxCols = Math.max(DEFAULT_COLS, parsed.reduce((m, r) => Math.max(m, r.length), 0));
      const padded = parsed.map(r => { while (r.length < maxCols) r.push(''); return r; });
      while (padded.length < DEFAULT_ROWS) padded.push(Array(maxCols).fill(''));
      updateActiveSheet({ columns: makeColumns(maxCols), data: padded });
      setTitle(name);
    }

    if (fileRef.current) fileRef.current.value = '';
  };

  // Stats
  const allNums: number[] = [];
  data.forEach(row => row.forEach(cell => {
    const v = parseFloat(cell);
    if (!isNaN(v) && cell.trim()) allNums.push(v);
  }));
  const filledCount = data.reduce((c, row) => c + row.filter(cell => cell.trim()).length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        {editingTitle ? (
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditingTitle(false); }}
            autoFocus
            className="text-sm font-medium text-gray-900 border border-gray-300 rounded px-2 py-0.5 w-40 focus:border-blue-500 focus:ring-blue-500" />
        ) : (
          <button onClick={() => setEditingTitle(true)} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate max-w-[200px]" title="Click to rename">
            {title || 'Untitled'}
          </button>
        )}

        <div className="h-4 w-px bg-gray-300" />

        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" onChange={importFile} className="hidden" />
        <button onClick={() => fileRef.current?.click()}
          className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
          Open
        </button>
        <button onClick={exportCSV}
          className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
          Save CSV
        </button>

        <div className="h-4 w-px bg-gray-300" />

        <div className="flex items-center gap-1">
          <input type="number" min="1" max="50" value={addColCount} onChange={e => setAddColCount(e.target.value)}
            className="w-10 text-xs text-center border border-gray-300 rounded px-1 py-0.5 focus:border-blue-500 focus:ring-blue-500" />
          <button onClick={() => addColumns(parseInt(addColCount) || 1)}
            className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
            + Col
          </button>
        </div>
        <div className="flex items-center gap-1">
          <input type="number" min="1" max="500" value={addRowCount} onChange={e => setAddRowCount(e.target.value)}
            className="w-10 text-xs text-center border border-gray-300 rounded px-1 py-0.5 focus:border-blue-500 focus:ring-blue-500" />
          <button onClick={() => addRows(parseInt(addRowCount) || 10)}
            className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
            + Row
          </button>
        </div>

        <div className="h-4 w-px bg-gray-300" />

        <button onClick={handleClear}
          className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-200 transition-colors">
          Clear
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0">
        <EditableGrid
          columns={columns}
          data={data}
          onChange={handleChange}
          onColumnsChange={(newCols) => updateActiveSheet({ columns: newCols })}
          minRows={DEFAULT_ROWS}
          maxHeight="100%"
        />
      </div>

      {/* Sheet tabs + status bar */}
      <div className="flex items-center border-t border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-0.5 px-1 py-1 overflow-x-auto flex-1 min-w-0">
          {sheets.map((sheet, idx) => (
            <button key={sheet.id}
              onClick={() => setActiveIdx(idx)}
              onDoubleClick={() => { setEditingTab(idx); setTabName(sheet.name); }}
              onContextMenu={e => { e.preventDefault(); if (sheets.length > 1) removeSheet(idx); }}
              className={`px-3 py-1 text-xs font-medium rounded-t whitespace-nowrap transition-colors ${
                idx === activeIdx
                  ? 'bg-white text-blue-700 border border-b-0 border-gray-300 -mb-px relative z-10'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}>
              {editingTab === idx ? (
                <input type="text" value={tabName} onChange={e => setTabName(e.target.value)}
                  onBlur={() => renameSheet(idx, tabName || sheet.name)}
                  onKeyDown={e => { if (e.key === 'Enter') renameSheet(idx, tabName || sheet.name); if (e.key === 'Escape') setEditingTab(null); }}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                  className="w-20 text-xs border border-blue-400 rounded px-1 py-0 focus:ring-0 focus:outline-none" />
              ) : sheet.name}
            </button>
          ))}
          <button onClick={addSheet} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="Add sheet">+</button>
        </div>

        <div className="flex items-center gap-4 px-3 py-1 text-xs text-gray-500 shrink-0 border-l border-gray-200">
          <span>{filledCount} cells</span>
          {allNums.length > 0 && (
            <>
              <span>Sum: {allNums.reduce((s, v) => s + v, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              <span>Avg: {(allNums.reduce((s, v) => s + v, 0) / allNums.length).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </>
          )}
          <span>{data.length} × {columns.length}</span>
        </div>
      </div>
    </div>
  );
}
