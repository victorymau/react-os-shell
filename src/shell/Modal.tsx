import { useEffect, useCallback, useRef, useState, createContext, useContext, useSyncExternalStore, cloneElement, isValidElement } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { confirm } from './ConfirmDialog';
import { useWindowManager } from './WindowManager';
import { glassStyle as getGlassStyle } from '../utils/glass';
import { PopupMenu, PopupMenuItem, PopupMenuDivider } from './PopupMenu';
import { useIsMobile } from './useIsMobile';
import { getSwipingParentKey, setSwipingParentKey, subscribeSwipingParentKey } from './mobileSwipeStore';

/** Context that passes the modal's unique ID to children */
const ModalIdContext = createContext<string>('');

/** Hook for widget components to register a settings handler for the right-click menu. */
export function useWidgetSettings(handler: () => void) {
  const id = useContext(ModalIdContext);
  useEffect(() => {
    if (!id) return;
    const listener = (e: Event) => { if ((e as CustomEvent).detail === id) handler(); };
    window.addEventListener('widget-open-settings', listener);
    return () => window.removeEventListener('widget-open-settings', listener);
  }, [handler, id]);
}

/** Registry for extra window menu items added by child components */
const _extraMenuItems: Record<string, { label: string; icon?: React.ReactNode; onClick: () => void }[]> = {};

/** Hook to add custom items to the window title menu from inside a modal */
export function useWindowMenuItem(label: string, onClick: () => void, icon?: React.ReactNode) {
  const id = useContext(ModalIdContext);
  useEffect(() => {
    if (!id) return;
    if (!_extraMenuItems[id]) _extraMenuItems[id] = [];
    const item = { label, icon, onClick };
    _extraMenuItems[id].push(item);
    return () => { _extraMenuItems[id] = (_extraMenuItems[id] || []).filter(i => i !== item); };
  }, [id, label, onClick, icon]);
}

/** Component that updates the surrounding window's title bar. Render anywhere
 *  inside a Modal-rendered page. Cross-bundle safe (uses DOM traversal rather
 *  than React Context, which has separate instances in each bundle). */
export function WindowTitle({ title }: { title: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const handle = setTimeout(() => {
      const panel = ref.current?.closest('[data-modal-id]');
      const id = panel?.getAttribute('data-modal-id');
      if (id) window.dispatchEvent(new CustomEvent('window-title-update', { detail: { id, title } }));
    }, 0);
    return () => clearTimeout(handle);
  }, [title]);
  return <span ref={ref} style={{ display: 'none' }} aria-hidden="true" />;
}

/** @deprecated Use <WindowTitle> instead — the hook variant doesn't work
 *  across bundle boundaries (apps barrel has its own ModalIdContext). */
export function useWindowTitle(_title: string) {
  // Intentionally a no-op now. Kept for type compatibility during migration.
}

/**
 * Portal component — renders children into the nearest Modal's footer actions area.
 * position="left" for destructive actions (Delete), default is right for primary actions.
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={handleCopy} title={copied ? 'Copied!' : `Copy ${text}`}
      className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
      {copied ? (
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
}

// Context to pass action container refs from Modal to ModalActions
interface ModalActionsCtx {
  rightRef: React.RefObject<HTMLDivElement | null>;
  leftRef: React.RefObject<HTMLDivElement | null>;
  notify: () => void;
  active: boolean;
  isDirty: boolean;
}
const ModalActionsContext = createContext<ModalActionsCtx | null>(null);

/** Hook to check if the current modal is active (frontmost) */
export function useModalActive(): boolean {
  const activeId = useSyncExternalStore(subscribeActive, getActiveModalId);
  const ctx = useContext(ModalActionsContext);
  return ctx?.active ?? (activationOrder.length <= 1 || activeId != null);
}

export function ModalActions({ children, position = 'right' }: { children: React.ReactNode; position?: 'left' | 'right' }) {
  const ctx = useContext(ModalActionsContext);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const ref = position === 'left' ? ctx.leftRef : ctx.rightRef;
    const check = () => {
      if (ref.current) { setTarget(ref.current); ctx.notify(); return true; }
      return false;
    };
    if (check()) return;
    // Ref might not be set yet — retry
    const t = setInterval(() => { if (check()) clearInterval(t); }, 50);
    const cleanup = setTimeout(() => clearInterval(t), 2000);
    return () => { clearInterval(t); clearTimeout(cleanup); };
  }, [ctx, position]);

  if (!target) return null;
  return createPortal(children, target);
}

/**
 * Cancel button that checks for unsaved changes before calling onClick.
 * Automatically detects dirty state from the nearest Modal context.
 */
export function CancelButton({ onClick, children, className }: { onClick: () => void; children?: React.ReactNode; className?: string }) {
  const ctx = useContext(ModalActionsContext);

  const handleClick = async () => {
    if (ctx?.isDirty) {
      const { confirm } = await import('./ConfirmDialog');
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Are you sure you want to cancel? All changes will be lost.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep Editing',
        variant: 'warning',
      });
      if (!ok) return;
    }
    onClick();
  };

  return (
    <button type="button" onClick={handleClick}
      className={className || 'bg-white text-gray-700 border border-gray-300 px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-50'}>
      {children || 'Cancel'}
    </button>
  );
}

// ── Window position persistence ──
const WP_KEY = 'erp_window_positions';
let _windowPositions: Record<string, { x: number; y: number; w: number; h: number }> = {};
try {
  const stored = localStorage.getItem(WP_KEY);
  if (stored) _windowPositions = JSON.parse(stored);
} catch {}
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function _savePositionsDebounced() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem(WP_KEY, JSON.stringify(_windowPositions)); } catch {}
  }, 500);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Window icon — shown before title, clicking it opens window menu */
  icon?: React.ReactNode;
  /** Text to copy when the copy icon in the header is clicked (e.g. entity number) */
  copyText?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  dirty?: boolean | 'auto';
  onNext?: () => void;
  onPrev?: () => void;
  footer?: React.ReactNode;
  /** When true, body uses overflow-hidden — child content manages its own scrolling */
  bodyScroll?: false;
  /** Custom minimize handler — called instead of the default global minimize */
  onMinimize?: (savedBox: { x: number; y: number; w: number; h: number; maximized: boolean }) => void;
  /** Restore to a previously saved position/size */
  initialBox?: { x: number; y: number; w: number; h: number; maximized: boolean };
  /** Footer actions (right side) — alternative to ModalActions portal */
  actions?: React.ReactNode;
  /** Footer actions (left side) — alternative to ModalActions portal */
  actionsLeft?: React.ReactNode;
  /** Allow the window to be pinned on top of all others */
  allowPinOnTop?: boolean;
  /** Initial position hint */
  initialPosition?: 'top-right' | 'top-left';
  /** Widget mode: no title/footer, drag anywhere, right-click context menu */
  widget?: boolean;
  /** Compact title bar: smaller header with title + close only, no minimize/maximize */
  compact?: boolean;
  /** App-style window: full title bar but body uses no padding so the app's own
   *  chrome (toolbars, menus) sits flush against the window frame. For
   *  self-chromed apps like Preview, Files, Browser. Implies `bodyScroll: false`
   *  — apps manage their own scrolling internally. */
  appStyle?: boolean;
  /** Auto-size height based on content. Window's height adapts to whatever the
   *  body renders; combined with `autoMinHeight` to prevent collapse and capped
   *  to the available viewport so nothing overflows the screen. Only set this
   *  for windows whose root content uses natural (block / shrink-to-fit) sizing
   *  — windows whose root uses `h-full` / `flex-1` would collapse here. */
  autoHeight?: boolean;
  /** Minimum height (px) when `autoHeight` is on. Defaults to 240. */
  autoMinHeight?: number;
  /** Custom menu items for widget right-click context menu */
  widgetMenu?: React.ReactNode;
  /** Custom window dimensions [width, height] in pixels */
  dimensions?: [number, number];
  /** Stable key for persisting window position to sessionStorage */
  windowKey?: string;
  /** windowKey of whichever window was active when this one opened. On
   *  mobile, swipe-to-back broadcasts this value so the parent window can
   *  un-hide itself underneath the sliding panel. */
  openedFromKey?: string;
  children: React.ReactNode;
}

