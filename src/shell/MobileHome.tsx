/**
 * Mobile home screen — full-screen icon grid driven by the consumer-supplied
 * `navSections`. Top-level NavItems render as direct app icons; NavSections
 * render as folder icons that, when tapped, push a "selected folder" view
 * showing that section's items in a sub-grid.
 *
 * Reuses the existing nav data shape (no new props for consumers) — the same
 * sections that populate the desktop StartMenu populate the mobile home.
 */
import { useState, useMemo, type ReactNode, isValidElement, cloneElement, type ReactElement } from 'react';
import { isSection, type NavItem, type NavSection } from './nav-types';
import type { MinimizedItem } from './WindowManager';

interface MobileHomeProps {
  productName?: string;
  productIcon?: string;
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
  productName,
  productIcon,
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

  // Open-window count per section route — show badge on folder icons.
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

  if (selectedFolder) {
    const openInThisFolder = openInFolder(selectedFolder);
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 bg-white/90 backdrop-blur border-b border-gray-200">
          <button onClick={() => setSelectedFolder(null)} className="p-2 -ml-2 rounded-full active:bg-gray-200" aria-label="Back to home">
            <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{selectedFolder.label}</h1>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {openInThisFolder.length > 0 && (
            <section className="mb-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Open</h2>
              <div className="grid grid-cols-2 gap-3">
                {openInThisFolder.map(w => (
                  <button
                    key={w.id}
                    onClick={() => onActivateWindow(w.id)}
                    className="flex flex-col items-start gap-2 p-3 rounded-lg bg-white border border-gray-200 active:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="h-7 w-7 rounded bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                        {sizeIcon(w.route ? navIcons[w.route] : null, FALLBACK_APP_ICON)}
                      </span>
                      <span className="text-xs font-medium text-gray-700 truncate flex-1">{w.label}</span>
                    </div>
                    <span className="text-[10px] text-blue-600">Open · tap to focus</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            {openInThisFolder.length > 0 && (
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">All</h2>
            )}
            <AppGrid
              items={selectedFolder.items}
              navIcons={navIcons}
              openCountByRoute={openCountByRoute}
              onOpenApp={onOpenApp}
            />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="px-4 py-3 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="flex items-center gap-2">
          {productIcon && <img src={productIcon} alt="" className="h-6 w-6 rounded" />}
          <h1 className="text-lg font-semibold text-gray-900 truncate">{productName ?? 'react-os-shell'}</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {topItems.length > 0 && (
          <section className="mb-6">
            <AppGrid
              items={topItems}
              navIcons={navIcons}
              openCountByRoute={openCountByRoute}
              onOpenApp={onOpenApp}
            />
          </section>
        )}
        {sections.length > 0 && (
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Folders</h2>
            <div className="grid grid-cols-4 gap-3">
              {sections.map(section => {
                const openInThis = openInFolder(section).length;
                return (
                  <button
                    key={section.label}
                    onClick={() => setSelectedFolder(section)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-lg active:bg-white/60"
                  >
                    <span className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200/60 flex items-center justify-center text-blue-600 shadow-sm">
                      {sizeIcon(sectionIcons[section.label], FALLBACK_FOLDER_ICON)}
                      {openInThis > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-[18px] text-center border-2 border-white">
                          {openInThis}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium text-gray-700 truncate w-full text-center">{section.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
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
            className="flex flex-col items-center gap-1.5 p-2 rounded-lg active:bg-white/60"
          >
            <span className="relative h-14 w-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-gray-700 shadow-sm">
              {sizeIcon(navIcons[item.to], FALLBACK_APP_ICON)}
              {openCount > 0 && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border-2 border-white" />
              )}
            </span>
            <span className="text-[11px] font-medium text-gray-700 truncate w-full text-center">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
