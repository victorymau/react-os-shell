/**
 * Card — the kit's standard surface: a rounded, bordered panel with optional
 * header and footer rows. StatCard is the dashboard variant (label + big value
 * + optional trend delta). Both are pure presentational components.
 */
import { type ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  /** Title row above the body, divided by a hairline. */
  header?: ReactNode;
  /** Row below the body, divided by a hairline. */
  footer?: ReactNode;
  /** Apply default padding to the body. Default true; set false to fill edge-to-edge. */
  padded?: boolean;
  className?: string;
}

export default function Card({ children, header, footer, padded = true, className = '' }: CardProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`.trim()}>
      {header && (
        <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">{header}</div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
      {footer && <div className="border-t border-gray-100 px-4 py-3">{footer}</div>}
    </div>
  );
}

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  /** Trend pill, e.g. `{ value: '12%', direction: 'up' }`. */
  delta?: { value: ReactNode; direction: 'up' | 'down' | 'flat' };
  className?: string;
}

export function StatCard({ label, value, icon, delta, className = '' }: StatCardProps) {
  const deltaColor =
    delta?.direction === 'up' ? 'text-green-600'
    : delta?.direction === 'down' ? 'text-red-600'
    : 'text-gray-500';
  const arrow = delta?.direction === 'up' ? '▲' : delta?.direction === 'down' ? '▼' : '→';
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`.trim()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        {delta && <span className={`text-xs font-medium ${deltaColor}`}>{arrow} {delta.value}</span>}
      </div>
    </div>
  );
}
