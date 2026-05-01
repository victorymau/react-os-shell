/**
 * Module-level state shared by all <Modal> instances on mobile during a
 * swipe-to-back gesture. The swiping window publishes its parent windowKey
 * here when the gesture starts; the parent Modal reads it (via
 * `useSyncExternalStore`) and renders itself visible underneath the sliding
 * panel even though it isn't the active window. When the gesture ends or
 * cancels, the parent key is cleared and the parent goes back to hidden.
 */

let _parentKey: string | null = null;
const subs = new Set<() => void>();

export function getSwipingParentKey(): string | null {
  return _parentKey;
}

export function setSwipingParentKey(key: string | null): void {
  if (_parentKey === key) return;
  _parentKey = key;
  for (const cb of subs) cb();
}

export function subscribeSwipingParentKey(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}
