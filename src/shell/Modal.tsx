import { useEffect, useLayoutEffect, useCallback, useRef, useState, createContext, useContext, useSyncExternalStore, cloneElement, isValidElement, type ReactNode, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { confirm } from './ConfirmDialog';
import { useWindowManager } from './WindowManager';
import { glassStyle as getGlassStyle } from '../utils/glass';
import { PopupMenu, PopupMenuItem, PopupMenuDivider } from './PopupMenu';
import { useIsMobile } from './useIsMobile';
import { getSwipingParentKey, setSwipingParentKey, subscribeSwipingParentKey } from './mobileSwipeStore';
import WindowErrorBoundary from './WindowErrorBoundary';
import { useShellPrefs } from './ShellPrefs';
import { boxFillsWorkArea, computeMaximizedBox, isSidebarStripReserved, readAlwaysMaximizedFlag } from './workArea';

/** Context that passes the modal's unique ID to children */
const ModalIdContext = createContext<string>('');

/** Desktop-shortcut spec for the window menu's "Add to Desktop" item —
 *  the shape saved into `prefs.favorite_documents` (what <Desktop> renders
 *  as icons). Pages use entityType 'page' keyed by route; entities use
 *  their registry key + id. */
export interface WindowShortcutSpec {
  entityType: string;
  entityId: string;
  label: string;
}

const WindowShortcutContext = createContext<WindowShortcutSpec | null>(null);

/** Wraps each top-level app window (see WindowManagerProvider) so its Modal
 *  can offer "Add to Desktop" — including consumer components that render
 *  their own Modal, which a child-component approach can't reach. The
 *  outermost Modal consumes the spec and re-provides null, so nested
 *  dialogs don't repeat the item. */
export function WindowShortcutProvider({ spec, children }: { spec: WindowShortcutSpec | null; children: ReactNode }) {
  return <WindowShortcutContext.Provider value={spec}>{children}</WindowShortcutContext.Provider>;
}

/**
 * Extract just the text from a title ReactNode for non-interactive
 * contexts like the expose-mode tile header — strips buttons, inputs,
 * kbd hints, and SVG decorations so only the document/page name shows.
 *
 * The title can be anything from a plain string to a flex row with an
 * inline edit button and a copy icon. Tiles in expose mode are scaled
 * down and not interactive (clicking focuses the window), so rendering
 * the whole tree is at best ugly and at worst clipped.
 */
const TITLE_STRIP_TYPES = new Set(['button', 'input', 'textarea', 'select', 'kbd', 'svg']);
function extractTitleText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractTitleText).join('');
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    const tag = typeof el.type === 'string' ? el.type : '';
    if (TITLE_STRIP_TYPES.has(tag)) return '';
    return extractTitleText(el.props?.children);
  }
  return '';
}

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

// ── Window activation (z-order) persistence ──
const AO_KEY = 'erp_activation_order';
let _activationOrderKeys: string[] = [];
try {
  const stored = localStorage.getItem(AO_KEY);
  const parsed = stored ? JSON.parse(stored) : null;
  if (Array.isArray(parsed) && parsed.every(k => typeof k === 'string')) _activationOrderKeys = parsed;
} catch {}
let _saveOrderTimer: ReturnType<typeof setTimeout> | null = null;
function _saveOrderDebounced() {
  if (_saveOrderTimer) clearTimeout(_saveOrderTimer);
  _saveOrderTimer = setTimeout(() => {
    try { localStorage.setItem(AO_KEY, JSON.stringify(_activationOrderKeys)); } catch {}
  }, 500);
}

/**
 * Seed an initial position for a window — applied only when no saved
 * position already exists for the given key. Use this from the consumer
 * to lay out the first-run desktop without overwriting whatever the user
 * has subsequently dragged the windows to.
 *
 * The key matches the window's `windowKey` — for `openPage('/weather')`
 * that's `'page:/weather'`.
 */
export function setWindowDefaultPosition(key: string, pos: { x: number; y: number; w: number; h: number }) {
  if (_windowPositions[key]) return;
  _windowPositions[key] = pos;
  _savePositionsDebounced();
}

/** Read the saved box for a window key (viewport-relative px), or null. */
export function getWindowPosition(key: string): { x: number; y: number; w: number; h: number } | null {
  return _windowPositions[key] ? { ..._windowPositions[key] } : null;
}

/**
 * Force a window's saved position — unlike `setWindowDefaultPosition` this
 * overwrites any existing entry. Use when the consumer wants to deliberately
 * (re)place a window, e.g. the Widget Manager dropping a freshly-added widget
 * into a tidy top-left slot regardless of where it last sat. For `autoHeight`
 * windows the `h` here is only a first-paint placeholder — the window
 * re-measures its content height on open.
 */
export function setWindowPosition(key: string, pos: { x: number; y: number; w: number; h: number }) {
  _windowPositions[key] = pos;
  _savePositionsDebounced();
}

/**
 * Forget every saved box that is really "the whole work area".
 *
 * A window that was maximized persists its full-screen geometry under its
 * `windowKey`, so it reopens filling the screen even after the shell is back
 * in windowed mode — the box outlives the setting that produced it. Layout
 * Mode → Classic calls this so those windows fall back to the normal size
 * ladder on their next open. `boxFillsWorkArea` is what keeps it from
 * forgetting a window the user sized and placed by hand.
 */
export function forgetMaximizedWindowBoxes() {
  const workArea = computeMaximizedBox();
  const sidebarReserved = isSidebarStripReserved();
  let changed = false;
  for (const key of Object.keys(_windowPositions)) {
    if (boxFillsWorkArea(_windowPositions[key], workArea, sidebarReserved)) {
      delete _windowPositions[key];
      changed = true;
    }
  }
  if (changed) _savePositionsDebounced();
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Window icon — shown before title, clicking it opens window menu */
  icon?: React.ReactNode;
  /** Text to copy when the copy icon in the header is clicked (e.g. entity number) */
  copyText?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
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
  /** Flush body: keeps the STANDARD full title bar and footer, but drops the
   *  body padding so the content sits flush to the window edges (e.g. a
   *  `<SidebarLayout>`). Implies `bodyScroll: false`. */
  flushBody?: boolean;
  /** Auto-size height based on content. Window's height adapts to whatever the
   *  body renders; floored by `autoMinHeight` and capped to the available
   *  viewport so nothing overflows the screen. Naturally-flowing content (a
   *  form, a table) shrinks the window to hug it; a fill-height root (`h-full` /
   *  `flex-1` between a fixed header and footer) keeps the normal size-ladder
   *  height and scrolls internally rather than collapsing. */
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
  /** Per-section window accent (SG#00372): an `R G B` triple (e.g.
   *  '91 141 190'). When set, the panel publishes it as the
   *  `--window-accent-rgb` CSS custom property and renders a thin accent
   *  stripe across the top of the title bar, so overlapping windows from
   *  different app sections are distinguishable at a glance. The header
   *  itself stays theme-neutral — themes and the user's custom header
   *  colour are untouched. Absent = exactly the previous rendering. */
  accentRgb?: string;
  children: React.ReactNode;
}

const sizeDefaults: Record<string, number> = {
  sm: 384, md: 512, lg: 672, xl: 896, '2xl': 1152, '3xl': 1408,
};

// The user's "Default window size" preference (Settings → Behavior). Layout
// publishes it as the `--default-window-size` CSS var; here it scales a
// freshly-opened window's initial height. 'large' is the default and opens
// windows taller than 'medium' (the old fixed ladder), 'small' opens them
// shorter, and 'maximized' opens non-widget windows filling the work area
// (handled separately via the maximized state). Widgets ignore the pref —
// they're content-sized utilities. Windows with explicit `dimensions` keep
// their height for small/medium/large.
type WindowSizePref = 'small' | 'medium' | 'large' | 'maximized';
const readDefaultWindowSize = (): WindowSizePref => {
  if (typeof document === 'undefined') return 'large';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--default-window-size')?.trim();
  return v === 'small' || v === 'medium' || v === 'maximized' ? v : 'large';
};
// Multiplier applied to the per-size open-height ladder. 'medium' reproduces
// the previous fixed heights; 'large' (the default) opens 25 % taller.
const windowHeightScale: Record<WindowSizePref, number> = {
  small: 0.8, medium: 1, large: 1.25, maximized: 1.25,
};

