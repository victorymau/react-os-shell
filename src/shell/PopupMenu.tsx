import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { glassStyle, GLASS_DIVIDER } from '../utils/glass';

/**
 * Unified popup menu component — used for all context menus, dropdowns, and flyouts.
 * Reads --menu-density CSS variable: 'tight', 'normal' (default), or 'large'.
 */

export interface PopupMenuProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClose?: () => void;
  minWidth?: number;
  /** Render into document.body instead of in place. Required when the menu
   *  is opened from INSIDE a window: the window panel is a transformed /
   *  backdrop-filtered `overflow-hidden` container, which both re-anchors
   *  `position: fixed` descendants to itself and clips them — a menu
   *  positioned at viewport coordinates ends up offset or invisible.
   *  Portaling restores true viewport positioning. */
  portal?: boolean;
}

function getDensity(): 'tight' | 'normal' | 'large' {
  return (getComputedStyle(document.documentElement).getPropertyValue('--menu-density')?.trim() as any) || 'normal';
}

/** Container for a popup menu — auto-clamps to stay within viewport */
export function PopupMenu({ children, style, className = '', onClose, minWidth = 180, portal = false }: PopupMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onClose) return;
    const handleClick = (e: PointerEvent | MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-menu-toggle]')) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('pointerdown', handleClick); window.removeEventListener('keydown', handleKey); };
  }, [onClose]);

  // After render, clamp position to viewport boundaries
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const margin = 8;
      // Clamp right edge
      if (rect.right > window.innerWidth - margin) {
        const overflow = rect.right - window.innerWidth + margin;
        if (el.style.left) {
          el.style.left = `${parseFloat(el.style.left) - overflow}px`;
        } else if (!el.style.right) {
          el.style.left = `${rect.left - overflow}px`;
        }
      }
      // Clamp left edge
      if (rect.left < margin) {
        if (el.style.left) {
          el.style.left = `${margin}px`;
        } else if (el.style.right) {
          el.style.right = `${window.innerWidth - rect.width - margin}px`;
        }
      }
      // Clamp bottom edge
      if (rect.bottom > window.innerHeight - margin) {
        const overflow = rect.bottom - window.innerHeight + margin;
        if (el.style.top) {
          el.style.top = `${parseFloat(el.style.top) - overflow}px`;
        } else if (el.style.bottom) {
          // Already anchored to bottom, just clamp
          el.style.bottom = `${margin}px`;
        } else {
          el.style.top = `${rect.top - overflow}px`;
        }
      }
      // Clamp top edge
      if (rect.top < margin) {
        if (el.style.top) {
          el.style.top = `${margin}px`;
        } else if (el.style.bottom) {
          el.style.bottom = `${window.innerHeight - rect.height - margin}px`;
        }
      }
    });
  });

  const density = getDensity();

  const menu = (
    <div ref={ref}
      className={`fixed z-[400] rounded-2xl ${density === 'tight' ? 'py-1' : density === 'large' ? 'py-2' : 'py-1.5'} ${className}`}
      style={{ minWidth, animation: 'popup-in 0.12s ease-out', ...glassStyle(), ...style }}>
      {children}
      <style>{`@keyframes popup-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );

  return portal ? createPortal(menu, document.body) : menu;
}

/** A clickable menu item */
export function PopupMenuItem({ onClick, children, className = '', danger, disabled }: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const density = getDensity();
  // Vertical gap between items. `normal` sits a little tighter than the raw
  // size padding; `large` adds a bit more room. Floored at the tight value so
  // the reduced `normal` never drops below `tight` at the smallest menu size.
  const itemPadY = density === 'tight' ? '0.25rem'
    : density === 'large' ? '0.6rem'
    : 'max(0.25rem, calc(var(--menu-padding-y, 0.5rem) - 0.1rem))';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 text-left transition-colors rounded-lg mx-auto
        ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${className}`}
      style={{
        width: 'calc(100% - 8px)',
        marginLeft: 4,
        marginRight: 4,
        fontSize: 'var(--menu-font-size, 14px)',
        paddingLeft: 'var(--menu-padding-x, 1rem)',
        paddingRight: 'var(--menu-padding-x, 1rem)',
        paddingTop: itemPadY,
        paddingBottom: itemPadY,
      }}
    >
      {children}
    </button>
  );
}

/** A divider line between menu items */
export function PopupMenuDivider() {
  const density = getDensity();
  return <div className={`border-t ${GLASS_DIVIDER} ${density === 'tight' ? 'my-0.5' : density === 'large' ? 'my-1.5' : 'my-1'} mx-3`} />;
}

/** A section header label */
export function PopupMenuLabel({ children }: { children: ReactNode }) {
  const density = getDensity();
  const labelPadY = density === 'tight' ? '0.125rem' : density === 'large' ? '0.375rem' : '0.25rem';
  return (
    <div
      className="text-[10px] font-medium text-gray-400 uppercase tracking-wider"
      style={{
        paddingLeft: 'var(--menu-padding-x, 1rem)',
        paddingRight: 'var(--menu-padding-x, 1rem)',
        paddingTop: labelPadY,
        paddingBottom: labelPadY,
      }}
    >
      {children}
    </div>
  );
}

/** An icon helper */
export function MenuIcon({ d, className = 'h-4 w-4 text-gray-400' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
