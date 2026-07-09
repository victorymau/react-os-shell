import { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, cloneElement, isValidElement, Suspense, type ReactNode, type ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { isShellApiClientConfigured } from '../api/client';
import { WINDOW_REGISTRY, isPageEntry, isEntityEntry, type PageRegistryEntry, type ModalRegistryEntry } from '../windowRegistry/types';
import Modal, { triggerSplitView, modalDepthRef, getActiveModalId, subscribeActive, activateModal, ExposeBackdrop, WindowShortcutProvider, setWindowDefaultPosition, type WindowShortcutSpec } from './Modal';
import WindowErrorBoundary, { WindowCrashedFallback } from './WindowErrorBoundary';
import PartNumberDetailPopup from './PartNumberDetailPopup';
import LoadingSpinner from './LoadingSpinner';
import { navIcons } from '../shell-config/nav';


interface SavedBox {
  x: number; y: number; w: number; h: number; maximized: boolean;
}

export interface MinimizedItem {
  id: string;
  type: 'part_number' | 'modal' | 'page';
  label: string;
  /** Route path for icon lookup (e.g. '/orders', '/invoices') */
  route?: string;
  savedBox?: SavedBox;
  /** Entity registry key (e.g. 'order', 'manufacturer') for restore */
  entityType?: string;
  /** Entity UUID for API fetch on cross-page restore */
  entityId?: string;
  /** Cached entity data for instant rendering while refetch happens */
  entitySnapshot?: any;
  /** windowKey of the window that was active when this opened — used by the
   *  mobile swipe-to-back gesture to reveal the parent (e.g. the list a
   *  detail entity was opened from) instead of the home wallpaper. Undefined
   *  when this window opened directly from home / the start menu. */
  openedFrom?: string;
}

interface MinimizedContextType {
  openWindows: MinimizedItem[];
  openEntity: (entityType: string, entityId: string, snapshot?: any, label?: string, route?: string) => void;
  openPage: (path: string) => void;
  closeEntity: (id: string) => void;
  /** @deprecated kept for backward compat — aliases openEntity/closeEntity */
  minimize: (item: MinimizedItem) => void;
  items: MinimizedItem[];
  restore: (item: MinimizedItem) => void;
  remove: (id: string) => void;
  restoreIfMinimized: (label: string) => boolean;
  openItems: MinimizedItem[];
}

const MinimizedContext = createContext<MinimizedContextType>({
  openWindows: [],
  openEntity: () => {},
  openPage: () => {},
  closeEntity: () => {},
  minimize: () => {},
  items: [],
  restore: () => {},
  remove: () => {},
  restoreIfMinimized: () => false,
  openItems: [],
});

export function useWindowManager() {
  return useContext(MinimizedContext);
}

function RestoredPartNumber({ partNumber, savedBox, onClose, onMinimize }: { partNumber: string; savedBox?: SavedBox; onClose: () => void; onMinimize: (sb: SavedBox) => void }) {
  const { data: pn, isLoading } = useQuery({
    queryKey: ['part-number-lookup', partNumber],
    enabled: isShellApiClientConfigured(),
    queryFn: () => apiClient.get('/products/part-numbers/', { params: { search: partNumber, page_size: 1 } }).then(r => {
      const results = r.data?.results ?? r.data ?? [];
      return results.find((p: any) => p.part_number === partNumber) || results[0] || null;
    }),
  });

  return (
    <Modal
      open={true}
      onClose={onClose}
      onMinimize={onMinimize}
      initialBox={savedBox}
      size="2xl"
      title={pn ? (
        <span className="flex items-center gap-2">
          {pn.part_number}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${pn.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-300 text-gray-800'}`}>{pn.is_active ? 'Active' : 'Inactive'}</span>
        </span>
      ) : partNumber}
      footer={pn ? (
        <>
          <span className="text-gray-500">{pn.brand_name} · {pn.category_name || 'Wheel'} · {pn.manufacturer_mid || '—'}</span>
          <span className="text-gray-400">Stock: <b className="text-gray-700">{pn.stock_quantity ?? 0}</b></span>
        </>
      ) : undefined}
    >
      {isLoading ? <div className="flex items-center justify-center py-12"><LoadingSpinner /></div> : pn ? <PartNumberDetailPopup pn={pn} /> : <p className="text-sm text-gray-500">Part number not found.</p>}
    </Modal>
  );
}

/** Window → desktop-shortcut spec for the Modal window menu's "Add to
 *  Desktop" item. Pages save as entityType 'page' keyed by route; entities
 *  by registry key + id. Windows with no stable identity return null and
 *  get no menu item. */
function shortcutSpecFor(item: MinimizedItem): WindowShortcutSpec | null {
  const entityType = item.type === 'page' ? 'page' : (item.entityType || '');
  const entityId = item.type === 'page' ? (item.route || '') : (item.entityId || '');
  if (!entityType || !entityId) return null;
  return { entityType, entityId, label: item.label };
}

function PageWindow({ item, onClose }: { item: MinimizedItem; onClose: () => void }) {
  const raw = WINDOW_REGISTRY[item.route!];
  if (!raw || !isPageEntry(raw)) return null;
  const entry = raw as PageRegistryEntry;
  const Component = entry.component;
  return (
    <Modal open={true} onClose={onClose} icon={navIcons[item.route!]} title={entry.label} size={entry.size || '2xl'} allowPinOnTop={entry.allowPinOnTop} initialPosition={entry.initialPosition} widget={entry.widget} compact={entry.compact} appStyle={entry.appStyle} flushBody={entry.flushBody} autoHeight={entry.autoHeight} autoMinHeight={entry.autoMinHeight} dimensions={entry.dimensions} windowKey={item.id} openedFromKey={item.openedFrom}>
      <Suspense fallback={<div className="flex items-center justify-center py-12"><LoadingSpinner /></div>}>
        <Component />
      </Suspense>
    </Modal>
  );
}

/** Star button to favorite a document — saves to preferences.favorite_documents */
export function DocFavStar({ entityType, entityId, label }: { entityType: string; entityId: string; label: string }) {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['my-profile-sidebar'], enabled: isShellApiClientConfigured(), queryFn: () => apiClient.get('/auth/me/').then(r => r.data) });
  const favDocs: { entityType: string; entityId: string; label: string }[] = (profile?.preferences || {}).favorite_documents || [];
  const isFav = favDocs.some(d => d.entityType === entityType && d.entityId === entityId);

  const toggle = () => {
    const next = isFav
      ? favDocs.filter(d => !(d.entityType === entityType && d.entityId === entityId))
      : [...favDocs, { entityType, entityId, label }];
    apiClient.patch('/auth/me/', { preferences: { favorite_documents: next } }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
    });
  };

  return (
    <button onClick={toggle} title={isFav ? 'Remove from desktop' : 'Add to desktop'}
      className={`shrink-0 transition-colors ${isFav ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-yellow-400'}`}>
      <svg className="h-4 w-4" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </button>
  );
}

