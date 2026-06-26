/**
 * DashboardTemplate — an analytics dashboard starter: a stat-card row, a
 * revenue bar chart + traffic donut, and a recent-orders table. Composed
 * entirely from the kit's primitives so a design agent can adapt it. Static
 * data; wire real data in a consuming app.
 */
import StatusBadge, { StatusBadgeProvider } from '../shell/StatusBadge';
import type { SemanticGroup } from '../shell/StatusBadge';
import Card, { StatCard } from '../shell/Card';
import Avatar from '../shell/Avatar';
import Button from '../forms/Button';
import Sparkline from '../charts/Sparkline';
import BarChart from '../charts/BarChart';
import DonutChart from '../charts/DonutChart';

const STATUS_GROUPS: Record<string, SemanticGroup> = {
  paid: 'success', shipped: 'active', processing: 'queued', refunded: 'neutral', overdue: 'danger',
};

const REVENUE = [12, 18, 14, 22, 19, 27, 24, 31, 28, 35, 30, 38];
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const ORDERS = [
  { id: '#3201', customer: 'Alice Nguyen', total: '$1,204', status: 'paid' },
  { id: '#3202', customer: 'Marco Reyes', total: '$642', status: 'shipped' },
  { id: '#3203', customer: 'Priya Patel', total: '$2,980', status: 'processing' },
  { id: '#3204', customer: 'Tom Becker', total: '$318', status: 'overdue' },
  { id: '#3205', customer: 'Sara Lind', total: '$540', status: 'refunded' },
];

export default function DashboardTemplate() {
  return (
    <StatusBadgeProvider groups={STATUS_GROUPS}>
      <div className="h-full overflow-auto bg-gray-50 p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500">Overview of your store this month</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm">Export</Button>
              <Button size="sm">New report</Button>
            </div>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Revenue" value="$38.2k" delta={{ value: '12%', direction: 'up' }} />
            <StatCard label="Orders" value="1,204" delta={{ value: '4%', direction: 'up' }} />
            <StatCard label="Customers" value="892" delta={{ value: '2%', direction: 'down' }} />
            <StatCard label="Refunds" value="$1.1k" delta={{ value: '0%', direction: 'flat' }} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card header="Revenue" className="lg:col-span-2">
              <div className="text-blue-600">
                <BarChart data={REVENUE} labels={MONTHS} height={160} />
              </div>
            </Card>
            <Card header="Traffic sources">
              <div className="flex items-center gap-4">
                <DonutChart
                  size={120}
                  segments={[
                    { label: 'Direct', value: 45 },
                    { label: 'Search', value: 30 },
                    { label: 'Social', value: 15 },
                    { label: 'Email', value: 10 },
                  ]}
                  centerLabel={<span className="text-gray-900">100%</span>}
                />
                <ul className="space-y-1.5 text-sm text-gray-600">
                  <li className="flex items-center gap-2"><Dot c="#3b82f6" />Direct · 45%</li>
                  <li className="flex items-center gap-2"><Dot c="#22c55e" />Search · 30%</li>
                  <li className="flex items-center gap-2"><Dot c="#f59e0b" />Social · 15%</li>
                  <li className="flex items-center gap-2"><Dot c="#ef4444" />Email · 10%</li>
                </ul>
              </div>
            </Card>
          </div>

          {/* Recent orders */}
          <Card header="Recent orders" padded={false}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ORDERS.map(o => (
                  <tr key={o.id} className="text-gray-700">
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{o.id}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <Avatar size="xs" name={o.customer} />
                        {o.customer}
                      </span>
                    </td>
                    <td className="px-4 py-2">{o.total}</td>
                    <td className="px-4 py-2"><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <p className="flex items-center gap-2 text-xs text-gray-400">
            <span className="text-emerald-600"><Sparkline data={REVENUE} width={80} height={20} /></span>
            Trending up 12% vs last month
          </p>
        </div>
      </div>
    </StatusBadgeProvider>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />;
}
