import { useState, useEffect, useRef } from 'react';

/**
 * Keyboard navigation for table rows.
 * J/K or Arrow keys to move, Enter to open, Space to toggle checkbox.
 * Shift+J/K to move and select (range select).
 * Shift+click for mouse range select.
 * Cmd+A to select/deselect all.
 */
export default function useTableNav<T>(
  items: T[],
  onSelect: (item: T) => void,
  onToggle?: (item: T) => void,
  onSelectAll?: () => void,
  onSelectRange?: (from: number, to: number) => void,
) {
  const [focusIdx, setFocusIdx] = useState(-1);
  const itemsRef = useRef(items);
  const onSelectRef = useRef(onSelect);
  const onToggleRef = useRef(onToggle);
  const onSelectAllRef = useRef(onSelectAll);
  const onSelectRangeRef = useRef(onSelectRange);
  const focusRef = useRef(focusIdx);
  const lastToggledRef = useRef(-1);
  itemsRef.current = items;
  onSelectRef.current = onSelect;
  onToggleRef.current = onToggle;
  onSelectAllRef.current = onSelectAll;
  onSelectRangeRef.current = onSelectRange;
  focusRef.current = focusIdx;

  // Reset when items length changes
  const prevLen = useRef(items.length);
  useEffect(() => {
    if (items.length !== prevLen.current) {
      setFocusIdx(-1);
      lastToggledRef.current = -1;
      prevLen.current = items.length;
    }
  }, [items.length]);

  // Track normal checkbox clicks to set the anchor for Shift+click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.shiftKey) return; // handled by shift-click handler below
      const row = (e.target as HTMLElement)?.closest?.('[data-row-idx]');
      if (!row) return;
      // Only track if clicking a checkbox or within the select column
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' || (target as HTMLInputElement).type !== 'checkbox') return;
      const idx = parseInt(row.getAttribute('data-row-idx')!, 10);
      if (!isNaN(idx)) {
        lastToggledRef.current = idx;
        setFocusIdx(idx);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (document.querySelector('[data-modal-panel]')) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        onSelectAllRef.current?.();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const len = itemsRef.current.length;
      if (len === 0) return;

      const isDown = e.code === 'KeyJ' || e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown';
      const isUp = e.code === 'KeyK' || e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp';

      if (isDown || isUp) {
        e.preventDefault();
        const prev = focusRef.current;
        const next = isDown
          ? Math.min(prev + 1, len - 1)
          : Math.max(prev - 1, 0);
        if (next !== prev) {
          setFocusIdx(next);
          scrollRowIntoView(next);
          if (e.shiftKey && onToggleRef.current) {
            onToggleRef.current(itemsRef.current[next]);
            lastToggledRef.current = next;
          }
        }
      } else if (e.key === 'Enter' && focusRef.current >= 0 && focusRef.current < len) {
        e.preventDefault();
        onSelectRef.current(itemsRef.current[focusRef.current]);
      } else if (e.key === ' ' && focusRef.current >= 0 && focusRef.current < len) {
        e.preventDefault();
        if (e.shiftKey && lastToggledRef.current >= 0 && onSelectRangeRef.current) {
          const from = Math.min(lastToggledRef.current, focusRef.current);
          const to = Math.max(lastToggledRef.current, focusRef.current);
          onSelectRangeRef.current(from, to);
        } else {
          onToggleRef.current?.(itemsRef.current[focusRef.current]);
        }
        lastToggledRef.current = focusRef.current;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Shift+click handler for mouse range select
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!e.shiftKey) return;
      const row = (e.target as HTMLElement)?.closest?.('[data-row-idx]');
      if (!row) return;
      const clickedIdx = parseInt(row.getAttribute('data-row-idx')!, 10);
      if (isNaN(clickedIdx)) return;

      const anchor = lastToggledRef.current;
      if (anchor < 0) {
        // No anchor yet — just toggle the single row
        onToggleRef.current?.(itemsRef.current[clickedIdx]);
        lastToggledRef.current = clickedIdx;
        setFocusIdx(clickedIdx);
        return;
      }

      // Range select from anchor to clicked
      e.preventDefault();
      e.stopPropagation();
      const from = Math.min(anchor, clickedIdx);
      const to = Math.max(anchor, clickedIdx);
      if (onSelectRangeRef.current) {
        onSelectRangeRef.current(from, to);
      } else if (onToggleRef.current) {
        // Fallback: toggle each
        for (let i = from; i <= to; i++) {
          onToggleRef.current(itemsRef.current[i]);
        }
      }
      lastToggledRef.current = clickedIdx;
      setFocusIdx(clickedIdx);
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  return focusIdx;
}

function scrollRowIntoView(idx: number) {
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-row-idx="${idx}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  });
}
