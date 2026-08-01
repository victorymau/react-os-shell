import { useState, useEffect, useRef } from 'react';
import { useModalActive } from '../shell/Modal';

/**
 * Keyboard + shift-click navigation for table rows.
 *
 * - J/K or Arrow keys to move focus
 * - Enter to open the focused row (calls `onSelect`)
 * - Space to toggle the focused row's checkbox (calls `onToggle`)
 * - Shift+J/K to extend selection while moving
 * - Shift+click to range-select (calls `onSelectRange`, which must ADD the range
 *   rather than toggle it — the clicked checkbox is ticked on that assumption)
 * - Cmd/Ctrl+A to select/deselect all (calls `onSelectAll`)
 *
 * Each list instance gates its document-level listeners on `useModalActive`
 * so two open lists don't both react to the same shift-click.
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
  const isActive = useModalActive();
  const isActiveRef = useRef(isActive);
  itemsRef.current = items;
  onSelectRef.current = onSelect;
  onToggleRef.current = onToggle;
  onSelectAllRef.current = onSelectAll;
  onSelectRangeRef.current = onSelectRange;
  focusRef.current = focusIdx;
  isActiveRef.current = isActive;

  const prevLen = useRef(items.length);
  useEffect(() => {
    if (items.length !== prevLen.current) {
      setFocusIdx(-1);
      lastToggledRef.current = -1;
      prevLen.current = items.length;
    }
  }, [items.length]);

  // Track normal checkbox clicks to set the anchor for Shift+click.
  // MUST be a capture-phase listener: the checkbox's own onClick calls
  // e.stopPropagation() (so toggling doesn't also open the row), and since
  // React delegates events at the root container — which sits *below*
  // document — that stopPropagation blocks any bubble-phase document listener.
  // Capture runs top-down before the event reaches the checkbox, so the anchor
  // is recorded even though bubbling is later stopped. Without this, the anchor
  // stayed -1 and "click A, Shift+click B" only toggled A and B individually
  // instead of selecting the range between them.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!isActiveRef.current) return;
      if (e.shiftKey) return;
      const target = e.target as HTMLElement;
      const row = target?.closest?.('[data-row-idx]');
      if (!row) return;
      if (target.tagName !== 'INPUT' || (target as HTMLInputElement).type !== 'checkbox') return;
      const idx = parseInt(row.getAttribute('data-row-idx')!, 10);
      if (!isNaN(idx)) {
        lastToggledRef.current = idx;
        setFocusIdx(idx);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActiveRef.current) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!isActiveRef.current) return;
      if (!e.shiftKey) return;
      const target = e.target as HTMLElement;
      const row = target?.closest?.('[data-row-idx]');
      if (!row) return;
      const clickedIdx = parseInt(row.getAttribute('data-row-idx')!, 10);
      if (isNaN(clickedIdx)) return;

      // Clicking the row's checkbox and clicking its body need different
      // handling below — the checkbox toggles itself, the body doesn't.
      const checkbox =
        target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox'
          ? (target as HTMLInputElement)
          : null;

      const anchor = lastToggledRef.current;
      if (anchor < 0) {
        // Nothing to range from — this Shift+click is just a plain tick that
        // also becomes the anchor. On the checkbox its own onClick already
        // toggles the row; toggling here too cancels out and selects nothing.
        if (checkbox) {
          lastToggledRef.current = clickedIdx;
          setFocusIdx(clickedIdx);
          return;
        }
        onToggleRef.current?.(itemsRef.current[clickedIdx]);
      } else {
        const from = Math.min(anchor, clickedIdx);
        const to = Math.max(anchor, clickedIdx);
        if (onSelectRangeRef.current) {
          onSelectRangeRef.current(from, to);
          // A range select only ever ADDS, so the clicked checkbox must end up
          // ticked. Say so directly rather than leaving it to React: the
          // browser toggled it during the click's activation behaviour, and if
          // the row was already selected the `checked` prop doesn't change, so
          // React has no reason to write the DOM back.
          if (checkbox) checkbox.checked = true;
        } else if (onToggleRef.current) {
          for (let i = from; i <= to; i++) {
            onToggleRef.current(itemsRef.current[i]);
          }
        }
      }

      // Suppress the click — but NEVER on the checkbox itself. preventDefault()
      // on a checkbox runs the browser's "canceled activation steps", which
      // restore the pre-click checkedness at the END of dispatch — after the
      // microtask in which React commits the new selection. React's write is
      // overwritten and never repeated (the prop is unchanged on later
      // renders), so the Shift+clicked row alone rendered unticked while being
      // counted as selected. stopPropagation() is enough here: it keeps both
      // the checkbox's own toggle and the row-open handler from firing. On the
      // row body preventDefault() is still wanted, to stop a Shift+click on a
      // cell link opening a new window.
      if (!checkbox) e.preventDefault();
      e.stopPropagation();
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
