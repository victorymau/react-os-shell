import { useEffect } from 'react';

/**
 * Registers a handler for the Cmd+S "save and stay" event dispatched by Modal.
 * The callback should save the form data WITHOUT closing the modal.
 */
export default function useModalSave(callback: (() => void) | null) {
  useEffect(() => {
    if (!callback) return;
    const handler = () => callback();
    document.addEventListener('modal-save', handler);
    return () => document.removeEventListener('modal-save', handler);
  }, [callback]);
}
