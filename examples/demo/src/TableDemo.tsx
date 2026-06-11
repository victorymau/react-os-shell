import { useMemo, useState } from 'react';
import { ResizableTable, ListFooter, StatusBadge, type ColumnDef, type SortState } from 'react-os-shell';

/**
 * Demo for <ResizableTable> — the raw table primitive underneath EntityList:
 * sticky header, drag-to-reorder columns (blue drop indicator), edge-drag
 * resizing, and a glass column-picker (the ⚙ at the right end of the header)
 * with per-user persistence when an api client is wired. The footer is the
 * shell's <ListFooter>, fed by the row selection.
 */

const COLUMNS: ColumnDef[] = [
  { key: '_select', label: '', defaultWidth: 36, minWidth: 36 },
  { key: 'sku', label: 'SKU', defaultWidth: 110, sortField: 'sku' },
  { key: 'item', label: 'Item', defaultWidth: 240, sortField: 'item' },
  { key: 'status', label: 'Status', defaultWidth: 130, sortField: 'status' },
  { key: 'stock', label: 'Stock', defaultWidth: 90, sortField: 'stock' },
  { key: 'updated', label: 'Updated', defaultWidth: 120, sortField: 'updated', defaultHidden: true },
];

interface Row { sku: string; item: string; status: string; stock: number; updated: string }
const ROWS: Row[] = [
  { sku: 'WH-1908', item: 'Forged wheel 19×8.5', status: 'in_production', stock: 64, updated: '2026-06-09' },
  { sku: 'WH-2010', item: 'Forged wheel 20×10', status: 'approved', stock: 12, updated: '2026-06-10' },
  { sku: 'CT-0042', item: 'Center cap, carbon', status: 'paid', stock: 340, updated: '2026-06-08' },
  { sku: 'LB-1144', item: 'Lug bolt set M14', status: 'pending', stock: 96, updated: '2026-06-05' },
  { sku: 'VS-0007', item: 'Valve stem, alloy', status: 'delivered', stock: 1280, updated: '2026-06-02' },
  { sku: 'BX-0900', item: 'Shipping crate', status: 'overdue', stock: 8, updated: '2026-05-28' },
  { sku: 'TL-0311', item: 'Torque wrench 110Nm', status: 'draft', stock: 22, updated: '2026-06-01' },
];

export default function TableDemo() {
  const [sort, setSort] = useState<SortState>({ field: 'sku', direction: 'asc' });
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...ROWS].sort((a, b) => {
      const av = (a as any)[sort.field], bv = (b as any)[sort.field];
      return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))) * dir;
    });
  }, [sort]);

  const toggle = (sku: string) =>
    setChecked(prev => { const n = new Set(prev); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-3 shrink-0">
        <h2 className="text-base font-semibold text-gray-900">ResizableTable + ListFooter</h2>
        <p className="mt-1 text-sm text-gray-500 max-w-2xl">
          The primitive under every list view: drag a header to reorder
          columns, drag its right edge to resize, click to sort, and open the
          column picker at the far right of the header row — an <span className="font-medium">Updated</span>{' '}
          column is hidden in there. Tick rows and watch the{' '}
          <code className="text-xs bg-gray-100 rounded px-1 py-0.5">&lt;ListFooter&gt;</code> below.
        </p>
      </div>
      <div className="flex-1 min-h-0 px-4 pb-4">
        <ResizableTable
          tableId="demo.parts"
          columns={COLUMNS}
          sort={sort}
          onSort={(field) => setSort(s => ({ field, direction: s.field === field && s.direction === 'asc' ? 'desc' : 'asc' }))}
          saveDefaultPerms={[]}
          footer={<ListFooter selectedCount={checked.size} loadedCount={rows.length} totalCount={ROWS.length} label="parts" />}
        >
          {(cols) => (
            <tbody>
              {rows.map(row => (
                <tr key={row.sku} className={`border-b border-gray-100 ${checked.has(row.sku) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  {cols.map(col => {
                    switch (col.key) {
                      case '_select':
                        return (
                          <td key={col.key} className="px-2 py-1.5 text-center">
                            <input type="checkbox" checked={checked.has(row.sku)} onChange={() => toggle(row.sku)} />
                          </td>
                        );
                      case 'status':
                        return <td key={col.key} className="px-2 py-1.5"><StatusBadge status={row.status} /></td>;
                      case 'stock':
                        return <td key={col.key} className="px-2 py-1.5 text-right tabular-nums">{row.stock.toLocaleString()}</td>;
                      default:
                        return <td key={col.key} className="px-2 py-1.5 truncate">{(row as any)[col.key]}</td>;
                    }
                  })}
                </tr>
              ))}
            </tbody>
          )}
        </ResizableTable>
      </div>
    </div>
  );
}
