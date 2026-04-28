/**
 * StatusBadge — unified status pill across the system.
 *
 * The shell defines 8 semantic groups so the same concept always looks the
 * same color, regardless of which entity the status came from. The mapping
 * from raw status strings → groups is consumer-supplied via
 * <StatusBadgeProvider groups={...}>; when no provider is present (or a
 * status isn't mapped), the badge falls back to the "neutral" group.
 *
 * Dark-mode tone-down lives in index.css under [data-theme="dark"].
 */
import { createContext, useContext, type ReactNode } from 'react';

export type SemanticGroup =
  | 'success'   // finished, done, paid, approved, confirmed, received, active, production_ready, shipped
  | 'active'    // in-progress, in production, in transit, posted, development
  | 'queued'    // sent, arranged, loaded, submitted, pending_production
  | 'info'      // initialized, delivered
  | 'pending'   // pending, at_port (waiting / hold)
  | 'warning'   // customs, partially_paid (needs attention)
  | 'danger'    // overdue
  | 'draft'     // draft (slightly more visible than neutral)
  | 'neutral';  // cancelled, inactive, rejected

const GROUP_COLORS: Record<SemanticGroup, string> = {
  success: 'bg-green-100 text-green-800',
  active:  'bg-blue-100 text-blue-800',
  queued:  'bg-indigo-100 text-indigo-800',
  info:    'bg-sky-100 text-sky-800',
  pending: 'bg-yellow-100 text-yellow-800',
  warning: 'bg-orange-100 text-orange-800',
  danger:  'bg-red-100 text-red-800',
  draft:   'bg-gray-300 text-gray-800',
  neutral: 'bg-gray-100 text-gray-800',
};

const StatusGroupsContext = createContext<Record<string, SemanticGroup>>({});

export function StatusBadgeProvider({
  groups,
  children,
}: { groups: Record<string, SemanticGroup>; children: ReactNode }) {
  return <StatusGroupsContext.Provider value={groups}>{children}</StatusGroupsContext.Provider>;
}

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const groups = useContext(StatusGroupsContext);
  const group = groups[status] ?? 'neutral';
  const color = GROUP_COLORS[group];
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