// Track modal depth for stacking z-index and ESC handling
export let modalDepth = 0;
export const modalStack: string[] = [];
export const modalDepthRef = { get: () => modalDepth, inc: () => ++modalDepth, dec: () => --modalDepth };

// Activation order — last element is the frontmost modal
const activationOrder: string[] = [];
const activeListeners = new Set<() => void>();
// Bi-directional map between live (random per-mount) modalIds and stable
// window keys (`windowKey || copyText`). Stable keys outlive page refreshes
// and let us slot remounted modals back into their previous z-order.
const _modalIdByKey = new Map<string, string>();
const _keyByModalId = new Map<string, string>();

function _insertModalIdForKey(modalId: string, key: string) {
  const savedIdx = _activationOrderKeys.indexOf(key);
  if (savedIdx === -1) { activationOrder.push(modalId); return; }
  let insertAt = activationOrder.length;
  for (let i = 0; i < activationOrder.length; i++) {
    const otherKey = _keyByModalId.get(activationOrder[i]);
    if (!otherKey) continue;
    const otherIdx = _activationOrderKeys.indexOf(otherKey);
    if (otherIdx > savedIdx) { insertAt = i; break; }
  }
  activationOrder.splice(insertAt, 0, modalId);
}

export function mountModal(modalId: string, key: string | null) {
  if (!key) {
    activationOrder.push(modalId);
  } else {
    _modalIdByKey.set(key, modalId);
    _keyByModalId.set(modalId, key);
    _insertModalIdForKey(modalId, key);
    if (_activationOrderKeys.indexOf(key) === -1) {
      _activationOrderKeys.push(key);
      _saveOrderDebounced();
    }
  }
  activeListeners.forEach(fn => fn());
  window.dispatchEvent(new CustomEvent('modal-reorder'));
}

export function activateModal(id: string) {
  const idx = activationOrder.indexOf(id);
  if (idx !== -1) activationOrder.splice(idx, 1);
  activationOrder.push(id);
  const key = _keyByModalId.get(id);
  if (key) {
    const kidx = _activationOrderKeys.indexOf(key);
    if (kidx !== -1) _activationOrderKeys.splice(kidx, 1);
    _activationOrderKeys.push(key);
    _saveOrderDebounced();
  }
  activeListeners.forEach(fn => fn());
  window.dispatchEvent(new CustomEvent('modal-reorder'));
}

function _minimizeModal(modalId: string) {
  const idx = activationOrder.indexOf(modalId);
  if (idx !== -1) activationOrder.splice(idx, 1);
  const key = _keyByModalId.get(modalId);
  if (key) {
    const kidx = _activationOrderKeys.indexOf(key);
    if (kidx !== -1) { _activationOrderKeys.splice(kidx, 1); _saveOrderDebounced(); }
  }
  activeListeners.forEach(fn => fn());
  window.dispatchEvent(new CustomEvent('modal-reorder'));
}

