/**
 * Checkbox — a styled native checkbox. Controlled via `checked` +
 * `onChange(checked)` (boolean, not the event — the kit idiom). When `label`
 * or `description` is given it renders inside a clickable `<label>` row.
 *
 * Uses `accent-blue-600`, which the theme system points at the active accent,
 * so the check fill follows the user's accent in both light and dark mode.
 */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked' | 'className'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}

const BOX =
  'h-4 w-4 shrink-0 rounded border-gray-300 accent-blue-600 focus:outline-none ' +
  'focus:ring-2 focus:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-60';

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, onChange, label, description, disabled, className = '', ...rest },
  ref,
) {
  if (!label && !description) {
    return (
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className={`${BOX} ${className}`.trim()}
        {...rest}
      />
    );
  }
  return (
    <label className={`flex items-start gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${className}`.trim()}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className={`${BOX} mt-0.5`}
        {...rest}
      />
      <span className="text-sm leading-tight">
        {label && <span className="font-medium text-gray-700">{label}</span>}
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>
    </label>
  );
});

export default Checkbox;
