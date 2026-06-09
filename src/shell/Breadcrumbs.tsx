import { Fragment } from 'react';
import type { ReactNode } from 'react';

/**
 * Generic breadcrumb trail. Self-contained and styled with the same Tailwind
 * utilities the shell already ships, so consumers get it for free.
 *
 * Pass an ordered list of `items` from root → current. Every crumb except the
 * last renders as a button when it has an `onClick`; the last crumb is treated
 * as the current location — rendered inert with `aria-current="page"`. When the
 * trail is long, set `maxItems` to collapse the middle into an ellipsis
 * (`first … last-n` ), keeping the first and the tail visible.
 */
export interface BreadcrumbItem {
  /** Visible label. */
  label: ReactNode;
  /** Optional leading icon (typically a 3.5×3.5 svg). */
  icon?: ReactNode;
  /** Navigate to this crumb. Omitted on the current (last) crumb. */
  onClick?: () => void;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Node rendered between crumbs. Defaults to a chevron. */
  separator?: ReactNode;
  /** Collapse the middle to an ellipsis when there are more than this many
   *  crumbs. `0` (default) never collapses. */
  maxItems?: number;
  className?: string;
}

const DEFAULT_SEPARATOR = (
  <svg className="h-3.5 w-3.5 shrink-0 text-gray-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
    <path
      fillRule="evenodd"
      d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
      clipRule="evenodd"
    />
  </svg>
);

type Crumb = { kind: 'item'; item: BreadcrumbItem; isLast: boolean } | { kind: 'ellipsis' };

export default function Breadcrumbs({ items, separator, maxItems = 0, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  const sep = separator ?? DEFAULT_SEPARATOR;

  // Build the display list, collapsing the middle if `maxItems` is exceeded.
  const crumbs: Crumb[] = [];
  const lastIndex = items.length - 1;
  if (maxItems > 0 && items.length > maxItems && maxItems >= 2) {
    const tailCount = Math.max(1, maxItems - 1); // keep the first + this many from the end
    crumbs.push({ kind: 'item', item: items[0], isLast: false });
    crumbs.push({ kind: 'ellipsis' });
    for (let i = items.length - tailCount; i <= lastIndex; i++) {
      crumbs.push({ kind: 'item', item: items[i], isLast: i === lastIndex });
    }
  } else {
    items.forEach((item, i) => crumbs.push({ kind: 'item', item, isLast: i === lastIndex }));
  }

  return (
    <nav aria-label="Breadcrumb" className={`min-w-0 ${className ?? ''}`}>
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <Fragment key={i}>
            {i > 0 && <li aria-hidden className="flex items-center">{sep}</li>}
            <li className="flex min-w-0 items-center">
              {crumb.kind === 'ellipsis' ? (
                <span className="px-0.5 text-gray-400 select-none" aria-label="Hidden crumbs">…</span>
              ) : crumb.isLast || !crumb.item.onClick ? (
                <span
                  aria-current={crumb.isLast ? 'page' : undefined}
                  className={`inline-flex min-w-0 items-center gap-1 truncate ${
                    crumb.isLast ? 'font-medium text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {crumb.item.icon}
                  <span className="truncate">{crumb.item.label}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={crumb.item.onClick}
                  className="inline-flex min-w-0 items-center gap-1 truncate rounded px-1 -mx-1 text-gray-500 transition-colors hover:text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {crumb.item.icon}
                  <span className="truncate">{crumb.item.label}</span>
                </button>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