// Track which modal IDs belong to widget windows; widgets stay visible when
// the user double-clicks the desktop ("show desktop"), only regular windows
// are hidden.
const widgetIds = new Set<string>();
export function deactivateAllModals() {
  for (let i = activationOrder.length - 1; i >= 0; i--) {
    if (!widgetIds.has(activationOrder[i])) activationOrder.splice(i, 1);
  }
  _activationOrderKeys = _activationOrderKeys.filter(k => {
    const mid = _modalIdByKey.get(k);
    return mid != null && widgetIds.has(mid);
  });
  _saveOrderDebounced();
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

// ── Keeping windows reachable ────────────────────────────────────────────
// A window may be parked mostly off-screen on purpose — macOS allows it, and
// so do we. What neither macOS nor Windows allows is a window you can no
// longer grab: Windows pins the caption inside the work area, macOS forbids
// going under the menu bar. We enforce the same invariant, which is also the
// only defence against the browser viewport shrinking out from under a window.
const CAPTION_H = 40;    // title-bar height that must stay inside the work area
const MIN_VISIBLE_X = 80; // horizontal strip that must stay grabbable

/** Smallest move that keeps `box` grabbable. Never resizes. Returns `box`
 *  itself when nothing moved, so callers can `setBox(clampReachable)` without
 *  forcing a re-render or re-persisting an untouched window. */
function clampReachable(box: Box, a: Box = workArea()): Box {
  const x = Math.min(Math.max(box.x, a.x + MIN_VISIBLE_X - box.w), a.x + a.w - MIN_VISIBLE_X);
  const y = Math.min(Math.max(box.y, a.y), a.y + a.h - CAPTION_H);
  return x === box.x && y === box.y ? box : { ...box, x, y };
}

/** Smallest move that brings the whole window back on screen. Shrinks it only
 *  when it is larger than the work area. */
function clampFullyVisible(box: Box, a: Box = workArea()): Box {
  const w = Math.min(box.w, a.w);
  const h = Math.min(box.h, a.h);
  return {
    w, h,
    x: Math.min(Math.max(box.x, a.x), a.x + a.w - w),
    y: Math.min(Math.max(box.y, a.y), a.y + a.h - h),
  };
}

/** Does every edge of this window sit inside the work area? A hidden panel
 *  (minimised, or hidden by show-desktop) measures 0×0 and is never reported
 *  off-screen — there is nothing to rescue. */
export function isPanelFullyVisible(panel: HTMLElement): boolean {
  const r = panel.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return true;
  const a = workArea();
  const EPS = 1;
  return r.left >= a.x - EPS && r.top >= a.y - EPS
    && r.right <= a.x + a.w + EPS && r.bottom <= a.y + a.h + EPS;
}

/** Bearing in degrees from the work-area centre toward an off-screen window
 *  (0 = right, 90 = down), for the taskbar's off-screen chevron. Null when the
 *  window is fully visible. */
export function panelOffscreenBearing(panel: HTMLElement): number | null {
  if (isPanelFullyVisible(panel)) return null;
  const r = panel.getBoundingClientRect();
  const a = workArea();
  const dx = (r.left + r.width / 2) - (a.x + a.w / 2);
  const dy = (r.top + r.height / 2) - (a.y + a.h / 2);
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

/** Ask the window owning `windowKey` to slide fully back into the work area
 *  and take focus. Handled by the `modal-reveal` listener each Modal installs.
 *  Unlike `modal-center` this keeps the window's size and roughly its position
 *  — it is a rescue, not a re-layout. */
export function revealWindow(windowKey: string) {
  window.dispatchEvent(new CustomEvent('modal-reveal', { detail: { windowKey } }));
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

// ── Pointer-gesture shield (drag/resize) ──────────────────────────────
// A window drag/resize must keep receiving pointer events for the WHOLE
// gesture. The move/up listeners live on `window`, which only sees events
// dispatched within this document. Without pointer capture, the instant the
// cursor crosses an overlapping window whose body is an <iframe> (e.g. an
// embedded editor preview), the browser routes pointermove/pointerup into that
// iframe's own document — the parent listeners fall silent, so the drag freezes
// and can stick to the cursor ("the background window interferes with the
// active window"). For the gesture's duration we therefore:
//   1. capture the pointer on the grabbed handle so events stay in this doc;
//   2. mount a transparent full-viewport shield so the pointer never reaches a
//      background iframe even if capture is unavailable, and background windows
//      don't react to the moving cursor; and
//   3. flag <body> so every window is promoted to its own compositor layer,
//      so moving the foreground window doesn't repaint the windows behind it.
//      Backdrop-blur is intentionally KEPT on every window for the gesture's
//      duration so the frosted "wallpaper-through-glass" look never flickers
//      off while dragging. Only the grabbed (top) window re-samples its blur
//      per frame — its backdrop shifts as it moves; the static windows below
//      it don't, so the cost is a single moving glass surface.
const GESTURE_STYLE_ID = 'rosh-gesture-style';
function ensureGestureStyle() {
  if (typeof document === 'undefined' || document.getElementById(GESTURE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = GESTURE_STYLE_ID;
  style.textContent =
    // Promote every window to its own compositor layer for the gesture so
    // dragging the foreground window doesn't repaint the ones behind it. We do
    // NOT drop backdrop-blur — every window keeps its frosted glass while a
    // drag/resize is in progress (only the grabbed window re-samples, cheaply).
    'body.rosh-gesturing [data-modal-panel]{will-change:transform}';
  document.head.appendChild(style);
}

const RESIZE_CURSOR: Record<'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w', string> = {
  se: 'nwse-resize', nw: 'nwse-resize', sw: 'nesw-resize', ne: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};

// Pointer travel (px) before a title-bar / resize press counts as a real
// drag. Below this a press-and-hold (or a plain click) is NOT a gesture, so
// `beginPointerGesture` (pointer capture, drag shield, compositor-layer
// promotion) never engages — a press/click that isn't a drag leaves the
// windows completely untouched.
const DRAG_THRESHOLD = 4;

/** Begin a drag/resize pointer gesture on `handle`: capture the pointer, mount
 *  a transparent shield with `cursor`, and promote windows to their own
 *  compositor layers. Returns an idempotent cleanup for the pointerup handler. */
function beginPointerGesture(handle: HTMLElement, pointerId: number, cursor: string): () => void {
  ensureGestureStyle();
  try { handle.setPointerCapture(pointerId); } catch { /* capture unsupported for this input */ }
  document.body.classList.add('rosh-gesturing');
  const shield = document.createElement('div');
  shield.setAttribute('data-drag-shield', '');
  shield.style.cssText = `position:fixed;inset:0;z-index:2147483647;cursor:${cursor};background:transparent;touch-action:none`;
  document.body.appendChild(shield);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try { handle.releasePointerCapture(pointerId); } catch { /* already released on pointerup */ }
    shield.remove();
    document.body.classList.remove('rosh-gesturing');
  };
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

// ── Escape interceptors ────────────────────────────────────────────────────
// Window content can claim an Escape press before the topmost-modal handler
// closes the window — e.g. the DXF Preview's measure tool exits AutoCAD-style
// (clear the command input, then the tool, and only a further Esc closes the
// window). Interceptors run in registration order; the first to return true
// consumes the event (the modal neither closes nor sees it). An interceptor
// is global, so it must check it belongs to the *active* modal itself (via
// `getActiveModalId()`) before consuming.
const escapeInterceptors = new Set<(e: KeyboardEvent) => boolean>();
/** Register an Escape interceptor; returns an unregister function. */
export function registerModalEscapeInterceptor(fn: (e: KeyboardEvent) => boolean): () => void {
  escapeInterceptors.add(fn);
  return () => { escapeInterceptors.delete(fn); };
}
function runEscapeInterceptors(e: KeyboardEvent): boolean {
  for (const fn of escapeInterceptors) {
    try {
      if (fn(e)) return true;
    } catch { /* a broken interceptor must not block closing */ }
  }
  return false;
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

// When the user clicks a thumbnail to leave exposé, we publish that modal's
// id here so all panels know which one is the "spotlight" pick. The picked
// panel animates from its tile back to its real box; unpicked panels stay
// pinned in their tile and fade out so the picked window has a clean stage.
let _exposeExitFocusId: string | null = null;
const _exposeExitListeners = new Set<() => void>();
function subscribeExposeExitFocus(fn: () => void) {
  _exposeExitListeners.add(fn); return () => _exposeExitListeners.delete(fn);
}
function getExposeExitFocus() { return _exposeExitFocusId; }
function setExposeExitFocus(id: string | null) {
  if (_exposeExitFocusId === id) return;
  _exposeExitFocusId = id;
  _exposeExitListeners.forEach(fn => fn());
}

// Keyboard-driven cycling through expose tiles (e.g. an ⌥⇧W shortcut in
// the host app). The highlight is purely visual feedback while the user
// browses; only commitExposeHighlight() actually focuses a window. The
// distinction matters because a host that pre-selects a window on every
// keystroke would otherwise rapidly thrash window state.
let _exposeHighlightId: string | null = null;
const _exposeHighlightListeners = new Set<() => void>();
function subscribeExposeHighlight(fn: () => void) {
  _exposeHighlightListeners.add(fn);
  return () => _exposeHighlightListeners.delete(fn);
}
function getExposeHighlight() { return _exposeHighlightId; }
export function setExposeHighlight(id: string | null) {
  if (_exposeHighlightId === id) return;
  _exposeHighlightId = id;
  _exposeHighlightListeners.forEach(fn => fn());
}
/**
 * Commit the current keyboard highlight: focus the highlighted window
 * and exit exposé with the standard "picked tile glides back" animation.
 * No-op when no highlight is set.
 */
export function commitExposeHighlight() {
  if (!_exposeHighlightId) {
    setExposeState(false);
    return;
  }
  const id = _exposeHighlightId;
  // Set exit-focus BEFORE flipping expose off, so panels see the picked
  // id on their first exit-render and pick the right role (matches the
  // mouse-click path at the bottom of this file).
  setExposeExitFocus(id);
  setExposeHighlight(null);
  setExposeState(false);
}
export { getExposeHighlight, subscribeExposeHighlight };

// Backwards-compat — old taskbar wiring fires this event; treat it as a toggle.
function triggerSplitView() {
  setExposeState(!_exposeOn);
  window.dispatchEvent(new CustomEvent('modal-split-view'));
}
export { triggerSplitView };

// Escape exits exposé. Also clear the highlight so a re-entry starts fresh.
window.addEventListener('keydown', (e) => {
  if (_exposeOn && e.key === 'Escape') {
    setExposeHighlight(null);
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
 *
 * Fades in when exposé opens and out over the same window the panels use
 * to settle back, so the user sees a single coordinated transition rather
 * than the dim disappearing the instant a tile is clicked.
 */
export function ExposeBackdrop() {
  const on = useSyncExternalStore(subscribeExpose, getExposeState);
  const [mounted, setMounted] = useState(on);
  const [visible, setVisible] = useState(on);
  useEffect(() => {
    if (on) {
      setMounted(true);
      // Next frame so the opacity:0 → opacity:1 transition kicks in.
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(t);
  }, [on]);
  if (!mounted || typeof document === 'undefined') return null;
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
        opacity: visible ? 1 : 0,
        transition: 'opacity 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    />,
    document.body
  );
}


export default function Modal({ open, onClose, title, icon, copyText, size = 'lg', dirty = false, onNext, onPrev, footer, bodyScroll, onMinimize, initialBox, actions, actionsLeft, allowPinOnTop, initialPosition, widget, compact, appStyle, flushBody, autoHeight, autoMinHeight, widgetMenu, dimensions, windowKey, openedFromKey, accentRgb, children }: ModalProps) {
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
  // "Add to Desktop" — spec provided by the WindowManager around each open
  // window; null for nested dialogs (the outermost Modal re-provides null
  // below) and for Modals used outside the window system.
  const shortcutSpec = useContext(WindowShortcutContext);
  const { prefs: shellPrefs, save: saveShellPrefs } = useShellPrefs();
  const favDocs: WindowShortcutSpec[] = shellPrefs.favorite_documents || [];
  const isOnDesktop = !!shortcutSpec && favDocs.some(d => d.entityType === shortcutSpec.entityType && d.entityId === shortcutSpec.entityId);
  const toggleDesktopShortcut = useCallback(() => {
    if (!shortcutSpec) return;
    const next = isOnDesktop
      ? favDocs.filter(d => !(d.entityType === shortcutSpec.entityType && d.entityId === shortcutSpec.entityId))
      : [...favDocs, { entityType: shortcutSpec.entityType, entityId: shortcutSpec.entityId, label: shortcutSpec.label }];
    saveShellPrefs({ favorite_documents: next });
  }, [shortcutSpec, isOnDesktop, favDocs, saveShellPrefs]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // Widget anchoring: 'left' or 'right' — determines which edge the widget is fixed to
  const [widgetAnchor, setWidgetAnchor] = useState<'left' | 'right'>(initialPosition === 'top-right' ? 'right' : 'left');
  const closingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // SG#00372: publish the per-section accent as a CSS custom property on the
  // panel element (same setProperty convention as the theme vars in
  // Layout/useTheme). The accent stripe below and any theme CSS read it via
  // `var(--window-accent-rgb)`. React never manages this key in the panel's
  // `style` prop, so the two can't fight over it.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (accentRgb) el.style.setProperty('--window-accent-rgb', accentRgb);
    else el.style.removeProperty('--window-accent-rgb');
  }, [accentRgb]);
  // SG#00391: set when a mousedown on an INACTIVE window's interactive element
  // was swallowed to raise-only — the paired click (which is what would
  // navigate an <a> or fire a button's onClick) must be eaten too.
  const swallowInactiveClickRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
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
  const exposeExitFocusId = useSyncExternalStore(subscribeExposeExitFocus, getExposeExitFocus);
  const exposeHighlightId = useSyncExternalStore(subscribeExposeHighlight, getExposeHighlight);
  const isExposeTileable = !allowPinOnTop && !widget;
  const exposeActive = exposeOn && isExposeTileable;
  // Hover highlight for the thumbnail while in exposé.
  const [exposeHovered, setExposeHovered] = useState(false);
  // Keyboard-driven highlight (set externally via setExposeHighlight). Same
  // glow as hover so cycling visually matches what a mouse user sees.
  const exposeKeyboardHighlight = exposeActive && exposeHighlightId === modalId;
  // Exit-animation window: keep `transition: transform` on the panel for ~320ms
  // after exposé closes so the panel slides smoothly back to its real box
  // instead of snapping. Without this, removing `exposeStyle` drops the
  // transition prop instantly and the browser sees no animatable change.
  // The window the user clicked (when leaving via thumbnail) becomes the
  // "picked" one: same glide-home animation as everyone else, but with a
  // spring-y curve and elevated z-index so it reads as the focal point.
  const [exposeExiting, setExposeExiting] = useState(false);
  const exposeExitRole = (exposeExiting && isExposeTileable && exposeExitFocusId === modalId)
    ? 'picked' as const
    : null;
  const prevExposeActiveRef = useRef(exposeActive);
  useEffect(() => {
    if (prevExposeActiveRef.current && !exposeActive) {
      setExposeExiting(true);
      // Wait long enough for the picked window's spring (640 ms) to settle
      // before stripping the transition rule, otherwise the late-overshoot
      // tail snaps to the final position.
      const t = setTimeout(() => {
        setExposeExiting(false);
        // Only the picked modal resets the global focus; other panels read
        // it from the store during the whole window so no race.
        if (_exposeExitFocusId === modalId) setExposeExitFocus(null);
      }, 700);
      prevExposeActiveRef.current = exposeActive;
      return () => clearTimeout(t);
    }
    prevExposeActiveRef.current = exposeActive;
  }, [exposeActive, modalId]);
  // Reset hover whenever exposé toggles off so the highlight ring doesn't
  // linger past the transition.
  useEffect(() => { if (!exposeActive) setExposeHovered(false); }, [exposeActive]);


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

  const calcMaximized = useCallback(computeMaximizedBox, []);

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
    // Initial-open height ladder. 320 px is the open-time floor — the CSS
    // minHeight (~240 px at line ~1500) stays in place as the manual-resize
    // floor, so users can still drag a window smaller. xl/2xl previously had
    // no cap and ballooned to fill the entire viewport on tall screens;
    // they're now bounded at 800 / 920 px. The ladder is then scaled by the
    // user's "Default window size" preference — 'large' (the default) opens
    // 25 % taller than the old fixed values, 'small' shorter, 'medium' keeps
    // them. All caps are further clamped to the available viewport, so small
    // screens still get a window that fits.
    const heightScale = windowHeightScale[readDefaultWindowSize()];
    const h = dimensions
        ? Math.min(dimensions[1], availH)
        : (() => { const minH = 320; const maxH = (size === 'sm' ? 500 : size === 'md' ? 600 : size === 'lg' ? 700 : size === 'xl' ? 800 : 920) * heightScale; return Math.max(minH, Math.min(maxH, window.innerHeight - taskbarH - 80)); })();
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

  const boxKey = windowKey || copyText || null;

  useEffect(() => {
    if (!open) return;
    modalDepthRef.inc();
    modalStack.push(modalId);
    mountModal(modalId, boxKey);
    // Inline dialogs (a list's detail Modal, a confirm) have no `windowKey`, so
    // they never pass through WindowManager's `activateAfterMount` and never
    // survive a refresh. mountModal would otherwise slot them into a stale
    // saved z-order (from a prior open, keyed by `copyText`) — dropping them
    // BEHIND the window they were opened from, which reads as "nothing opened".
    // A user-initiated open must come to the front, so raise keyless modals
    // here. WindowManager-managed windows (windowKey set) are fronted by
    // activateAfterMount instead and must keep their restored order on refresh.
    if (!windowKey) activateModal(modalId);
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
      const titleEl = panelRef.current?.querySelector('[data-window-title]');
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
      const titleEl = panelRef.current?.querySelector('[data-window-title]');
      if (!titleEl?.textContent?.includes(label)) return;
      activateModal(modalId);
      setWindowMenu({ x, y });
    };

    // Rescue a window the user can't reach: the smallest move that puts it
    // fully back inside the work area, shrinking it only if it is bigger than
    // the work area. Fired when the taskbar's off-screen thumbnail is clicked.
    // Deliberately narrower than `onCenter` — the window keeps its size and
    // roughly its place, because a rescue shouldn't re-layout your desktop.
    const onReveal = (e: Event) => {
      if ((e as CustomEvent).detail?.windowKey !== windowKey) return;
      activateModal(modalId);
      const cur = boxRef.current;
      const next = clampFullyVisible(cur);
      if (next.x === cur.x && next.y === cur.y && next.w === cur.w && next.h === cur.h) return;
      const panel = panelRef.current;
      const stillness = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (panel && !stillness) {
        // Animate it home so the user sees where it came from. Mid-slide the
        // panel's rect still measures as off-screen, so the taskbar marker
        // would survive its own rescue — re-poll once the window has landed.
        // `transitionend` is the honest signal; the timer is a fallback,
        // because a slide with no movement on any axis never fires one.
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          panel.style.transition = '';
          window.dispatchEvent(new CustomEvent('modal-geometry'));
        };
        panel.style.transition = 'left .28s ease, top .28s ease, width .28s ease, height .28s ease';
        panel.addEventListener('transitionend', done, { once: true });
        window.setTimeout(done, 400);
      }
      setBox(next);
    };

    window.addEventListener('modal-reorder', onReorder);
    window.addEventListener('modal-split-view', onSplitView);
    window.addEventListener('modal-center', onCenter);
    window.addEventListener('modal-reveal', onReveal);
    window.addEventListener('modal-context-menu', onCtxMenu);
    return () => {
      modalDepthRef.dec();
      const idx = modalStack.indexOf(modalId);
      if (idx !== -1) modalStack.splice(idx, 1);
      const aidx = activationOrder.indexOf(modalId);
      if (aidx !== -1) { activationOrder.splice(aidx, 1); activeListeners.forEach(fn => fn()); }
      const cleanupKey = _keyByModalId.get(modalId);
      if (cleanupKey) { _keyByModalId.delete(modalId); _modalIdByKey.delete(cleanupKey); }
      window.removeEventListener('modal-reorder', onReorder);
      window.removeEventListener('modal-split-view', onSplitView);
      window.removeEventListener('modal-center', onCenter);
      window.removeEventListener('modal-reveal', onReveal);
      window.removeEventListener('modal-context-menu', onCtxMenu);
      // Notify remaining modals to recalc z-index
      window.dispatchEvent(new CustomEvent('modal-reorder'));
    };
  }, [open, modalId, boxKey, calcMaximized]);

  // 'Maximized' default-window-size preference: a freshly-opened non-widget
  // window fills the work area. Widgets (small content-sized utilities) and
  // windows restored from a saved/explicit box are exempt.
  const openMaximized = !widget && readDefaultWindowSize() === 'maximized';

  // Restore saved position from window position store
  const [box, setBox] = useState(() => {
    if (boxKey && _windowPositions[boxKey]) {
      const saved = { ..._windowPositions[boxKey] };
      // If dimensions are specified, enforce them (override cached size but keep position)
      if (dimensions) { saved.w = dimensions[0]; if (!autoHeight) saved.h = dimensions[1]; }
      // A box saved on a larger screen must not reopen out of reach.
      return clampReachable(saved);
    }
    if (initialBox) return { x: initialBox.x, y: initialBox.y, w: initialBox.w, h: initialBox.h };
    return openMaximized ? calcMaximized() : calcWindowed();
  });
  // `autoHeight` is a *one-shot* "size to content at open time" hint, not a
  // continuous CSS rule. The panel always renders at a *definite* height
  // (`box.h`, seeded from the normal windowed size ladder), and the layout
  // effect below measures the content and adjusts `box.h` to hug it — then
  // freezes, so the window behaves as a normal fixed-size window from there
  // on (drag/resize don't re-shrink it). `autoHeight` windows always
  // re-measure on open so they stay content-aware; the saved box restores
  // position + width but its `h` is only a placeholder.
  //
  // Crucially we measure against a definite panel height rather than
  // `height: auto`. A naturally-flowing detail (a table, a form) hugs its
  // content either way, but content whose root fills its parent — the common
  // `header / flex-1 scroll region / footer` detail layout — collapses to
  // nothing under a content-sized parent and used to freeze at the
  // `autoMinHeight` floor (a useless ~240px sliver). Keeping the panel
  // definite lets such content fill the ladder height; the measurement only
  // shrinks the window when the content genuinely *doesn't* fill it.
  const [autoHeightResolved, setAutoHeightResolved] = useState(() => !autoHeight);
  // Always-maximized layout: when the Layout sets `--layout-mode: sidebar`
  // on <html>, every non-widget Modal becomes immovable and locked to
  // calcMaximized() — no windowed state, no drag-to-restore, no maximize
  // toggle button. Layout dispatches a custom event whenever the pref
  // flips so already-mounted windows refresh without needing to remount.
  const [alwaysMaximizedRaw, setAlwaysMaximizedRaw] = useState<boolean>(() => readAlwaysMaximizedFlag());
  useEffect(() => {
    const refresh = () => setAlwaysMaximizedRaw(readAlwaysMaximizedFlag());
    window.addEventListener('react-os-shell:layout-mode-changed', refresh);
    return () => window.removeEventListener('react-os-shell:layout-mode-changed', refresh);
  }, []);
  const alwaysMaximized = alwaysMaximizedRaw && !widget;
  const [maximized, setMaximized] = useState(() => {
    // Saved positions and explicit restore boxes keep their own state (the
    // open effect below restores `initialBox.maximized`); a fresh window
    // honours the 'maximized' default-window-size preference.
    if ((boxKey && _windowPositions[boxKey]) || initialBox) return alwaysMaximized;
    return alwaysMaximized || openMaximized;
  });
  const boxRef = useRef(box);
  boxRef.current = box;

  // autoHeight measurement. The panel renders at a definite height the whole
  // time; here we measure the body's content and nudge `box.h` so the window
  // hugs it. A single first-paint measurement is unreliable — the open
  // animation, the lazy/Suspense body, and async data each settle over
  // several frames, so we track the body with a ResizeObserver:
  //   • Widgets stay content-sized for their whole life (never freeze), so a
  //     widget grows/shrinks with its content — a World Clock gains height as
  //     each city's weather loads or when the user adds a city, a Currency
  //     widget hugs its rows. This holds only while a widget's root is
  //     naturally-flowing: a fill-height widget root (`h-full` / `flex-1`)
  //     would still trip the fill-detection below and pin to the ladder
  //     height, so widget roots must hug their own content rather than fill.
  //     Widgets aren't user-resizable, so there's nothing to preserve by
  //     freezing.
  //   • Other autoHeight windows (e.g. settings dialogs, entity details)
  //     measure-then-freeze once the height holds steady, then behave as
  //     normal fixed-size windows (draggable/resizable, no further reactivity).
  //
  // The measurement distinguishes content that *fills* its container from
  // content that doesn't, so it never collapses a fill-height layout:
  //   1. With the body temporarily content-sized, read its natural outer
  //      height (`bodyNatural`) and the content root's own height.
  //   2. Restore the body to its definite flex height and re-read the content
  //      root. If the content root grew, it's a fill-height layout (flex-1 /
  //      h-full) — keep the ladder height so it doesn't collapse. Otherwise
  //      the content is naturally-flowing — size the window to chrome +
  //      `bodyNatural`, clamped between the floor and the viewport.
  //
  // Two things make this robust against content that arrives *after* the first
  // paint — the common case where a detail component fetches its own data and
  // renders a small spinner before swapping in the real, taller content:
  //   • We freeze (commit the height and stop reacting) only once we've
  //     measured real content — a height *above the floor*. While the body
  //     still measures at the floor (a loading spinner / pre-data placeholder)
  //     we keep observing, so the window grows to the loaded content instead of
  //     locking at a collapsed sliver. Without this, a fetch slower than the
  //     freeze delay froze the window at the spinner height on first open
  //     (a reopen, with the data cached, rendered tall content immediately and
  //     looked fine — the tell-tale of this race).
  //   • The ResizeObserver tracks the live *content root*, not the body (which
  //     is a fixed flex height and so never resizes when content changes
  //     inside it). That catches async rows, late images, and font swaps; a
  //     MutationObserver on the body re-points it when the root element itself
  //     is replaced (spinner → content).
  useLayoutEffect(() => {
    if (autoHeightResolved) return;
    const panel = panelRef.current;
    const body = bodyRef.current;
    if (!panel || !body) return;
    const floor = autoMinHeight ?? (widget ? 0 : 240);
    const taskbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 0;
    let lastH = 0;
    let freezeTimer: ReturnType<typeof setTimeout> | null = null;
    let observed: Element | null = null;
    const measure = () => {
      const content = body.firstElementChild as HTMLElement | null;
      if (!content || panel.offsetHeight <= 0) return;
      // Keep the ResizeObserver pointed at the current content root so growth
      // inside the fixed-height body (data swapping in, images/fonts loading)
      // re-triggers measurement.
      if (content !== observed) {
        if (observed) ro.unobserve(observed);
        ro.observe(content);
        observed = content;
      }
      const chrome = panel.offsetHeight - body.offsetHeight; // title bar + footer
      // Pass 1: let the body size to its content and note the natural heights.
      const prevFlex = body.style.flex, prevOverflow = body.style.overflowY, prevHeight = body.style.height;
      body.style.flex = '0 0 auto';
      body.style.height = 'auto';
      body.style.overflowY = 'visible';
      const bodyNatural = body.offsetHeight;
      const contentNatural = content.offsetHeight;
      // Pass 2: restore the definite flex height and see if the content grew.
      body.style.flex = prevFlex;
      body.style.height = prevHeight;
      body.style.overflowY = prevOverflow;
      const contentFilled = content.offsetHeight;
      const fillsContainer = contentFilled > contentNatural + 4;
      const viewportCap = Math.max(floor, window.innerHeight - taskbarH - Math.max(0, boxRef.current.y) - 24);
      const target = fillsContainer
        ? Math.min(boxRef.current.h, viewportCap)
        : Math.min(Math.max(floor, chrome + bodyNatural), viewportCap);
      const changed = Math.abs(target - lastH) > 1;
      if (changed) {
        lastH = target;
        setBox(prev => (Math.abs(prev.h - target) > 1 ? { ...prev, h: target } : prev));
      }
      // Freeze (commit the height and stop reacting) only once real content —
      // taller than the floor — has settled. Re-evaluated on every measure so
      // the freeze is *disarmed* whenever the body sits at the floor (a loading
      // spinner / pre-data placeholder, or a brief open-animation transient).
      // Otherwise an early transient above the floor could arm the timer and
      // lock the window at the collapsed floor height before the real, taller
      // content arrives — the bug where a detail window opened as a sliver on
      // first (uncached) open but was fine on reopen. Fill-height content
      // reports the ladder height (> floor), so it still freezes promptly.
      if (!widget) {
        if (target <= floor) {
          if (freezeTimer) { clearTimeout(freezeTimer); freezeTimer = null; }
        } else if (changed || freezeTimer === null) {
          if (freezeTimer) clearTimeout(freezeTimer);
          freezeTimer = setTimeout(() => setAutoHeightResolved(true), 160);
        }
      }
    };
    const ro = new ResizeObserver(measure);
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(body, { childList: true, subtree: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); if (freezeTimer) clearTimeout(freezeTimer); };
  }, [autoHeightResolved, widget, autoMinHeight]);

  // When sidebar mode is toggled at runtime, snap existing windows to the
  // maximized box so they instantly fill the new work area.
  useEffect(() => {
    if (alwaysMaximized) {
      setMaximized(true);
      setBox(calcMaximized());
    }
  }, [alwaysMaximized, calcMaximized]);

  // Picking 'Classic' in Layout Mode means "windowed": every non-widget window
  // drops out of maximized and back onto the normal size ladder, whether it was
  // maximized by sidebar mode, by the default-window-size preference, or by
  // hand. Widgets are content-sized and never maximized, so they're exempt.
  // Layout Mode fires this on every Classic click — not only on a sidebar →
  // classic transition — so a shell already stuck full-screen can be recovered
  // without hunting through Behavior.
  //
  // The handler deliberately does *not* re-read `--layout-mode`: Layout writes
  // that var in an effect that lands after the click handler, so a guard here
  // would still see the outgoing 'sidebar' and skip the restore. Un-maximizing
  // unconditionally is safe either way — if the shell really is still in
  // sidebar mode, the alwaysMaximized effect above puts the window straight
  // back.
  useEffect(() => {
    if (widget) return;
    const restore = () => { setMaximized(false); setBox(calcWindowed()); };
    window.addEventListener('react-os-shell:restore-windowed', restore);
    return () => window.removeEventListener('react-os-shell:restore-windowed', restore);
  }, [widget, calcWindowed]);

  // Persist box position on changes (debounced to localStorage)
  useEffect(() => {
    if (open && boxKey) {
      _windowPositions[boxKey] = box;
      _savePositionsDebounced();
    }
    // Let the taskbar recompute its off-screen markers. `box` only changes on a
    // settled gesture (drag/resize commit, snap, reveal) — never per frame.
    if (open) window.dispatchEvent(new CustomEvent('modal-geometry'));
  }, [box, open, boxKey]);

  // Sync on viewport resize: refit a maximized window, and rescue a windowed
  // one the viewport has shrunk out from under.
  useEffect(() => {
    if (!open) return;
    const sync = () => {
      if (maximized) { setBox(calcMaximized()); return; }
      // Mid-gesture the panel is driven by inline styles, not `box` — leave it.
      if (document.body.classList.contains('rosh-gesturing')) return;
      // `clampReachable` returns the same object when nothing moved, so a
      // window that is already reachable neither re-renders nor re-persists.
      setBox(clampReachable);
    };
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
    // If we have a saved position in the store, restore it instead of resetting.
    // For `autoHeight` windows the stored `h` is only a placeholder — height is
    // owned by live measurement — so keep the currently-measured `h` rather
    // than clobbering it back to the (stale/seeded) saved value.
    if (boxKey && _windowPositions[boxKey]) {
      const saved = _windowPositions[boxKey];
      setBox(prev => clampReachable(autoHeight ? { ...saved, h: prev.h } : { ...saved }));
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
    // In sidebar layout mode the window is locked to the work area —
    // the title bar still activates the window but doesn't drag it.
    if (alwaysMaximized) { e.preventDefault(); return; }
    e.preventDefault();
    // The gesture (pointer capture, drag shield, compositor-layer promotion)
    // is deferred until the pointer actually moves past DRAG_THRESHOLD — a
    // press-and-hold or a plain click on the title bar must not engage any of
    // it. `null` until the first real move; started in `move`, ended in `up`.
    const dragHandle = e.currentTarget as HTMLElement;
    const dragPointerId = e.pointerId;
    let endGesture: (() => void) | null = null;
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
      // Promote to a real drag gesture on the first move past the threshold.
      if (!endGesture) {
        if (Math.abs(ev.clientX - sx) < DRAG_THRESHOLD && Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
        endGesture = beginPointerGesture(dragHandle, dragPointerId, 'move');
        // The exposé exit path leaves `transition: transform` on the panel for
        // ~320ms — a drag starting inside that window would animate/lag every
        // frame's translate below, so pin transitions off for the gesture.
        if (panel) panel.style.transition = 'none';
      }
      const nx = ox + ev.clientX - sx;
      const ny = Math.max(0, oy + ev.clientY - sy);
      // Move via transform, NOT left/top: mutating left/top invalidates layout
      // of the whole window subtree every frame — reflowing a heavy list at
      // pointer rate is what made drags stutter on older machines. translate()
      // runs on the compositor against the will-change:transform layer the
      // gesture style promotes, so the window's contents are never re-laid-out
      // or repainted mid-drag. Inline left/top stay pinned at the gesture
      // origin (matching the `box` state set above), so a mid-drag React
      // re-render re-applies the same origin and can't fight the transform —
      // with left/top writes it would snap the window back for a frame.
      if (panel) panel.style.transform = `translate(${nx - ox}px, ${ny - oy}px)`;
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
      endGesture?.();
      hideSnapPreview();
      // Commit the drag through the reachability clamp — the pointer can leave
      // the viewport, so without this a window can be shoved past the right or
      // bottom edge and never grabbed again.
      const finalBox = clampReachable({ ...boxRef.current });
      boxRef.current = finalBox;

      // Snap drop: lock to the snap target, save the pre-snap size for next drag.
      if (!widget && currentZone) {
        preSnapBoxRef.current = { x: ox, y: oy, w: actualW, h: actualH };
        const snapped = calcSnapBox(currentZone);
        // Commit the snap target inline in the same frame the transform is
        // cleared, so the panel never flashes back to the gesture origin.
        if (panel) {
          panel.style.left = `${snapped.x}px`;
          panel.style.top = `${snapped.y}px`;
          panel.style.width = `${snapped.w}px`;
          panel.style.height = `${snapped.h}px`;
          panel.style.transform = '';
          panel.style.transition = '';
        }
        setBox(snapped);
        return;
      }

      // For widgets, determine anchor side based on center position vs viewport midpoint
      if (widget) {
        const centerX = finalBox.x + finalBox.w / 2;
        const mid = window.innerWidth / 2;
        setWidgetAnchor(centerX > mid ? 'right' : 'left');
      }
      // Commit the drag delta into inline left/top and clear the transform in
      // one style pass, then sync React state once — the inline position holds
      // the window in place until the re-render lands.
      if (panel) {
        panel.style.left = `${finalBox.x}px`;
        panel.style.top = `${finalBox.y}px`;
        panel.style.transform = '';
        panel.style.transition = '';
      }
      setBox(finalBox);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  // ── Resize ──
  const startResizeCorner = useCallback((e: React.PointerEvent, corner: 'se' | 'sw' | 'ne' | 'nw' | 'n' | 's' | 'e' | 'w') => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    // Deferred until the pointer moves past DRAG_THRESHOLD (see startDrag) so a
    // stray press on a resize edge doesn't flatten every frosted window.
    const resizeHandle = e.currentTarget as HTMLElement;
    const resizePointerId = e.pointerId;
    let endGesture: (() => void) | null = null;
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
      // Write straight to the DOM per frame. Routing every frame through
      // setBox re-rendered the whole window — reflowing a heavy <iframe> body
      // on each animation frame. React state is synced once on pointer-up
      // (mirrors the drag path, which also keeps inline styles mid-gesture).
      if (panel) {
        panel.style.left = `${next.x}px`;
        panel.style.top = `${next.y}px`;
        panel.style.width = `${next.w}px`;
        panel.style.height = `${next.h}px`;
      }
    };
    const move = (ev: PointerEvent) => {
      // Promote to a real resize gesture on the first move past the threshold.
      if (!endGesture) {
        if (Math.abs(ev.clientX - sx) < DRAG_THRESHOLD && Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
        endGesture = beginPointerGesture(resizeHandle, resizePointerId, RESIZE_CURSOR[corner]);
      }
      pending = compute(ev.clientX - sx, ev.clientY - sy);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (raf) cancelAnimationFrame(raf);
      flush();
      endGesture?.();
      setBox({ ...boxRef.current });
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
      const label = typeof title === 'string' ? title : (panelRef.current?.querySelector('[data-window-title]')?.textContent || 'Window');
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
        // Window content gets first refusal (measure tools, command bars…).
        if (runEscapeInterceptors(e)) { e.preventDefault(); e.stopPropagation(); return; }
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
  // Factor that shrinks a full-size window into its exposé tile. Hoisted so the
  // hover close-button can counter-scale (1/exposeScale) back to a real,
  // clickable on-screen size no matter how small the tile is.
  const exposeScale = exposeActive && exposeTile
    ? Math.min(exposeTile.w / box.w, exposeTile.h / box.h)
    : 1;
  const exposeStyle = (() => {
    if (exposeActive && exposeTile) {
      const scale = exposeScale;
      const scaledW = box.w * scale;
      const scaledH = box.h * scale;
      const tx = exposeTile.x + (exposeTile.w - scaledW) / 2 - box.x;
      const ty = exposeTile.y + (exposeTile.h - scaledH) / 2 - box.y;
      // Hover and keyboard-cycle both light the tile up. They share the
      // same glow so a mouse user and a keyboard user are always looking
      // at the same visual cue. When both apply (mouse hovering the
      // currently-keyboard-highlighted tile), hover wins z-index-wise so
      // the hover ring stays readable above neighbours.
      const lit = exposeHovered || exposeKeyboardHighlight;
      return {
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        transformOrigin: 'top left' as const,
        transition: 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 280ms',
        cursor: 'pointer',
        // Lifted tile sits above its neighbours so the glow isn't clipped.
        zIndex: lit ? 2020 : 2010,
        boxShadow: lit
          ? '0 24px 72px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.55), 0 0 36px 12px rgba(96,165,250,0.85), 0 0 96px 28px rgba(96,165,250,0.55)'
          : '0 16px 48px rgba(0,0,0,0.55)',
        pointerEvents: 'auto' as const,
      };
    }
    if (exposeExiting && isExposeTileable) {
      // All tileable windows glide from their thumbnail back to their real
      // position simultaneously — preserve the transition rule so the
      // transform-from-tile animates instead of snapping. The "picked" one
      // (when the user clicked a thumbnail to leave) gets a spring-y curve
      // and an elevated z-index so it reads as the focal point of the move.
      // Durations are deliberately on the slow side (~600 ms) so the user
      // can read the choreography as every window slides back home.
      const picked = exposeExitRole === 'picked';
      return {
        transition: picked
          ? 'transform 640ms cubic-bezier(0.34, 1.42, 0.64, 1), box-shadow 600ms'
          : 'transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 600ms',
        ...(picked ? { zIndex: 2030 } : {}),
      };
    }
    return null;
  })();

  const content = (
    <div>
      {/* Window */}
      {/* `data-utility` marks a window that *may* be pinned on top; `data-pinned-top`
          marks one that currently *is*, and so is riding the 999 lane rather than the
          activation-order ladder. The taskbar's peek needs the latter to know which
          windows it must not restack. */}
      <div ref={panelRef} data-modal-panel data-modal-id={modalId} data-window-key={windowKey || undefined} {...(allowPinOnTop ? { 'data-utility': '' } : {})} {...(pinnedOnTop ? { 'data-pinned-top': '' } : {})} {...(widget ? { 'data-widget': '' } : {})}
        className={`fixed rounded-2xl flex flex-col overflow-hidden ${widget ? (isActive ? 'shadow-2xl' : 'shadow-lg') : `border ${isActive ? 'shadow-2xl border-gray-200' : 'shadow-lg border-gray-300'}`}`}
        onMouseDownCapture={(e) => {
          swallowInactiveClickRef.current = false;
          if (exposeActive) {
            // The exposé close button handles its own click — let it through so
            // the capture-phase "select this window" logic doesn't swallow it.
            if ((e.target as HTMLElement).closest('[data-expose-close]')) return;
            // In exposé mode, any click on a tileable window selects it.
            e.preventDefault();
            e.stopPropagation();
            // Publish the picked id BEFORE flipping exposeState off so all
            // panels see it on their first exit-render and pick the right
            // role (picked vs unpicked).
            setExposeExitFocus(modalId);
            setExposeState(false);
            activateModal(modalId);
            return;
          }
          // SG#00391: a primary-button press on an INACTIVE window's
          // interactive element raises the window and does nothing else — no
          // click-through (a link in a background tile used to navigate when
          // the user only meant to bring the window forward). Widgets and
          // pinned-on-top utility panels keep the pass-through; the active
          // window is untouched. Title-bar chrome ([data-window-chrome]:
          // close/minimize/maximize/pin/icon-menu) is exempt so a background
          // window still closes in ONE click. preventDefault here only affects
          // interactive targets, so text selection over background content is
          // unchanged.
          if (!isActive && !widget && !pinnedOnTop && e.button === 0) {
            const target = e.target as HTMLElement;
            // Ignore events bubbling out of a nested child modal's panel.
            if (target.closest('[data-modal-panel]') === panelRef.current
              && target.closest('button, input, a, select, textarea')
              && !target.closest('[data-window-chrome]')) {
              e.preventDefault();
              e.stopPropagation();
              swallowInactiveClickRef.current = true;
              setWindowMenu(null);
              activateModal(modalId);
              // If the mouseup lands OUTSIDE the panel (drag off the control),
              // no paired click reaches onClickCapture and the flag would eat
              // the next keyboard/programmatic click. mouseup fires before
              // click in the same task, so clear on the next tick — after the
              // paired click (if any) has been dispatched and consumed.
              window.addEventListener('mouseup', () => {
                setTimeout(() => { swallowInactiveClickRef.current = false; }, 0);
              }, { once: true });
            }
          }
        }}
        onClickCapture={(e) => {
          // Second half of the SG#00391 swallow: activation already happened
          // on mousedown; eat exactly the paired click so the control never
          // fires. The flag (not `isActive`, which is already true by now)
          // guards against double-activation and against eating later clicks.
          if (swallowInactiveClickRef.current) {
            swallowInactiveClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
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
          // The panel is always a definite height — even while an `autoHeight`
          // window is still measuring (box.h is seeded from the size ladder).
          // The measurement effect adjusts box.h to hug the content; rendering
          // at a definite height the whole way through means fill-height
          // content (flex-1 / h-full) never collapses to the floor.
          zIndex: pinnedOnTop ? 999 : zIndex + 1, width: box.w, height: box.h, top: box.y,
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

        {/* SG#00372: per-section accent stripe — a thin line across the top
         *  edge of the title bar, painted from --window-accent-rgb (set by the
         *  effect above when the consumer passes `accentRgb`). Overlapping
         *  windows from different app sections become distinguishable while
         *  the header itself stays theme-neutral. pointer-events-none keeps
         *  title-bar dragging/clicking unaffected; the overflow-hidden panel
         *  clips it to the rounded corners. Widgets have no title bar and
         *  mobile windows are fullscreen, so neither renders it. */}
        {accentRgb && !widget && !isMobile && (
          <div aria-hidden="true"
            className="absolute top-0 left-0 right-0 h-[3px] z-[6] pointer-events-none"
            style={{ backgroundColor: `rgb(var(--window-accent-rgb) / ${isActive ? 0.9 : 0.55})` }} />
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
          <div onPointerDown={startDrag} data-window-chrome=""
            className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-200 shrink-0 cursor-move select-none rounded-t-2xl ${isActive ? 'backdrop-blur-sm' : ''}`}
            style={{ touchAction: 'none', backgroundColor: isActive ? `rgb(var(--window-header-rgb) / var(--active-header-opacity, 0.8))` : `rgb(var(--window-header-rgb) / var(--inactive-header-opacity, 0.7))` }}>
            <div data-window-title className="text-sm font-medium min-w-0 flex-1 truncate flex items-center gap-1.5" style={{ color: isActive ? 'var(--window-title-active, rgb(17 24 39))' : 'var(--window-title-inactive, rgb(156 163 175))' }}>
              {!exposeActive && renderIconButton()}
              <span className="truncate">{exposeActive ? extractTitleText(displayTitle) : displayTitle}</span>
            </div>
            {!exposeActive && (
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
            )}
          </div>
        ) : appStyle ? (
          /* App style: small title bar like compact, but keeps minimize/maximize for full window control. */
          <div onPointerDown={startDrag} data-window-chrome=""
            className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-200 shrink-0 cursor-move select-none rounded-t-2xl ${isActive ? 'backdrop-blur-sm' : ''}`}
            style={{ touchAction: 'none', backgroundColor: isActive ? `rgb(var(--window-header-rgb) / var(--active-header-opacity, 0.8))` : `rgb(var(--window-header-rgb) / var(--inactive-header-opacity, 0.7))` }}>
            <div data-window-title className="text-sm font-medium min-w-0 flex-1 truncate flex items-center gap-1.5" style={{ color: isActive ? 'var(--window-title-active, rgb(17 24 39))' : 'var(--window-title-inactive, rgb(156 163 175))' }}>
              {!exposeActive && renderIconButton()}
              <span className="truncate">{exposeActive ? extractTitleText(displayTitle) : displayTitle}</span>
            </div>
            {!exposeActive && (
              <div className="flex items-center gap-0.5 shrink-0 ml-2">
                {allowPinOnTop && (
                  <button onClick={() => setPinnedOnTop(p => !p)} title={pinnedOnTop ? 'Unpin from top' : 'Pin on top'}
                    className={`p-0.5 rounded hover:bg-gray-200 ${pinnedOnTop ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <svg className="h-3 w-3" fill={pinnedOnTop ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" /></svg>
                  </button>
                )}
                <button onClick={() => _minimizeModal(modalId)} title="Minimize" className="text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-200 text-xs leading-none">─</button>
                {!alwaysMaximized && (
                  <button onClick={() => { if (maximized) { setMaximized(false); setBox(calcWindowed()); } else { reset(); } }} title={maximized ? 'Windowed' : 'Maximize'} className="text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-200 text-xs leading-none">{maximized ? '❐' : '⤢'}</button>
                )}
                <button type="button" onClick={guardedClose} className="rounded p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
        <div onPointerDown={startDrag} data-window-chrome=""
          className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-200 shrink-0 cursor-move select-none rounded-t-2xl ${isActive ? 'backdrop-blur-sm' : ''}`}
          style={{ touchAction: 'none', backgroundColor: isActive ? `rgb(var(--window-header-rgb) / var(--active-header-opacity, 0.8))` : `rgb(var(--window-header-rgb) / var(--inactive-header-opacity, 0.7))` }}>
          <div data-window-title className="text-base font-medium min-w-0 flex-1 truncate flex items-center gap-2" style={{ color: isActive ? 'var(--window-title-active, rgb(17 24 39))' : 'var(--window-title-inactive, rgb(156 163 175))' }}>
            {!exposeActive && renderIconButton()}
            <span className="truncate">{exposeActive ? extractTitleText(displayTitle) : displayTitle}</span>
          </div>
          {!exposeActive && (
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
              <button onClick={() => _minimizeModal(modalId)} title="Minimize" className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-200">─</button>
              {!alwaysMaximized && (
                <button onClick={() => { if (maximized) { setMaximized(false); setBox(calcWindowed()); } else { reset(); } }} title={maximized ? 'Windowed' : 'Maximize'} className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-200">{maximized ? '❐' : '⤢'}</button>
              )}
              <kbd className="rounded border border-gray-300 bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">ESC</kbd>
              <button type="button" onClick={guardedClose} className="rounded-md text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
        )}

        {/* BODY */}
        <ModalIdContext.Provider value={modalId}>
        <ModalActionsContext.Provider value={{ rightRef: actionsRef as React.RefObject<HTMLDivElement | null>, leftRef: actionsLeftRef as React.RefObject<HTMLDivElement | null>, notify: () => setHasActions(true), active: isActive, isDirty }}>
        <div
          ref={bodyRef}
          {...(widget ? { onPointerDown: startDrag, onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); } } : {})}
          className={`flex-1 min-h-0 flex flex-col ${widget ? 'p-0 cursor-move' : appStyle ? 'p-0' : flushBody ? 'p-0' : compact ? 'p-2' : 'p-4'} ${widget ? '' : 'backdrop-blur-sm'} ${(bodyScroll === false || appStyle || flushBody) ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'} ${widget ? 'rounded-2xl select-none' : ''}`}
          style={{ ...(widget ? { touchAction: 'none' } : {}), backgroundColor: widget ? 'transparent' : (isActive ? `rgb(var(--window-content-rgb) / var(--active-content-opacity, 0.9))` : `rgb(var(--window-content-rgb) / var(--inactive-content-opacity, 0.8))`) }}>
          {/* A throwing page/entity component must not unmount the desktop —
              the boundary swaps the body for an inline crash state while the
              window chrome (close/minimize) and all other windows keep running. */}
          <WindowErrorBoundary>
            {children}
          </WindowErrorBoundary>
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
            onMouseEnter={() => setExposeHovered(true)}
            onMouseLeave={() => setExposeHovered(false)}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // Activate the picked window first so its z-index lifts it
              // above the others while every panel animates back to its
              // real position. setExposeState(false) starts that exit
              // animation; the panel keeps `transition: transform` for
              // ~320ms via exposeExiting.
              activateModal(modalId);
              setExposeState(false);
            }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          >
            {/* Close button — revealed while the tile is hovered, pinned to the
             *  tile's top-right corner. It lives INSIDE the hover-capture layer
             *  (not as a sibling) so sliding the pointer onto it doesn't fire a
             *  mouseleave and flicker the hover off. Counter-scaled by
             *  1/exposeScale so it stays a real ~30px target however small the
             *  tile is; honours the dirty-close confirm via `guardedClose`. */}
            {exposeHovered && (
              <button
                type="button"
                data-expose-close
                aria-label="Close window"
                title="Close"
                className="absolute flex items-center justify-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/40 transition-colors hover:bg-red-500"
                style={{
                  top: 8,
                  right: 8,
                  width: 30,
                  height: 30,
                  transform: `scale(${1 / exposeScale})`,
                  transformOrigin: 'top right',
                  zIndex: 10000,
                }}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); guardedClose(); }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
      {/* EXPOSÉ label — title under the thumbnail (no hover styling on the
       *  text — the glow on the thumbnail itself is the affordance). */}
      {exposeActive && exposeTile && (
        <div
          className="fixed pointer-events-none select-none truncate text-center"
          style={{
            left: exposeTile.x,
            top: exposeTile.y + exposeTile.h + 4,
            width: exposeTile.w,
            zIndex: exposeHovered ? 2021 : 2011,
            color: 'white',
            fontSize: 12,
            fontWeight: 500,
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          {extractTitleText(displayTitle)}
        </div>
      )}
    </div>
  );

  // Window context menu
  const windowMenuEl = windowMenu && (
    <PopupMenu style={{ left: windowMenu.x, top: windowMenu.y }} onClose={() => setWindowMenu(null)} minWidth={160}>
      {!widget && !compact && (<>
        <PopupMenuItem onClick={() => { _minimizeModal(modalId); setWindowMenu(null); }}>
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
          Minimize
        </PopupMenuItem>
        {!alwaysMaximized && (maximized ? (
          <PopupMenuItem onClick={() => { setMaximized(false); setBox(calcWindowed()); setWindowMenu(null); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 9h15M4.5 15h15" /></svg>
            Windowed
          </PopupMenuItem>
        ) : (
          <PopupMenuItem onClick={() => { reset(); setWindowMenu(null); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
            Maximize
          </PopupMenuItem>
        ))}

      </>)}
      {allowPinOnTop && (
        <PopupMenuItem onClick={() => { setPinnedOnTop(p => !p); setWindowMenu(null); }}>
          <svg className={`h-4 w-4 ${pinnedOnTop ? 'text-blue-600' : 'text-gray-400'}`} fill={pinnedOnTop ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" /></svg>
          {pinnedOnTop ? 'Unpin from Top' : 'Pin on Top'}
        </PopupMenuItem>
      )}
      {shortcutSpec && (
        <PopupMenuItem onClick={() => { setWindowMenu(null); toggleDesktopShortcut(); }}>
          <svg className={`h-4 w-4 ${isOnDesktop ? 'text-yellow-500' : 'text-gray-400'}`} fill={isOnDesktop ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
          {isOnDesktop ? 'Remove from Desktop' : 'Add to Desktop'}
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

  // Always portal to body — ensures DOM persists when hidden/minimized.
  // Re-providing a null shortcut spec stops dialogs nested inside this
  // window from also offering "Add to Desktop" for it.
  return createPortal(
    <WindowShortcutContext.Provider value={null}>{content}{windowMenuEl}</WindowShortcutContext.Provider>,
    document.body,
  );
}
