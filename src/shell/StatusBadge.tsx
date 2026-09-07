/**
 * StatusBadge — unified status pill across the system.
 *
 * The shell defines 8 semantic groups so the same concept always looks the
 * same color, regardless of which entity the status came from. The mapping
 * from raw status strings → groups is consumer-supplied via
 * <StatusBadgeProvider groups={...}>; when no provider is present (or a
 * status isn't mapped), the badge falls back to the "neutral" group.
 *
 * Colour comes from the status tokens in ui.css, which carry both themes, so
 * there is no dark-mode rule to keep in step with this file.
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

/**
 * How loudly the badge speaks. The same two words `Banner` uses, for the same
 * idea — one axis, one vocabulary, wherever the shell lets a caller choose.
 *
 * `subtle` (the default) is the quiet register: a wash of the group's hue that
 * composites over whatever it sits on, so a table of forty rows reads as a
 * table rather than as forty coloured chips. `solid` is the saturated fill for
 * the ONE place the same fact is the headline — a detail header, a risk tier on
 * an approval screen. Solid inside a dense list is the bug this axis exists to
 * make unnecessary: it turns every row into an alarm and none of them is read.
 */
export type StatusEmphasis = 'subtle' | 'solid';

/**
 * The one table. `ColoredBadge` reads it too, through its `tone` prop, so a
 * badge given a tone directly and a badge given a status string that maps to
 * that tone are the same colour — which is the promise this component's
 * docblock makes and could not keep for anything that was not a status.
 *
 * The values are token-backed rather than palette steps (`bg-green-100
 * text-green-800`) for two reasons. An opaque tint is calibrated against ONE
 * backdrop — the flat surface — and reads as a patch on a raised panel or a
 * hovered row; the `-soft` tokens are a transparent wash, so one value is right
 * on all three. And a token carries its own dark value, so this table no longer
 * needs a matching `[data-theme="dark"] .bg-green-100.text-green-800` rule in
 * ui.css that a new group could silently ship without. See the status-token
 * block in ui.css for the measured contrast the inks are set to.
 */
export const GROUP_COLORS: Record<SemanticGroup, string> = {
  success: 'bg-[var(--status-success-soft)] text-[color:var(--status-success-soft-ink)]',
  active:  'bg-[var(--status-active-soft)] text-[color:var(--status-active-soft-ink)]',
  queued:  'bg-[var(--status-queued-soft)] text-[color:var(--status-queued-soft-ink)]',
  info:    'bg-[var(--status-info-soft)] text-[color:var(--status-info-soft-ink)]',
  pending: 'bg-[var(--status-pending-soft)] text-[color:var(--status-pending-soft-ink)]',
  warning: 'bg-[var(--status-warning-soft)] text-[color:var(--status-warning-soft-ink)]',
  danger:  'bg-[var(--status-danger-soft)] text-[color:var(--status-danger-soft-ink)]',
  draft:   'bg-[var(--status-draft-soft)] text-[color:var(--status-draft-soft-ink)]',
  neutral: 'bg-[var(--status-neutral-soft)] text-[color:var(--status-neutral-soft-ink)]',
};

/** The loud register of the same nine groups — `emphasis="solid"`. White on a
 *  saturated fill, one value in both themes, because a solid badge is read
 *  against itself rather than against the surface behind it. */
export const GROUP_COLORS_SOLID: Record<SemanticGroup, string> = {
  success: 'bg-[var(--status-success-solid)] text-[color:var(--status-on-solid)]',
  active:  'bg-[var(--status-active-solid)] text-[color:var(--status-on-solid)]',
  queued:  'bg-[var(--status-queued-solid)] text-[color:var(--status-on-solid)]',
  info:    'bg-[var(--status-info-solid)] text-[color:var(--status-on-solid)]',
  pending: 'bg-[var(--status-pending-solid)] text-[color:var(--status-on-solid)]',
  warning: 'bg-[var(--status-warning-solid)] text-[color:var(--status-on-solid)]',
  danger:  'bg-[var(--status-danger-solid)] text-[color:var(--status-on-solid)]',
  draft:   'bg-[var(--status-draft-solid)] text-[color:var(--status-on-solid)]',
  neutral: 'bg-[var(--status-neutral-solid)] text-[color:var(--status-on-solid)]',
};

/** Classes for one group at one emphasis. Exported so a surface that has to
 *  build its own pill — a virtualised cell, a canvas legend — takes the same
 *  colours instead of guessing at them. */
export function groupColors(group: SemanticGroup, emphasis: StatusEmphasis = 'subtle'): string {
  return emphasis === 'solid' ? GROUP_COLORS_SOLID[group] : GROUP_COLORS[group];
}

const StatusGroupsContext = createContext<Record<string, SemanticGroup>>({});

export function StatusBadgeProvider({
  groups,
  children,
}: { groups: Record<string, SemanticGroup>; children: ReactNode }) {
  return <StatusGroupsContext.Provider value={groups}>{children}</StatusGroupsContext.Provider>;
}

interface StatusBadgeProps {
  status: string;
  /**
   * What to SHOW, when the raw status is not what a reader should see.
   *
   * The derived label — underscores to spaces, title case — is right for a
   * status this system named. It is wrong for one that arrived from somewhere
   * else: Stripe's `trialing` reads as "Trialing" rather than "Trial", and its
   * `canceled` puts an American spelling in front of a British-English tenant.
   *
   * Without this, a consumer that needs one word changed has to abandon the
   * badge and hand-roll the whole pill — and takes the colours with it, which
   * is precisely the drift `StatusBadge` exists to prevent. The tone still
   * comes from `status`, so the group mapping stays the single source of
   * truth for colour no matter what is written on the pill.
   */
  label?: ReactNode;
  /**
   * How loudly to say it. Same fact, same group, same mapping — only the
   * volume changes, so a risk tier can be quiet in a table row and loud in the
   * header of the record that row opens, with no second component and no call
   * site picking colours.
   */
  emphasis?: StatusEmphasis;
}

export default function StatusBadge({ status, label, emphasis = 'subtle' }: StatusBadgeProps) {
  const groups = useContext(StatusGroupsContext);
  const group = groups[status] ?? 'neutral';
  const color = groupColors(group, emphasis);
  const text = label ?? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {text}
    </span>
  );
}
