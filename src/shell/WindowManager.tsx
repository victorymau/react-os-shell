import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, useSyncExternalStore, cloneElement, isValidElement, Suspense, type ReactNode, type ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { WINDOW_REGISTRY, isPageEntry, isEntityEntry, type PageRegistryEntry, type ModalRegistryEntry } from '../windowRegistry/types';
import Modal, { triggerSplitView, modalDepthRef, getActiveModalId, subscribeActive, activateModal, useWindowMenuItem } from './Modal';
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

/** Universal fav star for any window — pages and entities. Saves to preferences.favorite_documents */
function WindowFavStar({ item }: { item: MinimizedItem }) {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['my-profile-sidebar'], queryFn: () => apiClient.get('/auth/me/').then(r => r.data) });
  const favDocs: { entityType: string; entityId: string; label: string }[] = (profile?.preferences || {}).favorite_documents || [];

  // For pages, use route as entityType='page' and entityId=route
  const favType = item.type === 'page' ? 'page' : (item.entityType || '');
  const favId = item.type === 'page' ? (item.route || '') : (item.entityId || '');
  const favLabel = item.label;

  const isFav = favDocs.some(d => d.entityType === favType && d.entityId === favId);

  const toggle = () => {
    const next = isFav
      ? favDocs.filter(d => !(d.entityType === favType && d.entityId === favId))
      : [...favDocs, { entityType: favType, entityId: favId, label: favLabel }];
    apiClient.patch('/auth/me/', { preferences: { favorite_documents: next } }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
    });
  };

  if (!favId) return null;

  return (
    <button onClick={toggle} title={isFav ? 'Remove from desktop' : 'Add to desktop'}
      className={`shrink-0 transition-colors ${isFav ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-yellow-400'}`}>
      <svg className="h-4 w-4" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </button>
  );
}

/** Adds "Add to Desktop" / "Remove from Desktop" to the window menu */
function DesktopShortcutMenuItem({ item }: { item: MinimizedItem }) {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['my-profile-sidebar'], queryFn: () => apiClient.get('/auth/me/').then(r => r.data) });
  const favDocs: { entityType: string; entityId: string; label: string }[] = (profile?.preferences || {}).favorite_documents || [];
  const favType = item.type === 'page' ? 'page' : (item.entityType || '');
  const favId = item.type === 'page' ? (item.route || '') : (item.entityId || '');
  const isFav = favDocs.some(d => d.entityType === favType && d.entityId === favId);

  const toggle = useCallback(() => {
    const next = isFav
      ? favDocs.filter(d => !(d.entityType === favType && d.entityId === favId))
      : [...favDocs, { entityType: favType, entityId: favId, label: item.label }];
    apiClient.patch('/auth/me/', { preferences: { favorite_documents: next } }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
    });
  }, [isFav, favDocs, favType, favId, item.label, queryClient]);

  const icon = useMemo(() => (
    <svg className="h-4 w-4" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  ), [isFav]);

  useWindowMenuItem(isFav ? 'Remove from Desktop' : 'Add to Desktop', toggle, icon);
  return null;
}

function PageWindow({ item, onClose }: { item: MinimizedItem; onClose: () => void }) {
  const raw = WINDOW_REGISTRY[item.route!];
  if (!raw || !isPageEntry(raw)) return null;
  const entry = raw as PageRegistryEntry;
  const Component = entry.component;
  return (
    <Modal open={true} onClose={onClose} icon={navIcons[item.route!]} title={entry.label} size={entry.size || '2xl'} allowPinOnTop={entry.allowPinOnTop} initialPosition={entry.initialPosition} widget={entry.widget} compact={entry.compact} autoHeight={entry.autoHeight} dimensions={entry.dimensions} windowKey={item.id}>
      <DesktopShortcutMenuItem item={item} />
      <Suspense fallback={<div className="flex items-center justify-center py-12"><LoadingSpinner /></div>}>
        <Component />
      </Suspense>
    </Modal>
  );
}