function RestoredRegistryModal({ item, onClose, onMinimize }: { item: MinimizedItem; onClose: () => void; onMinimize: (sb: SavedBox) => void }) {
  const raw = WINDOW_REGISTRY[item.entityType!];
  if (!raw || !isEntityEntry(raw)) return null;
  const entry = raw as ModalRegistryEntry;

  const [editing, setEditing] = useState(false);

  // Use queryKey from registry (matches what detail components invalidate) or derive from endpoint
  const qkPrefix = entry.queryKey || entry.endpoint.replace(/^\/|\/$/g, '').split('/').pop() || item.entityType;
  const isDuplicate = item.entitySnapshot?._duplicate;
  // Unsaved "create" windows carry a placeholder id like `new-1783415283039`
  // (openEntity mints these for a not-yet-persisted record). There is nothing to
  // fetch — the GET would always 404 — so skip the detail query, exactly as we
  // do for duplicate windows. The snapshot already drives the create form.
  const isDraft = typeof item.entityId === 'string' && item.entityId.startsWith('new-');
  const { data: entity, isLoading, refetch } = useQuery({
    queryKey: [qkPrefix, item.entityId],
    queryFn: () => apiClient.get(`${entry.endpoint}${item.entityId}/`).then(r => r.data),
    initialData: item.entitySnapshot,
    initialDataUpdatedAt: 0, // Treat snapshot as stale so query refetches immediately
    enabled: !entry.selfFetching && !isDuplicate && !isDraft && isShellApiClientConfigured(),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 60_000, // Fallback polling; WebSocket provides instant updates
    refetchIntervalInBackground: false,
  });

  // Refetch entity data whenever this modal is activated (brought to front)
  useEffect(() => {
    if (entry.selfFetching || isDuplicate || isDraft) return;
    const handler = () => { refetch(); };
    window.addEventListener('modal-reorder', handler);
    return () => window.removeEventListener('modal-reorder', handler);
  }, [refetch, entry.selfFetching, isDuplicate, isDraft]);

  // When editing, close/ESC exits edit mode instead of closing the window
  const handleClose = useCallback(() => {
    if (editing) {
      setEditing(false);
    } else {
      onClose();
    }
  }, [editing, onClose]);

  const titleBase = entry.selfFetching
    ? item.label
    : (entity ? entry.title(entity, editing, setEditing) : item.label);

  const entityIconKey = (entry as ModalRegistryEntry).icon;
  const entityIcon = entityIconKey ? navIcons[entityIconKey] : null;
  const titleContent = titleBase;

  const footerContent = (!entry.selfFetching && entity && entry.footer && !isDuplicate)
    ? entry.footer(entity)
    : undefined;

  // Components that render their own Modal — skip outer wrapper
  if (entry.rendersOwnModal) {
    // selfFetching components handle their own data loading — always render them
    if (entry.selfFetching) {
      return (
        <Suspense fallback={<LoadingSpinner />}>
          {entry.render(entity ?? item.entitySnapshot, handleClose, item.entityId, editing, setEditing)}
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<LoadingSpinner />}>
        {isLoading && !entity ? (
          <LoadingSpinner />
        ) : entity ? (
          entry.render(entity, handleClose, item.entityId, editing, setEditing)
        ) : (
          <Modal open={true} onClose={onClose} title={item.label} size={(entry.size || '2xl') as any}>
            <p className="text-sm text-gray-500 py-8 text-center">Not found.</p>
          </Modal>
        )}
      </Suspense>
    );
  }

  return (
    <Modal
      open={true}
      onClose={handleClose}
      onMinimize={onMinimize}
      initialBox={item.savedBox}
      icon={entityIcon}
      title={titleContent}
      footer={footerContent}
      copyText={item.label}
      windowKey={item.id}
      openedFromKey={item.openedFrom}
      size={(entry.size || '2xl') as any}
      dimensions={entry.dimensions}
      autoHeight={entry.autoHeight}
      autoMinHeight={entry.autoMinHeight}
      appStyle={entry.appStyle}
    >
      <Suspense fallback={<LoadingSpinner />}>
        {entry.selfFetching ? (
          entry.render(null, handleClose, item.entityId, editing, setEditing)
        ) : isLoading && !entity ? (
          <LoadingSpinner />
        ) : entity ? (
          entry.render(entity, handleClose, item.entityId, editing, setEditing)
        ) : (
          <p className="text-sm text-gray-500 py-8 text-center">Not found.</p>
        )}
      </Suspense>
    </Modal>
  );
}


