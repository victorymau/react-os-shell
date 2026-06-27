/**
 * Pure helpers for reconciling a bulk-import grid (rows of string cells) against
 * an existing items array, keyed by a designated "key column" (e.g. a part
 * number, SKU, or code). No app/framework dependencies — usable by any consumer
 * of {@link BulkImportGrid}.
 *
 * Merge rule: a blank cell means "don't touch the original" — only an explicit
 * value (including "0") replaces what's already there. Existing rows the user
 * didn't mention in the bulk grid are left untouched. Unknown keys are appended
 * via the caller-supplied `newItem` factory.
 */

export type BulkRow = Record<string, string | undefined>;

export interface DuplicateGroup {
  /** Key value as it appeared in the first occurrence (trimmed, original casing). */
  key: string;
  /** Indices into the rows array where this key appears. Length is always >= 2. */
  rowIndices: number[];
}

/**
 * Find key values that appear more than once within a single bulk-import file.
 * Match is case-insensitive (consistent with {@link mergeBulkItems}). Blank key
 * cells are ignored. The caller is expected to surface these to the user before
 * merge so they can pick a per-group resolution.
 */
export function findDuplicateKeys(rows: BulkRow[], keyRowKey: string): DuplicateGroup[] {
  const groups = new Map<string, { key: string; rowIndices: number[] }>();
  rows.forEach((r, i) => {
    const raw = r[keyRowKey];
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) return;
    const dedupeKey = trimmed.toUpperCase();
    const existing = groups.get(dedupeKey);
    if (existing) existing.rowIndices.push(i);
    else groups.set(dedupeKey, { key: trimmed, rowIndices: [i] });
  });
  const out: DuplicateGroup[] = [];
  for (const g of groups.values()) {
    if (g.rowIndices.length >= 2) out.push(g);
  }
  return out;
}

interface BaseItem {
  [key: string]: unknown;
}

export interface MergeBulkResult<T> {
  merged: T[];
  importedCount: number;
}

export interface MergeBulkOptions<T extends BaseItem> {
  /** Raw rows from BulkImportGrid. */
  rows: BulkRow[];
  /** Existing items array to merge into. */
  existing: T[];
  /**
   * Mapping from row column key → item field key.
   * MUST include the key-column mapping (e.g. `{ pn: 'part_number' }`).
   * Example: `{ pn: 'part_number', qty: 'quantity', price: 'unit_price' }`.
   */
  fieldMap: Record<string, string>;
  /**
   * The item field that holds the merge key — the value `fieldMap` maps the
   * grid's key column onto. Existing items are matched against this field
   * (case-insensitive). Defaults to `'part_number'`.
   */
  keyField?: string;
  /**
   * Build a brand-new item for a row whose key isn't in `existing`.
   * `filled` contains only the fields the user actually entered (mapped to
   * item-field keys via `fieldMap`); supply defaults for anything required
   * by your item shape.
   */
  newItem: (filled: Partial<T>) => T;
}

/** Pull out just the trimmed cells the user actually filled in. */
function pickFilled(row: BulkRow, fieldMap: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rowKey, itemField] of Object.entries(fieldMap)) {
    const v = row[rowKey];
    const trimmed = typeof v === 'string' ? v.trim() : '';
    if (trimmed !== '') out[itemField] = trimmed;
  }
  return out;
}

export function mergeBulkItems<T extends BaseItem>(
  options: MergeBulkOptions<T>,
): MergeBulkResult<T> {
  const { rows, existing, fieldMap, newItem, keyField = 'part_number' } = options;

  // Locate the row key that holds the merge key, and the matching item field.
  const keyEntry = Object.entries(fieldMap).find(([, v]) => v === keyField);
  if (!keyEntry) {
    throw new Error(`mergeBulkItems: fieldMap must map a row column to "${keyField}"`);
  }
  const keyRowKey = keyEntry[0];

  const validRows = rows.filter(r => (r[keyRowKey] ?? '').trim());
  if (validRows.length === 0) return { merged: existing, importedCount: 0 };

  const existingMap = new Map<string, number>();
  existing.forEach((item, i) => {
    const k = item[keyField];
    if (typeof k === 'string' && k.trim()) existingMap.set(k.toUpperCase(), i);
  });

  const result = [...existing];
  const added: T[] = [];

  for (const r of validRows) {
    const filled = pickFilled(r, fieldMap);
    const k = filled[keyField];
    if (!k) continue;
    const idx = existingMap.get(k.toUpperCase());

    if (idx !== undefined) {
      // Existing key — overwrite only the fields the user actually entered.
      result[idx] = { ...result[idx], ...filled } as T;
    } else {
      // Tag every new item so callers can highlight bulk-imported rows in
      // the UI without each call site repeating the flag in their newItem
      // factory. Form submit payloads always project to explicit fields, so
      // the flag never leaks to the backend.
      added.push({ ...newItem(filled as Partial<T>), _isNew: true } as T);
    }
  }

  return { merged: [...result, ...added], importedCount: validRows.length };
}
