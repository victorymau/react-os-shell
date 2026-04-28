import { useState, useEffect } from 'react';

let _count = 0;
const _listeners = new Set<(n: number) => void>();

export function setEmailUnreadCount(n: number) {
  if (_count === n) return;
  _count = n;
  _listeners.forEach(fn => fn(n));
}

export function useEmailUnreadCount(): number {
  const [count, setCount] = useState(_count);
  useEffect(() => {
    _listeners.add(setCount);
    return () => { _listeners.delete(setCount); };
  }, []);
  return count;
}
