/**
 * Select — a styled native `<select>` for short, fixed option lists. Follows
 * the kit's controlled idiom (`value` + `onChange(value)`, not the raw event,
 * matching SearchableSelect). Native dark-mode styling applies automatically.
 *
 * Use SearchableSelect instead when the list is long or needs type-to-filter /
 * free-text entry; use Select for a handful of known options.
 */
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { inputClasses } from './styles';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'className'> {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown as a disabled first option when no value is selected. */
  placeholder?: string;
  invalid?: boolean;
  className?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { value, onChange, options, placeholder, invalid, className = '', ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={inputClasses({ invalid, className: `pr-8 ${className}`.trim() })}
      {...rest}
    >
      {placeholder !== undefined && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
});

export default Select;
