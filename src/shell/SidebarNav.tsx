import type { ReactNode } from 'react';
import { resolveSeverity, type SeverityTone } from './severity';

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

export interface SidebarNavItemProps {
  /**
   * Widened from `string` to `ReactNode` so an item can carry markup the label
   * itself needs — a code span on a tenant slug, an `<em>` on the part of the
   * name that matched a filter. A plain string is still the common case and is
   * the only one that gets a `title`: a node has no text this component can
   * read without walking it, and a tooltip reading "[object Object]" is worse
   * than none.
   */
  label: ReactNode;
  count?: number;
  active: boolean;
  onClick: () => void;
  /**
   * A 16px glyph at the leading edge, naming the destination — the section
   * icons an admin sidebar repeats from its Start-menu entry, so the same
   * place looks the same in both.
   *
   * Decorative in the a11y tree: the label already names the item, and an
   * icon announced beside it is the name read twice. It follows the row's
   * state rather than inheriting the row's own ink — `gray-400` idle against
   * the label's `gray-700`, `blue-600` active against `blue-700` — so the
   * glyph stays a step quieter than the words it introduces.
   */
  icon?: ReactNode;
  /**
   * The right edge of the row, after the count: a plan chip, an "external"
   * mark on an item that leaves the shell, a sync spinner. `shrink-0`, so it
   * keeps its size and the label is what gives way when the sidebar narrows.
   *
   * Not a second count — `count` is still the count, and the two render
   * together in that order. This slot is for what the count cannot say.
   */
  trailing?: ReactNode;
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
   *
   * A tone that arrives from a backend rollup has not been near the compiler,
   * so an unrecognised token (`'crit'`, `'critical'`, a stale enum) renders a
   * visible "unknown severity" marker and logs — never nothing. This item is
   * often the ONLY place a deep alarm surfaces; a marker that quietly vanishes
   * on a bad token would turn the safety feature into the outage.
   */
  severity?: SeverityTone;
}

export function SidebarNavItem({ label, count, active, onClick, icon, trailing, severity }: SidebarNavItemProps) {
  // `null` when the prop was omitted (no marker at all — 3.24's markup), a
  // style otherwise. Never partially-undefined classes, whatever came in.
  const marker = resolveSeverity(severity, 'SidebarNavItem');
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-left ${active ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      {/* Icon first, then the severity dot: the glyph is the item's identity
          and belongs at the edge, while the dot is a marker ON the label and
          has to stay against it. A dot stranded to the left of an icon reads
          as the icon's status rather than the section's. */}
      {icon != null && (
        <span aria-hidden="true" className={`shrink-0 h-4 w-4 ${active ? 'text-blue-600' : 'text-gray-400'}`}>
          {icon}
        </span>
      )}
      {marker && (
        // Decorative in the a11y tree — the word itself follows the label, so
        // the item reads "Warehouses, warning, 12" in that order instead of
        // leading with a tone before anyone knows what it belongs to.
        <span
          aria-hidden="true"
          title={marker.word}
          className={`shrink-0 h-1.5 w-1.5 rounded-full ${marker.fill}`}
        />
      )}
      {/* `mr-auto` unconditionally, where it used to depend on the marker: the
          button is `justify-between`, which only lands the label left and the
          count right while those are the ONLY two children. Any third child —
          a dot, an icon, a trailing chip — and the free space is dealt out
          between them instead, stranding the label in the middle. An auto
          margin absorbs all of it in one place, so everything before the label
          packs left and everything after it packs right however many there
          are. With exactly two children it is what `justify-between` was
          already doing, so the rendered geometry of a plain item is unchanged.

          `min-w-0` is what makes `truncate` work at all here: a flex item's
          default `min-width: auto` refuses to shrink below its content, so a
          long bucket name pushed the count off the row instead of ellipsing. */}
      <span
        className="min-w-0 truncate mr-auto"
        // Only a string can be a tooltip. See `label`.
        title={typeof label === 'string' ? label : undefined}
      >
        {label}
      </span>
      {marker && <span className="sr-only">{marker.word}</span>}
      {count != null && count > 0 && (
        <span className={`shrink-0 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 h-5 rounded-full text-[11px] font-medium ${active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          {count}
        </span>
      )}
      {trailing != null && <span className="shrink-0">{trailing}</span>}
    </button>
  );
}
