import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type ReactNode, type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { glassStyle, GLASS_DIVIDER } from '../utils/glass';
import { keepsNativeMenu } from './contextMenuTarget';
import { registerModalEscapeInterceptor } from './escapeInterceptors';
import { clampMenuTop, closeMenuBelow, menuPanelLeft, openMenuLevel, type MenuAnchor } from './menuPath';

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

/** Grace period before a submenu closes, so the pointer can cut the corner
 *  across sibling rows on its way into the panel. The Start menu's value. */
const SUBMENU_CLOSE_DELAY = 200;
/** How long the pointer rests on a submenu row before it opens. Short enough
 *  to feel immediate, long enough that sweeping down a menu past the row does
 *  not flash its panel open. */
const SUBMENU_OPEN_DELAY = 120;
/** Gap between a submenu and the menu it opened from. */
const SUBMENU_GAP = 4;

/**
 * What every submenu under one `PopupMenu` shares.
 *
 * The open submenus are ONE path for the whole tree — the same state machine
 * the Start menu runs (`menuPath.ts`): `path[d]` is the submenu open from a row
 * in panel `d`, and there is one close timer. That is what makes sibling
 * submenus exclusive, and it is what stops a stale timer from a row the
 * pointer merely passed over from closing a submenu that has since opened —
 * the bug the Start menu had while it ran a timer per level.
 */
interface MenuTree {
  /** Marks every panel of this tree, so a click inside a portalled submenu is
   *  not "outside" the menu. */
  id: string;
  /** 0 for rows in the root menu, 1 inside its submenu, and so on. */
  depth: number;
  path: MenuAnchor[];
  open: (depth: number, anchor: MenuAnchor) => void;
  /** Close the submenus under panel `depth`, after the grace period. */
  scheduleClose: (depth: number) => void;
  /** Close the submenus under panel `depth` now. */
  closeBelow: (depth: number) => void;
  cancelClose: () => void;
  /** Close every panel — an item inside a submenu was chosen. */
  closeTree: () => void;
  /** The root panel, for measuring what it is layered at. */
  root: React.RefObject<HTMLDivElement | null>;
}

const MenuTreeContext = createContext<MenuTree | null>(null);