const sizeDefaults: Record<string, number> = {
  sm: 384, md: 512, lg: 672, xl: 896, '2xl': 1152,
};

// Track modal depth for stacking z-index and ESC handling
export let modalDepth = 0;
export const modalStack: string[] = [];
export const modalDepthRef = { get: () => modalDepth, inc: () => ++modalDepth, dec: () => --modalDepth };

// Activation order — last element is the frontmost modal
const activationOrder: string[] = [];
const activeListeners = new Set<() => void>();
export function activateModal(id: string) {
  const idx = activationOrder.indexOf(id);
  if (idx !== -1) activationOrder.splice(idx, 1);
  activationOrder.push(id);
  activeListeners.forEach(fn => fn());
  window.dispatchEvent(new CustomEvent('modal-reorder'));
}
// Track which modal IDs belong to widget windows; widgets stay visible when
// the user double-clicks the desktop ("show desktop"), only regular windows
// are hidden.
const widgetIds = new Set<string>();
export function deactivateAllModals() {
  // Drop everything that is not a widget.
  for (let i = activationOrder.length - 1; i >= 0; i--) {
    if (!widgetIds.has(activationOrder[i])) activationOrder.splice(i, 1);
  }
  activeListeners.forEach(fn => fn());
  window.dispatchEvent(new CustomEvent('modal-reorder'));
}
// ── Window snapping ──────────────────────────────────────────────────────
// Aero/Magnet-style edge snapping. The drag handler watches the cursor
// position and calls into these helpers. A single translucent preview
// element is reused across drags (lazily created, kept around in body).

type SnapZone = 'top' | 'left' | 'right' | 'tl' | 'tr' | 'bl' | 'br';
const EDGE_THRESHOLD = 8;     // px from edge to trigger half-screen snap
const CORNER_THRESHOLD = 32;  // px square at each corner for quarter-screen snap

interface Box { x: number; y: number; w: number; h: number; }

function workArea(): Box {
  const taskbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 0;
  const taskbarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-width')) || 0;
  const tbPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
  const x = tbPos === 'left' ? taskbarW : 0;
  const y = tbPos === 'top' ? taskbarH : 0;
  const w = window.innerWidth - (tbPos === 'left' || tbPos === 'right' ? taskbarW : 0);
  const h = window.innerHeight - (tbPos === 'top' || tbPos === 'bottom' ? taskbarH : 0);
  return { x, y, w, h };
}

function calcSnapBox(zone: SnapZone): Box {
  const a = workArea();
  const halfW = Math.floor(a.w / 2);
  const halfH = Math.floor(a.h / 2);
  switch (zone) {
    case 'top':   return { x: a.x, y: a.y, w: a.w, h: a.h };
    case 'left':  return { x: a.x, y: a.y, w: halfW, h: a.h };
    case 'right': return { x: a.x + halfW, y: a.y, w: a.w - halfW, h: a.h };
    case 'tl':    return { x: a.x, y: a.y, w: halfW, h: halfH };
    case 'tr':    return { x: a.x + halfW, y: a.y, w: a.w - halfW, h: halfH };
    case 'bl':    return { x: a.x, y: a.y + halfH, w: halfW, h: a.h - halfH };
    case 'br':    return { x: a.x + halfW, y: a.y + halfH, w: a.w - halfW, h: a.h - halfH };
  }
}

function detectSnapZone(clientX: number, clientY: number): SnapZone | null {
  const a = workArea();
  const nearLeft   = clientX <= a.x + EDGE_THRESHOLD;
  const nearRight  = clientX >= a.x + a.w - EDGE_THRESHOLD;
  const nearTop    = clientY <= a.y + EDGE_THRESHOLD;
  const nearBottom = clientY >= a.y + a.h - EDGE_THRESHOLD;
  // Corners take priority over edges (larger detection square).
  const cornerLeft = clientX <= a.x + CORNER_THRESHOLD;
  const cornerRight = clientX >= a.x + a.w - CORNER_THRESHOLD;
  const cornerTop = clientY <= a.y + CORNER_THRESHOLD;
  const cornerBottom = clientY >= a.y + a.h - CORNER_THRESHOLD;
  if (nearTop && cornerLeft)    return 'tl';
  if (nearTop && cornerRight)   return 'tr';
  if (nearBottom && cornerLeft) return 'bl';
  if (nearBottom && cornerRight)return 'br';
  if (cornerTop && nearLeft)    return 'tl';
  if (cornerTop && nearRight)   return 'tr';
  if (cornerBottom && nearLeft) return 'bl';
  if (cornerBottom && nearRight)return 'br';
  if (nearTop)   return 'top';
  if (nearLeft)  return 'left';
  if (nearRight) return 'right';
  return null;
}

let snapPreviewEl: HTMLDivElement | null = null;
function getSnapPreviewEl(): HTMLDivElement {
  if (!snapPreviewEl) {
    snapPreviewEl = document.createElement('div');
    snapPreviewEl.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 40',
      'border-radius: 8px',
      'background: rgba(59, 130, 246, 0.18)',
      'border: 2px solid rgb(59, 130, 246)',
      'transition: left 120ms ease, top 120ms ease, width 120ms ease, height 120ms ease, opacity 120ms ease',
      'opacity: 0',
      'display: none',
    ].join(';');
    document.body.appendChild(snapPreviewEl);
  }
  return snapPreviewEl;
}
function showSnapPreview(box: Box) {
  const el = getSnapPreviewEl();
  el.style.display = 'block';
  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;
  el.style.width = `${box.w}px`;
  el.style.height = `${box.h}px`;
  el.style.opacity = '1';
}
function hideSnapPreview() {
  if (!snapPreviewEl) return;
  snapPreviewEl.style.opacity = '0';
  snapPreviewEl.style.display = 'none';
}

// Listen for deactivate-all event from taskbar
window.addEventListener('deactivate-all-modals', deactivateAllModals);
function getZForModal(id: string): number {
  const idx = activationOrder.indexOf(id);
  if (idx === -1) return -1; // Behind everything — hidden below listing page
  return 50 + idx * 10;
}
export function getActiveModalId() {
  return activationOrder[activationOrder.length - 1] || null;
}
export function subscribeActive(cb: () => void) {
  activeListeners.add(cb);
  return () => { activeListeners.delete(cb); };
}
/** Hook: returns true if this modal ID is the frontmost */
function useIsActiveModal(modalId: string): boolean {
  const activeId = useSyncExternalStore(subscribeActive, getActiveModalId);
  return activationOrder.length <= 1 || activeId === modalId;
}

// ── Exposé / Mission-Control mode ─────────────────────────────────────────
//
// Module-level toggle that, when on, visually scales every open modal
// down into a non-overlapping grid (CSS transform; the modals stay where
// they are layout-wise, so exiting just clears the transform). Each
// scaled tile renders the live modal content as a thumbnail, plus a
// label below; clicking a tile activates that modal and exits exposé;
// clicking the backdrop (or pressing Escape, or the taskbar button
// again) exits without changing the active modal.
let _exposeOn = false;
const _exposeListeners = new Set<() => void>();
function _notifyExpose() { _exposeListeners.forEach((fn) => fn()); }
function subscribeExpose(fn: () => void) { _exposeListeners.add(fn); return () => _exposeListeners.delete(fn); }
function getExposeState() { return _exposeOn; }
function setExposeState(v: boolean) {
  if (_exposeOn === v) return;
  _exposeOn = v;
  _notifyExpose();
}
export function toggleExposeMode() { setExposeState(!_exposeOn); }
export function exitExposeMode() { setExposeState(false); }

