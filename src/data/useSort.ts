import { useState } from 'react';
import type { SortState } from './types';

/**
 * Tiny sort-state hook used by list pages. Returns:
 * - `sort` — current `{ field, direction }`
 * - `onSort(field)` — toggle direction if same field, else activate asc
 * - `ordering` — DRF-style string (`'-mid'` for desc, `'mid'` for asc) ready
 *    to drop into a query-string param.
 */
export function useSort(defaultField: string, defaultDir: 'asc' | 'desc' = 'asc') {
  const [sort, setSort] = useState<SortState>({ field: defaultField, direction: defaultDir });

  const onSort = (field: string) => {
    setSort(prev =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );
  };

  const ordering = sort.direction === 'desc' ? `-${sort.field}` : sort.field;

  return { sort, onSort, ordering };
}
