import { useMemo, isValidElement, cloneElement, type ReactElement } from 'react';
import Modal from './Modal';
import { useWindowManager } from './WindowManager';
import { WINDOW_REGISTRY, isPageEntry, type PageRegistryEntry } from '../windowRegistry/types';
import { navIcons } from '../shell-config/nav';

interface AvailableWidget {
  route: string;
  label: string;
  entry: PageRegistryEntry;
}

/** Generic fallback glyph for widgets the consumer hasn't given a navIcon. */
function FallbackIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function widgetIcon(entry: PageRegistryEntry, route: string) {
  const icon = navIcons[entry.icon ?? route];
  if (icon && isValidElement(icon)) {
    return cloneElement(icon as ReactElement, { className: 'h-5 w-5' });
  }
  return <FallbackIcon />;
}

/**
 * Widget gallery — the "manage widgets on the desktop" surface.
 *
 * Enumerates every widget-flagged page in the live window registry (so it
 * automatically lists whatever the consumer registered, not just the bundled
 * five) and cross-references the window manager's `openWindows` to know which
 * are currently sitting on the desktop. Adding a widget calls `openPage`
 * (which drops the chrome-less panel onto the desktop and persists it via the
 * normal open-windows session store); removing one calls `closeEntity` on the
 * live window. No new persistence layer — it drives the same plumbing the
 * Start Menu already uses.
 *
 * Surfaced from the desktop right-click menu ("Manage Widgets…") and exported
 * so a consumer can also register it as a window or wire it to a tray button.
 */
export default function WidgetManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openWindows, openPage, closeEntity } = useWindowManager();

  // Widget-flagged page entries from the live registry, alphabetised.
  const widgets = useMemo<AvailableWidget[]>(() => {
    if (!open) return [];
    return Object.entries(WINDOW_REGISTRY)
      .filter(([, e]) => isPageEntry(e) && (e as PageRegistryEntry).widget)
      .map(([route, e]) => ({ route, label: (e as PageRegistryEntry).label, entry: e as PageRegistryEntry }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [open]);

  if (!open) return null;

  // route → the live open-window item (widgets aren't multi-instance, so at
  // most one per route).
  const activeByRoute = new Map(openWindows.filter(w => w.route).map(w => [w.route!, w]));
  const isActive = (route: string) => activeByRoute.has(route);
  const add = (route: string) => { if (!isActive(route)) openPage(route); };
  const remove = (route: string) => { const w = activeByRoute.get(route); if (w) closeEntity(w.id); };
  const toggle = (route: string) => { isActive(route) ? remove(route) : add(route); };

  const activeCount = widgets.reduce((n, w) => n + (isActive(w.route) ? 1 : 0), 0);
  const allActive = widgets.length > 0 && activeCount === widgets.length;
  const addAll = () => widgets.forEach(w => add(w.route));
  const removeAll = () => widgets.forEach(w => remove(w.route));

  const widgetGlyph = (
    <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );

  return (
    <Modal open={open} onClose={onClose} title="Widgets" icon={widgetGlyph} size="md" compact dimensions={[480, 560]}>
      <div className="flex flex-col h-full">
        {/* Summary + bulk actions */}
        <div className="flex items-center justify-between gap-2 px-1 pb-3">
          <p className="text-xs text-gray-500">
            {widgets.length === 0
              ? 'No widgets available'
              : <><span className="font-semibold text-gray-700">{activeCount}</span> of {widgets.length} on your desktop</>}
          </p>
          {widgets.length > 0 && (
            <button
              onClick={allActive ? removeAll : addAll}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">
              {allActive ? 'Remove all' : 'Add all'}
            </button>
          )}
        </div>

        {/* Gallery */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 text-gray-400">
              <div className="opacity-60 mb-2">{widgetGlyph}</div>
              <p className="text-sm">No widgets are registered.</p>
              <p className="text-xs mt-1">Widgets like Weather, Currency, and the Pomodoro timer appear here once available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {widgets.map(({ route, label, entry }) => {
                const active = isActive(route);
                return (
                  <button
                    key={route}
                    onClick={() => toggle(route)}
                    title={active ? `Remove ${label} from desktop` : `Add ${label} to desktop`}
                    className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-blue-300 bg-blue-50/70 hover:bg-blue-50'
                        : 'border-gray-200 bg-white/60 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <span className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-lg ${
                      active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {widgetIcon(entry, route)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate">{label}</span>
                      <span className={`block text-[11px] ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                        {active ? 'On desktop' : 'Available'}
                      </span>
                    </span>
                    {/* Toggle affordance */}
                    <span className={`shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full border transition-colors ${
                      active
                        ? 'border-blue-500 bg-blue-500 text-white group-hover:border-red-400 group-hover:bg-red-400'
                        : 'border-gray-300 text-gray-400 group-hover:border-blue-400 group-hover:text-blue-500'
                    }`}>
                      {active ? (
                        <>
                          {/* check by default, swap to × on hover to signal removal */}
                          <svg className="h-3.5 w-3.5 group-hover:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          <svg className="h-3.5 w-3.5 hidden group-hover:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Hint */}
        <p className="shrink-0 pt-3 mt-1 border-t border-gray-100 text-[11px] text-gray-400 leading-relaxed">
          Drag a widget anywhere on the desktop to reposition it. Right-click a widget for its appearance settings.
        </p>
      </div>
    </Modal>
  );
}