// Backwards-compat — old taskbar wiring fires this event; treat it as a toggle.
function triggerSplitView() {
  setExposeState(!_exposeOn);
  window.dispatchEvent(new CustomEvent('modal-split-view'));
}
export { triggerSplitView };

// Escape exits exposé.
window.addEventListener('keydown', (e) => {
  if (_exposeOn && e.key === 'Escape') {
    setExposeState(false);
  }
});

interface ExposeTile { x: number; y: number; w: number; h: number; }

/**
 * Compute the grid cell rectangle for a given modal id when exposé is on.
 * Returns null when the modal isn't tileable (utility / widget / pinned).
 *
 * Layout: roughly-square grid (cols=ceil(sqrt(N)), rows=ceil(N/cols)).
 * Tiles in the last row are centred when the row is short. The grid
 * uses the document work-area minus the taskbar.
 */
function computeExposeTile(modalId: string): ExposeTile | null {
  if (typeof document === 'undefined') return null;
  const allPanels = Array.from(document.querySelectorAll('[data-modal-panel]'));
  // Skip utility, widget, and panels that have been hidden via display:none.
  const tileable: HTMLElement[] = allPanels.filter((p) => {
    const el = p as HTMLElement;
    if (el.hasAttribute('data-utility') || el.hasAttribute('data-widget')) return false;
    if (el.style.display === 'none') return false;
    return true;
  }) as HTMLElement[];
  // Stable ordering by data-modal-id so the same window lands in the same
  // tile each time exposé is opened — avoids visual reshuffling.
  tileable.sort((a, b) => (a.getAttribute('data-modal-id') || '').localeCompare(b.getAttribute('data-modal-id') || ''));
  const myIdx = tileable.findIndex((p) => p.getAttribute('data-modal-id') === modalId);
  const count = tileable.length;
  if (myIdx < 0 || count < 1) return null;

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const myRow = Math.floor(myIdx / cols);
  const myCol = myIdx % cols;
  const lastRowCount = count - cols * (rows - 1);
  const isLastRow = myRow === rows - 1 && lastRowCount < cols;

  const taskbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 0;
  const taskbarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-width')) || 0;
  const tbPos = (getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position') || 'bottom').trim();
  const xOffset = tbPos === 'left' ? taskbarW : 0;
  const xRight = tbPos === 'right' ? taskbarW : 0;
  const yOffset = tbPos === 'top' ? taskbarH : 0;
  const yBottom = (tbPos === 'top' || tbPos === 'left' || tbPos === 'right') ? 0 : taskbarH;
  const a = {
    x: xOffset, y: yOffset,
    w: window.innerWidth - xOffset - xRight,
    h: window.innerHeight - yOffset - yBottom,
  };
  // Layout constants. Generous gaps + label space below each tile so the
  // grid reads as separate windows the way macOS Exposé does.
  const gapX = 20;
  const gapY = 14;
  const labelH = 22;
  const cellW = (a.w - gapX * (cols + 1)) / cols;
  const cellH = (a.h - gapY * (rows + 1) - labelH * rows) / rows;

  const lastRowOffsetX = isLastRow ? ((cols - lastRowCount) * (cellW + gapX)) / 2 : 0;
  const tileX = a.x + gapX + myCol * (cellW + gapX) + lastRowOffsetX;
  const tileY = a.y + gapY + myRow * (cellH + gapY + labelH);
  return { x: tileX, y: tileY, w: cellW, h: cellH };
}

/**
 * Singleton backdrop that's shown while exposé mode is on. Click anywhere
 * (outside a window thumbnail) to exit exposé. Should be mounted exactly
 * once, near the root — typically by WindowManager.
 */
export function ExposeBackdrop() {
  const on = useSyncExternalStore(subscribeExpose, getExposeState);
  if (!on || typeof document === 'undefined') return null;
  return createPortal(
    <div
      onMouseDown={(e) => { e.stopPropagation(); setExposeState(false); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        zIndex: 2000,
        cursor: 'pointer',
        animation: 'expose-fade-in 220ms ease-out',
      }}
    />,
    document.body
  );
}


export default function Modal({ open, onClose, title, icon, copyText, size = 'lg', dirty = false, onNext, onPrev, footer, bodyScroll, onMinimize, initialBox, actions, actionsLeft, allowPinOnTop, initialPosition, widget, compact, appStyle, autoHeight, autoMinHeight, widgetMenu, dimensions, windowKey, openedFromKey, children }: ModalProps) {
  const isMobile = useIsMobile();
  // Mobile swipe-from-left-edge gesture: track horizontal offset of the panel.
  // 0 = at rest. While the user is dragging from the left edge, this grows
  // with the finger. On release, if past the threshold the panel slides off
  // and `onClose` fires; otherwise it animates back to 0.
  const [swipeX, setSwipeX] = useState(0);
  const [swipeDragging, setSwipeDragging] = useState(false);
  const swipeStartRef = useRef<{ startX: number; startY: number; pointerId: number } | null>(null);
  const swipeXRef = useRef(0);
  useEffect(() => { swipeXRef.current = swipeX; }, [swipeX]);

  const handleEdgePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMobile) return;
    swipeStartRef.current = { startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    setSwipeDragging(true);
    // Tell sibling Modals which window's parent should reveal itself behind
    // this swipe — `null` (no `openedFromKey`) means "this is a top-level
    // app, fall back to the home wallpaper".
    setSwipingParentKey(openedFromKey ?? null);
  }, [isMobile, openedFromKey]);

  // Subscribe to the swipe store so non-active panels can render themselves
  // visible underneath a sibling that's currently being swiped to its parent.
  const swipingParentKey = useSyncExternalStore(subscribeSwipingParentKey, getSwipingParentKey);

  // Move + release wired globally during a swipe so the panel keeps tracking
  // the finger even if it leaves the edge zone (e.g. the user drags clear
  // across the screen).
  useEffect(() => {
    if (!swipeDragging) return;
    const onMove = (ev: PointerEvent) => {
      if (!swipeStartRef.current) return;
      const dx = ev.clientX - swipeStartRef.current.startX;
      const dy = Math.abs(ev.clientY - swipeStartRef.current.startY);
      if (dy > Math.abs(dx) + 12) {
        // Vertical movement dominates — abandon the gesture so the user can
        // scroll content normally.
        swipeStartRef.current = null;
        setSwipeDragging(false);
        setSwipeX(0);
        setSwipingParentKey(null);
        return;
      }
      setSwipeX(Math.max(0, dx));
    };
    const onUp = () => {
      if (!swipeStartRef.current) return;
      const threshold = window.innerWidth * 0.3;
      const past = swipeXRef.current > threshold;
      swipeStartRef.current = null;
      setSwipeDragging(false);
      if (past) {
        // Swipe-from-edge closes the current window so whatever was opened
        // before it (the parent list, or — if this was a top-level app —
        // home) becomes visible underneath. MobileShell falls back to home
        // when the close empties openWindows.
        setSwipeX(window.innerWidth);
        setTimeout(() => {
          onClose();
          setSwipeX(0);
          setSwipingParentKey(null);
        }, 180);
      } else {
        setSwipeX(0);
        setSwipingParentKey(null);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [swipeDragging]);
  const [displayTitle, setDisplayTitle] = useState<React.ReactNode>(title);
  useEffect(() => { setDisplayTitle(title); }, [title]);
  const [touched, setTouched] = useState(false);
  const [pinnedOnTop, setPinnedOnTop] = useState(false);
  const [windowMenu, setWindowMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // Widget anchoring: 'left' or 'right' — determines which edge the widget is fixed to
  const [widgetAnchor, setWidgetAnchor] = useState<'left' | 'right'>(initialPosition === 'top-right' ? 'right' : 'left');
  const closingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsLeftRef = useRef<HTMLDivElement>(null);
  const [hasActions, setHasActions] = useState(false);
  // Every window must surface a clickable icon — it's the only entry point
  // to the window menu. Fall back to a generic "window" glyph when the
  // consumer hasn't supplied one. Consumer icons rarely include explicit
  // size classes (the start menu adds them via cloneElement), so we also
  // size them here to keep the title bar layout stable.
  const fallbackIcon = (
    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z M3.75 9h16.5" />
    </svg>
  );
  const effectiveIcon = icon && isValidElement(icon)
    ? cloneElement(icon as React.ReactElement, {
        className: `h-4 w-4 ${(icon as React.ReactElement).props?.className ?? ''}`.trim(),
      } as any)
    : (icon ?? fallbackIcon);
  const renderIconButton = () => (
    <button
      onPointerDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setWindowMenu(prev => prev ? null : { x: rect.left, y: rect.bottom + 4 });
      }}
      className="shrink-0 p-0.5 rounded hover:bg-gray-200/50 transition-colors"
      title="Window menu"
    >
      {effectiveIcon}
    </button>
  );
  const padding = 40;
  const { minimize: globalMinimize, items: minimizedItems, restoreIfMinimized } = useWindowManager();
  const modalId = useRef(`modal-${Math.random().toString(36).slice(2, 8)}`).current;

  // Mark widget windows so deactivate-all (show desktop) skips them.
  useEffect(() => {
    if (widget) {
      widgetIds.add(modalId);
      return () => { widgetIds.delete(modalId); };
    }
  }, [widget, modalId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id === modalId) setDisplayTitle(detail.title);
    };
    window.addEventListener('window-title-update', handler);
    return () => window.removeEventListener('window-title-update', handler);
  }, [modalId]);
  const [zIndex, setZIndex] = useState(50);
  const isActive = useIsActiveModal(modalId);

  // Exposé: when enabled, every tileable modal scales down via CSS
  // transform into its grid cell. Utility, widget, and pinned panels
  // sit out — they keep their normal layout.
  const exposeOn = useSyncExternalStore(subscribeExpose, getExposeState);
  const isExposeTileable = !allowPinOnTop && !widget;
  const exposeActive = exposeOn && isExposeTileable;


  // Track whether ModalActions portal has content (either left or right)
  useEffect(() => {
    const r = actionsRef.current;
    const l = actionsLeftRef.current;
    if (!r && !l) return;
    const check = () => setHasActions((r?.childElementCount ?? 0) + (l?.childElementCount ?? 0) > 0);
    check();
    const obs = new MutationObserver(check);
    if (r) obs.observe(r, { childList: true });
    if (l) obs.observe(l, { childList: true });
    return () => obs.disconnect();
  }, [open]);

  // Forward submit-button clicks from portaled actions to the form
  // (React onClick won't fire for portal children — must use native listener)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button[type="submit"]');
      if (btn && panelRef.current) {
        const form = panelRef.current.querySelector('form');
        if (form) { e.preventDefault(); form.requestSubmit(); }
      }
    };
    const r = actionsRef.current;
    const l = actionsLeftRef.current;
    if (r) r.addEventListener('click', handler);
    if (l) l.addEventListener('click', handler);
    return () => { if (r) r.removeEventListener('click', handler); if (l) l.removeEventListener('click', handler); };
  }, [open]);

  // ── Draggable/resizable state ──
  const isNested = useRef(false);

  const calcMaximized = useCallback(() => {
    const taskbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 0;
    const taskbarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-width')) || 0;
    const tbPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
    const x = tbPos === 'left' ? taskbarW : 0;
    const y = tbPos === 'top' ? taskbarH : 0;
    const w = window.innerWidth - (tbPos === 'left' || tbPos === 'right' ? taskbarW : 0);
    const h = window.innerHeight - (tbPos === 'top' || tbPos === 'bottom' ? taskbarH : 0);
    return { x, y, w, h };
  }, []);

  const calcWindowed = useCallback(() => {
    const sw = 0;
    const taskbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 0;
    const taskbarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-width')) || 0;
    const tbPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
    const leftOffset = tbPos === 'left' ? taskbarW : 0;
    const rightOffset = tbPos === 'right' ? taskbarW : 0;
    const targetW = dimensions ? dimensions[0] : (sizeDefaults[size] || 672);
    const availW = window.innerWidth - sw - leftOffset - rightOffset - padding * 2;
    const availH = window.innerHeight - taskbarH - padding * 2;
    const w = Math.min(targetW, availW);
    const h = dimensions
        ? Math.min(dimensions[1], availH)
        : (() => { const minH = size === 'sm' ? 300 : 400; const maxH = size === 'sm' ? 500 : size === 'md' ? 600 : size === 'lg' ? 700 : availH; return Math.max(minH, Math.min(maxH, window.innerHeight - taskbarH - 80)); })();
    // Window position mode
    const posMode = getComputedStyle(document.documentElement).getPropertyValue('--window-position')?.trim() || 'cascade';
    const offset = posMode === 'cascade' ? (activationOrder.length - 1) * 30 : 0;
    const maxOffsetX = availW - w;
    const maxOffsetY = availH - h;
    // Position hints
    if (initialPosition === 'top-right') {
      return { x: window.innerWidth - w - padding, y: padding, w, h };
    }
    if (initialPosition === 'top-left') {
      return { x: sw + padding, y: padding, w, h };
    }
    return {
      x: sw + Math.max(padding, (availW - w) / 2 + padding) + Math.min(offset, Math.max(0, maxOffsetX)),
      y: Math.max(padding, (availH - h) / 2) + Math.min(offset, Math.max(0, maxOffsetY)),
      w, h,
    };
  }, [size]);

  const interceptedRef = useRef(false);
  if (!open) interceptedRef.current = false;

  useEffect(() => {
    if (!open) return;
    modalDepthRef.inc();
    modalStack.push(modalId);
    activateModal(modalId);
    isNested.current = false; // All modals are independent top-level windows
    setZIndex(getZForModal(modalId));
    // Listen for reorder events to update z-index
    const onReorder = () => {
      setZIndex(getZForModal(modalId));
    };
    // The old "split view" handler used to setBox to tile windows side
    // by side. Exposé replaces that with a non-destructive overlay
    // (CSS transform on the panel, see further down) — so this handler
    // is now a no-op. Kept around as an event listener target only so
    // the prior wiring keeps working until every consumer migrates.
    const onSplitView = () => { /* no-op: exposé toggle handled by setExposeState */ };

    // Center window on double-click from taskbar
    const onCenter = (e: Event) => {
      const label = (e as CustomEvent).detail?.label;
      if (!label) return;
      const titleEl = panelRef.current?.querySelector('.text-lg, .text-sm');
      if (!titleEl?.textContent?.includes(label)) return;
      activateModal(modalId);
      const taskbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 0;
      const taskbarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-width')) || 0;
      const tbPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
      const leftOff = tbPos === 'left' ? taskbarW : 0;
      const rightOff = tbPos === 'right' ? taskbarW : 0;
      const availW = window.innerWidth - leftOff - rightOff;
      const availH = window.innerHeight - taskbarH;
      // Clamp size to viewport if bigger
      const w = Math.min(boxRef.current.w, availW - 40);
      const h = Math.min(boxRef.current.h, availH - 40);
      const x = leftOff + (availW - w) / 2;
      const y = (tbPos === 'top' ? taskbarH : 0) + (availH - h) / 2;
      setBox({ x, y, w, h });
      setMaximized(false);
    };
    // Context menu from taskbar right-click
    const onCtxMenu = (e: Event) => {
      const { label, x, y } = (e as CustomEvent).detail || {};
      if (!label) return;
      const titleEl = panelRef.current?.querySelector('.text-lg, .text-sm');
      if (!titleEl?.textContent?.includes(label)) return;
      activateModal(modalId);
      setWindowMenu({ x, y });
    };

    window.addEventListener('modal-reorder', onReorder);
    window.addEventListener('modal-split-view', onSplitView);
    window.addEventListener('modal-center', onCenter);
    window.addEventListener('modal-context-menu', onCtxMenu);
    return () => {
      modalDepthRef.dec();
      const idx = modalStack.indexOf(modalId);
      if (idx !== -1) modalStack.splice(idx, 1);
      const aidx = activationOrder.indexOf(modalId);
      if (aidx !== -1) { activationOrder.splice(aidx, 1); activeListeners.forEach(fn => fn()); }
      window.removeEventListener('modal-reorder', onReorder);
      window.removeEventListener('modal-split-view', onSplitView);
      window.removeEventListener('modal-center', onCenter);
      window.removeEventListener('modal-context-menu', onCtxMenu);
      // Notify remaining modals to recalc z-index
      window.dispatchEvent(new CustomEvent('modal-reorder'));
    };
  }, [open, modalId, calcMaximized]);

  // Restore saved position from window position store
  const boxKey = windowKey || copyText || null;
  const [box, setBox] = useState(() => {
    if (boxKey && _windowPositions[boxKey]) {
      const saved = { ..._windowPositions[boxKey] };
      // If dimensions are specified, enforce them (override cached size but keep position)
      if (dimensions) { saved.w = dimensions[0]; if (!autoHeight) saved.h = dimensions[1]; }
      return saved;
    }
    return initialBox ? { x: initialBox.x, y: initialBox.y, w: initialBox.w, h: initialBox.h } : calcWindowed();
  });
  const [maximized, setMaximized] = useState(false);
  const boxRef = useRef(box);
  boxRef.current = box;

  // Persist box position on changes (debounced to localStorage)
  useEffect(() => {
    if (open && boxKey) {
      _windowPositions[boxKey] = box;
      _savePositionsDebounced();
    }
  }, [box, open, boxKey]);

  // Sync on viewport resize when maximized
  useEffect(() => {
    if (!open) return;
    const sync = () => { if (maximized) setBox(calcMaximized()); };
    window.addEventListener('resize', sync);
    // Only observe DOM changes when maximized — avoids unnecessary re-renders
    let observer: MutationObserver | null = null;
    if (maximized) {
      observer = new MutationObserver(sync);
      observer.observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
    }
    return () => { window.removeEventListener('resize', sync); observer?.disconnect(); };
  }, [open, maximized, calcMaximized]);

  // Reset when modal opens — skip if we have a saved position
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    closingRef.current = false;
    // If we have a saved position in the store, restore it instead of resetting
    if (boxKey && _windowPositions[boxKey]) {
      setBox({ ..._windowPositions[boxKey] });
      return;
    }
    if (initialBox) {
      setBox({ x: initialBox.x, y: initialBox.y, w: initialBox.w, h: initialBox.h });
      setMaximized(initialBox.maximized);
    }
    // Don't call calcWindowed() here — useState already set the initial position
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-detect dirty
  useEffect(() => {
    if (!open || dirty !== 'auto') return;
    const handler = (e: Event) => { if (panelRef.current?.contains(e.target as HTMLElement)) setTouched(true); };
    document.addEventListener('input', handler, true);
    document.addEventListener('change', handler, true);
    return () => { document.removeEventListener('input', handler, true); document.removeEventListener('change', handler, true); };
  }, [open, dirty]);

  const isDirty = dirty === 'auto' ? touched : dirty === true;

  const guardedClose = useCallback(async () => {
    if (closingRef.current) return;
    if (isDirty) {
      closingRef.current = true;
      const ok = await confirm({ title: 'Discard changes?', message: 'You have unsaved changes. Are you sure you want to close? All changes will be lost.', confirmLabel: 'Discard', cancelLabel: 'Keep Editing', variant: 'warning' });
      closingRef.current = false;
      if (!ok) return;
    }
    onClose();
  }, [isDirty, onClose]);

  // Pre-snap box: if the user drags a window that's currently snapped to an
  // edge, restore it to its previous "natural" size so dragging it across
  // the screen feels right. Set on snap-drop, consumed on next drag start.
  const preSnapBoxRef = useRef<Box | null>(null);

  // ── Drag ──
  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, a, kbd, select, textarea')) return;
    setWindowMenu(null);
    activateModal(modalId);
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const panel = panelRef.current;
    const rect = panel?.getBoundingClientRect();

    // If this window is currently snapped, restore its pre-snap dimensions
    // and reposition so the cursor lands roughly in the title bar.
    let ox: number, oy: number, actualH: number, actualW: number;
    if (preSnapBoxRef.current) {
      const restore = preSnapBoxRef.current;
      preSnapBoxRef.current = null;
      actualW = restore.w;
      actualH = restore.h;
      // Center the restored window horizontally on the cursor; keep title
      // bar at cursor Y.
      const offsetX = rect ? Math.min(Math.max(20, e.clientX - rect.left), restore.w - 20) : restore.w / 2;
      ox = e.clientX - offsetX;
      oy = e.clientY - 12;
      if (panel) {
        panel.style.width = `${actualW}px`;
        panel.style.height = `${actualH}px`;
        panel.style.left = `${ox}px`;
        panel.style.top = `${oy}px`;
      }
    } else {
      ox = rect ? rect.left : boxRef.current.x;
      oy = rect ? rect.top : boxRef.current.y;
      actualH = rect ? rect.height : boxRef.current.h;
      actualW = rect ? rect.width : boxRef.current.w;
    }
    setMaximized(false);
    setBox(b => ({ ...b, x: ox, y: oy, w: actualW, h: actualH }));

    // Snap zone tracking — only re-render preview when zone CHANGES.
    let currentZone: SnapZone | null = null;

    const move = (ev: PointerEvent) => {
      const nx = ox + ev.clientX - sx;
      const ny = Math.max(0, oy + ev.clientY - sy);
      if (panel) {
        panel.style.left = `${nx}px`;
        panel.style.top = `${ny}px`;
      }
      boxRef.current = { ...boxRef.current, x: nx, y: ny };

      // Snap detection: ignore for widgets so they keep free-positioning.
      if (!widget) {
        const zone = detectSnapZone(ev.clientX, ev.clientY);
        if (zone !== currentZone) {
          currentZone = zone;
          if (zone) showSnapPreview(calcSnapBox(zone));
          else hideSnapPreview();
        }
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      hideSnapPreview();
      const finalBox = { ...boxRef.current };

      // Snap drop: lock to the snap target, save the pre-snap size for next drag.
      if (!widget && currentZone) {
        preSnapBoxRef.current = { x: ox, y: oy, w: actualW, h: actualH };
        setBox(calcSnapBox(currentZone));
        return;
      }

      // For widgets, determine anchor side based on center position vs viewport midpoint
      if (widget) {
        const centerX = finalBox.x + finalBox.w / 2;
        const mid = window.innerWidth / 2;
        setWidgetAnchor(centerX > mid ? 'right' : 'left');
      }
      // Sync React state once on drop — keep inline position until React re-renders
      setBox(finalBox);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  // ── Resize ──
  const startResizeCorner = useCallback((e: React.PointerEvent, corner: 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w') => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const panel = panelRef.current;
    // Always use the live rendered rect as the origin so we don't drift
    // when the panel was previously maximised or pinned.
    const rect = panel?.getBoundingClientRect();
    const ox = rect ? rect.left : boxRef.current.x;
    const oy = rect ? rect.top : boxRef.current.y;
    const ow = rect ? rect.width : boxRef.current.w;
    const oh = rect ? rect.height : boxRef.current.h;
    const MIN_W = 384;
    const MIN_H = 400;
    const isWest = corner === 'sw' || corner === 'nw' || corner === 'w';
    const isNorth = corner === 'ne' || corner === 'nw' || corner === 'n';
    const isEast = corner === 'se' || corner === 'ne' || corner === 'e';
    const isSouth = corner === 'se' || corner === 'sw' || corner === 's';
    setMaximized(false);
    // Pin the box to the actual rendered coordinates immediately so the
    // panel does not jump if it was previously maximised.
    setBox({ x: ox, y: oy, w: ow, h: oh });
    boxRef.current = { x: ox, y: oy, w: ow, h: oh };

    const compute = (dx: number, dy: number) => {
      let nx = ox, ny = oy, nw = ow, nh = oh;
      if (isEast)  nw = Math.max(MIN_W, ow + dx);
      if (isSouth) nh = Math.max(MIN_H, oh + dy);
      if (isWest) {
        const targetW = Math.max(MIN_W, ow - dx);
        // Anchor the east edge: as W grows/shrinks, x moves opposite so the
        // east edge (ox + ow) stays fixed.
        nx = ox + ow - targetW;
        nw = targetW;
      }
      if (isNorth) {
        const targetH = Math.max(MIN_H, oh - dy);
        ny = oy + oh - targetH;
        nh = targetH;
      }
      return { x: nx, y: ny, w: nw, h: nh };
    };

    let raf = 0;
    let pending: { x: number; y: number; w: number; h: number } | null = null;
    const flush = () => {
      raf = 0;
      if (!pending) return;
      const next = pending; pending = null;
      boxRef.current = next;
      setBox(next);
    };
    const move = (ev: PointerEvent) => {
      pending = compute(ev.clientX - sx, ev.clientY - sy);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (raf) cancelAnimationFrame(raf);
      flush();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  const reset = () => { setMaximized(true); setBox(calcMaximized()); };
  const handleMinimize = () => {
    const saved = { ...boxRef.current, maximized };
    if (onMinimize) {
      onMinimize(saved);
    } else {
      const label = typeof title === 'string' ? title : (panelRef.current?.querySelector('.text-lg')?.textContent || 'Window');
      const route = window.location.pathname;
      globalMinimize({
        id: copyText || label || modalId, type: 'modal', label, route, savedBox: saved,
      });
      onClose();
    }
  };

  // ── Submit modal ──
  const submitModal = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const form = panel.querySelector('form');
    if (form) { form.requestSubmit(); } else {
      const btn = panel.querySelector<HTMLButtonElement>('button[type="submit"], button[data-submit], button.bg-green-600, button.bg-blue-600');
      if (btn && !btn.disabled) btn.click();
    }
  }, []);

  // Cmd+Enter submits, bare Enter prevented — only for topmost modal
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (activationOrder[activationOrder.length - 1] !== modalId) return;
      if (e.key === 'Enter') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); submitModal(); }
        else if (target.tagName === 'INPUT' && target.closest('form')) {
          // Let Enter submit the form naturally (e.g. password fields)
          return;
        }
        else { e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, submitModal, modalId]);

  // Cmd+S save-and-stay, Alt+Shift+D duplicate — only for topmost modal
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (activationOrder[activationOrder.length - 1] !== modalId) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); document.dispatchEvent(new CustomEvent('modal-save')); setTouched(false); }
      else if (e.altKey && e.shiftKey && (e.code === 'KeyD' || e.key === 'D' || e.key === 'd')) { e.preventDefault(); document.dispatchEvent(new CustomEvent('modal-duplicate')); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  // ESC → close only the topmost modal (with dirty guard)
  useEffect(() => {
    if (!open) return;
    // Widgets (Calculator, Weather, Currency, Pomodoro, World Clock, etc.) are
    // ambient — ESC shouldn't close them. They have their own right-click Close.
    if (widget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activationOrder[activationOrder.length - 1] === modalId) {
        e.preventDefault(); e.stopPropagation(); guardedClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, guardedClose, modalId, widget]);

  // J/K navigation
  const hasNav = open && (onNext !== undefined || onPrev !== undefined);
  const showBoundaryToast = useCallback((edge: 'top' | 'bottom') => {
    const existing = document.getElementById('nav-boundary-toast');
    if (existing) existing.remove();
    const lines = edge === 'bottom'
      ? ["That's the last one, chief.", "You've hit rock bottom... of the list.", "End of the line, buddy.", "Nothing left. Go outside.", "Congratulations, you scrolled to the void.", "There's no more. I checked.", "You've reached the edge of the known universe.", "Plot twist: there is no next one.", "Even scrolling has limits. Unlike your ambition.", "Last one. Time to touch grass."]
      : ["Already at the top. Overachiever.", "There is no item above this. Trust me.", "You're #1. Literally.", "Can't go higher. You've peaked.", "This is it. The summit. The top.", "First item. No VIP lounge above this.", "Going up? Nope. Elevator's broken.", "You want negative indexes? Bold.", "Top of the list. Top of the world.", "The only way is down from here."];
    const msg = lines[Math.floor(Math.random() * lines.length)];
    const toast = document.createElement('div');
    toast.id = 'nav-boundary-toast';
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-gray-900 text-white px-5 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-opacity duration-300';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2000);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (activationOrder[activationOrder.length - 1] !== modalId) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).isContentEditable) return;
      if (e.key === 'j' && hasNav) { e.preventDefault(); if (onNext) onNext(); else showBoundaryToast('bottom'); }
      if (e.key === 'k' && hasNav) { e.preventDefault(); if (onPrev) onPrev(); else showBoundaryToast('top'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onNext, onPrev, hasNav, showBoundaryToast, modalId]);

  // When minimized, stay mounted but hidden (preserves all state)
  if (!open || interceptedRef.current) return null;

  // ── Full window — render via portal when nested to escape parent overflow:hidden ──
  const exposeTile = exposeActive ? computeExposeTile(modalId) : null;
  const exposeStyle = (() => {
    if (!exposeActive || !exposeTile) return null;
    const scale = Math.min(exposeTile.w / box.w, exposeTile.h / box.h);
    const scaledW = box.w * scale;
    const scaledH = box.h * scale;
    const tx = exposeTile.x + (exposeTile.w - scaledW) / 2 - box.x;
    const ty = exposeTile.y + (exposeTile.h - scaledH) / 2 - box.y;
    return {
      transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
      transformOrigin: 'top left' as const,
      transition: 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 280ms',
      cursor: 'pointer',
      zIndex: 2010,
      boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
      pointerEvents: 'auto' as const,
    };
  })();

  const content = (
    <div>
      {/* Window */}
      <div ref={panelRef} data-modal-panel data-modal-id={modalId} data-window-key={windowKey || undefined} {...(allowPinOnTop ? { 'data-utility': '' } : {})} {...(widget ? { 'data-widget': '' } : {})}
        className={`fixed rounded-lg flex flex-col overflow-hidden group ${widget ? (isActive ? 'shadow-2xl' : 'shadow-lg') : `border ${isActive ? 'shadow-2xl border-gray-200' : 'shadow-lg border-gray-300'}`}`}
        onMouseDownCapture={(e) => {
          if (exposeActive) {
            // In exposé mode, any click on a tileable window selects it.
            e.preventDefault();
            e.stopPropagation();
            setExposeState(false);
            activateModal(modalId);
            return;
          }
        }}
        onMouseDown={(e) => {
          if (exposeActive) return;
          setWindowMenu(null);
          // Don't activate if the click is inside a child modal (nested portal)
          const targetPanel = (e.target as HTMLElement).closest('[data-modal-panel]');
          if (targetPanel && targetPanel !== panelRef.current) return;
          if (!(e.target as HTMLElement).closest('button, input, a, select, textarea')) {
            activateModal(modalId);
          }
        }}
        style={isMobile ? {
          // Mobile fullscreen: ignore stored box, fill viewport down to bottom
          // nav. Widgets stay hidden on mobile. Only the active window is
          // visible — all others hidden so swipe-right reveals the home
          // wallpaper backdrop. Exception: when a sibling Modal is being
          // swiped to-back and we're its `openedFrom` parent, un-hide so the
          // user sees their parent list during the slide instead of just the
          // wallpaper.
          zIndex: zIndex + 1,
          top: 0, left: 0, right: 0,
          bottom: 'var(--mobile-bottom-nav, 56px)',
          width: 'auto', height: 'auto',
          transform: `translateX(${swipeX}px)`,
          transition: swipeDragging ? 'none' : 'transform 180ms ease-out',
          ...(widget ? { display: 'none' } : {}),
          ...(zIndex < 0 ? { display: 'none' } : {}),
          ...((!isActive && !pinnedOnTop && !(swipingParentKey && windowKey === swipingParentKey)) ? { display: 'none' } : {}),
        } : {
          zIndex: pinnedOnTop ? 999 : zIndex + 1, width: box.w, height: autoHeight ? 'auto' : box.h, top: box.y,
          ...(autoHeight ? {
            // Widgets must fit content exactly (Weather, Currency, etc.) —
            // the 240 px floor only applies to non-widget app windows where
            // a near-empty body would look broken.
            minHeight: `${autoMinHeight ?? (widget ? 0 : 240)}px`,
            maxHeight: `calc(100vh - var(--taskbar-height, 0px) - 24px)`,
          } : {}),
          ...(widget && widgetAnchor === 'right' ? { right: window.innerWidth - box.x - box.w } : { left: box.x }),
          ...(zIndex < 0 && !pinnedOnTop ? { display: 'none' } : {}),
          ...(exposeStyle ?? {}),
        }}
      >
        {/* Mobile swipe-from-left-edge gesture zone. Captures pointerdown only
         *  in the leftmost 22px so it doesn't interfere with normal taps or
         *  scrolls in the body. */}
        {isMobile && !widget && (
          <div
            onPointerDown={handleEdgePointerDown}
            className="absolute top-0 bottom-0 left-0 w-[22px] z-[5]"
            style={{ touchAction: 'pan-y' }}
            aria-hidden="true"
          />
        )}

        {/* HEADER — draggable on desktop, hidden on mobile (apps go fullscreen
         *  with a swipe-from-left-edge gesture to close). */}
        {widget ? (
          /* Widget: no title bar — drag via body, close via right-click context menu */
          null
        ) : isMobile ? (
          null
        ) : compact ? (
          /* Compact: smaller title bar with title + close only */
          <div onPointerDown={startDrag}
            className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-200 shrink-0 cursor-move select-none rounded-t-lg ${isActive ? 'backdrop-blur-sm' : ''}`}
            style={{ touchAction: 'none', backgroundColor: isActive ? `rgb(var(--window-header-rgb) / var(--active-header-opacity, 0.8))` : `rgb(var(--window-header-rgb) / var(--inactive-header-opacity, 0.7))` }}>
            <div className="text-sm font-medium min-w-0 flex-1 truncate flex items-center gap-1.5" style={{ color: isActive ? 'rgb(17 24 39)' : 'rgb(156 163 175)' }}>
              {renderIconButton()}
              <span className="truncate">{displayTitle}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {allowPinOnTop && (
                <button onClick={() => setPinnedOnTop(p => !p)} title={pinnedOnTop ? 'Unpin from top' : 'Pin on top'}
                  className={`p-0.5 rounded hover:bg-gray-200 ${pinnedOnTop ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  <svg className="h-3 w-3" fill={pinnedOnTop ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" /></svg>
                </button>
              )}
              <button type="button" onClick={guardedClose} className="rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : appStyle ? (
          /* App style: small title bar like compact, but keeps minimize/maximize for full window control. */
          <div onPointerDown={startDrag}
            className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-200 shrink-0 cursor-move select-none rounded-t-lg ${isActive ? 'backdrop-blur-sm' : ''}`}
            style={{ touchAction: 'none', backgroundColor: isActive ? `rgb(var(--window-header-rgb) / var(--active-header-opacity, 0.8))` : `rgb(var(--window-header-rgb) / var(--inactive-header-opacity, 0.7))` }}>
            <div className="text-sm font-medium min-w-0 flex-1 truncate flex items-center gap-1.5" style={{ color: isActive ? 'rgb(17 24 39)' : 'rgb(156 163 175)' }}>
              {renderIconButton()}
              <span className="truncate">{displayTitle}</span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 ml-2">
              {allowPinOnTop && (
                <button onClick={() => setPinnedOnTop(p => !p)} title={pinnedOnTop ? 'Unpin from top' : 'Pin on top'}
                  className={`p-0.5 rounded hover:bg-gray-200 ${pinnedOnTop ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  <svg className="h-3 w-3" fill={pinnedOnTop ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" /></svg>
                </button>
              )}
              <button onClick={() => { const idx = activationOrder.indexOf(modalId); if (idx !== -1) activationOrder.splice(idx, 1); activeListeners.forEach(fn => fn()); window.dispatchEvent(new CustomEvent('modal-reorder')); }} title="Minimize" className="text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-200 text-xs leading-none">─</button>
              <button onClick={() => { if (maximized) { setMaximized(false); setBox(calcWindowed()); } else { reset(); } }} title={maximized ? 'Windowed' : 'Maximize'} className="text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-200 text-xs leading-none">{maximized ? '❐' : '⤢'}</button>
              <button type="button" onClick={guardedClose} className="rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
        <div onPointerDown={startDrag}
          className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0 cursor-move select-none rounded-t-lg ${isActive ? 'backdrop-blur-sm' : ''}`}
          style={{ touchAction: 'none', backgroundColor: isActive ? `rgb(var(--window-header-rgb) / var(--active-header-opacity, 0.8))` : `rgb(var(--window-header-rgb) / var(--inactive-header-opacity, 0.7))` }}>
          <div className="text-lg font-semibold min-w-0 flex-1 truncate flex items-center gap-2" style={{ color: isActive ? 'var(--window-title-active, rgb(17 24 39))' : 'var(--window-title-inactive, rgb(156 163 175))' }}>
            {renderIconButton()}
            <span className="truncate">{displayTitle}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-4">
            {hasNav && (
              <span className="flex items-center gap-1 mr-1 text-[10px] text-gray-400">
                <kbd className="rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-medium text-gray-500">K</kbd><span>Prev</span>
                <kbd className="rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 font-medium ml-1 text-gray-500">J</kbd><span>Next</span>
              </span>
            )}
            {allowPinOnTop && (
              <button onClick={() => setPinnedOnTop(p => !p)} title={pinnedOnTop ? 'Unpin from top' : 'Pin on top'}
                className={`text-xs px-2 py-1 rounded hover:bg-gray-200 ${pinnedOnTop ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                <svg className="h-3.5 w-3.5" fill={pinnedOnTop ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" /></svg>
              </button>
            )}
            <button onClick={() => { const idx = activationOrder.indexOf(modalId); if (idx !== -1) activationOrder.splice(idx, 1); activeListeners.forEach(fn => fn()); window.dispatchEvent(new CustomEvent('modal-reorder')); }} title="Minimize" className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-200">─</button>
            <button onClick={() => { if (maximized) { setMaximized(false); setBox(calcWindowed()); } else { reset(); } }} title={maximized ? 'Windowed' : 'Maximize'} className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-200">{maximized ? '❐' : '⤢'}</button>
            <kbd className="rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">ESC</kbd>
            <button type="button" onClick={guardedClose} className="rounded-md text-gray-400 hover:text-gray-600">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        )}

        {/* BODY */}
        <ModalIdContext.Provider value={modalId}>
        <ModalActionsContext.Provider value={{ rightRef: actionsRef as React.RefObject<HTMLDivElement | null>, leftRef: actionsLeftRef as React.RefObject<HTMLDivElement | null>, notify: () => setHasActions(true), active: isActive, isDirty }}>
        <div
          {...(widget ? { onPointerDown: startDrag, onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); } } : {})}
          className={`flex-1 min-h-0 flex flex-col ${widget ? 'p-0 cursor-move' : appStyle ? 'p-0' : compact ? 'p-2' : 'p-4'} ${widget ? '' : 'backdrop-blur-sm'} ${(bodyScroll === false || appStyle) ? 'overflow-hidden' : 'overflow-y-auto'} ${widget ? 'rounded-lg select-none' : ''}`}
          style={{ ...(widget ? { touchAction: 'none' } : {}), backgroundColor: widget ? 'transparent' : (isActive ? `rgb(var(--window-content-rgb) / var(--active-content-opacity, 0.9))` : `rgb(var(--window-content-rgb) / var(--inactive-content-opacity, 0.8))`) }}>
          {children}
        </div>
        </ModalActionsContext.Provider>
        </ModalIdContext.Provider>

        {/* Widget right-click context menu */}
        {widget && ctxMenu && (
          <PopupMenu minWidth={160} style={{ left: ctxMenu.x, top: ctxMenu.y }} onClose={() => setCtxMenu(null)}>
            <PopupMenuItem onClick={() => { setCtxMenu(null); window.dispatchEvent(new CustomEvent('widget-open-settings', { detail: modalId })); }}>
              Settings
            </PopupMenuItem>
            <PopupMenuDivider />
            {widgetMenu && (
              <>
                {widgetMenu}
                <PopupMenuDivider />
              </>
            )}
            <PopupMenuItem onClick={() => { setCtxMenu(null); setPinnedOnTop(p => !p); }}>
              <span className="flex-1">Always on Top</span>
              {pinnedOnTop && <svg className="h-4 w-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </PopupMenuItem>
            <PopupMenuDivider />
            <PopupMenuItem onClick={() => { setCtxMenu(null); guardedClose(); }}>
              Close
            </PopupMenuItem>
          </PopupMenu>
        )}

        {/* FOOTER — always rendered; visible when footer prop or portal actions exist; hidden for widgets/compact */}
        <div onPointerDown={startDrag}
          className={`px-4 py-2 border-t border-gray-200 shrink-0 flex items-center justify-between text-xs select-none cursor-move${isActive ? ' backdrop-blur-sm' : ''}${widget || compact || appStyle || isMobile || (!footer && !hasActions && !actions && !actionsLeft) ? ' hidden' : ''}`}
          style={{ touchAction: 'none', backgroundColor: isActive ? `rgb(var(--window-footer-rgb) / var(--active-header-opacity, 0.8))` : `rgb(var(--window-footer-rgb) / var(--inactive-header-opacity, 0.7))` }}>
          <div className="flex items-center gap-2 min-w-0">
            {actionsLeft}
            <div ref={actionsLeftRef} data-modal-actions-left className="flex items-center gap-2" />
            {footer}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <div ref={actionsRef} data-modal-actions className="flex items-center gap-2" />
            {actions}
          </div>
        </div>

        {/* RESIZE HANDLES — corners and edges (hidden in widget/mobile/exposé mode; only rendered when active to avoid z-index bleed on inactive windows) */}
        {!widget && !isMobile && !exposeActive && isActive && <>
        <div onPointerDown={e => startResizeCorner(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-10" />
        <div onPointerDown={e => startResizeCorner(e, 'sw')} className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-10" />
        <div onPointerDown={e => startResizeCorner(e, 'ne')} className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-10" />
        <div onPointerDown={e => startResizeCorner(e, 'nw')} className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-10" />
        <div onPointerDown={e => startResizeCorner(e, 'n')} className="absolute top-0 left-3 right-3 h-1 cursor-ns-resize" />
        <div onPointerDown={e => startResizeCorner(e, 's')} className="absolute bottom-0 left-3 right-3 h-1 cursor-ns-resize" />
        <div onPointerDown={e => startResizeCorner(e, 'e')} className="absolute top-3 bottom-3 right-0 w-1 cursor-ew-resize" />
        <div onPointerDown={e => startResizeCorner(e, 'w')} className="absolute top-3 bottom-3 left-0 w-1 cursor-ew-resize" />
        </>}
        {/* EXPOSÉ click capture — sits above all content so any click selects this window */}
        {exposeActive && (
          <div
            className="absolute inset-0"
            style={{ zIndex: 9999, cursor: 'pointer', background: 'transparent' }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setExposeState(false); activateModal(modalId); }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          />
        )}
      </div>
      {/* EXPOSÉ label — title under the thumbnail */}
      {exposeActive && exposeTile && (
        <div
          className="fixed pointer-events-none select-none truncate text-center"
          style={{
            left: exposeTile.x,
            top: exposeTile.y + exposeTile.h + 4,
            width: exposeTile.w,
            zIndex: 2011,
            color: 'white',
            fontSize: 12,
            fontWeight: 500,
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          {displayTitle}
        </div>
      )}
    </div>
  );

  // Window context menu
  const windowMenuEl = windowMenu && (
    <PopupMenu style={{ left: windowMenu.x, top: windowMenu.y }} onClose={() => setWindowMenu(null)} minWidth={160}>
      {!widget && !compact && (<>
        <PopupMenuItem onClick={() => {
          const idx = activationOrder.indexOf(modalId);
          if (idx !== -1) activationOrder.splice(idx, 1);
          activeListeners.forEach(fn => fn());
          window.dispatchEvent(new CustomEvent('modal-reorder'));
          setWindowMenu(null);
        }}>
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
          Minimize
        </PopupMenuItem>
        {maximized ? (
          <PopupMenuItem onClick={() => { setMaximized(false); setBox(calcWindowed()); setWindowMenu(null); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 9h15M4.5 15h15" /></svg>
            Windowed
          </PopupMenuItem>
        ) : (
          <PopupMenuItem onClick={() => { reset(); setWindowMenu(null); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
            Maximize
          </PopupMenuItem>
        )}

      </>)}
      {allowPinOnTop && (
        <PopupMenuItem onClick={() => { setPinnedOnTop(p => !p); setWindowMenu(null); }}>
          <svg className={`h-4 w-4 ${pinnedOnTop ? 'text-blue-600' : 'text-gray-400'}`} fill={pinnedOnTop ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" /></svg>
          {pinnedOnTop ? 'Unpin from Top' : 'Pin on Top'}
        </PopupMenuItem>
      )}
      {/* Custom menu items registered by child components */}
      {(_extraMenuItems[modalId] || []).length > 0 && (<>
        {(_extraMenuItems[modalId] || []).map((item, i) => (
          <PopupMenuItem key={i} onClick={() => { setWindowMenu(null); item.onClick(); }}>
            {item.icon}
            {item.label}
          </PopupMenuItem>
        ))}
      </>)}
      <PopupMenuDivider />
      <PopupMenuItem danger onClick={() => { setWindowMenu(null); guardedClose(); }}>
        <XMarkIcon className="h-4 w-4" />
        Close
      </PopupMenuItem>
    </PopupMenu>
  );

  // Always portal to body — ensures DOM persists when hidden/minimized
  return createPortal(<>{content}{windowMenuEl}</>, document.body);
}
