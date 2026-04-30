/**
 * Mobile home screen — open widgets render at the top, app + folder icons
 * sit in a unified grid below. Long-press any icon to drag it to a new
 * position; the order is persisted to localStorage so it carries across
 * sessions, mirroring how desktop remembers each window's box.
 *
 * Folders open as a centered popup with a blurred backdrop. Reuses the
 * existing nav data shape — same sections that populate the desktop
 * StartMenu populate the mobile home.
 */
import { useState, useMemo, useEffect, useRef, Suspense, type ReactNode, isValidElement, cloneElement, type ReactElement } from 'react';
import { isSection, type NavItem, type NavSection } from './nav-types';
import { WINDOW_REGISTRY, isPageEntry, type PageRegistryEntry } from '../windowRegistry/types';
import type { MinimizedItem } from './WindowManager';
import LoadingSpinner from './LoadingSpinner';

// Persisted vertical order of widget cards (top of home).
const MOBILE_WIDGET_ORDER_KEY = 'erp_mobile_widget_order';
// Persisted icon order of the unified home grid (apps + folders).
const MOBILE_HOME_ORDER_KEY = 'erp_mobile_home_order';

// Long-press to enter drag mode (ms). 400 is the iOS/Android home-screen feel.
const LONG_PRESS_MS = 400;

function loadOrder(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(s => typeof s === 'string');
    }
  } catch {}
  return [];
}

function saveOrder(key: string, order: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(order)); } catch {}
}

interface MobileHomeProps {
  navSections: (NavSection | NavItem)[];
  navIcons: Record<string, ReactNode>;
  sectionIcons: Record<string, ReactNode>;
  openWindows: MinimizedItem[];
  onOpenApp: (path: string) => void;
  onActivateWindow: (id: string) => void;
}

type HomeIcon =
  | { kind: 'app'; id: string; label: string; route: string }
  | { kind: 'folder'; id: string; label: string; section: NavSection };

const FALLBACK_FOLDER_ICON = (
  <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
  </svg>
);

const FALLBACK_APP_ICON = (
  <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z" />
  </svg>
);

function sizeIcon(node: ReactNode, fallback: ReactNode, sizeClass = 'h-10 w-10'): ReactNode {
  if (!node) return fallback;
  if (isValidElement(node)) {
    return cloneElement(node as ReactElement, {
      className: `${sizeClass} ${(node as ReactElement).props?.className ?? ''}`.trim(),
    } as any);
  }
  return node;
}

