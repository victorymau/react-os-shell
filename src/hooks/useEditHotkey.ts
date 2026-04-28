import { useEffect } from 'react';
import { useModalActive } from '../shell/Modal';

/**
 * Registers Alt+Shift+E (Windows) / Opt+Shift+E (Mac) hotkey to trigger an "Edit" action.
 * Uses e.code (physical key) to avoid locale/modifier character issues.
 * Only fires for the active (frontmost) modal.
 */
export default function useEditHotkey(callback: (() => void) | null) {
  const isActive = useModalActive();
  useEffect(() => {
    if (!callback || !isActive) return;
    const handler = (e: KeyboardEvent) => {
      const isE = e.code === 'KeyE' || e.key === 'E' || e.key === 'e';
      if (e.altKey && e.shiftKey && isE && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        callback();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [callback, isActive]);
}
