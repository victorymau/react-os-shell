import type { ReactNode } from 'react';
import { SEVERITY_FILL, SEVERITY_WORD, type SeverityTone } from './severity';

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

export function SidebarNavItem({ label, count, active, onClick, severity }: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  /**
   * Optional health marker — a small dot before the label, in the shell's
   * status vocabulary (`success | warning | danger`). For sidebars that double
   * as an alarm surface: a problem several levels down inside a section stays
   * visible on the always-on nav item that leads to it, without the operator
   * having to open anything.
   *
   * Roll the tone up in the consuming app (worst-of its children) — the item
   * renders a severity, it never computes one. Omitting it is not a claim of
   * health, it is no claim at all, and renders exactly as an item did before
   * this prop existed.
   */
  severity?: SeverityTone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left ${active ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      {severity && (
        // Decorative in the a11y tree — the word itself follows the label, so
        // the item reads "Warehouses, warning, 12" in that order instead of
        // leading with a tone before anyone knows what it belongs to.
        <span
          aria-hidden="true"
          title={SEVERITY_WORD[severity]}
          className={`shrink-0 h-1.5 w-1.5 rounded-full ${SEVERITY_FILL[severity]}`}
        />
      )}
      {/* `mr-auto` only with a marker: the button is `justify-between`, which
          would otherwise push the dot to the far left and strand the label in
          the middle. An auto margin absorbs the free space instead, so the dot
          stays against the label and the count keeps its right edge. Without a
          marker the class list is untouched — 3.24's exact markup. */}
      <span className={severity ? 'truncate mr-auto' : 'truncate'}>{label}</span>
      {severity && <span className="sr-only">{SEVERITY_WORD[severity]}</span>}
      {count != null && count > 0 && (
        <span className={`shrink-0 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 h-5 rounded-full text-[11px] font-medium ${active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          {count}
        </span>
      )}
    </button>
  );
}
