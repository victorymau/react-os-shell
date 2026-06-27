import { PageHeader, Button } from 'react-os-shell';

// PageHeader — page/section title with an optional muted description and a
// right-aligned actions slot. Accepts both the description/actions and the
// subtitle/children prop shapes.

export function WithActions() {
  return (
    <div className="p-5">
      <PageHeader
        title="Sales Orders"
        description="Open and recently shipped orders across all warehouses."
        actions={<><Button variant="secondary">Export</Button><Button variant="primary">New order</Button></>}
      />
    </div>
  );
}

export function TitleOnly() {
  return (
    <div className="p-5">
      <PageHeader title="Dashboard" description="Overview of your store this month." />
    </div>
  );
}
