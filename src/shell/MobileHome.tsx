/**
 * Mobile home screen — open widgets render at the top, app + folder icons sit
 * in a unified grid below. Long-press any icon to drag it. Order persists
 * in localStorage.
 *
 * Folders open as a centered popup with a blurred backdrop and a scale-in
 * animation. The folder tile itself shows a 2×2 preview of the apps inside,
 * iOS-style.
 */
import { useState, useMemo, useEffect, useRef, Suspense, type ReactNode, isValidElement, cloneElement, type ReactElement } from 'react';
import { isSection, type NavItem, type NavSection } from './nav-types';
import { WINDOW_REGISTRY, isPageEntry, type PageRegistryEntry } from '../windowRegistry/types';
import type { MinimizedItem } from './WindowManager';
import LoadingSpinner from './LoadingSpinner';

const MOBILE_WIDGET_ORDER_KEY = 'erp_mobile_widget_order';
const MOBILE_HOME_ORDER_KEY = 'erp_mobile_home_order';
const LONG_PRESS_MS = 400;

// Per-app colored tile background. Tailwind's JIT scans the source so each
// gradient class string must appear in full somewhere — keep them inline.
const ICON_GRADIENTS = [
  'from-blue-500 to-blue-700',
  'from-indigo-500 to-purple-600',
  'from-purple-500 to-pink-600',
  'from-pink-500 to-rose-600',
  'from-red-500 to-rose-600',
  'from-orange-500 to-red-600',
  'from-amber-500 to-orange-600',
  'from-yellow-500 to-amber-500',
  'from-lime-500 to-green-600',
  'from-green-500 to-emerald-600',
  'from-emerald-500 to-teal-600',
  'from-teal-500 to-cyan-600',
  'from-cyan-500 to-sky-600',
  'from-sky-500 to-blue-600',
  'from-violet-500 to-fuchsia-600',
];

function hashGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return ICON_GRADIENTS[Math.abs(h) % ICON_GRADIENTS.length];
}

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

/** A colored gradient tile with the app's glyph in white — one per app on
 *  the home grid. iOS-style. */
function AppTile({ route, icon }: { route: string; icon: ReactNode }) {
  return (
    <span className={`relative aspect-square w-full max-w-[80px] mx-auto rounded-2xl bg-gradient-to-br ${hashGradient(route)} flex items-center justify-center text-white shadow-sm border border-white/30`}>
      {sizeIcon(icon, FALLBACK_APP_ICON, 'h-11 w-11')}
    </span>
  );
}

