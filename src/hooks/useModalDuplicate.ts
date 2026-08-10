import { useEffect } from 'react';
import { useEnclosingModalId } from '../shell/Modal';
import { isEventForModal } from '../shell/modalEventScope';

/**
 * Registers a handler for the Alt+Shift+D "save as new / duplicate" event
 * dispatched by Modal. The callback should save the form data as a NEW record
 * (ignoring the current ID).
 *
 * Window-scoped for the same reason as {@link useModalSave}, and the stakes are
 * higher here: an unscoped duplicate created a second record from every open
 * form at once, and one consumer closes its window on success, so a background
 * window vanished as well.
 */
export default function useModalDuplicate(callback: (() => void) | null) {
  const modalId = useEnclosingModalId();
  useEffect(() => {
    if (!callback) return;
    const handler = (e: Event) => {
      if (!isEventForModal((e as CustomEvent).detail, modalId)) return;
      callback();
    };
    document.addEventListener('modal-duplicate', handler);
    return () => document.removeEventListener('modal-duplicate', handler);
  }, [callback, modalId]);
}
