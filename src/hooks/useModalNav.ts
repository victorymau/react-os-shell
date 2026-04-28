import { useCallback, useMemo } from 'react';

/**
 * Returns onNext/onPrev callbacks for Modal J/K navigation.
 * Pass the visible list, the current detail item, and its setter.
 */
export default function useModalNav<T extends { id: string }>(
  items: T[],
  detail: T | null,
  setDetail: (item: T) => void,
): { onNext?: () => void; onPrev?: () => void } {
  const idx = useMemo(
    () => (detail ? items.findIndex(i => i.id === detail.id) : -1),
    [items, detail],
  );

  const onNext = useCallback(() => {
    if (idx >= 0 && idx < items.length - 1) setDetail(items[idx + 1]);
  }, [idx, items, setDetail]);

  const onPrev = useCallback(() => {
    if (idx > 0) setDetail(items[idx - 1]);
  }, [idx, items, setDetail]);

  if (!detail || items.length === 0) return {};
  return { onNext: idx < items.length - 1 ? onNext : undefined, onPrev: idx > 0 ? onPrev : undefined };
}
