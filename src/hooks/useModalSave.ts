import { useEffect } from 'react';
import { useEnclosingModalId } from '../shell/Modal';
import { isEventForModal } from '../shell/modalEventScope';

/**
 * Registers a handler for the Cmd+S "save and stay" event dispatched by Modal.
 * The callback should save the form data WITHOUT closing the modal.
 *
 * Fires ONLY for the window the keystroke was aimed at. Modal restricts the
 * dispatch to the topmost modal, but the event goes to `document`, so without
 * this match every mounted window's hook answered one keypress — and with two
 * forms open, a single Cmd+S saved both. Depending on each form's mode that
 * either PATCHed a background record or CREATEd a brand new one, each with its
 * own success toast, so the user saw the write and misread which window it came
 * from.
 *
 * The match is on the originating modal's id rather than on
 * {@link useModalActive}, which asks a different question: "is the frontmost
 * modal mine". Every nested dialog a form opens pushes itself onto the
 * activation order, so a form with a child dialog open would read as inactive
 * and Cmd+S would silently do nothing where it used to save.
 *
 * An event with no `detail.modalId` is treated as "for me", so a consumer on a
 * newer package than the shell that dispatched it keeps working exactly as
 * before rather than losing Cmd+S entirely.
 */
export default function useModalSave(callback: (() => void) | null) {
  const modalId = useEnclosingModalId();
  useEffect(() => {
    if (!callback) return;
    const handler = (e: Event) => {
      if (!isEventForModal((e as CustomEvent).detail, modalId)) return;
      callback();
    };
    document.addEventListener('modal-save', handler);
    return () => document.removeEventListener('modal-save', handler);
  }, [callback, modalId]);
}