/** Find a modal panel by its window key (the openWindows item id). */
function findPanelByWindowKey(key: string): HTMLElement | null {
  return document.querySelector(`[data-modal-panel][data-window-key="${key}"]`) as HTMLElement | null;
}

/** Look up the windowKey of whichever modal is currently active. Used when
 *  opening a new window so we can record what was on screen at the moment of
 *  open as the new window's `openedFrom` — drives the mobile swipe-to-back
 *  gesture's "reveal the parent" behavior. Returns undefined when nothing is
 *  active (i.e. the user opened from home / start menu). */
function currentlyActiveWindowKey(): string | undefined {
  const activeId = getActiveModalId();
  if (!activeId) return undefined;
  const panel = document.querySelector(`[data-modal-panel][data-modal-id="${activeId}"]`) as HTMLElement | null;
  return panel?.getAttribute('data-window-key') ?? undefined;
}

/** Module-level mirror of windowKey → route for the currently-open
 *  windows. Kept in sync by the Provider's effect (see below). Lets
 *  non-React code (e.g. a bug-report submit callback) ask "which app
 *  window is the user currently looking at" without grabbing context.
 *  Bug-report and similar HeadlessUI dialogs don't go through the
 *  shell's Modal store, so the active window key keeps pointing at
 *  the underlying app window even while such a dialog is open. */
const routeByWindowKey = new Map<string, string>();

/** Public, framework-free helper: route ('/orders', '/qc-reports', …)
 *  of the window the user is currently focused on. Returns undefined
 *  when no app window is active (start menu / dashboard with nothing
 *  open). Useful for code paths that fire outside React render — the
 *  shell consumer can stamp metadata on a payload (e.g. "which module
 *  is this bug report against?") without needing to lift state. */
export function getActiveWindowRoute(): string | undefined {
  const key = currentlyActiveWindowKey();
  if (!key) return undefined;
  return routeByWindowKey.get(key);
}

/** Find a modal panel whose title text contains `label`. Used as a fallback
 *  when no window key is available (legacy code paths). */
function findPanelByLabel(label: string): HTMLElement | null {
  const panels = document.querySelectorAll('[data-modal-panel]');
  for (const p of Array.from(panels)) {
    const t = p.querySelector('[data-window-title]');
    if (t?.textContent?.includes(label)) return p as HTMLElement;
  }
  return null;
}

