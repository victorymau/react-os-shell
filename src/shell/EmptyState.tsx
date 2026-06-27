import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Bold heading, e.g. "No invoices yet". */
  title?: string;
  /** Muted primary line. Defaults to "Nothing here yet." when neither
   *  `title` nor `message` is given. */
  message?: string;
  /** Secondary muted line. (`hint` is an accepted alias.) */
  description?: string;
  /** @deprecated alias for `description`. */
  hint?: string;
  /** Frame around the content: `dashed` (default), `card` (bordered surface),
   *  or `none`. */
  variant?: 'dashed' | 'card' | 'none';
  /** @deprecated set `variant="none"` instead. */
  frameless?: boolean;
  /** Show the placeholder icon. Defaults to true (false for `variant="card"`). */
  icon?: boolean;
  /** Action(s) rendered under the text. */
  children?: ReactNode;
}

/**
 * EmptyState — placeholder for empty lists/panes. Supersedes the per-portal
 * copies: accepts both the `title`/`description` and `message`/`hint`/`frameless`
 * prop shapes, with a single unified look.
 */
export default function EmptyState({
  title, message, description, hint, variant, frameless, icon, children,
}: EmptyStateProps) {
  const v = frameless ? 'none' : (variant ?? 'dashed');
  const showIcon = icon ?? (v !== 'card');
  const primary = message ?? (title ? undefined : 'Nothing here yet.');
  const secondary = description ?? hint;
  const frame =
    v === 'card' ? 'rounded-md border border-gray-200 bg-white px-6 py-12' :
    v === 'none' ? 'px-6 py-12' :
                   'rounded-lg border-2 border-dashed border-gray-300 px-6 py-12';
  return (
    <div className={`flex flex-col items-center justify-center text-center ${frame}`}>
      {showIcon && (
        <svg className="h-10 w-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      )}
      {title && <h3 className="text-sm font-medium text-gray-900">{title}</h3>}
      {primary && <p className={`text-sm text-gray-500 ${title ? 'mt-2' : ''}`}>{primary}</p>}
      {secondary && <p className="text-xs text-gray-400 mt-1">{secondary}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
