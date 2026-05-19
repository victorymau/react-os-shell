// Shared types for the list/grid primitives. Mirrors the shape that Django
// REST Framework's PageNumberPagination returns.

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ColumnDef {
  key: string;
  label: string;
  defaultWidth?: number;
  minWidth?: number;
  defaultHidden?: boolean;
  /** Optional rich header node (e.g. icon-only column). Falls back to label. */
  headerNode?: React.ReactNode;
  /** Optional override for the field used to sort against. */
  sortField?: string;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}
