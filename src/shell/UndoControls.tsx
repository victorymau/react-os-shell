import { useContext } from 'react';
import { CMD_Z, CMD_SHIFT_Z } from './Kbd';
import { UndoContext } from './undoContext';

export interface UndoControlsProps {
  /** Extra classes for the wrapping row. */
  className?: string;
  /**
   * Set by the shell on the pair it mounts itself — the window footer's, or a
   * nested provider's. A form's own `<UndoControls />` leaves it unset, and
   * stands down while a shell-mounted pair is on screen for the same stack, so
   * a form written before the shell did this shows one pair rather than two.
   */
  auto?: boolean;
}

/** Quiet by design — these sit beside the real actions and matter only in the
 *  moment after something went wrong. */
const BTN =
  'text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:hover:text-gray-500 disabled:cursor-default';

/**
 * Undo/Redo for the enclosing form, reading the stack from {@link UndoProvider}.
 *
 * The shell mounts this pair itself, in the window footer's left slot, for any
 * window whose form has registered state and whose user may edit it — a form
 * has nothing to add for the buttons to appear. Mount it by hand only for a
 * place the footer is not: a section header, a toolbar of a page with no
 * window footer. The keys work without it; this is for discoverability and for
 * the mouse. Both buttons stay rendered and go disabled, so the row does not
 * reflow the moment there is something to undo.
 *
 * Renders nothing for a user who may not edit the record — dead buttons on a
 * read-only form read as something broken rather than something withheld —
 * and nothing while the shell's own pair is showing for the same stack.
 */
export default function UndoControls({ className = '', auto = false }: UndoControlsProps) {
  const ctx = useContext(UndoContext);
  if (!ctx || !ctx.enabled) return null;
  if (!auto && ctx.autoMounted) return null;
  const { undo, redo, canUndo, canRedo, undoLabel, redoLabel } = ctx;
  return (
    <div className={`flex items-center gap-2 ${className}`} data-undo-controls={auto ? 'shell' : 'form'}>
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        title={canUndo ? `Undo ${undoLabel} (${CMD_Z})` : 'Nothing to undo'}
        className={BTN}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        title={canRedo ? `Redo ${redoLabel} (${CMD_SHIFT_Z})` : 'Nothing to redo'}
        className={BTN}
      >
        Redo
      </button>
    </div>
  );
}
