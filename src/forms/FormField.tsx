/**
 * FormField — label + control + hint/error wrapper. The standard row for every
 * form in the kit: pass a control as `children`, a `label` (wired to it via
 * `htmlFor`), and either a `hint` (greyed helper) or an `error` (red, takes
 * precedence). Promotes the `Field` helper the demos used inline.
 */
import { type ReactNode } from 'react';

export interface FormFieldProps {
  label?: ReactNode;
  /** id of the control, for label-for wiring. */
  htmlFor?: string;
  /** Greyed helper text below the control. */
  hint?: ReactNode;
  /** Red error text below the control — overrides `hint` when present. */
  error?: ReactNode;
  /** Append a red asterisk to the label. */
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export default function FormField({
  label, htmlFor, hint, error, required, className = '', children,
}: FormFieldProps) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-600">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="mt-1 text-[11px] text-red-600">{error}</p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-1 text-[11px] text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}
