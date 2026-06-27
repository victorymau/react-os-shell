import { BulkImportGrid } from 'react-os-shell';
import type { BulkColumn } from 'react-os-shell';

// BulkImportGrid — paste-or-upload bulk entry with column mapping, duplicate
// review, and optional sum-merge. The first column is the key; `kind` drives
// CSV auto-detection and price/qty totals. Presentational — rows come back via
// onImport.

const COLUMNS: BulkColumn[] = [
  { key: 'part_number', title: 'Part Number', required: true, kind: 'key' },
  { key: 'description', title: 'Description', kind: 'text' },
  { key: 'qty', title: 'Qty', kind: 'qty' },
  { key: 'unit_price', title: 'Unit Price', kind: 'price' },
];

export function Import() {
  return (
    <div style={{ height: 520 }}>
      <BulkImportGrid
        columns={COLUMNS}
        description="Paste rows from a spreadsheet, or upload a CSV — columns are matched automatically."
        onImport={async () => {}}
        onCancel={() => {}}
      />
    </div>
  );
}
