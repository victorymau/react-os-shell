import { useState, useSyncExternalStore } from 'react';
import { BugReportDetail, useBugReport, reportBug, formatDate, type BugReport } from 'react-os-shell';
import { subscribeDemoBugReports, getDemoBugReports } from './demoBugStore';

/**
 * Demo for <BugReportDetail> — the admin-side viewer for reports collected by
 * the shell's Suggestion-or-Bug dialog. Reports filed in this demo (desktop
 * right-click → Suggestion or Bug, or the button below) land in an in-memory
 * store; picking one renders the real detail component, whose Resolve /
 * Reopen / Delete actions run through the same BugReportConfig callbacks a
 * portal wires to its backend.
 */
export default function BugReportsDemo() {
  const reports = useSyncExternalStore(subscribeDemoBugReports, getDemoBugReports, getDemoBugReports);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bugReport = useBugReport();
  const selected: BugReport | undefined = reports.find(r => r.id === selectedId) ?? reports[0];

  return (
    <div className="flex h-full text-sm">
      <nav className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Reports</span>
          <button
            onClick={() => bugReport && reportBug(bugReport.submit)}
            disabled={!bugReport}
            className="px-2 py-0.5 text-[11px] rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
          >
            New…
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {reports.length === 0 ? (
            <p className="px-2 py-6 text-xs text-gray-400 text-center">
              Nothing filed yet — click <span className="font-medium">New…</span> or use the
              desktop right-click menu.
            </p>
          ) : reports.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full rounded-md px-2.5 py-1.5 text-left ${selected?.id === r.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{String(r.report_code ?? `#${r.id}`)}</span>
                <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${r.is_resolved ? 'bg-green-500' : 'bg-yellow-400'}`} />
              </span>
              <span className="block text-[11px] text-gray-400 truncate">
                {r.report_type === 'suggestion' ? 'Suggestion' : 'Bug'} · {formatDate(r.created_at)}
              </span>
            </button>
          ))}
        </div>
      </nav>
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <BugReportDetail key={selected.id} report={selected} onClose={() => setSelectedId(null)} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-gray-400">
            <p>
              File a report and it appears here, rendered by the shell's{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">&lt;BugReportDetail&gt;</code>{' '}
              with live Resolve / Reopen / Delete actions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
