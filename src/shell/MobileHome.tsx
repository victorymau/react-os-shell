/**
 * Mobile home screen — folders + apps below an inline widget tray, all
 * rendered over the desktop wallpaper. Folders open as a centered popup with
 * a blurred backdrop (instead of pushing a separate sub-screen).
 *
 * Reuses the existing nav data shape (no new props for consumers) — the same
 * sections that populate the desktop StartMenu populate the mobile home.
 */
import { useState, useMemo, useEffect, Suspense, type ReactNode, isValidElement, cloneElement, type ReactElement } from 'react';
import { isSection, type NavItem, type NavSection } from './nav-types';
import { WINDOW_REGISTRY, isPageEntry, type PageRegistryEntry } from '../windowRegistry/types';
import type { MinimizedItem } from './WindowManager';
import LoadingSpinner from './LoadingSpinner';

// Persisted order of widget routes on mobile. Mirrors how desktop remembers
// each widget's box position (`erp_window_positions`); on mobile a
// 360-px-wide phone, the only useful axis is vertical so we just persist
// the route list order.
const MOBILE_WIDGET_ORDER_KEY = 'erp_mobile_widget_order';

function loadWidgetOrder(): string[] {
  try {
    const raw = localStorage.getItem(MOBILE_WIDGET_ORDER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(s => typeof s === 'string');
    }
  } catch {}
  return [];
}

function saveWidgetOrder(order: string[]): void {
  try { localStorage.setItem(MOBILE_WIDGET_ORDER_KEY, JSON.stringify(order)); } catch {}
}

interface MobileHomeProps {
  navSections: (NavSection | NavItem)[];
  navIcons: Record<string, ReactNode>;
  sectionIcons: Record<string, ReactNode>;
  openWindows: MinimizedItem[];
  onOpenApp: (path: string) => void;
  onActivateWindow: (id: string) => void;
}

const FALLBACK_FOLDER_ICON = (
  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
  </svg>
);

const FALLBACK_APP_ICON = (
  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z" />
  </svg>
);