/** Star button to favorite a document — saves to preferences.favorite_documents */
export function DocFavStar({ entityType, entityId, label }: { entityType: string; entityId: string; label: string }) {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['my-profile-sidebar'], queryFn: () => apiClient.get('/auth/me/').then(r => r.data) });
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
  const { data: entity, isLoading, refetch } = useQuery({
    queryKey: [qkPrefix, item.entityId],
    queryFn: () => apiClient.get(`${entry.endpoint}${item.entityId}/`).then(r => r.data),
    initialData: item.entitySnapshot,
    initialDataUpdatedAt: 0, // Treat snapshot as stale so query refetches immediately
    enabled: !entry.selfFetching && !isDuplicate,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 60_000, // Fallback polling; WebSocket provides instant updates
    refetchIntervalInBackground: false,
  });

  // Refetch entity data whenever this modal is activated (brought to front)
  useEffect(() => {
    if (entry.selfFetching || isDuplicate) return;
    const handler = () => { refetch(); };
    window.addEventListener('modal-reorder', handler);
    return () => window.removeEventListener('modal-reorder', handler);
  }, [refetch, entry.selfFetching, isDuplicate]);

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
      copyText={item.id}
      windowKey={item.id}
      size={(entry.size || '2xl') as any}
    >
      <DesktopShortcutMenuItem item={item} />
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

/** Find a modal panel whose title text contains `label`. Used as a fallback
 *  when no window key is available (legacy code paths). */
function findPanelByLabel(label: string): HTMLElement | null {
  const panels = document.querySelectorAll('[data-modal-panel]');
  for (const p of Array.from(panels)) {
    const t = p.querySelector('.text-lg, .text-sm.font-medium');
    if (t?.textContent?.includes(label)) return p as HTMLElement;
  }
  return null;
}

/** Render a single window snapshot. The card sizes itself to the source
 *  panel's aspect ratio (clamped to maxW × maxH) so the snapshot fills
 *  the card with no empty letterboxing. */