/** Container for a popup menu — auto-clamps to stay within viewport */
export function PopupMenu({ children, style, className = '', onClose, minWidth = 180, portal = false }: PopupMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const treeId = useId();
  const [path, setPath] = useState<MenuAnchor[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const tree = useMemo<MenuTree>(() => {
    const cancelClose = () => clearTimeout(closeTimer.current);
    return {
      id: treeId,
      depth: 0,
      path,
      open: (depth, anchor) => { cancelClose(); setPath(prev => openMenuLevel(prev, depth, anchor)); },
      scheduleClose: depth => {
        cancelClose();
        closeTimer.current = setTimeout(() => setPath(prev => closeMenuBelow(prev, depth)), SUBMENU_CLOSE_DELAY);
      },
      closeBelow: depth => { cancelClose(); setPath(prev => closeMenuBelow(prev, depth)); },
      cancelClose,
      closeTree: () => { cancelClose(); setPath([]); onClose?.(); },
      root: ref,
    };
  }, [treeId, path, onClose]);

  useEffect(() => {
    if (!onClose) return;
    const handleClick = (e: PointerEvent | MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-menu-toggle]')) return;
      // A submenu is portalled to <body>, so it is outside `ref` in the DOM
      // while still being part of this menu.
      if ((e.target as HTMLElement).closest?.(`[data-popup-menu-tree="${treeId}"]`)) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('pointerdown', handleClick); window.removeEventListener('keydown', handleKey); };
  }, [onClose, treeId]);

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

  // A right-click on an open menu is not a request for another menu. Claiming
  // it stops the shell-wide `ShellContextMenu` (which stands down on a
  // prevented event) and the browser's from opening on top of this one. A text
  // field inside a menu still keeps the browser's, as it does everywhere else.
  const menu = (
    <div ref={ref}
      data-popup-menu-tree={treeId}
      className={`fixed z-[400] rounded-2xl ${density === 'tight' ? 'py-1' : density === 'large' ? 'py-2' : 'py-1.5'} ${className}`}
      onContextMenu={e => { if (!keepsNativeMenu(e.target)) e.preventDefault(); }}
      style={{ minWidth, animation: 'popup-in 0.12s ease-out', ...glassStyle(), ...style }}>
      <MenuTreeContext.Provider value={tree}>{children}</MenuTreeContext.Provider>
      <style>{`@keyframes popup-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );

  return portal ? createPortal(menu, document.body) : menu;
}

/** A clickable menu item */
export interface PopupMenuItemProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
  /**
   * The menu semantics, when this item is part of one.
   *
   * A context menu on the desktop is a list of buttons and needs none of this;
   * a dropdown attached to a trigger is a `menu` whose items are `menuitem`s
   * with one tab stop between them. Both draw the same item, so the styling
   * lives here rather than being copied into whichever one is newer.
   */
  role?: 'menuitem';
  tabIndex?: number;
  id?: string;
  onMouseEnter?: () => void;
}

/**
 * `forwardRef`, not a `ref` prop.
 *
 * Taking `ref` as an ordinary prop is React 19 only. This package's peer range
 * is `react: ">=18"`, and React 18 strips `ref` from a function component's
 * props and warns — so on an 18 consumer the ref would silently never attach,
 * `DropdownMenu`'s `itemRefs` would all be null, and its arrow keys would move
 * `tabIndex` while DOM focus stayed put. A keyboard-dead menu with no error.
 */
/** The row look shared by an item and a submenu's row. */
function itemLook(danger: boolean | undefined, disabled: boolean | undefined, className: string, highlighted = false) {
  const density = getDensity();
  // Vertical gap between items. `normal` sits a little tighter than the raw
  // size padding; `large` adds a bit more room. Floored at the tight value so
  // the reduced `normal` never drops below `tight` at the smallest menu size.
  const itemPadY = density === 'tight' ? '0.25rem'
    : density === 'large' ? '0.6rem'
    : 'max(0.25rem, calc(var(--menu-padding-y, 0.5rem) - 0.1rem))';
  const tone = danger ? 'text-red-600 hover:bg-red-50'
    : highlighted ? 'bg-blue-50 text-blue-700'
    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700';
  return {
    className: `w-full flex items-center gap-2 text-left transition-colors rounded-lg mx-auto
        ${tone}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        ${className}`,
    style: {
        width: 'calc(100% - 8px)',
        marginLeft: 4,
        marginRight: 4,
        fontSize: 'var(--menu-font-size, 14px)',
        paddingLeft: 'var(--menu-padding-x, 1rem)',
        paddingRight: 'var(--menu-padding-x, 1rem)',
        paddingTop: itemPadY,
        paddingBottom: itemPadY,
      } satisfies CSSProperties,
  };
}

export const PopupMenuItem = forwardRef<HTMLButtonElement, PopupMenuItemProps>(function PopupMenuItem({
  onClick, children, className = '', danger, disabled,
  role, tabIndex, id, onMouseEnter,
}, ref) {
  const tree = useContext(MenuTreeContext);
  const look = itemLook(danger, disabled, className);
  return (
    <button
      ref={ref}
      id={id}
      role={role}
      tabIndex={tabIndex}
      onClick={() => {
        onClick?.();
        // Inside a submenu, choosing an item is the end of the whole menu —
        // not just the panel it sat in. A root item keeps its old contract:
        // the caller's own onClick decides.
        if (tree && tree.depth > 0) tree.closeTree();
      }}
      onMouseEnter={() => {
        // Resting on a plain row retires any submenu open beside it, after the
        // same grace the Start menu gives.
        tree?.scheduleClose(tree.depth);
        onMouseEnter?.();
      }}
      disabled={disabled}
      className={look.className}
      style={look.style}
    >
      {children}
    </button>
  );
});

export interface PopupSubmenuProps {
  /** The row's text. */
  label: ReactNode;
  /** Drawn before the label, as in a `PopupMenuItem`. */
  icon?: ReactNode;
  /** The submenu's contents — `PopupMenuItem`, `PopupMenuLabel`,
   *  `PopupMenuDivider`, or another `PopupSubmenu`. */
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  /** The submenu panel's minimum width. */
  minWidth?: number;
  /** The tallest the panel may grow before its items scroll — a long target
   *  list, say `'min(60vh, 420px)'`. Never taller than the viewport less its
   *  8px gutters, whatever is passed. */
  maxHeight?: number | string;
}

const chevron = (
  <svg aria-hidden className="h-3.5 w-3.5 shrink-0 ml-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

/** The z-index a panel must beat: the outermost stacking level `el` sits in
 *  at <body>, since a portalled submenu is compared against that, not against
 *  whatever the root menu is nested inside. */
function layerOf(el: HTMLElement | null): number {
  let z = 400;
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const value = parseInt(getComputedStyle(node).zIndex, 10);
    if (!Number.isNaN(value)) z = value;
  }
  return z;
}

/** Enabled items of a panel, in order — what the arrow keys walk. */
function focusables(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return [...panel.querySelectorAll<HTMLElement>('button:not([disabled])')]
    .filter(b => b.closest('[data-popup-submenu-panel]') === panel);
}

/**
 * A row in a `PopupMenu` that opens a nested menu.
 *
 * Opens on hover after a short rest, and at once on click, Enter, Space or
 * ArrowRight (which also move focus to its first item). ArrowLeft and Escape
 * close it and give focus back to the row. It opens to the right of the menu,
 * or to the left when there is no room, and moves up when it would run off the
 * bottom — the Start menu's placement rules, from `menuPath.ts`. Choosing an
 * item inside closes the whole menu (the root `PopupMenu`'s `onClose`).
 */
export function PopupSubmenu({ label, icon, children, disabled, className = '', minWidth = 180, maxHeight }: PopupSubmenuProps) {
  const tree = useContext(MenuTreeContext);
  const key = useId();
  const rowRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  /** Whether the current opening came from the keyboard — then focus moves in. */
  const focusOnOpen = useRef(false);
  const panelId = `${key}-menu`;
  useEffect(() => () => clearTimeout(openTimer.current), []);

  const depth = tree?.depth ?? 0;
  const anchor = tree?.path[depth];
  const isOpen = !!anchor && anchor.key === key && !disabled;

  const openNow = useCallback((withFocus: boolean) => {
    if (!tree || disabled || !rowRef.current) return;
    clearTimeout(openTimer.current);
    focusOnOpen.current = withFocus;
    const row = rowRef.current.getBoundingClientRect();
    const owner = (rowRef.current.closest('[data-popup-submenu-panel]')
      ?? rowRef.current.closest('[data-popup-menu-tree]')) as HTMLElement | null;
    const ownerRect = owner?.getBoundingClientRect() ?? row;
    const preferLeft = depth > 0 && (tree.path[depth - 1]?.flipped ?? false);
    const place = menuPanelLeft(ownerRect.left, ownerRect.right, minWidth, window.innerWidth, SUBMENU_GAP, preferLeft);
    tree.open(depth, { key, y: row.top, ...place });
  }, [tree, disabled, depth, key, minWidth]);

  const closeSelf = (restoreFocus: boolean) => {
    tree?.closeBelow(depth);
    if (restoreFocus) rowRef.current?.focus();
  };

  // Escape through the shell's interceptor seam: inside a window, `Modal`
  // takes Escape in the capture phase and would close the whole window. The
  // deepest open submenu registered last, so it is asked first.
  useEffect(() => {
    if (!isOpen) return;
    return registerModalEscapeInterceptor(e => {
      if (e.key !== 'Escape') return false;
      closeSelf(true);
      return true;
    });
  });

  // Place the panel against its real size before paint — the estimate used
  // `minWidth` and the row's top — then move focus in if a key opened it.
  useLayoutEffect(() => {
    if (!isOpen || !anchor) return;
    const place = () => {
      const panel = panelRef.current;
      if (!panel || !rowRef.current) return;
      const margin = 8;
      const owner = (rowRef.current.closest('[data-popup-submenu-panel]')
        ?? rowRef.current.closest('[data-popup-menu-tree]')) as HTMLElement | null;
      const ownerRect = owner?.getBoundingClientRect() ?? rowRef.current.getBoundingClientRect();
      const preferLeft = depth > 0 && (tree?.path[depth - 1]?.flipped ?? false);
      const width = panel.offsetWidth || minWidth;
      const spot = menuPanelLeft(ownerRect.left, ownerRect.right, width, window.innerWidth, SUBMENU_GAP, preferLeft, margin);
      const height = panel.offsetHeight;
      // Top-aligned with the row: centring the clamp on `row top + half the
      // panel` gives exactly that, and still moves the panel up at the bottom.
      const rowTop = rowRef.current.getBoundingClientRect().top;
      const top = clampMenuTop(rowTop + height / 2, height, margin, window.innerHeight - margin);
      panel.style.left = `${spot.left}px`;
      panel.style.top = `${top}px`;
      panel.dataset.flipped = String(spot.flipped);
    };
    place();
    // Again after the root menu's own viewport clamp, which runs in a frame
    // AFTER this effect: on a re-render it can still move the root a few
    // pixels, and the submenu has to follow the menu it hangs off.
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(place); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  });

  useEffect(() => {
    if (!isOpen || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    focusables(panelRef.current)[0]?.focus();
  }, [isOpen]);

  const childTree = useMemo<MenuTree | null>(() => tree && { ...tree, depth: depth + 1 }, [tree, depth]);

  if (!tree) throw new Error('PopupSubmenu must be rendered inside a PopupMenu');

  const onRowKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      openNow(true);
    }
  };

  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // React bubbles through portals, so a key pressed in a deeper submenu
    // reaches this handler too. That panel handled it already.
    if ((e.target as HTMLElement).closest('[data-popup-submenu-panel]') !== e.currentTarget) return;
    const items = focusables(panelRef.current);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => { e.preventDefault(); e.stopPropagation(); items[(to + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(items.length - 1);
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); closeSelf(true); }
  };

  const look = itemLook(false, disabled, className, isOpen);
  const density = getDensity();

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        disabled={disabled}
        data-popup-submenu-row
        className={look.className}
        style={look.style}
        onClick={e => {
          // `detail` is 0 for a click the keyboard made (Enter, Space).
          const byKey = e.detail === 0;
          if (!isOpen) openNow(byKey);
          else if (byKey) focusables(panelRef.current)[0]?.focus();
        }}
        onKeyDown={onRowKeyDown}
        onMouseEnter={() => {
          if (disabled) return;
          tree.cancelClose();
          if (isOpen) { tree.closeBelow(depth + 1); return; }
          clearTimeout(openTimer.current);
          openTimer.current = setTimeout(() => openNow(false), SUBMENU_OPEN_DELAY);
        }}
        onMouseLeave={() => {
          clearTimeout(openTimer.current);
          tree.scheduleClose(depth);
        }}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {chevron}
      </button>
      {isOpen && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          data-popup-menu-tree={tree.id}
          data-popup-submenu-panel
          className={`fixed rounded-2xl overflow-x-hidden overflow-y-auto overscroll-contain ${density === 'tight' ? 'py-1' : density === 'large' ? 'py-2' : 'py-1.5'}`}
          style={{
            left: anchor!.left, top: anchor!.y, minWidth,
            // The viewport cap always applies, so a long list scrolls rather
            // than running off the screen even when no maxHeight is passed.
            maxHeight: maxHeight === undefined
              ? 'calc(100vh - 16px)'
              : `min(${typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight}, calc(100vh - 16px))`,
            zIndex: layerOf(tree.root.current) + depth + 1,
            animation: `${anchor!.flipped ? 'popup-submenu-in-left' : 'popup-submenu-in'} 0.1s ease-out`,
            ...glassStyle(),
          }}
          onKeyDown={onPanelKeyDown}
          onMouseEnter={() => { tree.cancelClose(); clearTimeout(openTimer.current); }}
          onMouseLeave={() => tree.scheduleClose(depth + 1)}
          onContextMenu={e => { if (!keepsNativeMenu(e.target)) e.preventDefault(); }}
        >
          <MenuTreeContext.Provider value={childTree}>{children}</MenuTreeContext.Provider>
          <style>{`@keyframes popup-submenu-in { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: translateX(0); } }
@keyframes popup-submenu-in-left { from { opacity: 0; transform: translateX(4px); } to { opacity: 1; transform: translateX(0); } }`}</style>
        </div>,
        document.body,
      )}
    </>
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
