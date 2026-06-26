/**
 * Label — standalone field label in the kit's style, for the rare case where
 * FormField's all-in-one wrapper isn't wanted. Most forms should use FormField.
 */
import { type LabelHTMLAttributes } from 'react';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Append a red asterisk. */
  required?: boolean;
}

export default function Label({ required, children, className = '', ...rest }: LabelProps) {
  return (
    <label className={`mb-1 block text-xs font-medium text-gray-600 ${className}`.trim()} {...rest}>
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}
