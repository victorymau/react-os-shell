import { useState, useRef, useCallback } from 'react';
import EditableGrid from './EditableGrid';
import type { GridColumn } from './EditableGrid';
import { CancelButton } from './Modal';
import { findDuplicateKeys } from '../utils/mergeBulkItems';
import type { DuplicateGroup } from '../utils/mergeBulkItems';

/**
 * Semantic role of a column, used to auto-map CSV columns to fields and to
 * format the per-column totals. The first column is always the merge "key"
 * regardless of its declared kind.
 * - `key`   — the identifier rows are de-duplicated/merged on (text-like).
 * - `price` — a money column (matched by `$`/decimals; totalled with 2 dp).
 * - `qty`   — a whole-number quantity column.
 * - `text`  — anything else; never auto-mapped, never totalled.
 */
export type BulkColumnKind = 'key' | 'price' | 'qty' | 'text';

export interface BulkColumn {
  key: string;
  title: string;
  width?: number;
  required?: boolean;
  /**
   * Hint for CSV auto-mapping and totals. Defaults: the first column is `key`,
   * every other column is `text`. Set `price`/`qty` to opt a column into
   * auto-detection and the totals strip.
   */
  kind?: BulkColumnKind;
}

export interface BulkImportGridProps {
  /** Column definitions. The FIRST column is always the merge key. */
  columns: BulkColumn[];
  /** Called with the resolved, de-duplicated rows (one object per row, keyed by column key). */
  onImport: (rows: Record<string, string>[]) => Promise<void>;
  /** Called when the user cancels an in-progress mapping/duplicate review. */
  onCancel: () => void;
  /** Optional override for the help text shown above the grid. */
  description?: string;
  /**
   * When set, duplicate key values are merged into a single row with their
   * numeric columns summed, instead of offering keep-first / keep-last / skip.
   * Use for quantity-based imports where two rows of the same key mean "both" —
   * never for price imports, where summing prices would be nonsensical.
   */
  mergeDuplicates?: boolean;
}

function cleanNumber(s: string): string {
  if (!s) return '';
  return s.replace(/[$¥￥€£,\s]/g, '');
}

function parseCSVLine(line: string): string[] {
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
}

/** Resolve a column's effective kind: first column is the key, else its declared kind or `text`. */
function colKind(col: BulkColumn, index: number): BulkColumnKind {
  if (index === 0) return 'key';
  return col.kind ?? 'text';
}

// ── Column type detection ──

type DetectedType = 'skip' | 'key' | 'price' | 'qty';

function detectColumnType(values: string[]): DetectedType {
  const nonEmpty = values.filter(v => v.trim());
  if (nonEmpty.length === 0) return 'skip';

  const allIntOrEmpty = values.every(v => !v.trim() || /^\d+$/.test(v.trim()));
  if (allIntOrEmpty) {
    const nums = nonEmpty.map(v => parseInt(v));
    const isSequential = nums.length > 2 && nums.every((n, i) => i === 0 || n >= nums[i - 1]);
    if (isSequential) return 'skip';
  }

  const hasLetters = nonEmpty.some(v => /[a-zA-Z]/.test(v));
  const hasDollar = nonEmpty.some(v => /\$/.test(v));
  const hasDecimals = nonEmpty.filter(v => /\.\d{2}$/.test(cleanNumber(v))).length > nonEmpty.length * 0.5;
  const allWholeNumbers = nonEmpty.every(v => /^\d+$/.test(cleanNumber(v)));

  if (hasLetters && !hasDollar) return 'key';
  if (hasDollar) return 'price';
  if (hasDecimals) return 'price';
  if (allWholeNumbers) {
    const avg = nonEmpty.reduce((s, v) => s + parseInt(cleanNumber(v)), 0) / nonEmpty.length;
    if (avg > 10) return 'qty';
    return 'skip';
  }
  return 'key';
}