// Aero-peek: while the user hovers a taskbar thumbnail, fade every open window
// down to 40% except the one the thumbnail belongs to, which stays fully
// opaque so it stands out on the desktop behind the popover. Toggled purely
// via a body class + a marker attribute — never touches a panel's inline
// styles, so it cleans up for free and can't be stranded. The dim animates
// (transition is scoped to `.rosh-peeking`); dropping the class snaps every
// window crisply back to full. Mirrors `ensureGestureStyle` in Modal.tsx.
const PEEK_STYLE_ID = 'rosh-peek-style';
function ensurePeekStyle() {
  if (typeof document === 'undefined' || document.getElementById(PEEK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PEEK_STYLE_ID;
  style.textContent =
    'body.rosh-peeking [data-modal-panel]{transition:opacity .18s ease;opacity:.4}' +
    'body.rosh-peeking [data-modal-panel][data-peek-focus]{opacity:1}';
  document.head.appendChild(style);
}

/** Bring `panel` forward by fading every other open window to 40%. Passing
 *  null clears the effect. Re-marking a different panel while already peeking
 *  keeps the body class on, so sliding between thumbnails cross-fades the two
 *  windows instead of flashing everything back to full opacity. */
function setPeekFocus(panel: HTMLElement | null) {
  if (typeof document === 'undefined') return;
  ensurePeekStyle();
  document.querySelectorAll('[data-modal-panel][data-peek-focus]')
    .forEach(el => el.removeAttribute('data-peek-focus'));
  if (panel) panel.setAttribute('data-peek-focus', '');
  document.body.classList.toggle('rosh-peeking', !!panel);
}

/** Drop the peek — restore every window to full opacity. */
function clearPeekFocus() {
  if (typeof document === 'undefined') return;
  document.body.classList.remove('rosh-peeking');
  document.querySelectorAll('[data-modal-panel][data-peek-focus]')
    .forEach(el => el.removeAttribute('data-peek-focus'));
}

/** Render a single window snapshot. The card sizes itself to the source
 *  panel's aspect ratio (clamped to maxW × maxH) so the snapshot fills
 *  the card with no empty letterboxing. When the source window is
 *  hidden (zero rect — e.g. show-desktop just minimised it) we fall
 *  back to a frosted card with the icon + label so the preview is
 *  never empty. When `titleAbove` is true the bottom overlay label
 *  is dropped — the parent renders the title in a row above instead. */
/** Snapshot card for an open window. Exported for the mobile switcher.
 *  See JSDoc above for sizing/snapshot semantics. */
export function ThumbCard({ id, label, maxW, maxH, titleAbove = false, onClick, onClose }: {
  id: string; label: string; maxW: number; maxH: number; titleAbove?: boolean; onClick?: () => void; onClose?: () => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: maxW, h: Math.round(maxH * 0.75) });
  const [hasSnapshot, setHasSnapshot] = useState(false);

  useLayoutEffect(() => {
    const inner = previewRef.current;
    if (!inner) return;
    const target = findPanelByWindowKey(id) ?? findPanelByLabel(label);
    if (!target) { setHasSnapshot(false); return; }
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) { setHasSnapshot(false); return; }
    const ratio = Math.min(maxW / rect.width, maxH / rect.height);
    const cardW = Math.max(80, Math.round(rect.width * ratio));
    const cardH = Math.max(60, Math.round(rect.height * ratio));
    setSize({ w: cardW, h: cardH });
    setHasSnapshot(true);
    const clone = target.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.top = '0'; clone.style.left = '0';
    clone.style.right = 'auto'; clone.style.bottom = 'auto';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.transform = `scale(${ratio})`;
    clone.style.transformOrigin = 'top left';
    clone.style.pointerEvents = 'none';
    clone.style.animation = 'none';
    clone.removeAttribute('data-modal-panel');
    clone.removeAttribute('data-modal-id');
    clone.removeAttribute('data-window-key');
    clone.querySelectorAll<HTMLElement>('[role="dialog"], [data-portal]').forEach(el => { el.style.display = 'none'; });
    inner.innerHTML = '';
    inner.appendChild(clone);
    return () => { inner.innerHTML = ''; };
  }, [id, label, maxW, maxH]);

  return (
    <div
      style={{ width: size.w, height: size.h }}
      className="relative rounded-md overflow-hidden bg-white/95 border border-gray-300 shadow-md cursor-pointer ring-2 ring-transparent group-hover:ring-blue-400 transition shrink-0"
      onClick={onClick}
    >
      <div ref={previewRef} className="absolute inset-0 overflow-hidden" />
      {!hasSnapshot && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z M3.75 9h16.5" />
          </svg>
          <span className="mt-1 text-[10px] uppercase tracking-wide">Hidden</span>
        </div>
      )}
      {!titleAbove && (
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] font-medium text-white bg-gradient-to-t from-black/80 to-transparent truncate pointer-events-none">
          {label}
        </div>
      )}
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-gray-900/90 ring-1 ring-white/80 shadow-sm hover:bg-red-500 text-white flex items-center justify-center"
          title="Close window"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}

/** Hover popover — single thumbnail for a single window, or a row of
 *  thumbnails for a grouped set so the user can pick which instance to
 *  activate. Each thumb sizes to its window's aspect ratio (clamped).
 *  After mount, the popover measures its own bounding box and centers
 *  itself horizontally on the button below — fixed-width math doesn't
 *  hold once cards reflect their source aspect ratios. */
