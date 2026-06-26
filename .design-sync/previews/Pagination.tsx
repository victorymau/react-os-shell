import { useState } from 'react';
import { Pagination } from 'react-os-shell';

// Pagination — numbered page control with prev/next, ellipsis gaps, and
// optional first/last edges. Controlled via page + onPageChange.

export function Middle() {
  const [page, setPage] = useState(5);
  return (
    <div className="p-5">
      <Pagination page={page} pageCount={12} onPageChange={setPage} showEdges />
    </div>
  );
}

export function Short() {
  const [page, setPage] = useState(2);
  return (
    <div className="p-5">
      <Pagination page={page} pageCount={4} onPageChange={setPage} />
    </div>
  );
}
