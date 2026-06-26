/**
 * Accordion — collapsible sections. Uncontrolled by default (seed with
 * `defaultOpenIds`); pass `openIds` + `onOpenChange` to drive it. `allowMultiple`
 * lets more than one section stay open at once.
 */
import { useState, type ReactNode } from 'react';

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  defaultOpenIds?: string[];
  /** Controlled open set — when provided, the component stops tracking its own. */
  openIds?: string[];
  onOpenChange?: (ids: string[]) => void;
  allowMultiple?: boolean;
  className?: string;
}

export default function Accordion({
  items, defaultOpenIds = [], openIds, onOpenChange, allowMultiple = false, className = '',
}: AccordionProps) {
  const [internal, setInternal] = useState<string[]>(defaultOpenIds);
  const open = openIds ?? internal;

  const toggle = (id: string) => {
    const isOpen = open.includes(id);
    const next = isOpen ? open.filter(x => x !== id) : allowMultiple ? [...open, id] : [id];
    if (openIds === undefined) setInternal(next);
    onOpenChange?.(next);
  };

  return (
    <div className={`divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 ${className}`.trim()}>
      {items.map(item => {
        const isOpen = open.includes(item.id);
        return (
          <div key={item.id}>
            <button
              type="button"
              disabled={item.disabled}
              aria-expanded={isOpen}
              onClick={() => toggle(item.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{item.title}</span>
              <svg
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
              >
                <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && <div className="px-4 pb-3 text-sm text-gray-600">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
}
