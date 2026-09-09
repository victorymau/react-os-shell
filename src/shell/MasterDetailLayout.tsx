import { useEffect, useRef, useState, type ReactNode } from 'react';
import Button from '../forms/Button';
import SidebarLayout, { type SidebarLayoutProps } from './SidebarLayout';

export interface MasterDetailLayoutProps extends Pick<SidebarLayoutProps,
  'defaultWidth' | 'minWidth' | 'maxWidth' | 'storageKey' | 'className' | 'contentClassName' | 'resizeLabel'> {
  list: ReactNode;
  children: ReactNode;
  /** Controlled selection: false shows the list in compact containers. */
  selected: boolean;
  onBack: () => void;
  backLabel?: string;
  listLabel?: string;
  detailLabel?: string;
  listClassName?: string;
  /** Available container width below which only the active pane is shown. Default 720px. */
  compactBreakpoint?: number;
}

/** A responsive list/detail composition. Selection and data remain caller-owned. */
export default function MasterDetailLayout({
  list, children, selected, onBack,
  backLabel = 'Back to list', listLabel = 'List', detailLabel = 'Details',
  compactBreakpoint = 720, listClassName, className = '', ...layoutProps
}: MasterDetailLayoutProps) {
  const container = useRef<HTMLDivElement>(null);
  const listPane = useRef<HTMLDivElement>(null);
  const detailPane = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const lastListFocus = useRef<HTMLElement | null>(null);
  const previous = useRef({ selected, compact: false });
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = (width: number) => {
      // A hidden shell window has no width; retain its last usable layout.
      if (width > 0) setCompact(width < compactBreakpoint);
    };
    measure(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => measure(element.getBoundingClientRect().width);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) if (entry.target === element) measure(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [compactBreakpoint]);

  useEffect(() => {
    const before = previous.current;
    const focus = document.activeElement;
    if (compact && selected && (!before.selected || (!before.compact && listPane.current?.contains(focus)))) {
      backButton.current?.focus({ preventScroll: true });
    } else if (!selected && ((before.selected && (compact || detailPane.current?.contains(focus)))
      || (compact && !before.compact && detailPane.current?.contains(focus)))) {
      const target = lastListFocus.current;
      if (target?.isConnected && listPane.current?.contains(target) && !target.closest('[hidden], [disabled]')) {
        target.focus({ preventScroll: true });
      } else {
        listPane.current?.focus({ preventScroll: true });
      }
    } else if (!compact && before.compact && focus === backButton.current) {
      detailPane.current?.focus({ preventScroll: true });
    }
    previous.current = { selected, compact };
  }, [selected, compact]);

  return (
    <div ref={container} className={`h-full min-h-0 w-full min-w-0 ${className}`}>
      <SidebarLayout {...layoutProps}
        activePane={compact ? (selected ? 'content' : 'sidebar') : 'both'}
        sidebarClassName={listClassName}
        sidebar={
          <div ref={listPane} role="region" aria-label={listLabel} tabIndex={-1}
            className="flex min-h-0 flex-1 flex-col"
            onFocusCapture={event => { lastListFocus.current = event.target; }}>
            {list}
          </div>
        }>
        <div ref={detailPane} role="region" aria-label={detailLabel} tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col">
          <div hidden={!compact || !selected} style={{ display: compact && selected ? undefined : 'none' }}
            className="shrink-0 border-b border-gray-200 px-2 py-1">
            <Button ref={backButton} variant="ghost" size="touch-sm" onClick={onBack}>{backLabel}</Button>
          </div>
          {children}
        </div>
      </SidebarLayout>
    </div>
  );
}
