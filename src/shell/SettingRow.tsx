/**
 * SettingRow — one setting: its name and its current value on one baseline,
 * with the explanation at full width beneath.
 *
 * ── Why this is not `DescriptionList` ──
 * `DescriptionList` is the detail panel of a RECORD — an invoice header, a
 * shipment's dates. It renders `<dl>/<dt>/<dd>`, which claims that the value
 * defines the label, and it stacks the value UNDER the label inside a column
 * of a responsive grid. Both are right there and wrong here.
 *
 * A settings panel is not a record. Its value is frequently a CONTROL, and a
 * `<dd>` holding a switch tells a screen reader that the switch is the
 * definition of the term above it. Its rows have a third part — the sentence
 * explaining what the setting does — that `DescriptionItem` has nowhere to put,
 * so consumers end up appending it to the value and it inherits the value's
 * ink and the value's column. And that column is the actual failure this
 * component replaces: a fixed narrow description column folds a short badge
 * onto three lines while the other half of the row sits empty.
 *
 * So the shape is inverted. The name and the value share ONE line and sit at
 * opposite ends of it, the value never shrinks (`shrink-0`) and wraps to its
 * own line rather than being crushed, and the explanation runs the full width
 * beneath both in a smaller, quieter voice. Nothing here is a grid, because a
 * grid is what forced the badge into three lines.
 *
 * Four kinds of value, because a settings panel has four:
 *   a control       pass it as `value`, and `controlId` so the name labels it
 *   a read-only fact  pass the text
 *   not known       pass `null` — rendered as an em dash in the faint ink,
 *                   never as an empty cell and never as "off"
 *   nothing can write it yet   `quiet` — the row is legible and inert
 */
import { type ReactNode } from 'react';

export interface SettingRowProps {
  /** What the setting is called. */
  name: ReactNode;
  /**
   * Its current value: a control, a read-only fact, or `null`/`undefined`/`''`
   * for a value nobody knows. The unknown case renders `unknownText` in the
   * faint ink — an absent value and a value of "off" are different answers and
   * must not look the same.
   */
  value?: ReactNode;
  /** What the setting does, at full width under the pair, in a smaller voice. */
  description?: ReactNode;
  /**
   * The id of the control passed as `value`. Given it, the name renders as a
   * `<label htmlFor>` so clicking the name reaches the control and a screen
   * reader announces the two together. Omit it for a read-only row — a label
   * pointing at nothing is worse than no label.
   */
  controlId?: string;
  /** Shown in place of a value that is `null`, `undefined` or `''`. */
  unknownText?: ReactNode;
  /**
   * The setting is real but nothing can write it yet — a capability the
   * backend has not shipped, a field this tenant does not own.
   *
   * Drops the name and value one step down the ink ramp rather than reaching
   * for `opacity`: opacity multiplies against whatever is behind the row, so a
   * measured contrast stops being a measured contrast the moment the row is
   * hovered. The row stays fully legible; it just stops asking to be read
   * first. It is not `disabled` — there is no control here to disable, and a
   * read-only row that announced itself as disabled would be a lie.
   */
  quiet?: boolean;
  className?: string;
}

export default function SettingRow({
  name,
  value,
  description,
  controlId,
  unknownText = '—',
  quiet = false,
  className = '',
}: SettingRowProps) {
  const unknown = value === null || value === undefined || value === '';
  const nameInk = quiet ? 'text-gray-500' : 'text-gray-800';
  // Three inks, three facts: a known value, a value nobody knows, and a row
  // nothing can write.
  const valueInk = unknown ? 'text-gray-400' : quiet ? 'text-gray-500' : 'text-gray-900';

  return (
    <div className={className}>
      {/* justify-between, not a grid: the value takes exactly the width it
          needs and the gap absorbs the rest. flex-wrap is the escape — a long
          name and a long value drop onto two lines instead of the value being
          squeezed into a column that folds a six-character badge. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {controlId ? (
          <label htmlFor={controlId} className={`min-w-0 text-sm font-medium ${nameInk}`}>
            {name}
          </label>
        ) : (
          <span className={`min-w-0 text-sm font-medium ${nameInk}`}>{name}</span>
        )}
        <span className={`shrink-0 text-sm ${valueInk}`}>{unknown ? unknownText : value}</span>
      </div>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>
      )}
    </div>
  );
}
