import { EditableGrid, type GridColumn } from 'react-os-shell';

// EditableGrid is the spreadsheet-style grid: sticky header, per-column align,
// range selection, fill handle, and Excel-compatible copy/paste. Data is a
// string[][]; edits stream out via onChange (a no-op in these static cells).

const COLUMNS: GridColumn[] = [
  { key: 'sku', title: 'SKU', width: 110 },
  { key: 'item', title: 'Item', width: 220 },
  { key: 'qty', title: 'Qty', width: 70, align: 'right' },
  { key: 'price', title: 'Unit price', width: 100, align: 'right' },
  { key: 'notes', title: 'Notes', width: 220 },
];

const ROWS: string[][] = [
  ['WH-1908', 'Forged wheel 19×8.5', '12', '410.00', 'Gloss black'],
  ['WH-2010', 'Forged wheel 20×10', '8', '465.00', 'Brushed titanium'],
  ['CT-0042', 'Center cap, carbon', '40', '18.50', ''],
  ['LB-1144', 'Lug bolt set M14', '20', '32.00', 'Includes locks'],
  ['VS-0007', 'Valve stem, alloy', '64', '4.25', ''],
  ['BX-0900', 'Shipping crate', '6', '55.00', 'Reusable'],
];

export function OrderLines() {
  return (
    <div className="p-5">
      <EditableGrid columns={COLUMNS} data={ROWS} onChange={() => {}} minRows={10} maxHeight="380px" />
    </div>
  );
}

export function Compact() {
  const cols: GridColumn[] = [
    { key: 'metric', title: 'Metric', width: 180 },
    { key: 'q1', title: 'Q1', width: 90, align: 'right' },
    { key: 'q2', title: 'Q2', width: 90, align: 'right' },
    { key: 'q3', title: 'Q3', width: 90, align: 'right' },
  ];
  const data: string[][] = [
    ['Revenue', '1,204', '1,388', '1,512'],
    ['Active users', '8,420', '9,110', '9,805'],
    ['Churn %', '2.1', '1.8', '1.6'],
  ];
  return (
    <div className="p-5">
      <EditableGrid columns={cols} data={data} onChange={() => {}} fixedRows minRows={3} maxHeight="220px" />
    </div>
  );
}
