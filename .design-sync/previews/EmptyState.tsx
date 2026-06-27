import { EmptyState, Button } from 'react-os-shell';

// EmptyState — placeholder for empty lists/panes. One component, configurable
// frame (dashed | card | none) and an optional action slot.

export function Dashed() {
  return (
    <div className="p-5">
      <EmptyState message="No invoices match these filters." hint="Try clearing the date range." />
    </div>
  );
}

export function Card() {
  return (
    <div className="p-5">
      <EmptyState variant="card" title="No sales orders yet" description="Create your first order to see it here." />
    </div>
  );
}

export function WithAction() {
  return (
    <div className="p-5">
      <EmptyState title="No warehouses" message="You haven't added any warehouses.">
        <Button variant="primary">Add warehouse</Button>
      </EmptyState>
    </div>
  );
}