export default function MobileHome({
  navSections,
  navIcons,
  sectionIcons,
  openWindows,
  onOpenApp,
  onActivateWindow,
}: MobileHomeProps) {
  const [selectedFolder, setSelectedFolder] = useState<NavSection | null>(null);

  // Build the unified icon set (apps + folders, mixed). User-saved order
  // determines final layout; new icons (added later) append at the end.
  const homeIconsRaw = useMemo<HomeIcon[]>(() => {
    const list: HomeIcon[] = [];
    for (const entry of navSections) {
      if (isSection(entry)) {
        const sec = entry as NavSection;
        list.push({ kind: 'folder', id: `folder:${sec.label}`, label: sec.label, section: sec });
      } else {
        const it = entry as NavItem;
        list.push({ kind: 'app', id: `app:${it.to}`, label: it.label, route: it.to });
      }
    }
    return list;
  }, [navSections]);

  const [homeOrder, setHomeOrder] = useState<string[]>(() => loadOrder(MOBILE_HOME_ORDER_KEY));

  const homeIcons = useMemo(() => {
    const indexFor = (id: string) => {
      const i = homeOrder.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return homeIconsRaw.slice().sort((a, b) => {
      const ia = indexFor(a.id);
      const ib = indexFor(b.id);
      if (ia !== ib) return ia - ib;
      return homeIconsRaw.indexOf(a) - homeIconsRaw.indexOf(b);
    });
  }, [homeIconsRaw, homeOrder]);

  // Sync persisted order with the visible icon set: append newcomers, drop
  // anything no longer registered.
  useEffect(() => {
    const visibleIds = homeIconsRaw.map(i => i.id);
    const next = [
      ...homeOrder.filter(id => visibleIds.includes(id)),
      ...visibleIds.filter(id => !homeOrder.includes(id)),
    ];
    if (next.length !== homeOrder.length || next.some((id, i) => id !== homeOrder[i])) {
      setHomeOrder(next);
      saveOrder(MOBILE_HOME_ORDER_KEY, next);
    }
  }, [homeIconsRaw, homeOrder]);

  // ── Long-press drag state ─────────────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set true when long-press fires so the subsequent click is suppressed
  // (otherwise releasing after a drag would activate the icon).
  const longPressFiredRef = useRef(false);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const beginLongPress = (id: string, e: React.PointerEvent<HTMLElement>) => {
    // Ignore second pointers on the same gesture.
    if (dragId) return;
    const x = e.clientX;
    const y = e.clientY;
    const target = e.currentTarget;
    longPressFiredRef.current = false;
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      if (!target.isConnected) return;
      const rect = target.getBoundingClientRect();
      dragOffsetRef.current = { x: x - rect.left, y: y - rect.top };
      longPressFiredRef.current = true;
      setDragId(id);
      setDragPos({ x, y });
      try { (navigator as any).vibrate?.(15); } catch {}
    }, LONG_PRESS_MS);
  };

  // Drag move + release wired globally so the icon follows the finger even
  // outside its starting button.
  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const targetEl = el?.closest('[data-home-icon-id]') as HTMLElement | null;
      if (!targetEl) return;
      const targetId = targetEl.dataset.homeIconId!;
      if (targetId === dragId) return;
      setHomeOrder(prev => {
        const fromIdx = prev.indexOf(dragId);
        const toIdx = prev.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const next = prev.slice();
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, dragId);
        return next;
      });
    };
    const onUp = () => {
      setDragId(null);
      setDragPos(null);
      // Persist whatever order ended up after the drag.
      setHomeOrder(prev => { saveOrder(MOBILE_HOME_ORDER_KEY, prev); return prev; });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragId]);

  const handleIconClick = (icon: HomeIcon) => {
    if (longPressFiredRef.current) {
      // Drag just ended — swallow this click.
      longPressFiredRef.current = false;
      return;
    }
    if (icon.kind === 'app') onOpenApp(icon.route);
    else setSelectedFolder(icon.section);
  };

  // ── Widget tray (top of home) ─────────────────────────────────────────────
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => loadOrder(MOBILE_WIDGET_ORDER_KEY));

  const widgetWindows = useMemo(() => {
    const widgets = openWindows.filter(w => {
      if (!w.route) return false;
      const entry = WINDOW_REGISTRY[w.route];
      return entry && isPageEntry(entry) && (entry as PageRegistryEntry).widget;
    });
    const indexFor = (route: string) => {
      const i = widgetOrder.indexOf(route);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return widgets.slice().sort((a, b) => indexFor(a.route!) - indexFor(b.route!));
  }, [openWindows, widgetOrder]);

  useEffect(() => {
    const visibleRoutes = widgetWindows.map(w => w.route!).filter(Boolean);
    const next = [
      ...widgetOrder.filter(r => visibleRoutes.includes(r)),
      ...visibleRoutes.filter(r => !widgetOrder.includes(r)),
    ];
    if (next.length !== widgetOrder.length || next.some((r, i) => r !== widgetOrder[i])) {
      setWidgetOrder(next);
      saveOrder(MOBILE_WIDGET_ORDER_KEY, next);
    }
  }, [widgetWindows, widgetOrder]);

  const moveWidget = (route: string, dir: -1 | 1) => {
    setWidgetOrder(prev => {
      const i = prev.indexOf(route);
      if (i === -1) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      saveOrder(MOBILE_WIDGET_ORDER_KEY, next);
      return next;
    });
  };

  // Open window count per route — drives the small dot/badge on each icon.
  const openCountByRoute = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of openWindows) {
      if (!w.route) continue;
      map.set(w.route, (map.get(w.route) ?? 0) + 1);
    }
    return map;
  }, [openWindows]);

  const openInFolder = (folder: NavSection): MinimizedItem[] => {
    const routes = new Set(folder.items.map(i => i.to));
    return openWindows.filter(w => w.route && routes.has(w.route));
  };

  const draggedIcon = dragId ? homeIcons.find(i => i.id === dragId) : null;

  return (
    <>
      <div className="h-full overflow-y-auto px-3 pt-4 pb-4">
        {/* Widgets — square half-width cards (two per row), iOS home-screen
         *  style. Widget components designed for desktop dimensions are clipped
         *  by overflow-hidden; consumers wanting better fit can adjust the
         *  widget app to lay out for a square aspect ratio. */}
        {widgetWindows.length > 0 && (
          <section className="mb-4">
            <div className="grid grid-cols-2 gap-3">
              {widgetWindows.map((w, i) => {
                const entry = WINDOW_REGISTRY[w.route!] as PageRegistryEntry | undefined;
                if (!entry) return null;
                const Component = entry.component;
                const isFirst = i === 0;
                const isLast = i === widgetWindows.length - 1;
                return (
                  <div
                    key={w.id}
                    className="relative rounded-2xl bg-white/85 backdrop-blur border border-white/40 shadow-md overflow-hidden aspect-square"
                  >
                    <Suspense fallback={<div className="flex items-center justify-center h-full"><LoadingSpinner /></div>}>
                      <Component />
                    </Suspense>
                    {widgetWindows.length > 1 && (
                      <div className="absolute top-1.5 right-1.5 flex flex-col gap-0.5 z-10">
                        <button
                          onClick={() => moveWidget(w.route!, -1)}
                          disabled={isFirst}
                          className="h-6 w-6 rounded-md bg-white/90 backdrop-blur border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 disabled:opacity-30 active:bg-gray-100"
                          aria-label="Move up"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveWidget(w.route!, 1)}
                          disabled={isLast}
                          className="h-6 w-6 rounded-md bg-white/90 backdrop-blur border border-gray-200 shadow-sm flex items-center justify-center text-gray-700 disabled:opacity-30 active:bg-gray-100"
                          aria-label="Move down"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Unified home grid — apps + folders, in user-saved order.
         *  Long-press any icon to grab it; drag onto another icon to swap. */}
        {homeIcons.length > 0 && (
          <section>
            <div className="grid grid-cols-4 gap-3">
              {homeIcons.map(icon => {
                const isFolder = icon.kind === 'folder';
                const openCount = isFolder
                  ? openInFolder((icon as Extract<HomeIcon, { kind: 'folder' }>).section).length
                  : (openCountByRoute.get((icon as Extract<HomeIcon, { kind: 'app' }>).route) ?? 0);
                const isBeingDragged = dragId === icon.id;

                return (
                  <button
                    key={icon.id}
                    data-home-icon-id={icon.id}
                    onPointerDown={(e) => beginLongPress(icon.id, e)}
                    onPointerUp={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onClick={() => handleIconClick(icon)}
                    style={{ touchAction: 'none', visibility: isBeingDragged ? 'hidden' : 'visible' }}
                    className={`flex flex-col items-center gap-1 py-1 rounded-lg active:bg-white/40 ${dragId && !isBeingDragged ? 'transition-transform' : ''}`}
                  >
                    <span
                      className={`relative h-[72px] w-[72px] rounded-2xl flex items-center justify-center shadow-sm border ${
                        isFolder
                          ? 'bg-white/70 backdrop-blur border-white/40 text-blue-700'
                          : 'bg-white/85 backdrop-blur border-white/40 text-gray-800'
                      }`}
                    >
                      {isFolder
                        ? sizeIcon(sectionIcons[icon.label], FALLBACK_FOLDER_ICON)
                        : sizeIcon(navIcons[(icon as Extract<HomeIcon, { kind: 'app' }>).route], FALLBACK_APP_ICON)}
                      {openCount > 0 && (isFolder ? (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-[18px] text-center border-2 border-white">
                          {openCount}
                        </span>
                      ) : (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border-2 border-white" />
                      ))}
                    </span>
                    <span className="text-[11px] font-medium text-white drop-shadow-sm truncate w-full text-center">
                      {icon.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Floating "ghost" of the icon being dragged — follows the finger. */}
      {draggedIcon && dragPos && (
        <div
          className="fixed pointer-events-none z-[400] transition-none"
          style={{
            left: dragPos.x - dragOffsetRef.current.x,
            top: dragPos.y - dragOffsetRef.current.y,
            transform: 'scale(1.12)',
          }}
        >
          <div className="flex flex-col items-center gap-1 py-1">
            <span
              className={`relative h-[72px] w-[72px] rounded-2xl flex items-center justify-center shadow-2xl border ${
                draggedIcon.kind === 'folder'
                  ? 'bg-white backdrop-blur border-white/40 text-blue-700'
                  : 'bg-white backdrop-blur border-white/40 text-gray-800'
              }`}
            >
              {draggedIcon.kind === 'folder'
                ? sizeIcon(sectionIcons[draggedIcon.label], FALLBACK_FOLDER_ICON)
                : sizeIcon(navIcons[(draggedIcon as Extract<HomeIcon, { kind: 'app' }>).route], FALLBACK_APP_ICON)}
            </span>
            <span className="text-[11px] font-medium text-white drop-shadow-md truncate max-w-[80px] text-center">
              {draggedIcon.label}
            </span>
          </div>
        </div>
      )}

      {/* Folder popup — centered modal with blurred backdrop. */}
      {selectedFolder && (
        <FolderPopup
          folder={selectedFolder}
          navIcons={navIcons}
          openInFolder={openInFolder(selectedFolder)}
          openCountByRoute={openCountByRoute}
          onClose={() => setSelectedFolder(null)}
          onOpenApp={(path) => { setSelectedFolder(null); onOpenApp(path); }}
          onActivateWindow={(id) => { setSelectedFolder(null); onActivateWindow(id); }}
        />
      )}
    </>
  );
}

function FolderPopup({
  folder,
  navIcons,
  openInFolder,
  openCountByRoute,
  onClose,
  onOpenApp,
  onActivateWindow,
}: {
  folder: NavSection;
  navIcons: Record<string, ReactNode>;
  openInFolder: MinimizedItem[];
  openCountByRoute: Map<string, number>;
  onClose: () => void;
  onOpenApp: (path: string) => void;
  onActivateWindow: (id: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[210] flex flex-col items-center justify-center px-6 bg-black/45 backdrop-blur-xl"
      style={{ paddingBottom: 'calc(var(--mobile-bottom-nav, 56px) + 16px)' }}
      onClick={onClose}
    >
      {/* Folder name floats above the card (no header bar inside) */}
      <h2 className="text-2xl font-semibold text-white drop-shadow-md mb-4 self-start">{folder.label}</h2>

      <div
        className="w-full max-w-md max-h-[70vh] flex flex-col rounded-3xl bg-white/15 backdrop-blur-xl border border-white/25 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto px-4 py-5">
          {openInFolder.length > 0 && (
            <section className="mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/70 mb-2">Open</h3>
              <div className="grid grid-cols-2 gap-2">
                {openInFolder.map(w => (
                  <button
                    key={w.id}
                    onClick={() => onActivateWindow(w.id)}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/15 active:bg-white/25 text-left"
                  >
                    <span className="h-7 w-7 rounded bg-white/20 flex items-center justify-center text-white shrink-0">
                      {sizeIcon(w.route ? navIcons[w.route] : null, FALLBACK_APP_ICON, 'h-5 w-5')}
                    </span>
                    <span className="text-xs font-medium text-white truncate flex-1">{w.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="grid grid-cols-3 gap-3">
            {folder.items.map(item => {
              const openCount = openCountByRoute.get(item.to) ?? 0;
              return (
                <button
                  key={item.to}
                  onClick={() => onOpenApp(item.to)}
                  className="flex flex-col items-center gap-1.5 p-1 rounded-lg active:bg-white/15"
                >
                  <span className="relative h-16 w-16 rounded-2xl bg-white/85 backdrop-blur border border-white/40 flex items-center justify-center text-gray-800 shadow-sm">
                    {sizeIcon(navIcons[item.to], FALLBACK_APP_ICON)}
                    {openCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border-2 border-white" />
                    )}
                  </span>
                  <span className="text-[11px] font-medium text-white drop-shadow-sm truncate w-full text-center">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
