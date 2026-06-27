import type { ReactNode } from 'react';

/**
 * Presentational building blocks for SidebarLayout filter sidebars (status
 * buckets, categories, …) — the same item + group-label markup every list
 * window renders. Data wiring (count fetching) stays in the consuming app.
 */

export function SidebarGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{children}</p>
  );
}

export function SidebarNavItem({ label, count, active, onClick }: {
  label: string; count?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left ${active ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      <span className="truncate">{label}</span>
      {count != null && count > 0 && (
        <span className={`shrink-0 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 h-5 rounded-full text-[11px] font-medium ${active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          {count}
        </span>
      )}
    </button>
  );
}
