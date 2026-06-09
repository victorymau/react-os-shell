import type { ReactNode } from 'react';

/**
 * Generic top navigation bar. A horizontal row of tab-style links with an
 * optional brand on the left and free-form actions on the right. Self-contained
 * and styled with the shell's Tailwind utilities, so it themes for free.
 *
 * Controlled: pass `activeKey` and handle `onSelect`. The active item gets an
 * accent underline. Items can carry an `icon`, a `badge` (e.g. a count) and be
 * `disabled`.
 */
export interface TopNavItem {
  /** Stable key — what `onSelect` receives and `activeKey` matches. */
  key: string;
  label: ReactNode;
  /** Optional leading icon (typically a 4×4 svg). */
  icon?: ReactNode;
  /** Optional trailing badge — a count, dot, "New", etc. */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TopNavProps {
  items: TopNavItem[];
  /** Key of the active item — it gets the accent underline. */
  activeKey?: string;
  onSelect?: (key: string) => void;
  /** Left slot — logo / product title. */
  brand?: ReactNode;
  /** Right slot — actions (buttons, search, avatar…). Pinned to the far right. */
  actions?: ReactNode;
  className?: string;
}

export default function TopNav({ items, activeKey, onSelect, brand, actions, className }: TopNavProps) {
  return (
    <div
      className={`flex h-12 shrink-0 items-stretch gap-1 border-b border-gray-200 bg-white px-3 ${className ?? ''}`}
    >
      {brand && (
        <div className="mr-1 flex items-center gap-2 pr-3 font-semibold text-gray-900">{brand}</div>
      )}
      <nav className="flex items-stretch gap-0.5">
        {items.map(item => {
          const active = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              aria-current={active ? 'page' : undefined}
              onClick={() => !item.disabled && onSelect?.(item.key)}
              className={`relative inline-flex items-center gap-1.5 px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                active ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {item.icon && <span className="h-4 w-4 shrink-0">{item.icon}</span>}
              <span className="whitespace-nowrap">{item.label}</span>
              {item.badge != null && (
                <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold leading-5 text-gray-600">
                  {item.badge}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-600" aria-hidden />
              )}
            </button>
          );
        })}
      </nav>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
