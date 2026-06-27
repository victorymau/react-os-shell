import type { ReactNode } from 'react';

export interface ColoredBadgeProps {
  /** Tailwind classes for the badge color, e.g. `bg-green-100 text-green-800`.
   *  Keep a per-app palette map rather than hardcoding colors at call sites. */
  colorClass: string;
  children: ReactNode;
  /** `xs` = 10px (dense list cells), `sm` = 12px / px-2 (default), `md` =
   *  12px / px-2.5 (matches StatusBadge). */
  size?: 'xs' | 'sm' | 'md';
  /** Capitalize each word — useful for raw status strings like `in_progress`
   *  (rendered as `In Progress`). Default false. */
  capitalize?: boolean;
}

/**
 * ColoredBadge — a small rounded-full pill whose colors are supplied as a
 * Tailwind class string. Generic counterpart to StatusBadge (which maps status
 * strings to semantic groups); use this when the caller already knows the color.
 */
export default function ColoredBadge({ colorClass, children, size = 'sm', capitalize = false }: ColoredBadgeProps) {
  const sizeCls =
    size === 'xs' ? 'px-2 py-0.5 text-[10px]' :
    size === 'md' ? 'px-2.5 py-0.5 text-xs' :
                    'px-2 py-0.5 text-xs';
  const capCls = capitalize ? 'capitalize' : '';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeCls} ${capCls} ${colorClass}`}>
      {children}
    </span>
  );
}
