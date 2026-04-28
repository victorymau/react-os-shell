import { useEffect } from 'react';

/**
 * Registers a handler for the Cmd+D "save as new / duplicate" event dispatched by Modal.
 * The callback should save the form data as a NEW record (ignoring current ID).
 */
export default function useModalDuplicate(callback: (() => void) | null) {
  useEffect(() => {
    if (!callback) return;
    const handler = () => callback();
    document.addEventListener('modal-duplicate', handler);
    return () => document.removeEventListener('modal-duplicate', handler);
  }, [callback]);
}
