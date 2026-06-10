import { useState } from 'react';
import { EditableGrid, type GridColumn } from 'react-os-shell';

/**
 * Demo for the shell's <EditableGrid> primitive — the lightweight
 * spreadsheet-style grid used for tabular editing (e.g. the Spreadsheets
 * app's import staging). Everything is in-memory: edits land in local state
 * via onChange and the totals row below recomputes live.
 *
 * Things to try: click+drag to select a range, copy it (⌘C) and paste into a
 * real spreadsheet (tab-delimited) — or paste a block of cells back in (⌘V);
 * drag the fill handle on the selection corner; resize and drag-reorder
 * columns and rows; navigate with Tab / Enter / arrows.
 */

const COLUMNS: GridColumn[] = [
  { key: 'sku', title: 'SKU', width: 110 },
  { key: 'item', title: 'Item', width: 220 },
  { key: 'qty', title: 'Qty', width: 70, align: 'right' },
  { key: 'price', title: 'Unit price', width: 100, align: 'right' },
  { key: 'notes', title: 'Notes', width: 220 },
];

const INITIAL_ROWS: string[][] = [
  ['WH-1908', 'Forged wheel 19×8.5', '12', '410.00', 'Gloss black'],
  ['WH-2010', 'Forged wheel 20×10', '8', '465.00', 'Brushed titanium'],
  ['CT-0042', 'Center cap, carbon', '40', '18.50', ''],
  ['LB-1144', 'Lug bolt set M14', '20', '32.00', 'Includes locks'],
  ['VS-0007', 'Valve stem, alloy', '64', '4.25', ''],
  ['BX-0900', 'Shipping crate', '6', '55.00', 'Reusable'],
];

function rowTotal(row: string[]): number {
  const qty = parseFloat(row[2]);
  const price = parseFloat(row[3]);
  return Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0;
}

export default function GridDemo() {
  const [rows, setRows] = useState<string[][]>(INITIAL_ROWS);

  const filled = rows.filter(r => r.some(c => c && c.trim() !== ''));
  const total = rows.reduce((sum, r) => sum + rowTotal(r), 0);

  return (
    <div className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">EditableGrid</h2>
        <p className="mt-1 text-sm text-gray-500 max-w-2xl">
          Spreadsheet-style editing without the spreadsheet: range selection,
          copy/paste that round-trips with Excel and Google Sheets
          (tab-delimited), a fill handle, column &amp; row resize and
          drag-reorder, and Tab / Enter / arrow-key navigation. Edits stream
          out through <code className="text-xs bg-gray-100 rounded px-1 py-0.5">onChange</code> —
          the totals below recompute live.
        </p>
      </div>

      <EditableGrid
        columns={COLUMNS}
        data={rows}
        onChange={setRows}
        minRows={10}
        maxHeight="380px"
      />

      <div className="mt-3 flex items-center gap-6 text-sm text-gray-600">
        <span>
          <span className="font-medium text-gray-900">{filled.length}</span> line
          {filled.length === 1 ? '' : 's'}
        </span>
        <span>
          Order total:{' '}
          <span className="font-semibold text-gray-900 tabular-nums">
            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </span>
        <span className="text-xs text-gray-400">
          Tip: select Qty + Unit price cells and drag the fill handle.
        </span>
      </div>
    </div>
  );
}