function autoMapColumns(csvData: string[][], targetColumns: BulkColumn[]): number[] | null {
  if (csvData.length === 0 || csvData[0].length === 0) return null;
  const csvColCount = csvData[0].length;
  const targetKinds = targetColumns.map((c, i) => colKind(c, i));

  const csvColTypes: DetectedType[] = [];
  for (let c = 0; c < csvColCount; c++) {
    const values = csvData.map(row => row[c] || '');
    csvColTypes.push(detectColumnType(values));
  }

  const mapping: number[] = new Array(targetColumns.length).fill(-1);
  const used = new Set<number>();

  for (let t = 0; t < targetColumns.length; t++) {
    const kind = targetKinds[t];
    if (kind === 'text') continue;
    for (let c = 0; c < csvColCount; c++) {
      if (used.has(c)) continue;
      if (csvColTypes[c] === kind) {
        mapping[t] = c;
        used.add(c);
        break;
      }
    }
  }

  // Spread any remaining detected price columns across still-unmapped price targets,
  // in order (handles e.g. two currency columns the per-kind pass couldn't disambiguate).
  const priceTargets = targetKinds.map((k, i) => ({ i, k })).filter(x => x.k === 'price');
  const priceCsvCols = csvColTypes.map((t, i) => ({ i, type: t })).filter(x => x.type === 'price' && !used.has(x.i));
  let pi = 0;
  for (const pt of priceTargets) {
    if (mapping[pt.i] === -1 && pi < priceCsvCols.length) {
      mapping[pt.i] = priceCsvCols[pi].i;
      used.add(priceCsvCols[pi].i);
      pi++;
    }
  }

  if (mapping[0] === -1) return null; // key column must map
  return mapping;
}

// ── Column mapping UI ──

