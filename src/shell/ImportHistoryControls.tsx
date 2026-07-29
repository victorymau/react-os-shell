import { useEffect, useRef } from 'react';
import { confirm } from './ConfirmDialog';
import { useModalActive } from './Modal';
import { CMD_Z, CMD_SHIFT_Z } from './Kbd';
import { matchImportHotkey } from '../hooks/useImportHistory';
import type { ImportHistory, ImportHotkeyEvent } from '../hooks/useImportHistory';

export interface ImportHistoryControlsProps<T> {
  /** The history returned by `useImportHistory`. */
  history: ImportHistory<T>;
  /** Extra classes for the wrapping row. */
  className?: string;
  /** Bind ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y). Default true. Turn off
   *  for a second list on the same screen, so one pair owns the keys. */
  hotkeys?: boolean;
}

/** Quiet by design — these sit in a table header next to the real actions, and
 *  matter only in the moment after an import lands wrong. */
const BTN =
  'text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:hover:text-gray-500 disabled:cursor-default';

/**
 * Undo/Redo for the newest bulk import, paired with {@link useImportHistory}.
 *
 * Drop it into the header of the list the import lands in — not into
 * `BulkImportGrid`, which unmounts on import and takes any control inside it
 * along. Both buttons stay rendered and go disabled, so the header does not
 * reflow the moment an import arrives.
 *
 * Undoing after the list was edited also discards those edits, since the
 * snapshot predates them; that case asks first.
 */
export default function ImportHistoryControls<T>({
  history,
  className = '',
  hotkeys = true,
}: ImportHistoryControlsProps<T>) {
  const { undo, redo, canUndo, canRedo, undoLabel, redoLabel, hasLaterEdits } = history;

  const handleUndo = async () => {
    if (!canUndo) return;
    if (hasLaterEdits) {
      const ok = await confirm({
        title: 'Undo import',
        message: `This takes the list back to before the ${undoLabel}. Changes made since will be discarded.`,
        confirmLabel: 'Undo import',
        variant: 'warning',
      });
      if (!ok) return;
    }
    undo();
  };

  // Read through a ref so the listener is bound once, rather than rebinding on
  // every keystroke in the table below it.
  const actions = useRef({ handleUndo, redo, canUndo, canRedo });
  actions.current = { handleUndo, redo, canUndo, canRedo };

  const isActive = useModalActive();
  useEffect(() => {
    if (!hotkeys || !isActive) return;
    const handler = (e: KeyboardEvent) => {
      const action = matchImportHotkey(e as unknown as ImportHotkeyEvent);
      if (!action) return;
      const { handleUndo, redo, canUndo, canRedo } = actions.current;
      // Nothing to step to — leave the key to whatever else wants it rather
      // than swallowing it into a no-op.
      if (action === 'undo' ? !canUndo : !canRedo) return;
      e.preventDefault();
      if (action === 'undo') void handleUndo(); else redo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkeys, isActive]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleUndo}
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
