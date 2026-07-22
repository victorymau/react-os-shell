import Button from '../forms/Button';

export interface ListLoadErrorProps {
  /** Bold heading. Defaults to "Couldn't load this list". */
  title?: string;
  /** Muted explanatory line. Defaults to a generic connection/retry message. */
  message?: string;
  /** When provided, renders a "Try again" button that calls it (wire the
   *  data source's `refetch`). Omit for a static, non-retryable error. */
  onRetry?: () => void;
  /** Frame around the content, mirroring {@link EmptyState}: `dashed`
   *  (default), `card` (bordered surface), or `none`. */
  variant?: 'dashed' | 'card' | 'none';
}

/**
 * ListLoadError — the error counterpart to `EmptyState` for data lists. Shown
 * when a list's fetch fails (5xx, auth expiry, network) so an outage reads as
 * an error with a retry affordance instead of a misleading "nothing here"
 * empty state. Visual language mirrors `EmptyState`, tinted for error.
 */
export default function ListLoadError({
  title = "Couldn't load this list",
  message = 'Something went wrong fetching these records. Check your connection and try again.',
  onRetry,
  variant = 'dashed',
}: ListLoadErrorProps) {
  const frame =
    variant === 'card' ? 'rounded-md border border-gray-200 bg-white px-6 py-12' :
    variant === 'none' ? 'px-6 py-12' :
                         'rounded-lg border-2 border-dashed border-red-200 px-6 py-12';
  return (
    <div className={`flex flex-col items-center justify-center text-center ${frame}`} role="alert">
      <svg className="h-10 w-10 text-red-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-8.4 14.55A1.5 1.5 0 003.24 21h17.52a1.5 1.5 0 001.3-2.51l-8.4-14.55a1.5 1.5 0 00-2.6 0z" />
      </svg>
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mt-2">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}
