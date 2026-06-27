export interface LoadingSpinnerProps {
  /** Ring diameter: `sm` = 20px, `md` = 32px (default), `lg` = 48px. */
  size?: 'sm' | 'md' | 'lg';
  /** Wrapper padding utility (default `py-12`). Pass `''` to remove. */
  padding?: string;
  /** Extra classes on the centering wrapper. */
  className?: string;
}

/**
 * LoadingSpinner — a centered animated ring for pending/loading regions.
 * (Distinct from the shell's internal "Loading…" text used inside data grids.)
 */
export default function LoadingSpinner({ size = 'md', padding = 'py-12', className = '' }: LoadingSpinnerProps) {
  const dim = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-12 w-12' : 'h-8 w-8';
  return (
    <div className={`flex items-center justify-center ${padding} ${className}`}>
      <div className={`${dim} animate-spin rounded-full border-2 border-gray-200 border-t-blue-600`} />
    </div>
  );
}
