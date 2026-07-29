import { CMD_Z, CMD_SHIFT_Z } from './Kbd';
import { useUndo } from './UndoProvider';

export interface UndoControlsProps {
  /** Extra classes for the wrapping row. */
  className?: string;
}

/** Quiet by design — these sit beside the real actions and matter only in the
 *  moment after something went wrong. */
const BTN =
  'text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:hover:text-gray-500 disabled:cursor-default';

/**
 * Undo/Redo for the enclosing form, reading the stack from {@link UndoProvider}.
 *
 * Put it wherever the form's actions live — a window header, a section header,
 * beside the save button. The keys work without it; this is for discoverability
 * and for the mouse. Both buttons stay rendered and go disabled, so the row
 * does not reflow the moment there is something to undo.
 *
 * Renders nothing for a user who may not edit the record — dead buttons on a
 * read-only form read as something broken rather than something withheld.
 */
export default function UndoControls({ className = '' }: UndoControlsProps) {
  const { undo, redo, canUndo, canRedo, undoLabel, redoLabel, enabled } = useUndo();

  if (!enabled) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
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
