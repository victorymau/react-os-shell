import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBugReport, type BugReport } from './BugReportDialog';
import { formatDate } from '../utils/date';
import Modal from './Modal';
import { useWindowManager } from './WindowManager';
import { setPdfPreview } from '../apps/Preview';

function StatePill({ resolved }: { resolved: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${resolved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
      {resolved ? 'Resolved' : 'Open'}
    </span>
  );
}

interface Props {
  report: BugReport;
  onClose?: () => void;
}

export default function BugReportDetail({ report }: Props) {
  const qc = useQueryClient();
  const config = useBugReport();
  const { openPage } = useWindowManager();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState('');

  const openScreenshot = () => {
    if (!report.screenshot_url) return;
    const filename = `bug-report-${report.id}-screenshot.png`;
    setPdfPreview({ url: report.screenshot_url, filename, kind: 'image' });
    openPage('/preview');
  };

  const resolve = useMutation({
    mutationFn: ({ is_resolved, resolution_note }: { is_resolved: boolean; resolution_note?: string }) => {
      if (!config?.resolve) {
        return Promise.reject(new Error('Bug report resolve is not configured.'));
      }
      return config.resolve(report.id, is_resolved, resolution_note);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
      qc.invalidateQueries({ queryKey: ['entity', 'bug_report', report.id] });
      setResolveOpen(false);
      setNote('');
    },
    meta: { success: (d: BugReport) => d.is_resolved ? 'Bug report marked resolved.' : 'Bug report reopened.' },
  });

  const handleAction = () => {
    if (report.is_resolved) {
      // Reopen — no note prompt; clear any prior resolution note
      resolve.mutate({ is_resolved: false, resolution_note: '' });
    } else {
      setNote('');
      setResolveOpen(true);
    }
  };

  const submitResolve = () => {
    resolve.mutate({ is_resolved: true, resolution_note: note.trim() });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold text-gray-900">{report.reporter_name || 'Unknown'}</span>
        <StatePill resolved={report.is_resolved} />
        <span className="text-gray-500 ml-auto">{formatDate(report.created_at)}</span>
      </div>

      {report.description && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-800 whitespace-pre-wrap">
          {report.description}
        </div>
      )}

      {report.is_resolved && report.resolution_note && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-900 whitespace-pre-wrap">
          <div className="text-xs font-medium uppercase tracking-wide text-green-700 mb-1">Resolution note</div>
          {report.resolution_note}
        </div>
      )}

      <dl className="text-xs text-gray-600 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
        <dt className="font-medium text-gray-700">Page</dt>
        <dd className="break-all"><a href={report.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{report.url}</a></dd>
        <dt className="font-medium text-gray-700">Viewport</dt>
        <dd>{report.viewport}</dd>
        <dt className="font-medium text-gray-700">Browser</dt>
        <dd className="break-all">{report.user_agent}</dd>
      </dl>

      {report.screenshot_url ? (
        <button type="button" onClick={openScreenshot} className="block w-full text-left p-0 bg-transparent border-0 cursor-pointer">
          <img src={report.screenshot_url} alt="Screenshot at time of report"
            className="w-full rounded-lg border border-gray-200 hover:border-blue-400 transition-colors" />
        </button>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          No screenshot was captured for this report.
        </div>
      )}

      {config?.resolve && (
        <div className="flex justify-end pt-2 border-t border-gray-200">
          <button onClick={handleAction} disabled={resolve.isPending}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${report.is_resolved ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {resolve.isPending ? '...' : report.is_resolved ? 'Reopen' : 'Mark Resolved'}
          </button>
        </div>
      )}

      <Modal open={resolveOpen} onClose={() => !resolve.isPending && setResolveOpen(false)} title={`Resolve ${report.report_code}`} size="md" compact>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Add a short note for {report.reporter_name || 'the reporter'} (optional).
          </p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitResolve(); }}
            rows={3}
            autoFocus
            placeholder="e.g. Fixed in v1256 — let me know if you still see it."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <button onClick={() => setResolveOpen(false)} disabled={resolve.isPending}
              className="px-3 py-1.5 text-sm rounded-lg font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={submitResolve} disabled={resolve.isPending}
              className="px-3 py-1.5 text-sm rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              {resolve.isPending ? 'Resolving...' : 'Resolve'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
