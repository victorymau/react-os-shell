import { StatusBadge, StatusBadgeProvider, type SemanticGroup } from 'react-os-shell';

// Status strings → one of nine semantic groups, supplied via
// <StatusBadgeProvider groups>. The same concept reads the same color
// everywhere; unmapped strings fall back to neutral.
const GROUPS: Record<string, SemanticGroup> = {
  paid: 'success', approved: 'success', active: 'success',
  in_production: 'active', in_transit: 'active',
  submitted: 'queued', sent: 'queued',
  delivered: 'info',
  pending: 'pending', at_port: 'pending',
  customs: 'warning', partially_paid: 'warning',
  overdue: 'danger',
  draft: 'draft',
  cancelled: 'neutral', rejected: 'neutral',
};

const ORDER: { group: SemanticGroup; statuses: string[]; meaning: string }[] = [
  { group: 'success', statuses: ['paid', 'approved', 'active'], meaning: 'Finished / confirmed' },
  { group: 'active', statuses: ['in_production', 'in_transit'], meaning: 'Currently moving' },
  { group: 'queued', statuses: ['submitted', 'sent'], meaning: 'Waiting to start' },
  { group: 'info', statuses: ['delivered'], meaning: 'Informational milestone' },
  { group: 'pending', statuses: ['pending', 'at_port'], meaning: 'Waiting / on hold' },
  { group: 'warning', statuses: ['customs', 'partially_paid'], meaning: 'Needs attention' },
  { group: 'danger', statuses: ['overdue'], meaning: 'Action overdue' },
  { group: 'draft', statuses: ['draft'], meaning: 'Not yet submitted' },
  { group: 'neutral', statuses: ['cancelled', 'some_unmapped_status'], meaning: 'Terminal / fallback' },
];

export function SemanticGroups() {
  return (
    <StatusBadgeProvider groups={GROUPS}>
      <div className="p-5">
        <table className="w-full text-sm border-separate border-spacing-y-1">
          <thead className="text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left font-medium px-2 w-24">Group</th>
              <th className="text-left font-medium px-2">Badges</th>
              <th className="text-left font-medium px-2 w-48">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map(({ group, statuses, meaning }) => (
              <tr key={group}>
                <td className="px-2 align-top font-mono text-xs text-gray-500">{group}</td>
                <td className="px-2">
                  <div className="flex flex-wrap gap-1.5">
                    {statuses.map(s => <StatusBadge key={s} status={s} />)}
                  </div>
                </td>
                <td className="px-2 align-top text-xs text-gray-500">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StatusBadgeProvider>
  );
}

export function InRow() {
  return (
    <StatusBadgeProvider groups={GROUPS}>
      <div className="p-5 space-y-2 text-sm text-gray-700">
        {[
          { id: 'INV-1042', status: 'paid' },
          { id: 'INV-1043', status: 'partially_paid' },
          { id: 'INV-1044', status: 'overdue' },
          { id: 'INV-1045', status: 'draft' },
        ].map(row => (
          <div key={row.id} className="flex items-center gap-3">
            <span className="font-mono text-xs text-gray-500 w-20">{row.id}</span>
            <StatusBadge status={row.status} />
          </div>
        ))}
      </div>
    </StatusBadgeProvider>
  );
}
