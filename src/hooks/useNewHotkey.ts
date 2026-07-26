import { useEffect } from 'react';
import { useModalActive } from '../shell/Modal';

/**
 * Registers Alt+Shift+N (Windows) / Opt+Shift+N (Mac) hotkey to trigger a "New" action.
 * Uses e.code (physical key) to avoid locale/modifier character issues.
 * Only fires for the active (frontmost) window, mirroring useEditHotkey — without
 * the guard every mounted window's hook answered one keypress at once, so with
 * two or more list windows open Alt+Shift+N fired "New" in all of them.
 */
export default function useNewHotkey(callback: () => void) {
  const isActive = useModalActive();
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      const isN = e.code === 'KeyN' || e.key === 'N' || e.key === 'n';
      if (e.altKey && e.shiftKey && isN && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        callback();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [callback, isActive]);
}