function TaskbarTabPreview({ items, anchorEl, onActivate, onClose, onMouseEnter, onMouseLeave }: {
  items: MinimizedItem[]; anchorEl: HTMLElement; onActivate: (id: string) => void; onClose: (id: string) => void;
  onMouseEnter: () => void; onMouseLeave: () => void;
}) {
  const MAX_W = 240;
  const MAX_H = 160;
  const isGroup = items.length > 1;
  const popoverRef = useRef<HTMLDivElement>(null);
  // Provisional position (off-screen above viewport) so we can measure the
  // actual rendered size before snapping into place. This avoids a single
  // mis-aligned frame.
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: -9999, top: -9999, ready: false });
  const [taskbarPos, setTaskbarPos] = useState<string>(() =>
    typeof document !== 'undefined'
      ? (getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom')
      : 'bottom'
  );

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const measure = () => {
      const tabRect = anchorEl.getBoundingClientRect();
      const popRect = el.getBoundingClientRect();
      const tbPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
      setTaskbarPos(tbPos);
      let left = tabRect.left + tabRect.width / 2 - popRect.width / 2;
      let top: number;
      if (tbPos === 'top') {
        top = tabRect.bottom + 8;
      } else if (tbPos === 'left') {
        left = tabRect.right + 8;
        top = tabRect.top + tabRect.height / 2 - popRect.height / 2;
      } else if (tbPos === 'right') {
        left = tabRect.left - popRect.width - 8;
        top = tabRect.top + tabRect.height / 2 - popRect.height / 2;
      } else {
        // bottom
        top = tabRect.top - popRect.height - 8;
      }
      // Clamp to viewport.
      left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - popRect.height - 8));
      setPos({ left, top, ready: true });
    };
    measure();
    // Re-measure when child cards finalise their size (they pick their
    // dimensions in a useLayoutEffect after the first paint).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchorEl, items.length]);

  // Safety net: always drop the peek when the popover unmounts, so the
  // desktop never gets stranded dimmed if the mouse never fires a leave
  // (e.g. the popover closes because its taskbar button was activated).
  useEffect(() => clearPeekFocus, []);

  // When the taskbar is on top, the popover hangs below the tab, so the
  // snapshot should sit closest to the tab (i.e. on top of the popover) and
  // the title sits beneath it. Every other taskbar position keeps the title
  // above the snapshot.
  const titleBelow = taskbarPos === 'top';
  const titleClass = `${titleBelow ? 'mt-1' : 'mb-1'} max-w-[240px] truncate text-[11px] font-medium text-gray-900 bg-white/80 px-2 py-0.5 rounded shadow-sm ring-2 ring-transparent transition group-hover:ring-blue-400`;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999,
        maxWidth: 'calc(100vw - 16px)',
        opacity: pos.ready ? 1 : 0,
      }}
      className={isGroup ? 'flex gap-2 flex-wrap' : ''}
      onMouseEnter={onMouseEnter}
      onMouseLeave={() => { clearPeekFocus(); onMouseLeave(); }}
    >
      {items.map(it => (
        <div
          key={it.id}
          className="group flex flex-col items-center"
          onMouseEnter={() => setPeekFocus(findPanelByWindowKey(it.id) ?? findPanelByLabel(it.label))}
        >
          {!titleBelow && <span className={titleClass}>{it.label}</span>}
          <ThumbCard
            id={it.id}
            label={it.label}
            maxW={MAX_W}
            maxH={MAX_H}
            titleAbove
            onClick={() => onActivate(it.id)}
            onClose={() => onClose(it.id)}
          />
          {titleBelow && <span className={titleClass}>{it.label}</span>}
        </div>
      ))}
    </div>,
    document.body,
  );
}

