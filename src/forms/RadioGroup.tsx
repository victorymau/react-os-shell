/**
 * RadioGroup — one choice from a short, visible list.
 *
 * `Radio` has always been the single button; grouping them was the caller's
 * job, and the job is bigger than it looks. Every settings panel that did it by
 * hand had to remember the shared `name` (without which the buttons are not one
 * group and the arrow keys do nothing), a `role="radiogroup"` wrapper, a label
 * that names the GROUP rather than any one option, and a hint/error pair wired
 * to it. Most remembered the first and the last.
 *
 * ── What this does NOT do ──
 * Keyboard movement. The options are real `<input type="radio">` sharing one
 * `name`, which is what makes Arrow/Home/End move between them, skip the
 * disabled ones, wrap at the ends, and take the whole group out of the tab
 * order behind its selected member — all of it in the user agent, none of it
 * here. A hand-rolled roving-tabindex loop would have to `preventDefault` the
 * browser's own handling to avoid stepping twice, and would then own every one
 * of those behaviours for the rest of the component's life. See the spec for
 * what is asserted in its place and why.
 *
 * ── Why it composes `FormField` ──
 * Label, hint, error, the required asterisk and the id plumbing that points the
 * control at its own hint are already one component. Reimplementing them here
 * would be a second copy to drift — and it is the copy that went wrong in the
 * panels this replaces.
 *
 * `labelId` + `aria-labelledby` rather than `htmlFor`: a `<label for>` pointing
 * at a `<div role="radiogroup">` names nothing, because a div is not a
 * labelable element. `MediaUploadGrid` wires a group the same way, and that is
 * where the shape comes from.
 */
import { useId, type ReactNode } from 'react';

import FormField from './FormField';
import Radio from './Radio';

export type RadioGroupOrientation = 'vertical' | 'horizontal';

export interface RadioGroupOption {
  value: string;
  label: ReactNode;
  /** A second, quieter line under the label — what picking this one means. */
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** Names the GROUP. Rendered by `FormField` and pointed at by the group's
   *  `aria-labelledby`. */
  label?: ReactNode;
  /** Greyed helper text under the options. */
  hint?: ReactNode;
  /** Red error text under the options — overrides `hint`, exactly as on
   *  `FormField`. */
  error?: ReactNode;
  required?: boolean;
  /**
   * The shared `name` every option's input carries. Required, and NOT derived
   * from a generated id: this is what a native form posts under, and it is what
   * makes the browser treat the buttons as one group.
   */
  name: string;
  /** The selected option's value, or `null` for "nothing chosen yet". */
  value: string | null;
  onChange: (value: string) => void;
  options: RadioGroupOption[];
  /** Defaults to `vertical`. `horizontal` is for two or three short labels on
   *  one line; it wraps rather than compressing. */
  orientation?: RadioGroupOrientation;
  /** Disables every option. An individual option disables itself. */
  disabled?: boolean;
  className?: string;
}

const LAYOUT: Record<RadioGroupOrientation, string> = {
  vertical: 'flex flex-col gap-2',
  horizontal: 'flex flex-wrap items-start gap-x-6 gap-y-2',
};

export default function RadioGroup({
  label,
  hint,
  error,
  required,
  name,
  value,
  onChange,
  options,
  orientation = 'vertical',
  disabled = false,
  className = '',
}: RadioGroupProps) {
  const groupId = useId();
  const labelId = label ? `${groupId}-label` : undefined;

  return (
    <FormField
      label={label}
      labelId={labelId}
      htmlFor={groupId}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {/* A single element child, so FormField's clone reaches it: it is what
          adds `aria-describedby` for the hint/error and `aria-invalid` while
          an error is showing. Nothing is wired twice here. */}
      <div
        id={groupId}
        role="radiogroup"
        aria-labelledby={labelId}
        // The asterisk FormField draws is decoration; this is the half a
        // screen reader announces.
        aria-required={required || undefined}
        className={LAYOUT[orientation]}
      >
        {options.map(o => (
          <Radio
            key={o.value}
            name={name}
            value={o.value}
            checked={value === o.value}
            // Radio reports the checked state of the input that changed, and a
            // native radio only ever changes INTO checked — so there is no
            // "unselected" event to forward, and the group never emits null.
            onChange={checked => { if (checked) onChange(o.value); }}
            label={o.label}
            description={o.description}
            disabled={disabled || o.disabled}
          />
        ))}
      </div>
    </FormField>
  );
}
