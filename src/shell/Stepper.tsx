/**
 * Stepper — the progress strip of a linear wizard. Tabs' one-way sibling: the
 * consumer owns the current step (`value`) and renders the body; this is just
 * the strip of numbered circles, connectors and labels.
 *
 * The one-way part is deliberate. Steps BEFORE the current one are complete
 * and — when `onChange` is wired — clickable, because going back is always
 * safe. Steps AFTER it are never clickable: moving forward is the wizard's
 * own Continue button's job, behind whatever validation the current step
 * demands. A strip that lets the user jump to "Payment" from "Contact" has
 * silently promised that nothing in between matters.
 *
 * Semantically an <ol> (the order is the meaning) with `aria-current="step"`
 * on the current item. The circles — number or check — are decoration and
 * hidden from assistive technology; the label names the step.
 */
import { type ReactNode } from 'react';

export interface StepItem {
  id: string;
  label: ReactNode;
  /** Short line under the label. */
  description?: ReactNode;
}

export interface StepperProps {
  items: StepItem[];
  /** The current step's id. Controlled — the consumer owns the wizard state. */
  value: string;
  /**
   * Lets the user return to a COMPLETED step by clicking it. Omitted, the
   * strip is purely an indicator and renders no controls at all.
   */
  onChange?: (id: string) => void;
  /** Names the strip for assistive technology, e.g. "Checkout steps". */
  'aria-label'?: string;
  className?: string;
}

const Check = () => (
  <svg viewBox="0 0 12 12" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
    <path d="M2.5 6.5L5 9l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Stepper({
  items, value, onChange, 'aria-label': ariaLabel, className = '',
}: StepperProps) {
  const currentIndex = Math.max(0, items.findIndex(s => s.id === value));

  return (
    <ol aria-label={ariaLabel} className={`flex items-start ${className}`.trim()}>
      {items.map((step, i) => {
        const state = i < currentIndex ? 'complete' : i === currentIndex ? 'current' : 'upcoming';
        const clickable = state === 'complete' && !!onChange;

        const circle = (
          <span
            aria-hidden="true"
            className={[
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
              state === 'complete' ? 'bg-blue-600 text-white' : '',
              state === 'current' ? 'border-2 border-blue-600 bg-white text-blue-600' : '',
              state === 'upcoming' ? 'border-2 border-gray-300 bg-white text-gray-400' : '',
            ].filter(Boolean).join(' ')}
          >
            {state === 'complete' ? <Check /> : i + 1}
          </span>
        );
        const text = (
          <span className="min-w-0">
            <span className={`block text-sm font-medium ${state === 'upcoming' ? 'text-gray-400' : 'text-gray-900'}`}>
              {step.label}
            </span>
            {step.description && (
              <span className="block text-xs text-gray-500">{step.description}</span>
            )}
          </span>
        );

        return (
          <li
            key={step.id}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex items-start gap-2 ${i > 0 ? 'flex-1' : ''}`}
          >
            {/* The connector belongs to the step it leads INTO, and takes the
              * incoming step's color: every line left of the current circle
              * reads as travelled. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`mt-3.5 h-0.5 flex-1 rounded ${i <= currentIndex ? 'bg-blue-600' : 'bg-gray-200'}`}
              />
            )}
            {clickable ? (
              <button
                type="button"
                onClick={() => onChange?.(step.id)}
                className="flex items-start gap-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {circle}
                {text}
              </button>
            ) : (
              <span className="flex items-start gap-2">
                {circle}
                {text}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
