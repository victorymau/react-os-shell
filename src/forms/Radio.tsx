/**
 * Radio — a styled native radio button. Group several by sharing the same
 * `name`; each is controlled via `checked` + `onChange(checked)` (fires when
 * this option becomes selected). Mirrors Checkbox; uses the accent fill.
 */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked' | 'className'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}

const DOT =
  'h-4 w-4 shrink-0 border-gray-300 accent-blue-600 focus:outline-none ' +
  'focus:ring-2 focus:ring-blue-400/30 disabled:cursor-not-allowed disabled:opacity-60';

const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { checked, onChange, label, description, disabled, className = '', ...rest },
  ref,
) {
  if (!label && !description) {
    return (
      <input
        ref={ref}
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className={`${DOT} ${className}`.trim()}
        {...rest}
      />
    );
  }
  return (
    <label className={`flex items-start gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${className}`.trim()}>
      <input
        ref={ref}
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className={`${DOT} mt-0.5`}
        {...rest}
      />
      <span className="text-sm leading-tight">
        {label && <span className="font-medium text-gray-700">{label}</span>}
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>
    </label>
  );
});

export default Radio;