function ThumbCard({ id, label, maxW, maxH, onClick, onClose }: {
  id: string; label: string; maxW: number; maxH: number; onClick?: () => void; onClose?: () => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  // Source dimensions, defaulting to maxW x maxH until we measure.
  const [size, setSize] = useState<{ w: number; h: number }>({ w: maxW, h: maxH });

  useEffect(() => {
    const inner = previewRef.current;
    if (!inner) return;
    const target = findPanelByWindowKey(id) ?? findPanelByLabel(label);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Fit the source into a maxW x maxH bounding box, preserving aspect.
    const ratio = Math.min(maxW / rect.width, maxH / rect.height);
    const cardW = Math.max(80, Math.round(rect.width * ratio));
    const cardH = Math.max(60, Math.round(rect.height * ratio));
    setSize({ w: cardW, h: cardH });
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
      className="relative rounded-md overflow-hidden bg-white/95 border border-gray-300 shadow-md cursor-pointer hover:ring-2 hover:ring-blue-400 transition shrink-0"
      onClick={onClick}
    >
      <div ref={previewRef} className="absolute inset-0 overflow-hidden" />
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] font-medium text-white bg-gradient-to-t from-black/80 to-transparent truncate pointer-events-none">
        {label}
      </div>
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-1 right-1 h-4 w-4 rounded-full bg-black/40 hover:bg-red-500/90 text-white flex items-center justify-center"
          title="Close window"
        >
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const tabRect = anchorEl.getBoundingClientRect();
    const popRect = el.getBoundingClientRect();
    const taskbarPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
    let left = tabRect.left + tabRect.width / 2 - popRect.width / 2;
    let top: number;
    if (taskbarPos === 'top') {
      top = tabRect.bottom + 8;
    } else if (taskbarPos === 'left') {
      left = tabRect.right + 8;
      top = tabRect.top + tabRect.height / 2 - popRect.height / 2;
    } else if (taskbarPos === 'right') {
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
  }, [anchorEl, items.length]);

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999,
        maxWidth: 'calc(100vw - 16px)',
        opacity: pos.ready ? 1 : 0,
      }}
      className={isGroup
        ? 'flex gap-2 p-2 rounded-lg bg-white/40 backdrop-blur-sm border border-white/30 shadow-2xl flex-wrap'
        : ''}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {items.map(it => (
        <ThumbCard
          key={it.id}
          id={it.id}
          label={it.label}
          maxW={MAX_W}
          maxH={MAX_H}
          onClick={() => onActivate(it.id)}
          onClose={() => onClose(it.id)}
        />
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
    const titleEl = panel?.querySelector('.text-lg, .text-sm.font-medium');
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

  // Group multi-instance windows by route so the taskbar shows one icon
  // per app type with a count badge instead of N identical tabs.
  type Group = { key: string; route?: string; label: string; items: MinimizedItem[] };
  const groups: Group[] = [];
  const idx = new Map<string, number>();
  for (const item of tabWindows) {
    const key = item.route ?? `entity:${item.id}`;
    const i = idx.get(key);
    if (i !== undefined) {
      groups[i].items.push(item);
    } else {
      idx.set(key, groups.length);
      const registryLabel = item.route ? (WINDOW_REGISTRY[item.route] as PageRegistryEntry)?.label : undefined;
      groups.push({ key, route: item.route, label: registryLabel ?? item.label, items: [item] });
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
            const titleEl = panel.querySelector('.text-lg, .text-sm.font-medium');
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
        <button onClick={onSplitView}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 transition-colors shrink-0">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4m6-16h4a1 1 0 011 1v14a1 1 0 01-1 1h-4m-6 0V4" /></svg>
          Split
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
  { id: 'page:/currency', type: 'page', label: 'Currency', route: '/currency' },
];

function restoreWindowState(): MinimizedItem[] {
  try {
    if (window.location.pathname === '/login') return [];
    if (!localStorage.getItem('access_token')) return [];
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* corrupt data */ }
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
  }, [openWindows]);

  const closeEntity = useCallback((id: string) => {
    setOpenWindows(prev => prev.filter(m => m.id !== id));
  }, []);

  const openEntity = useCallback((entityType: string, entityId: string, snapshot?: any, label?: string, route?: string) => {
    if (!WINDOW_REGISTRY[entityType] || !isEntityEntry(WINDOW_REGISTRY[entityType])) return;
    const id = label || entityId;
    // If already open, just activate it
    setOpenWindows(prev => {
      const existing = prev.find(m => m.entityId === entityId && m.entityType === entityType);
      if (existing) {
        // Activate the existing window
        setTimeout(() => {
          const panels = document.querySelectorAll('[data-modal-panel]');
          panels.forEach(p => {
            const titleEl = p.querySelector('.text-lg, .text-sm.font-medium');
            if (titleEl?.textContent?.includes(existing.label)) {
              const mid = p.getAttribute('data-modal-id');
              if (mid) activateModal(mid);
            }
          });
        }, 50);
        return prev;
      }
      return [...prev, {
        id, type: 'modal' as const, label: label || entityId,
        route: route || window.location.pathname,
        entityType, entityId, entitySnapshot: snapshot,
      }];
    });
  }, []);

  /** Open a page as a window — reuse if already open */
  const openPage = useCallback((path: string) => {
    if (!WINDOW_REGISTRY[path] || !isPageEntry(WINDOW_REGISTRY[path])) return;
    const entry = WINDOW_REGISTRY[path] as PageRegistryEntry;
    setOpenWindows(prev => {
      // Multi-instance pages always spawn a new window with a unique id.
      if (entry.multiInstance) {
        const instanceCount = prev.filter(m => m.type === 'page' && m.route === path).length;
        const nextNum = instanceCount + 1;
        const id = `page:${path}:${Math.random().toString(36).slice(2, 8)}`;
        return [...prev, {
          id, type: 'page' as const,
          label: instanceCount === 0 ? entry.label : `${entry.label} ${nextNum}`,
          route: path,
        }];
      }
      const existing = prev.find(m => m.type === 'page' && m.route === path);
      if (existing) {
        // Widgets toggle on/off; non-widgets activate (bring to front)
        if (entry.widget) {
          return prev.filter(m => m !== existing);
        }
        setTimeout(() => {
          const panels = document.querySelectorAll('[data-modal-panel]');
          panels.forEach(p => {
            const titleEl = p.querySelector('.text-lg, .text-sm.font-medium');
            if (titleEl?.textContent?.includes(existing.label)) {
              const mid = p.getAttribute('data-modal-id');
              if (mid) activateModal(mid);
            }
          });
        }, 50);
        return prev;
      }
      return [...prev, {
        id: `page:${path}`, type: 'page' as const, label: entry.label,
        route: path,
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
            const titleEl = p.querySelector('.text-lg, .text-sm.font-medium');
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

      {/* All open windows — pages and entities (hidden on auth pages) */}
      {!isAuthPage && openWindows.map(item => (
        item.type === 'page' ? (
          <PageWindow key={item.id} item={item} onClose={() => closeEntity(item.id)} />
        ) : (
          <RestoredRegistryModal
            key={item.id}
            item={item}
            onClose={() => closeEntity(item.id)}
            onMinimize={() => {}}
          />
        )
      ))}
    </MinimizedContext.Provider>
  );
}
