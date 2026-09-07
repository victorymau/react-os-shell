/**
 * Switch — an on/off control that takes effect immediately.
 *
 * `Checkbox` is the one to use inside a form: it means "this will be true when
 * you save". A Switch means the change has already happened. Choosing the wrong
 * one tells the user the wrong thing about whether they still need to press
 * Save, so the distinction is worth keeping.
 *
 * Built on a real `<button role="switch">` with `aria-checked` rather than a
 * styled checkbox, because that is what the state actually is and it keeps
 * keyboard and screen-reader behaviour without further work.
 */
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type SwitchSize = 'sm' | 'md' | 'touch';

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'className'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: SwitchSize;
  /** Text beside the control. Clicking it toggles, as a label should. */
  label?: ReactNode;
  /** A line under the label for what the setting actually does. */
  hint?: ReactNode;
  /**
   * Why this switch is disabled, rendered as text BESIDE it — never as a
   * `title` tooltip. Same contract as `Button`'s, and for the same reason: a
   * tooltip needs a hover, a disabled control does not fire one on every
   * platform, and an operator facing a dead toggle with no explanation goes
   * looking for someone to ask.
   *
   * Only rendered while the switch is actually disabled; ignored otherwise, so
   * it is safe to pass unconditionally. Wired with `aria-describedby`, so the
   * reason is announced with the control rather than found by hunting.
   *
   * For a PANEL of controls that are all disabled for ONE reason, do not repeat
   * it eight times — write the sentence once and point every control at it with
   * `disabledReasonId`.
   */
  disabledReason?: ReactNode;
  /**
   * The id of an element elsewhere on the page that already explains why this
   * control is disabled — a panel-level note above a group of switches.
   *
   * Given this, the switch describes itself with that element and renders no
   * text of its own, which is what stops one sentence appearing under every
   * control in the group. Wins over `disabledReason`: pointing at a shared
   * explanation and printing a private one are two answers to the same
   * question, and the shared one is the reason this prop exists.
   *
   * Honoured only while the switch is disabled, exactly like `disabledReason`
   * — an enabled control has nothing to explain.
   */
  disabledReasonId?: string;
  id?: string;
  className?: string;
}

const TRACK: Record<SwitchSize, string> = {
  sm: 'h-5 w-9',
  md: 'h-6 w-11',
  touch: 'h-8 w-14',
};

const KNOB: Record<SwitchSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  touch: 'h-7 w-7',
};

// Travel = track width − knob width − 2× the 2px inset.
const TRAVEL: Record<SwitchSize, string> = {
  sm: 'translate-x-4',
  md: 'translate-x-5',
  touch: 'translate-x-6',
};

/**
 * Forwards its ref, and spreads the rest onto the button.
 *
 * A form library hands a field three things: a change handler, a name, and a
 * ref it uses to move focus to the field when validation fails. The first was
 * here; the other two had nowhere to go, so this control could not be a form
 * field at all — which contradicts the kit's own guidance that its controls
 * drop into react-hook-form.
 */
const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch({
  checked, onChange, disabled = false, size = 'md', label, hint, id, className = '',
  disabledReason, disabledReasonId, ...rest
}, ref) {
  const generated = useId();
  const switchId = id ?? generated;
  const hintId = hint ? `${switchId}-hint` : undefined;
  // A shared explanation outranks a private one; either is ignored unless the
  // control is actually disabled.
  const sharedId = disabled && disabledReasonId ? disabledReasonId : undefined;
  const showReason = disabled && !sharedId && disabledReason != null && disabledReason !== '';
  const reasonId = showReason ? `${switchId}-reason` : undefined;
  // Both, in reading order: what the setting does, then why it cannot be
  // touched. `aria-describedby` takes a list, so the reason does not have to
  // displace the hint the way a single id would.
  const describedBy = [hintId, sharedId ?? reasonId].filter(Boolean).join(' ') || undefined;

  const control = (
    <button
      ref={ref}
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...rest}
      className={[
        'relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-blue-400/40',
        'disabled:cursor-not-allowed disabled:opacity-40',
        TRACK[size],
        checked ? 'bg-blue-600' : 'bg-gray-300',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block rounded-full bg-white shadow transition-transform',
          KNOB[size],
          checked ? TRAVEL[size] : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );

  // Nothing beside the control ⇒ the bare switch, byte-identical to every
  // release before these props existed. A shared reason adds no text here
  // either — the panel already carries it.
  if (!label && !hint && !showReason) return <span className={className}>{control}</span>;

  return (
    <span className={`flex items-start gap-3 ${className}`.trim()}>
      {control}
      <span className="min-w-0">
        {label && (
          <label htmlFor={switchId} className="block text-sm font-medium text-gray-800">
            {label}
          </label>
        )}
        {hint && <span id={hintId} className="mt-0.5 block text-xs text-gray-500">{hint}</span>}
        {showReason && (
          <span id={reasonId} className="mt-0.5 block text-xs text-red-600">{disabledReason}</span>
        )}
      </span>
    </span>
  );
});

export default Switch;