function TaskbarWindows({ openWindows, onRemove, onCloseAll, onSplitView, onActivate, onActivateById }: {
  openWindows: MinimizedItem[]; onRemove: (id: string) => void; onCloseAll: () => void; onSplitView: () => void;
  onActivate: (label: string) => void;
  onActivateById: (id: string) => void;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById('taskbar-windows');
    if (el) setTarget(el);
    else { const t = setInterval(() => { const e = document.getElementById('taskbar-windows'); if (e) { setTarget(e); clearInterval(t); } }, 100); return () => clearInterval(t); }
  }, []);

  const activeModalId = useSyncExternalStore(subscribeActive, getActiveModalId);

  // Re-render the taskbar when any window's title changes so the dynamic
  // title (e.g. "Untitled - Spreadsheets") shows up on the tab.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const onTitle = () => forceTick(t => t + 1);
    window.addEventListener('window-title-update', onTitle);
    return () => window.removeEventListener('window-title-update', onTitle);
  }, []);
  const liveTitle = (label: string): string => {
    const panel = findPanelByLabel(label);
    const titleEl = panel?.querySelector('[data-window-title]');
    return titleEl?.textContent?.trim() || label;
  };

  const [hoveredItems, setHoveredItems] = useState<MinimizedItem[] | null>(null);
  const [hoveredAnchor, setHoveredAnchor] = useState<HTMLElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEnter = (items: MinimizedItem[], el: HTMLElement) => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    hoverTimerRef.current = setTimeout(() => { setHoveredItems(items); setHoveredAnchor(el); }, 350);
  };
  const handleLeave = () => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    hoverTimerRef.current = setTimeout(() => { setHoveredItems(null); setHoveredAnchor(null); }, 150);
  };
  const cancelLeave = () => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
  };
  // Filter out utility apps (e.g. calculator) from taskbar tabs
  const tabWindows = openWindows.filter(item => !item.route || !(WINDOW_REGISTRY[item.route] as PageRegistryEntry)?.utility);
  if (!target || tabWindows.length === 0) return null;

  // Group windows into one taskbar button with a count badge instead of N
  // tabs. Same-route `multiInstance` copies stack; windows that declare a
  // shared `taskbarGroup.key` also stack ACROSS routes (e.g. the Storefront
  // console + the editors it opens), taking the group's label + icon.
  type Group = { key: string; route?: string; label: string; items: MinimizedItem[] };
  const groups: Group[] = [];
  const idx = new Map<string, number>();
  for (const item of tabWindows) {
    const entry = item.route ? (WINDOW_REGISTRY[item.route] as PageRegistryEntry | undefined) : undefined;
    const grp = entry?.taskbarGroup;
    const key = grp?.key ?? item.route ?? `entity:${item.id}`;
    const i = idx.get(key);
    if (i !== undefined) {
      groups[i].items.push(item);
    } else {
      idx.set(key, groups.length);
      // A cross-route group shows its own label + icon; a plain route group
      // shows the window's registry label + its own route icon (as before).
      const label = grp?.label ?? entry?.label ?? item.label;
      groups.push({ key, route: grp?.icon ?? item.route, label, items: [item] });
    }
  }

  return createPortal(
    <>
      {groups.map(group => {
        const icon = group.route ? navIcons[group.route] : null;
        // The "primary" item for activation/preview: the most recently opened.
        const primary = group.items[group.items.length - 1];
        // Group is active if any of its instances is the active modal.
        let isActive = false;
        if (activeModalId) {
          const panel = document.querySelector(`[data-modal-id="${activeModalId}"]`);
          if (panel) {
            const titleEl = panel.querySelector('[data-window-title]');
            const titleText = titleEl?.textContent ?? '';
            isActive = group.items.some(it => titleText.includes(it.label));
          }
        }
        const isGrouped = group.items.length > 1;

        return (
          <button key={group.key} onClick={() => onActivateById(primary.id)}
            onMouseEnter={(e) => handleEnter(group.items, e.currentTarget)}
            onMouseLeave={handleLeave}
            onDoubleClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('modal-center', { detail: { label: primary.label } })); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('modal-context-menu', { detail: { label: primary.label, x: e.clientX, y: e.clientY } })); }}
            style={{ width: 'var(--window-tab-width, 200px)', fontSize: 'var(--window-tab-font-size, 12px)' }}
            data-tab-group={group.key}
            className={`group relative flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition-all min-w-0 shrink ${
              isActive ? 'bg-blue-100/60 border border-blue-400/60 text-blue-700' : 'bg-gray-50/40 border border-gray-200/40 text-gray-700 hover:bg-gray-200/40'
            }`}>
            {icon && isValidElement(icon)
              ? cloneElement(icon as ReactElement, { className: `h-3.5 w-3.5 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}` })
              : <svg className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            }
            <span className="truncate flex-1">{isGrouped ? group.label : liveTitle(primary.label)}</span>
            {isGrouped && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-blue-500/80 text-white text-[10px] font-bold leading-none">{group.items.length}</span>
            )}
            {!isGrouped && (
              <span role="button" onClick={(e) => { e.stopPropagation(); onRemove(primary.id); }} className="ml-auto text-gray-400 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </span>
            )}
          </button>
        );
      })}
      <div className="flex-1" />
      {tabWindows.length >= 2 && (
        <button onClick={onSplitView} title="Exposé — show all open windows as thumbnails"
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 transition-colors shrink-0">
          {/* 2×2 grid icon — exposé toggle, mirrors macOS Mission Control. */}
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
          </svg>
          Exposé
        </button>
      )}
      {hoveredItems && hoveredAnchor && (
        <TaskbarTabPreview
          items={hoveredItems}
          anchorEl={hoveredAnchor}
          onActivate={(id) => { onActivateById(id); setHoveredItems(null); setHoveredAnchor(null); }}
          onClose={(id) => { onRemove(id); setHoveredItems(null); setHoveredAnchor(null); }}
          onMouseEnter={cancelLeave}
          onMouseLeave={handleLeave}
        />
      )}
    </>,
    target
  );
}

const SESSION_KEY = 'erp_open_windows';

function saveWindowState(windows: MinimizedItem[]) {
  try {
    const serializable = windows.map(w => ({ ...w, entitySnapshot: undefined }));
    localStorage.setItem(SESSION_KEY, JSON.stringify(serializable));
  } catch { /* storage full */ }
}

const DEFAULT_WIDGETS: MinimizedItem[] = [
  { id: 'page:/weather', type: 'page', label: 'Weather', route: '/weather' },
  { id: 'page:/currency', type: 'page', label: 'Currency Converter', route: '/currency' },
  { id: 'page:/world-clock', type: 'page', label: 'World Clock', route: '/world-clock' },
];

/**
 * Lay the first-run default widgets out in a tidy top-left column — mirroring
 * the Widget Manager's placement — so a brand-new account opens with its widgets
 * stacked down the left edge instead of piled in the centre (which is what
 * Modal's `calcWindowed` no-saved-position fallback does). We seed the shared
 * window-position store *before* the widgets mount, so each Modal restores from
 * it on open. `setWindowDefaultPosition` is a no-op once a real saved position
 * exists, so this never disturbs a returning user who has dragged things around.
 *
 * Every default widget is `autoHeight`, so it re-measures to its content on open
 * — the heights here are only first-paint estimates for a non-overlapping stack.
 */
