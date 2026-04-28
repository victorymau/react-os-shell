import { useEffect } from 'react';

/**
 * Registers Alt+Shift+N (Windows) / Opt+Shift+N (Mac) hotkey to trigger a "New" action.
 * Uses e.code (physical key) to avoid locale/modifier character issues.
 */
export default function useNewHotkey(callback: () => void) {
  useEffect(() => {
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
  }, [callback]);
}
