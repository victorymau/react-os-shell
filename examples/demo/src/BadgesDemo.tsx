import { StatusBadge, useBugReport, reportBug, type SemanticGroup } from 'react-os-shell';
import { DEMO_STATUS_GROUPS } from './demoStatusGroups';

/**
 * Demo for <StatusBadge> — one pill style per *semantic group*, so the same
 * concept reads the same color everywhere regardless of which entity the
 * status string came from. The mapping below is exactly what App.tsx feeds
 * <StatusBadgeProvider>; unmapped strings fall back to neutral.
 *
 * Also hosts the bug-report trigger so the <BugReportProvider> flow (screen
 * capture → annotate → describe → submit) is reachable without right-clicking
 * the desktop.
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
  const bugReport = useBugReport();

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

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 max-w-2xl">
        <h3 className="text-sm font-semibold text-gray-800">Suggestion or Bug dialog</h3>
        <p className="mt-1 text-xs text-gray-500">
          The shell's bug-report flow: captures the tab (your browser will ask
          to share the screen — annotate the shot if you like), then hands the
          payload to the consumer's <code className="bg-gray-100 rounded px-1">submit</code> callback.
          The demo's callback just raises a notification — check the bell after
          sending. Also available from the desktop right-click menu.
        </p>
        <button
          onClick={() => bugReport && reportBug(bugReport.submit)}
          disabled={!bugReport}
          className="mt-3 px-3 py-1.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
        >
          Report a bug or suggestion…
        </button>
      </div>
    </div>
  );
}