function ColumnMapper({ csvPreview, targetColumns, onConfirm, onCancel }: {
  csvPreview: string[][];
  targetColumns: BulkColumn[];
  onConfirm: (mapping: number[]) => void;
  onCancel: () => void;
}) {
  const autoMapping = autoMapColumns(csvPreview, targetColumns);
  const [mapping, setMapping] = useState<number[]>(autoMapping || new Array(targetColumns.length).fill(-1));
  const csvColCount = csvPreview[0]?.length || 0;

  const keyMapped = mapping[0] >= 0;

  return (
    <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 mb-3">
      <p className="text-sm font-medium text-gray-800 mb-3">Map CSV columns to fields</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
        {targetColumns.map((col, ti) => (
          <div key={col.key} className="flex items-center gap-2">
            <span className="text-sm text-gray-700 w-28 shrink-0">{col.title}</span>
            <select value={mapping[ti]} onChange={e => setMapping(prev => { const next = [...prev]; next[ti] = parseInt(e.target.value); return next; })}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500">
              <option value={-1}>— Skip —</option>
              {Array.from({ length: csvColCount }, (_, ci) => (
                <option key={ci} value={ci}>Column {ci + 1} (e.g. {csvPreview[0]?.[ci] || ''})</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="border border-gray-200 rounded overflow-hidden mb-3">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              {targetColumns.map(col => (
                <th key={col.key} className="px-2 py-1 text-left text-gray-500 font-medium">{col.title}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {csvPreview.slice(0, 3).map((row, ri) => (
              <tr key={ri}>
                {targetColumns.map((col, ti) => (
                  <td key={col.key} className="px-2 py-1 text-gray-700 font-mono">
                    {mapping[ti] >= 0 ? (row[mapping[ti]] || '') : <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{csvPreview.length} rows detected</span>
        <div className="flex gap-2">
          <CancelButton onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</CancelButton>
          <button type="button" onClick={() => onConfirm(mapping)} disabled={!keyMapped}
            className="bg-blue-600 text-white px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            Confirm Mapping
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Duplicate-key review UI ──

type DupResolution = 'first' | 'last' | 'skip';

function DuplicateReview({
  rows,
  groups,
  columns,
  resolutions,
  onResolutionChange,
  onConfirm,
  onCancel,
}: {
  rows: Record<string, string>[];
  groups: DuplicateGroup[];
  columns: BulkColumn[];
  resolutions: Record<string, DupResolution>;
  onResolutionChange: (dupKey: string, choice: DupResolution) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const totalKept = groups.reduce((acc, g) => {
    const r = resolutions[g.key.toUpperCase()];
    if (r === 'skip') return acc;
    return acc + 1; // first/last always collapse to a single row
  }, 0);
  const totalDropped = groups.reduce((acc, g) => {
    const r = resolutions[g.key.toUpperCase()];
    if (r === 'skip') return acc + g.rowIndices.length;
    return acc + (g.rowIndices.length - 1);
  }, 0);

  return (
    <div className="border border-amber-200 rounded-lg bg-amber-50 p-4 mb-3">
      <p className="text-sm font-medium text-gray-800 mb-1">Duplicate entries detected</p>
      <p className="text-xs text-gray-600 mb-3">
        {groups.length} {groups.length === 1 ? 'value appears' : 'values appear'} more than once in your import.
        Choose how to handle each before proceeding.
      </p>
      <div className="space-y-3 mb-3 max-h-80 overflow-y-auto">
        {groups.map(g => {
          const dupKey = g.key.toUpperCase();
          const choice = resolutions[dupKey] || 'first';
          return (
            <div key={dupKey} className="border border-amber-200 rounded bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono font-medium text-gray-800">{g.key}</span>
                <span className="text-xs text-gray-500">{g.rowIndices.length} occurrences</span>
              </div>
              <div className="border border-gray-200 rounded overflow-hidden mb-2">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      {columns.map(col => (
                        <th key={col.key} className="px-2 py-1 text-left text-gray-500 font-medium">
                          {col.title.replace(' *', '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.rowIndices.map((ri, occ) => (
                      <tr key={ri} className={
                        choice === 'skip' ? 'opacity-40' :
                        (choice === 'first' && occ !== 0) || (choice === 'last' && occ !== g.rowIndices.length - 1)
                          ? 'opacity-40 line-through' : ''
                      }>
                        {columns.map(col => (
                          <td key={col.key} className="px-2 py-1 text-gray-700 font-mono">
                            {rows[ri]?.[col.key] || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {(['first', 'last', 'skip'] as DupResolution[]).map(opt => (
                  <label key={opt} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name={`dup-${dupKey}`}
                      value={opt}
                      checked={choice === opt}
                      onChange={() => onResolutionChange(dupKey, opt)}
                      className="h-3 w-3 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-gray-700">
                      {opt === 'first' ? 'Keep first' : opt === 'last' ? 'Keep last' : 'Skip all'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">
          {totalKept} kept · {totalDropped} dropped
        </span>
        <div className="flex gap-2">
          <CancelButton onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</CancelButton>
          <button type="button" onClick={onConfirm}
            className="bg-blue-600 text-white px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-blue-700">
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Duplicate-key merge UI (mergeDuplicates mode) ──

/**
 * Collapse each duplicate group into one row, summing numeric columns. The
 * merged row takes the slot of the group's first occurrence so import order is
 * preserved; later occurrences are dropped. Non-numeric / all-blank columns
 * collapse to blank (downstream merge treats blank as "don't touch").
 */
function mergeDuplicateRows(
  rows: Record<string, string>[],
  groups: DuplicateGroup[],
  columns: BulkColumn[],
): Record<string, string>[] {
  const keyCol = columns[0].key;
  const firstOf = new Map<number, DuplicateGroup>();
  const dropped = new Set<number>();
  for (const g of groups) {
    firstOf.set(g.rowIndices[0], g);
    g.rowIndices.slice(1).forEach(i => dropped.add(i));
  }
  const out: Record<string, string>[] = [];
  rows.forEach((row, i) => {
    const g = firstOf.get(i);
    if (g) {
      const merged: Record<string, string> = {};
      for (const col of columns) {
        if (col.key === keyCol) { merged[col.key] = g.key; continue; }
        const nums = g.rowIndices
          .map(ri => (rows[ri]?.[col.key] ?? '').trim())
          .filter(v => v !== '' && Number.isFinite(Number(v)))
          .map(Number);
        merged[col.key] = nums.length > 0 ? String(nums.reduce((s, n) => s + n, 0)) : '';
      }
      out.push(merged);
    } else if (!dropped.has(i)) {
      out.push(row);
    }
  });
  return out;
}

function MergeReview({
  rows,
  groups,
  columns,
  onConfirm,
  onCancel,
}: {
  rows: Record<string, string>[];
  groups: DuplicateGroup[];
  columns: BulkColumn[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const keyCol = columns[0].key;
  const dupRowCount = groups.reduce((acc, g) => acc + g.rowIndices.length, 0);

  return (
    <div className="border border-amber-200 rounded-lg bg-amber-50 p-4 mb-3">
      <p className="text-sm font-medium text-gray-800 mb-1">Duplicate entries detected</p>
      <p className="text-xs text-gray-600 mb-3">
        {groups.length} {groups.length === 1 ? 'value appeared' : 'values appeared'} more than once.
        Each is merged into a single line with its quantity summed — review before proceeding.
      </p>
      <div className="border border-gray-200 rounded overflow-hidden mb-3 bg-white max-h-80 overflow-y-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-2 py-1 text-left text-gray-500 font-medium">
                  {col.title.replace(' *', '')}
                </th>
              ))}
              <th className="px-2 py-1 text-right text-gray-500 font-medium">Merged from</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {groups.map(g => (
              <tr key={g.key.toUpperCase()}>
                {columns.map(col => {
                  if (col.key === keyCol) {
                    return (
                      <td key={col.key} className="px-2 py-1 font-mono font-medium text-gray-800">{g.key}</td>
                    );
                  }
                  const nums = g.rowIndices
                    .map(ri => (rows[ri]?.[col.key] ?? '').trim())
                    .filter(v => v !== '' && Number.isFinite(Number(v)))
                    .map(Number);
                  if (nums.length === 0) {
                    return <td key={col.key} className="px-2 py-1 text-gray-300">—</td>;
                  }
                  const sum = nums.reduce((s, n) => s + n, 0);
                  return (
                    <td key={col.key} className="px-2 py-1 font-mono text-gray-700">
                      {nums.length > 1 && (
                        <span className="text-gray-400">{nums.join(' + ')} = </span>
                      )}
                      <span className="font-semibold text-gray-800">{sum.toLocaleString()}</span>
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right text-gray-500">{g.rowIndices.length} rows</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">
          {dupRowCount} duplicate rows → {groups.length} merged line{groups.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <CancelButton onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</CancelButton>
          <button type="button" onClick={onConfirm}
            className="bg-blue-600 text-white px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-blue-700">
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──

/**
 * Spreadsheet-style bulk entry surface: type, paste, or upload a CSV/TSV, with
 * automatic column auto-mapping (with a manual mapping fallback) and duplicate
 * de-duplication (keep-first/last/skip, or summed merge in `mergeDuplicates`
 * mode). Purely presentational — owns local grid/CSV state and reports the
 * resolved rows via `onImport`; it does no fetching, auth, or persistence.
 *
 * Rows are de-duplicated and merged on the FIRST column (the "key"). Declare a
 * column's `kind` (`price`/`qty`) to opt it into CSV auto-detection and the
 * totals strip.
 */
export default function BulkImportGrid({ columns, onImport, description, mergeDuplicates = false }: BulkImportGridProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [gridData, setGridData] = useState<string[][]>(() =>
    Array.from({ length: 15 }, () => Array(columns.length).fill(''))
  );
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [pendingCSV, setPendingCSV] = useState<string[][] | null>(null);
  const [dupReview, setDupReview] = useState<{
    rows: Record<string, string>[];
    groups: DuplicateGroup[];
    resolutions: Record<string, DupResolution>;
  } | null>(null);
  const [mergeReview, setMergeReview] = useState<{
    rows: Record<string, string>[];
    groups: DuplicateGroup[];
  } | null>(null);

  const colCount = columns.length;
  const requiredLabel = columns[0]?.title?.replace(' *', '') || 'value';

  // Stats
  const filledRows = gridData.filter(row => row[0]?.trim());
  const filledCount = filledRows.length;
  const totals: Record<string, number> = {};
  for (let ci = 1; ci < columns.length; ci++) {
    if (colKind(columns[ci], ci) === 'text') continue;
    let sum = 0;
    for (const row of filledRows) {
      const v = parseFloat(cleanNumber(row[ci] || ''));
      if (!isNaN(v)) sum += v;
    }
    if (sum > 0) totals[columns[ci].key] = sum;
  }

  const gridColumns: GridColumn[] = columns.map(c => ({
    key: c.key,
    title: c.title,
    width: c.width,
  }));

  const loadDataIntoGrid = useCallback((data: string[][]) => {
    const cleaned = data.map(row => {
      const r = [...row];
      while (r.length < colCount) r.push('');
      return r.slice(0, colCount).map((cell, i) => i === 0 ? cell : cleanNumber(cell));
    });
    // Pad to minimum rows
    while (cleaned.length < 15) cleaned.push(Array(colCount).fill(''));
    setGridData(cleaned);
  }, [colCount]);

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || '';
      const parsed = text.split('\n').map(l => l.trim()).filter(Boolean).map(parseCSVLine);
      if (parsed.length === 0) return;

      const mapping = autoMapColumns(parsed, columns);
      if (mapping) {
        const mapped = parsed.map(row => columns.map((_, ti) => mapping[ti] >= 0 ? (row[mapping[ti]] || '') : ''));
        loadDataIntoGrid(mapped);
      } else {
        setPendingCSV(parsed);
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleMappingConfirm = (mapping: number[]) => {
    if (!pendingCSV) return;
    const mapped = pendingCSV.map(row => columns.map((_, ti) => mapping[ti] >= 0 ? (row[mapping[ti]] || '') : ''));
    loadDataIntoGrid(mapped);
    setPendingCSV(null);
  };

  const runImport = async (rows: Record<string, string>[]) => {
    setImporting(true);
    try { await onImport(rows); } catch { setError('Import failed.'); }
    setImporting(false);
  };

  const handleImport = async () => {
    const rows: Record<string, string>[] = gridData
      .filter(row => row[0]?.trim())
      .map(row => {
        const obj: Record<string, string> = {};
        columns.forEach((col, i) => {
          const val = row[i]?.trim() || '';
          obj[col.key] = i === 0 ? val : cleanNumber(val);
        });
        return obj;
      });
    if (rows.length === 0) { setError(`Enter at least one ${requiredLabel.toLowerCase()}.`); return; }
    setError('');

    const keyCol = columns[0].key;
    const groups = findDuplicateKeys(rows, keyCol);
    if (groups.length > 0) {
      if (mergeDuplicates) {
        setMergeReview({ rows, groups });
      } else {
        const resolutions: Record<string, DupResolution> = {};
        for (const g of groups) resolutions[g.key.toUpperCase()] = 'first';
        setDupReview({ rows, groups, resolutions });
      }
      return;
    }
    await runImport(rows);
  };

  const handleMergeConfirm = async () => {
    if (!mergeReview) return;
    const merged = mergeDuplicateRows(mergeReview.rows, mergeReview.groups, columns);
    setMergeReview(null);
    await runImport(merged);
  };

  const handleDupConfirm = async () => {
    if (!dupReview) return;
    const { rows, groups, resolutions } = dupReview;
    const drop = new Set<number>();
    for (const g of groups) {
      const choice = resolutions[g.key.toUpperCase()] || 'first';
      const idx = g.rowIndices;
      if (choice === 'first') {
        for (let i = 1; i < idx.length; i++) drop.add(idx[i]);
      } else if (choice === 'last') {
        for (let i = 0; i < idx.length - 1; i++) drop.add(idx[i]);
      } else {
        for (const j of idx) drop.add(j);
      }
    }
    const filtered = rows.filter((_, i) => !drop.has(i));
    setDupReview(null);
    if (filtered.length === 0) { setError('All rows skipped.'); return; }
    await runImport(filtered);
  };

  const handleClear = () => {
    setGridData(Array.from({ length: 15 }, () => Array(colCount).fill('')));
  };

  const descText = description || `Paste from spreadsheets, type directly, or upload a CSV. Rows don't need to be in order — they'll be matched. Values not in the list will be added to the end. Fields left blank will not be affected.`;

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50 mb-3 overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {descText}
          <span className="text-gray-400 ml-1">({filledCount} lines{Object.keys(totals).length > 0 && ' · '}{Object.entries(totals).map(([k, v]) => {
            const col = columns.find(c => c.key === k);
            const label = col?.title?.replace(' *', '') || k;
            const isPrice = col ? colKind(col, columns.indexOf(col)) === 'price' : false;
            return `${label}: ${isPrice ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString()}`;
          }).join(' · ')})</span>
        </p>
        <div className="flex items-center gap-2">
          {filledCount > 0 && (
            <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600 text-xs">Clear</button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleCSV} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="text-blue-600 border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-blue-50 hover:border-blue-300">Upload CSV</button>
          <button type="button" onClick={handleImport} disabled={importing || filledCount === 0}
            className="text-green-600 border border-green-200 bg-white px-3 py-1.5 text-sm font-medium rounded-lg hover:bg-green-50 hover:border-green-300 disabled:opacity-50">
            {importing ? 'Importing...' : `Import ${filledCount} Lines`}
          </button>
        </div>
      </div>

      {pendingCSV && (
        <div className="px-4 pb-2">
          <ColumnMapper
            csvPreview={pendingCSV}
            targetColumns={columns}
            onConfirm={handleMappingConfirm}
            onCancel={() => setPendingCSV(null)}
          />
        </div>
      )}

      {dupReview && (
        <div className="px-4 pb-2">
          <DuplicateReview
            rows={dupReview.rows}
            groups={dupReview.groups}
            columns={columns}
            resolutions={dupReview.resolutions}
            onResolutionChange={(dupKey, choice) =>
              setDupReview(prev => prev ? { ...prev, resolutions: { ...prev.resolutions, [dupKey]: choice } } : prev)
            }
            onConfirm={handleDupConfirm}
            onCancel={() => setDupReview(null)}
          />
        </div>
      )}

      {mergeReview && (
        <div className="px-4 pb-2">
          <MergeReview
            rows={mergeReview.rows}
            groups={mergeReview.groups}
            columns={columns}
            onConfirm={handleMergeConfirm}
            onCancel={() => setMergeReview(null)}
          />
        </div>
      )}

      <EditableGrid columns={gridColumns} data={gridData} onChange={setGridData} />
      {error && <p className="text-xs text-red-600 px-4 py-1">{error}</p>}
    </div>
  );
}
