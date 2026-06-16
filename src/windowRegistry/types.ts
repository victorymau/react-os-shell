/**
 * Window registry types — generic shell concepts (no consumer-specific data).
 *
 * Two kinds of entries can be registered:
 *   - PageRegistryEntry: a lazy-loaded React component rendered as a windowed
 *     page (Calculator, Notepad, Sales Order list, etc.).
 *   - ModalRegistryEntry: a detail-modal definition that fetches an entity
 *     from a REST endpoint and hands it to a render function (Sales Order
 *     detail, Bug Report detail, etc.).
 *
 * Consumers compose their full registry by passing entries to
 * `createWindowRegistry()` (see ./createWindowRegistry).
 */
import type { ReactNode, LazyExoticComponent } from 'react';

/** Page window entry — renders a lazy-loaded page component. */
export interface PageRegistryEntry {
  component: LazyExoticComponent<any>;
  label: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  allowPinOnTop?: boolean;
  /** Utility apps don't show as taskbar window tabs. */
  utility?: boolean;
  /** Initial position hint. */
  initialPosition?: 'top-right' | 'top-left';
  /** Widget mode: no title bar, drag via body, right-click context menu. */
  widget?: boolean;
  /** Compact title bar: smaller header with title + close only, no footer. */
  compact?: boolean;
  /** App-style window for self-chromed apps (Preview, Files, Browser, etc.):
   *  small title bar with full controls, no body padding, no footer. */
  appStyle?: boolean;
  /** Flush body — keeps the STANDARD full title bar and footer, but drops the
   *  body padding so the app's content (e.g. a `<SidebarLayout>`) sits flush to
   *  the window edges. Implies `bodyScroll: false`; the app manages its own
   *  scrolling. Use for two-pane / sidebar apps that want normal window chrome. */
  flushBody?: boolean;
  /** Custom window dimensions [width, height] in pixels. */
  dimensions?: [number, number];
  /** Auto-size window height to its content. Naturally-flowing content (forms,
   *  settings, simple tools) shrinks the window to hug it; a fill-height root
   *  (`h-full` / `flex-1` between a fixed header and footer) keeps the normal
   *  size-ladder height and scrolls internally rather than collapsing. */
  autoHeight?: boolean;
  /** Floor for `autoHeight` (px). Defaults to 240. */
  autoMinHeight?: number;
  /** When true, openPage(path) opens a new instance each time instead of
   *  activating an existing one. Each instance gets a unique window id and
   *  the taskbar groups them under a single icon. */
  multiInstance?: boolean;
  /** navIcon route key for window title icon (e.g. '/orders'). */
  icon?: string;
}

/** Entity window entry — renders a detail modal with API data. */
export interface ModalRegistryEntry {
  /** API endpoint prefix — entity fetched via GET {endpoint}{id}/. */
  endpoint: string;
  /** How to render the detail content. */
  render: (entity: any, onClose: () => void, entityId?: string, editing?: boolean, setEditing?: (v: boolean) => void) => ReactNode;
  /** Generate modal title from entity data. Editing state passed for Edit button. */
  title: (entity: any, editing?: boolean, setEditing?: (v: boolean) => void) => ReactNode;
  /** Generate modal footer from entity data. */
  footer?: (entity: any) => ReactNode;
  /** Modal size. */
  size?: string;
  /** If true, the component fetches its own data — pass ID, not entity. */
  selfFetching?: boolean;
  /** If true, the component renders its own Modal — skip outer Modal wrapper. */
  rendersOwnModal?: boolean;
  /** Query key prefix for React Query — must match what detail components invalidate. */
  queryKey?: string;
  /** Auto-size window height to its content. See PageRegistryEntry.autoHeight. */
  autoHeight?: boolean;
  /** Floor for `autoHeight` (px). Defaults to 240. */
  autoMinHeight?: number;
  /** App-style window: small title bar, no body padding, no footer. */
  appStyle?: boolean;
  /** navIcon route key for window title icon (e.g. '/orders'). */
  icon?: string;
}

export type WindowRegistryEntry = PageRegistryEntry | ModalRegistryEntry;

export type WindowRegistry = Record<string, WindowRegistryEntry>;

/** Type guard: true if entry is a page window (has `component`). */
export function isPageEntry(entry: WindowRegistryEntry): entry is PageRegistryEntry {
  return 'component' in entry;
}

/** Type guard: true if entry is an entity window (has `endpoint`). */
export function isEntityEntry(entry: WindowRegistryEntry): entry is ModalRegistryEntry {
  return 'endpoint' in entry;
}

/** Module-level registry — the package no longer ships entity/page data;
 *  consumers register their composed registry once at app startup via
 *  setShellWindowRegistry(). The shell's WindowManager reads from here at
 *  every openEntity / openPage call. */
let _registry: WindowRegistry = {};

export function setShellWindowRegistry(registry: WindowRegistry): void {
  _registry = registry;
}

/** Live proxy onto the consumer-registered registry — reads always reflect
 *  the latest setShellWindowRegistry() call. */
export const WINDOW_REGISTRY: WindowRegistry = new Proxy({} as WindowRegistry, {
  get(_t, prop: string) { return _registry[prop]; },
  has(_t, prop: string) { return prop in _registry; },
  ownKeys() { return Object.keys(_registry); },
  getOwnPropertyDescriptor(_t, prop: string) {
    if (prop in _registry) {
      return { configurable: true, enumerable: true, value: _registry[prop] };
    }
    return undefined;
  },
});
