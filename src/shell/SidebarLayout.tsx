import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react';

/**
 * Two-pane layout with a drag-to-resize left sidebar.
 *
 * Renders flush (`h-full w-full`) — pair it with a `flushBody` window so the
 * sidebar runs from just under the title bar to the very bottom with no
 * surrounding padding. The user can drag the right edge of the sidebar to
 * resize it; pass `storageKey` to persist that width across reopens, or
 * double-click the handle to reset to `defaultWidth`.
 *
 * @example
 * <SidebarLayout sidebar={<MyNav />} storageKey="todo.sidebarWidth">
 *   <MyContent />
 * </SidebarLayout>
 */
export interface SidebarLayoutProps {
  /** Content of the left sidebar pane. */
  sidebar: ReactNode;
  /** Content of the main pane (right of the sidebar). */
  children: ReactNode;
  /** localStorage key to persist the sidebar width across reopens. When set,
   *  the last dragged width is restored on mount. Omit for session-only width. */
  storageKey?: string;
  /** Initial sidebar width in px (used when nothing is persisted). Default 256. */
  defaultWidth?: number;
  /** Minimum sidebar width in px. Default 180. */
  minWidth?: number;
  /** Maximum sidebar width in px. Default 480. */
  maxWidth?: number;
  /** Extra classes for the outer flex row. */
  className?: string;
  /** Classes for the sidebar pane (background, border, …). The pane is a flex
   *  column that scrolls its own overflow. Defaults to a light-grey,
   *  right-bordered sidebar. */
  sidebarClassName?: string;
  /** Classes for the main content pane. Defaults to a white background. */
  contentClassName?: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export default function SidebarLayout({
  sidebar,
  children,
  storageKey,
  defaultWidth = 256,
  minWidth = 180,
  maxWidth = 480,
  className = '',
  sidebarClassName = 'border-r border-gray-200 bg-gray-50',
  contentClassName = 'bg-white',
}: SidebarLayoutProps) {
  const [width, setWidth] = useState<number>(() => {
    if (storageKey && typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(storageKey);
      const n = saved ? parseInt(saved, 10) : NaN;
      if (!Number.isNaN(n)) return clamp(n, minWidth, maxWidth);
    }
    return clamp(defaultWidth, minWidth, maxWidth);
  });

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setWidth(clamp(d.startWidth + (e.clientX - d.startX), minWidth, maxWidth));
  }, [minWidth, maxWidth]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  }, [onMove]);

  const startDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width, onMove, onUp]);

  // Persist (debounced) once the width settles.
  useEffect(() => {
    if (!storageKey) return;
    const id = window.setTimeout(() => {
      try { window.localStorage.setItem(storageKey, String(Math.round(width))); } catch { /* ignore quota / privacy mode */ }
    }, 200);
    return () => window.clearTimeout(id);
  }, [width, storageKey]);

  // Drop listeners if we unmount mid-drag.
  useEffect(() => () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove, onUp]);

  return (
    <div className={`flex h-full w-full overflow-hidden ${className}`}>
      <div className="relative flex h-full shrink-0 flex-col" style={{ width }}>
        <div className={`flex h-full flex-col overflow-y-auto ${sidebarClassName}`}>
          {sidebar}
        </div>
        {/* Resize handle — pinned to the right edge, fixed while the pane scrolls. */}
        <div
          onPointerDown={startDrag}
          onDoubleClick={() => setWidth(clamp(defaultWidth, minWidth, maxWidth))}
          title="Drag to resize · double-click to reset"
          className="group absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize"
        >
          <div className="absolute inset-y-0 right-0 w-px bg-transparent transition-colors group-hover:bg-blue-400" />
        </div>
      </div>
      <div className={`flex min-w-0 flex-1 flex-col ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}