function seedDefaultWidgetPositions(widgets: MinimizedItem[]) {
  const PAD = 20, GAP = 16, MAX_AUTO_H = 220;
  const cs = getComputedStyle(document.documentElement);
  const tbH = parseInt(cs.getPropertyValue('--taskbar-height')) || 0;
  const tbW = parseInt(cs.getPropertyValue('--taskbar-width')) || 0;
  const tbPos = cs.getPropertyValue('--taskbar-position').trim() || 'bottom';
  const sidebarW = parseInt(cs.getPropertyValue('--sidebar-width')) || 0;
  const leftStart = (tbPos === 'left' ? tbW : 0) + sidebarW + PAD;
  const topStart = (tbPos === 'top' ? tbH : 0) + PAD;
  const maxBottom = window.innerHeight - (tbPos === 'bottom' ? tbH : 0) - PAD;
  const rightLimit = window.innerWidth - PAD;

  let x = leftStart, y = topStart;
  for (const item of widgets) {
    if (!item.route) continue;
    const e = WINDOW_REGISTRY[item.route];
    if (!e || !isPageEntry(e)) continue;
    const entry = e as PageRegistryEntry;
    const w = entry.dimensions?.[0] ?? 320;
    const h = entry.dimensions?.[1] ?? 240;
    const stackH = entry.autoHeight ? Math.min(h, MAX_AUTO_H) : h;
    // Wrap to a fresh column when this one is full — but only if the next column
    // still fits on-screen, so a widget never gets pushed off the right edge.
    if (y > topStart && y + stackH > maxBottom && x + (w + GAP) + w <= rightLimit) {
      x += w + GAP;
      y = topStart;
    }
    setWindowDefaultPosition(item.id, { x, y, w, h });
    y += stackH + GAP;
  }
}

/** Heal a restored session against the legacy id-collision bug. Builds before
 *  3.14.1 derived a modal window's `id` from its (non-unique) label, so two
 *  records sharing a label persisted with the same `id` — duplicate React keys
 *  left one window un-closeable, and a plain reload restored it just as broken.
 *  Re-key any collided modal to its stable entity identity (matching what
 *  `openEntity` now emits) and drop any that still collide (the same entity
 *  persisted twice), so a reload resolves a stuck pair instead of resurrecting
 *  it. Non-collided windows keep their stored id so their saved box/z-order is
 *  preserved. */
function healWindowIds(items: MinimizedItem[]): MinimizedItem[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.id, (counts.get(it.id) ?? 0) + 1);
  const seen = new Set<string>();
  const out: MinimizedItem[] = [];
  for (const it of items) {
    let id = it.id;
    if ((counts.get(it.id) ?? 0) > 1 && it.type === 'modal' && it.entityType && it.entityId) {
      id = `${it.entityType}:${it.entityId}`;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id === it.id ? it : { ...it, id });
  }
  return out;
}

function restoreWindowState(): MinimizedItem[] {
  try {
    if (window.location.pathname === '/login') return [];
    if (!localStorage.getItem('access_token')) return [];
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) return healWindowIds(JSON.parse(stored));
  } catch { /* corrupt data */ }
  // First run for this account — no saved session yet. Seed a top-left stack so
  // the default widgets don't open piled in the centre of the desktop.
  seedDefaultWidgetPositions(DEFAULT_WIDGETS);
  return DEFAULT_WIDGETS;
}

