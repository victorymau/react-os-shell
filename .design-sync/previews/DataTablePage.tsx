import { DataTablePage } from 'react-os-shell';

// DataTablePage — list screen: toolbar (search + filter) + data table with
// status pills + Pagination. Uses static markup (not the react-query tables).

export function Members() {
  return (
    <div style={{ height: 620 }}>
      <DataTablePage />
    </div>
  );
}