/** Folder tile = 2×2 mini-grid of the apps inside, on a translucent backplate. */
function FolderTile({ section, navIcons }: { section: NavSection; navIcons: Record<string, ReactNode> }) {
  const previewItems = section.items.slice(0, 4);
  return (
    <span className="relative aspect-square w-full max-w-[80px] mx-auto rounded-2xl bg-white/30 backdrop-blur-sm border border-white/40 p-1.5 grid grid-cols-2 gap-1 shadow-sm">
      {previewItems.map(item => (
        <span
          key={item.to}
          className={`rounded-md bg-gradient-to-br ${hashGradient(item.to)} flex items-center justify-center text-white`}
        >
          {sizeIcon(navIcons[item.to], FALLBACK_APP_ICON, 'h-3.5 w-3.5')}
        </span>
      ))}
      {Array.from({ length: Math.max(0, 4 - previewItems.length) }).map((_, i) => (
        <span key={`empty-${i}`} className="rounded-md bg-white/20" />
      ))}
    </span>
  );
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

  // Long-press drag.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const beginLongPress = (id: string, e: React.PointerEvent<HTMLElement>) => {
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
      longPressFiredRef.current = false;
      return;
    }
    if (icon.kind === 'app') onOpenApp(icon.route);
    else setSelectedFolder(icon.section);
  };

  // Widget tray — vertical order persisted but no per-card reorder buttons.
  const [widgetOrder, _setWidgetOrder] = useState<string[]>(() => loadOrder(MOBILE_WIDGET_ORDER_KEY));

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
      _setWidgetOrder(next);
      saveOrder(MOBILE_WIDGET_ORDER_KEY, next);
    }
  }, [widgetWindows, widgetOrder]);

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
      <div
        className="h-full overflow-y-auto px-3 pt-4 pb-4 select-none"
        style={{
          // Disable iOS long-press text-selection / "Copy" callout on icon labels.
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        {/* Widgets — fixed 168×168 cards, wrapped in a flex row so they pack
         *  2-per-row on most phones and reflow to 1-per-row on narrow ones. */}
        {widgetWindows.length > 0 && (
          <section className="mb-4">
            <div className="flex flex-wrap gap-3">
              {widgetWindows.map(w => {
                const entry = WINDOW_REGISTRY[w.route!] as PageRegistryEntry | undefined;
                if (!entry) return null;
                const Component = entry.component;
                return (
                  <div
                    key={w.id}
                    className="relative rounded-2xl bg-white/85 backdrop-blur border border-white/40 shadow-md overflow-hidden"
                    style={{ width: 168, height: 168 }}
                  >
                    <Suspense fallback={<div className="flex items-center justify-center h-full"><LoadingSpinner /></div>}>
                      <Component />
                    </Suspense>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Unified home grid — apps + folders. Icon tiles are colored
         *  gradients (one per app); folder tiles preview their contents in a
         *  2×2 mini-grid. Long-press any tile to start dragging. */}
        {homeIcons.length > 0 && (
          <section>
            <div className="grid grid-cols-4 gap-3">
              {homeIcons.map(icon => {
                const isFolder = icon.kind === 'folder';
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
                    className={`flex flex-col items-center gap-1 py-1 rounded-lg active:bg-white/20 ${dragId && !isBeingDragged ? 'transition-transform' : ''}`}
                  >
                    {isFolder
                      ? <FolderTile section={(icon as Extract<HomeIcon, { kind: 'folder' }>).section} navIcons={navIcons} />
                      : <AppTile route={(icon as Extract<HomeIcon, { kind: 'app' }>).route} icon={navIcons[(icon as Extract<HomeIcon, { kind: 'app' }>).route]} />}
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
          <div className="flex flex-col items-center gap-1 py-1 w-20">
            {draggedIcon.kind === 'folder'
              ? <FolderTile section={draggedIcon.section} navIcons={navIcons} />
              : <AppTile route={draggedIcon.route} icon={navIcons[draggedIcon.route]} />}
            <span className="text-[11px] font-medium text-white drop-shadow-md truncate w-full text-center">
              {draggedIcon.label}
            </span>
          </div>
        </div>
      )}

      {/* Folder popup */}
      {selectedFolder && (
        <FolderPopup
          folder={selectedFolder}
          navIcons={navIcons}
          onClose={() => setSelectedFolder(null)}
          onOpenApp={(path) => { setSelectedFolder(null); onOpenApp(path); }}
        />
      )}
    </>
  );
}

function FolderPopup({
  folder,
  navIcons,
  onClose,
  onOpenApp,
}: {
  folder: NavSection;
  navIcons: Record<string, ReactNode>;
  onClose: () => void;
  onOpenApp: (path: string) => void;
}) {
  // Two-phase close: kick off the fade-out / scale-down animation, then unmount
  // after the duration so the user actually sees the reverse transition.
  // Used both for tap-outside dismiss and tap-an-app-inside-the-folder.
  const [closing, setClosing] = useState(false);
  const beginClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  };
  const closeThen = (after: () => void) => {
    if (closing) return;
    setClosing(true);
    setTimeout(after, 200);
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex flex-col items-center justify-center px-6 bg-black/45 backdrop-blur-xl select-none"
      style={{
        paddingBottom: 'calc(var(--mobile-bottom-nav, 70px) + 16px)',
        animation: closing
          ? 'folder-fade-out 200ms ease-in forwards'
          : 'folder-fade-in 220ms ease-out',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onClick={beginClose}
    >
      <style>{`
        @keyframes folder-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes folder-fade-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes folder-pop-in { from { opacity: 0; transform: scale(0.86) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes folder-pop-out { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(0.9) translateY(4px); } }
      `}</style>

      <h2 className="text-2xl font-semibold text-white drop-shadow-md mb-4 self-start">{folder.label}</h2>

      <div
        className="w-full max-w-md max-h-[70vh] flex flex-col rounded-3xl bg-white/15 backdrop-blur-xl border border-white/25 shadow-2xl overflow-hidden"
        style={{
          animation: closing
            ? 'folder-pop-out 180ms ease-in forwards'
            : 'folder-pop-in 240ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto px-4 py-5">
          {/* Folder shows just the apps inside — open-window summary lives on
           *  the home screen and the switcher, not here. */}
          <div className="grid grid-cols-4 gap-3">
            {folder.items.map(item => {
              return (
                <button
                  key={item.to}
                  onClick={() => closeThen(() => onOpenApp(item.to))}
                  className="flex flex-col items-center gap-1 py-1 rounded-lg active:bg-white/15"
                >
                  <AppTile route={item.to} icon={navIcons[item.to]} />
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