const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password', '/force-change-password'];

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isAuthPage = AUTH_PAGES.some(p => location.pathname.startsWith(p));
  const [openWindows, setOpenWindows] = useState<MinimizedItem[]>(() => restoreWindowState());

  // Persist window state on every change — but don't save empty on initial mount (login page)
  const hasUserActed = useRef(false);
  useEffect(() => {
    if (openWindows.length > 0) hasUserActed.current = true;
    if (hasUserActed.current) saveWindowState(openWindows);

    // Mirror windowKey → route into the module-level map exported as
    // `getActiveWindowRoute()`. Snapshot semantics: we rebuild from
    // scratch on every change so closed windows drop out cleanly.
    routeByWindowKey.clear();
    for (const w of openWindows) {
      if (w.route) routeByWindowKey.set(w.id, w.route);
    }
  }, [openWindows]);

  const closeEntity = useCallback((id: string) => {
    setOpenWindows(prev => prev.filter(m => m.id !== id));
  }, []);

  // Bring the just-spawned window with `windowKey` to the front after React
  // renders its panel. Without this, mountModal would slot the new modal into
  // its previously-saved z-order (from localStorage), placing it behind the
  // currently active window — wrong for user-initiated opens.
  const activateAfterMount = (windowKey: string) => {
    setTimeout(() => {
      const panel = document.querySelector(`[data-modal-panel][data-window-key="${windowKey}"]`);
      const mid = panel?.getAttribute('data-modal-id');
      if (mid) activateModal(mid);
    }, 50);
  };

  const openEntity = useCallback((entityType: string, entityId: string, snapshot?: any, label?: string, route?: string) => {
    if (!WINDOW_REGISTRY[entityType] || !isEntityEntry(WINDOW_REGISTRY[entityType])) return;
    // The window's identity must equal the dedup identity (entityType + entityId),
    // NOT the human `label`. Two different records that share a label — e.g. two
    // wheel finishes on the same design ("Yakama") — would otherwise both get
    // `id = label`, so they collided: duplicate React keys in the render map and a
    // shared `windowKey`/`boxKey`. Closing one then filtered both out of state but
    // left the other's portal panel stranded, its close button a no-op. Keying by
    // the entity identity guarantees no two live windows can share an id (that's
    // exactly what the `existing` dedup below already enforces).
    const id = `${entityType}:${entityId}`;
    const openedFrom = currentlyActiveWindowKey();
    // If already open, just activate it
    setOpenWindows(prev => {
      // Compare entityId as a string so a numeric id from one call site and the
      // string form from another (`42` vs '42') still dedup to one window — and
      // stay consistent with `id` above, which coerces both to the same string.
      const existing = prev.find(m => m.entityType === entityType && String(m.entityId) === String(entityId));
      if (existing) {
        activateAfterMount(existing.id);
        return prev;
      }
      activateAfterMount(id);
      return [...prev, {
        id, type: 'modal' as const, label: label || entityId,
        route: route || window.location.pathname,
        entityType, entityId, entitySnapshot: snapshot,
        openedFrom,
      }];
    });
  }, []);

  /** Open a page as a window — reuse if already open */
  const openPage = useCallback((path: string) => {
    if (!WINDOW_REGISTRY[path] || !isPageEntry(WINDOW_REGISTRY[path])) return;
    const entry = WINDOW_REGISTRY[path] as PageRegistryEntry;
    const openedFrom = currentlyActiveWindowKey();
    setOpenWindows(prev => {
      // Multi-instance pages always spawn a new window with a unique id.
      if (entry.multiInstance) {
        const instanceCount = prev.filter(m => m.type === 'page' && m.route === path).length;
        const nextNum = instanceCount + 1;
        const id = `page:${path}:${Math.random().toString(36).slice(2, 8)}`;
        activateAfterMount(id);
        return [...prev, {
          id, type: 'page' as const,
          label: instanceCount === 0 ? entry.label : `${entry.label} ${nextNum}`,
          route: path,
          openedFrom,
        }];
      }
      const existing = prev.find(m => m.type === 'page' && m.route === path);
      if (existing) {
        // Widgets toggle on/off; non-widgets activate (bring to front)
        if (entry.widget) {
          return prev.filter(m => m !== existing);
        }
        activateAfterMount(existing.id);
        return prev;
      }
      const id = `page:${path}`;
      activateAfterMount(id);
      return [...prev, {
        id, type: 'page' as const, label: entry.label,
        route: path,
        openedFrom,
      }];
    });
  }, []);

  // Backward compat stubs
  const minimize = useCallback(() => {}, []);
  const restore = useCallback(() => {}, []);
  const remove = closeEntity;
  const restoreIfMinimized = () => false;

  return (
    <MinimizedContext.Provider value={{ openWindows, openEntity, openPage, closeEntity, minimize, items: [], openItems: openWindows, restore, remove, restoreIfMinimized }}>
      {children}

      {/* Taskbar windows */}
      <TaskbarWindows
        openWindows={openWindows}
        onRemove={closeEntity}
        onCloseAll={() => setOpenWindows([])}
        onSplitView={triggerSplitView}
        onActivate={(label) => {
          const panels = document.querySelectorAll('[data-modal-panel]');
          panels.forEach(p => {
            const titleEl = p.querySelector('[data-window-title]');
            if (titleEl?.textContent?.includes(label)) {
              const mid = p.getAttribute('data-modal-id');
              if (mid) activateModal(mid);
            }
          });
        }}
        onActivateById={(id) => {
          const panel = document.querySelector(`[data-modal-panel][data-window-key="${id}"]`);
          const mid = panel?.getAttribute('data-modal-id');
          if (mid) activateModal(mid);
        }}
      />

      {/* Exposé backdrop — singleton overlay shown when exposé mode is on. */}
      <ExposeBackdrop />

      {/* All open windows — pages and entities (hidden on auth pages).
          Modal already guards its body content; this outer boundary is the
          last resort for crashes outside the body — a registry title()/footer()
          throwing on malformed data, or a rendersOwnModal component dying
          before its Modal mounts — so one bad window can never unmount the
          desktop. The fallback swaps the window for a plain Modal carrying the
          same crash state; its close button still removes the window. */}
      {!isAuthPage && openWindows.map(item => (
        <WindowErrorBoundary
          key={item.id}
          fallback={(error, reset) => (
            <Modal open={true} onClose={() => closeEntity(item.id)} title={item.label} size="md" autoHeight windowKey={item.id}>
              <WindowCrashedFallback error={error} onReload={reset} />
            </Modal>
          )}
        >
          <WindowShortcutProvider spec={shortcutSpecFor(item)}>
            {item.type === 'page' ? (
              <PageWindow item={item} onClose={() => closeEntity(item.id)} />
            ) : (
              <RestoredRegistryModal
                item={item}
                onClose={() => closeEntity(item.id)}
                onMinimize={() => {}}
              />
            )}
          </WindowShortcutProvider>
        </WindowErrorBoundary>
      ))}
    </MinimizedContext.Provider>
  );
}
