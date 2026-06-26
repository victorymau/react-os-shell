/**
 * Button — the kit's standard button. `primary` uses `bg-blue-600`, which the
 * theme system remaps to the active accent (and to a readable tone in dark
 * mode), so a primary button always follows the user's chosen accent.
 *
 * Controlled by the consumer like any native button (spread `onClick`, `type`,
 * `form`, …); the component only adds the look, a `loading` spinner state, and
 * optional icon slots.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner and disable the button while an action is in flight. */
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Stretch to the full width of the container. */
  block?: boolean;
  className?: string;
}

const BASE =
  'inline-flex items-center justify-center rounded-md font-medium transition-colors ' +
  'focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus:ring-blue-400/40',
  secondary: 'border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-blue-400/30',
  ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-blue-400/30',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus:ring-red-400/40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1 px-2.5 py-1 text-xs',
  md: 'gap-1.5 px-3 py-1.5 text-sm',
};

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, block = false,
    disabled, type = 'button', children, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[BASE, VARIANTS[variant], SIZES[size], block ? 'w-full' : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
