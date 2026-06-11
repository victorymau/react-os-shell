/**
 * In-memory store behind the demo's bug-report flow. `submit` (wired in
 * App.tsx) files reports here; the Bug Reports demo page lists them and
 * <BugReportDetail> resolves / deletes through the same BugReportConfig —
 * exactly the contract a real portal implements against its backend.
 */
import type { BugReport, BugReportSubmitPayload } from 'react-os-shell';

let reports: BugReport[] = [];
let seq = 1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

export function subscribeDemoBugReports(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getDemoBugReports(): BugReport[] {
  return reports;
}

export function addDemoBugReport(p: BugReportSubmitPayload): BugReport {
  const id = String(seq++);
  const report: BugReport = {
    id,
    report_code: `BR#${String(id).padStart(4, '0')}`,
    description: p.description,
    report_type: p.reportType,
    // Object URL keeps the capture viewable in BugReportDetail / Preview
    // without any upload — demo-only, revoked when the report is deleted.
    screenshot_url: p.screenshot ? URL.createObjectURL(p.screenshot) : undefined,
    url: p.url,
    user_agent: p.userAgent,
    viewport: p.viewport,
    module: p.extras?.module,
    reporter_name: 'Demo User',
    is_resolved: false,
    created_at: new Date().toISOString(),
  };
  reports = [report, ...reports];
  notify();
  return report;
}

export function resolveDemoBugReport(id: string, is_resolved: boolean, resolution_note?: string): BugReport {
  let updated: BugReport | undefined;
  reports = reports.map(r => {
    if (r.id !== id) return r;
    updated = { ...r, is_resolved, resolution_note: resolution_note ?? r.resolution_note };
    return updated;
  });
  notify();
  if (!updated) throw new Error('Report not found');
  return updated;
}

export function deleteDemoBugReport(id: string): void {
  const gone = reports.find(r => r.id === id);
  if (gone?.screenshot_url) URL.revokeObjectURL(gone.screenshot_url as string);
  reports = reports.filter(r => r.id !== id);
  notify();
}