function sizeIcon(node: ReactNode, fallback: ReactNode): ReactNode {
  if (!node) return fallback;
  if (isValidElement(node)) {
    return cloneElement(node as ReactElement, {
      className: `h-8 w-8 ${(node as ReactElement).props?.className ?? ''}`.trim(),
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

  // Split top-level items vs sections
  const { topItems, sections } = useMemo(() => {
    const t: NavItem[] = [];
    const s: NavSection[] = [];
    for (const entry of navSections) {
      if (isSection(entry)) s.push(entry);
      else t.push(entry);
    }
    return { topItems: t, sections: s };
  }, [navSections]);

  // Open widget windows — render their components inline at the top.
  // Sort by user-saved order; new widgets append at the end.
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => loadWidgetOrder());

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

  // Keep the persisted order in sync — append newly-opened widgets, drop
  // closed ones — so localStorage doesn't accumulate stale routes.
  useEffect(() => {
    const visibleRoutes = widgetWindows.map(w => w.route!).filter(Boolean);
    const next = [
      ...widgetOrder.filter(r => visibleRoutes.includes(r)),
      ...visibleRoutes.filter(r => !widgetOrder.includes(r)),
    ];
    if (next.length !== widgetOrder.length || next.some((r, i) => r !== widgetOrder[i])) {
      setWidgetOrder(next);
      saveWidgetOrder(next);
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
      saveWidgetOrder(next);
      return next;
    });
  };

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

  return (
    <>
      <div className="h-full overflow-y-auto px-3 pt-4 pb-4">
        {/* Widgets — order is user-controlled via the up/down handles and
         *  persisted to localStorage so it carries across sessions, just like
         *  desktop widget box positions. */}
        {widgetWindows.length > 0 && (
          <section className="mb-5">
            <div className="grid grid-cols-1 gap-3">
              {widgetWindows.map((w, i) => {
                const entry = WINDOW_REGISTRY[w.route!] as PageRegistryEntry | undefined;
                if (!entry) return null;
                const Component = entry.component;
                const isFirst = i === 0;
                const isLast = i === widgetWindows.length - 1;
                return (
                  <div
                    key={w.id}
                    className="relative rounded-2xl bg-white/85 backdrop-blur border border-white/40 shadow-md overflow-hidden"
                    style={{ height: entry.dimensions?.[1] ?? 320 }}
                  >
                    <Suspense fallback={<div className="flex items-center justify-center h-full"><LoadingSpinner /></div>}>
                      <Component />
                    </Suspense>
                    {/* Reorder handles — top-right corner, only show when more
                     *  than one widget. Buttons disable themselves at edges. */}
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

        {/* Top-level apps */}
        {topItems.length > 0 && (
          <section className="mb-5">
            <AppGrid
              items={topItems}
              navIcons={navIcons}
              openCountByRoute={openCountByRoute}
              onOpenApp={onOpenApp}
            />
          </section>
        )}

        {/* Folders */}
        {sections.length > 0 && (
          <section>
            <div className="grid grid-cols-4 gap-3">
              {sections.map(section => {
                const openInThis = openInFolder(section).length;
                return (
                  <button
                    key={section.label}
                    onClick={() => setSelectedFolder(section)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-lg active:bg-white/40"
                  >
                    <span className="relative h-14 w-14 rounded-2xl bg-white/70 backdrop-blur border border-white/40 flex items-center justify-center text-blue-700 shadow-sm">
                      {sizeIcon(sectionIcons[section.label], FALLBACK_FOLDER_ICON)}
                      {openInThis > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-[18px] text-center border-2 border-white">
                          {openInThis}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium text-white drop-shadow-sm truncate w-full text-center">
                      {section.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Folder popup — centered modal with blurred backdrop */}
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

function AppGrid({
  items,
  navIcons,
  openCountByRoute,
  onOpenApp,
}: {
  items: NavItem[];
  navIcons: Record<string, ReactNode>;
  openCountByRoute: Map<string, number>;
  onOpenApp: (path: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map(item => {
        const openCount = openCountByRoute.get(item.to) ?? 0;
        return (
          <button
            key={item.to}
            onClick={() => onOpenApp(item.to)}
            className="flex flex-col items-center gap-1.5 p-2 rounded-lg active:bg-white/40"
          >
            <span className="relative h-14 w-14 rounded-2xl bg-white/85 backdrop-blur border border-white/40 flex items-center justify-center text-gray-800 shadow-sm">
              {sizeIcon(navIcons[item.to], FALLBACK_APP_ICON)}
              {openCount > 0 && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border-2 border-white" />
              )}
            </span>
            <span className="text-[11px] font-medium text-white drop-shadow-sm truncate w-full text-center">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
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
      className="fixed inset-0 z-[210] flex items-center justify-center px-4 bg-black/40 backdrop-blur-md"
      style={{ paddingBottom: 'var(--mobile-bottom-nav, 56px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[80vh] flex flex-col rounded-2xl bg-white/95 backdrop-blur border border-white/40 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 truncate">{folder.label}</h2>
          <button onClick={onClose} className="p-1.5 -mr-1 rounded-full active:bg-gray-200 text-gray-600" aria-label="Close folder">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {openInFolder.length > 0 && (
            <section className="mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Open</h3>
              <div className="grid grid-cols-2 gap-2">
                {openInFolder.map(w => (
                  <button
                    key={w.id}
                    onClick={() => onActivateWindow(w.id)}
                    className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 active:bg-blue-100 text-left"
                  >
                    <span className="h-7 w-7 rounded bg-white flex items-center justify-center text-blue-600 shrink-0">
                      {sizeIcon(w.route ? navIcons[w.route] : null, FALLBACK_APP_ICON)}
                    </span>
                    <span className="text-xs font-medium text-gray-800 truncate flex-1">{w.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {openInFolder.length > 0 && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">All</h3>
          )}
          <AppGrid
            items={folder.items}
            navIcons={navIcons}
            openCountByRoute={openCountByRoute}
            onOpenApp={onOpenApp}
          />
        </div>
      </div>
    </div>
  );
}
