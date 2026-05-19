import type { ReactNode } from 'react';

interface ListFooterProps {
  selectedCount: number;
  loadedCount: number;
  totalCount?: number;
  label: string;
  isFetchingMore?: boolean;
  extra?: ReactNode;
}

/**
 * Standardized footer for `EntityList`. Shows:
 *   "[X selected — ] Y records"
 *   "Y of Z records · Loading more..."
 *   "All N records loaded"
 */
export default function ListFooter({
  selectedCount,
  loadedCount,
  totalCount,
  label,
  isFetchingMore,
  extra,
}: ListFooterProps) {
  const total = totalCount ?? loadedCount;
  const allLoaded = loadedCount >= total;

  return (
    <>
      {extra}
      {selectedCount > 0 ? `${selectedCount} selected — ` : ''}
      {allLoaded
        ? (totalCount != null ? `All ${total.toLocaleString()} ${label} loaded` : `${total.toLocaleString()} ${label}`)
        : `${loadedCount.toLocaleString()} of ${total.toLocaleString()} ${label}`
      }
      {isFetchingMore ? ' · Loading more...' : ''}
    </>
  );
}
