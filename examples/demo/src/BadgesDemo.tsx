import { StatusBadge, type SemanticGroup } from 'react-os-shell';
import { DEMO_STATUS_GROUPS } from './demoStatusGroups';

/**
 * Demo for <StatusBadge> — one pill style per *semantic group*, so the same
 * concept reads the same color everywhere regardless of which entity the
 * status string came from. The mapping below is exactly what App.tsx feeds
 * <StatusBadgeProvider>; unmapped strings fall back to neutral.
 */

const GROUP_BLURBS: Record<SemanticGroup, string> = {
  success: 'Finished / confirmed — nothing left to do',
  active: 'Currently moving',
  queued: 'Handed off, waiting to start',
  info: 'Informational milestones',
  pending: 'Waiting or on hold',
  warning: 'Needs attention',
  danger: 'Action overdue',
  draft: 'Not yet submitted',
  neutral: 'Terminal, no action (and the unmapped fallback)',
};

const GROUP_ORDER: SemanticGroup[] = [
  'success', 'active', 'queued', 'info', 'pending', 'warning', 'danger', 'draft', 'neutral',
];

export default function BadgesDemo() {
  const byGroup = new Map<SemanticGroup, string[]>();
  for (const [status, group] of Object.entries(DEMO_STATUS_GROUPS)) {
    byGroup.set(group as SemanticGroup, [...(byGroup.get(group as SemanticGroup) ?? []), status]);
  }

  return (
    <div className="p-5 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">StatusBadge</h2>
        <p className="mt-1 text-sm text-gray-500 max-w-2xl">
          Status strings map to one of nine <span className="font-medium">semantic groups</span> via{' '}
          <code className="text-xs bg-gray-100 rounded px-1 py-0.5">&lt;StatusBadgeProvider groups&gt;</code>,
          so “paid”, “approved” and “active” all read as the same green even
          though they come from different entities. Labels are prettified
          automatically (underscores → spaces, Title Case).
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left font-medium px-3 py-2 w-28">Group</th>
              <th className="text-left font-medium px-3 py-2">Mapped statuses</th>
              <th className="text-left font-medium px-3 py-2 w-72">Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {GROUP_ORDER.map(group => (
              <tr key={group}>
                <td className="px-3 py-2 align-top font-mono text-xs text-gray-500">{group}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(byGroup.get(group) ?? []).map(s => <StatusBadge key={s} status={s} />)}
                    {group === 'neutral' && <StatusBadge status="some_unmapped_status" />}
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-xs text-gray-500">{GROUP_BLURBS[group]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
