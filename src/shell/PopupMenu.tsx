import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { glassStyle, GLASS_DIVIDER } from '../utils/glass';

/**
 * Unified popup menu component — used for all context menus, dropdowns, and flyouts.
 * Reads --menu-density CSS variable: 'tight' or 'normal' (default).
 */

export interface PopupMenuProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClose?: () => void;
  minWidth?: number;
}

function getDensity(): 'tight' | 'normal' {
  return (getComputedStyle(document.documentElement).getPropertyValue('--menu-density')?.trim() as any) || 'normal';
}

/** Container for a popup menu — auto-clamps to stay within viewport */
export function PopupMenu({ children, style, className = '', onClose, minWidth = 180 }: PopupMenuProps) {
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

  const tight = getDensity() === 'tight';

  return (
    <div ref={ref}
      className={`fixed z-[400] rounded-2xl ${tight ? 'py-1' : 'py-1.5'} ${className}`}
      style={{ minWidth, animation: 'popup-in 0.12s ease-out', ...glassStyle(), ...style }}>
      {children}
      <style>{`@keyframes popup-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}

/** A clickable menu item */
export function PopupMenuItem({ onClick, children, className = '', danger, disabled }: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const tight = getDensity() === 'tight';
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
        paddingTop: tight ? '0.25rem' : 'var(--menu-padding-y, 0.5rem)',
        paddingBottom: tight ? '0.25rem' : 'var(--menu-padding-y, 0.5rem)',
      }}
    >
      {children}
    </button>
  );
}

/** A divider line between menu items */
export function PopupMenuDivider() {
  const tight = getDensity() === 'tight';
  return <div className={`border-t ${GLASS_DIVIDER} ${tight ? 'my-0.5' : 'my-1'} mx-3`} />;
}

/** A section header label */
export function PopupMenuLabel({ children }: { children: ReactNode }) {
  const tight = getDensity() === 'tight';
  return (
    <div
      className="text-[10px] font-medium text-gray-400 uppercase tracking-wider"
      style={{
        paddingLeft: 'var(--menu-padding-x, 1rem)',
        paddingRight: 'var(--menu-padding-x, 1rem)',
        paddingTop: tight ? '0.125rem' : '0.25rem',
        paddingBottom: tight ? '0.125rem' : '0.25rem',
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
