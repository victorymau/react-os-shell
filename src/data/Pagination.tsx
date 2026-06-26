/**
 * Pagination — a numbered page control for classic paginated tables/lists, with
 * prev/next and optional first/last edges and ellipsis gaps. Controlled: the
 * consumer owns `page` and updates it in `onPageChange`. Complements ListFooter
 * (which shows counts/selection for infinite-scroll lists).
 */

export interface PaginationProps {
  /** Current page, 1-based. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** How many page numbers to show on each side of the current page. */
  siblingCount?: number;
  /** Show first/last («/») buttons. */
  showEdges?: boolean;
  className?: string;
}

function buildPages(page: number, pageCount: number, sibling: number): (number | '…')[] {
  const wanted = new Set<number>([1, pageCount]);
  for (let i = page - sibling; i <= page + sibling; i++) {
    if (i >= 1 && i <= pageCount) wanted.add(i);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

const BTN =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

export default function Pagination({
  page, pageCount, onPageChange, siblingCount = 1, showEdges = false, className = '',
}: PaginationProps) {
  if (pageCount <= 1) return null;
  const pages = buildPages(page, pageCount, siblingCount);
  const go = (p: number) => { if (p >= 1 && p <= pageCount && p !== page) onPageChange(p); };

  return (
    <nav aria-label="Pagination" className={`flex items-center gap-1 ${className}`.trim()}>
      {showEdges && (
        <button type="button" aria-label="First page" disabled={page === 1} onClick={() => go(1)} className={`${BTN} text-gray-600 hover:bg-gray-100`}>«</button>
      )}
      <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => go(page - 1)} className={`${BTN} text-gray-600 hover:bg-gray-100`}>‹</button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-gray-400">…</span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? 'page' : undefined}
            onClick={() => go(p)}
            className={`${BTN} ${p === page ? 'bg-blue-600 font-medium text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            {p}
          </button>
        )
      )}
      <button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => go(page + 1)} className={`${BTN} text-gray-600 hover:bg-gray-100`}>›</button>
      {showEdges && (
        <button type="button" aria-label="Last page" disabled={page === pageCount} onClick={() => go(pageCount)} className={`${BTN} text-gray-600 hover:bg-gray-100`}>»</button>
      )}
    </nav>
  );
}
