/**
 * Tabs — a controlled in-content tab strip. The consumer owns the active id
 * (`value` + `onChange`) and renders the body for the active tab itself; this
 * component is just the strip. For app-level navigation use TopNav instead.
 *
 * `underline` (default) is the classic bordered tab row; `pill` is a segmented
 * control whose active segment fills with the accent (dark-mode safe).
 */
import { type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

export default function Tabs({ items, value, onChange, variant = 'underline', className = '' }: TabsProps) {
  if (variant === 'pill') {
    return (
      <div role="tablist" className={`inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1 ${className}`.trim()}>
        {items.map(t => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              disabled={t.disabled}
              onClick={() => onChange(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="tablist" className={`flex items-center gap-1 border-b border-gray-200 ${className}`.trim()}>
      {items.map(t => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
