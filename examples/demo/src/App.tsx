/**
 * react-os-shell demo — minimal Vite app showcasing the shell + bundled apps.
 *
 * Wires only what the package needs out of the box:
 *   - localStorage prefs (no backend)
 *   - bundled apps as the entire window registry (no consumer entities)
 *   - a fake user identity so the profile menu has something to render
 *   - permissive `hasAnyPerm` (no permission-gated nav items in this demo)
 *
 * Open the start menu (bottom-left "react-os-shell") and pick any app from
 * the Components / Utilities trays to see the windowing system in action.
 * Cmd-K opens the global search. Logout returns you to the demo's login
 * splash.
 */
import { lazy, useEffect, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Layout,
  WindowManagerProvider,
  ConfirmProvider,
  ShellAuthProvider,
  ShellPrefsProvider,
  ShellEntityFetcherProvider,
  StatusBadgeProvider,
  DesktopHostProvider,
  BugReportProvider,
  BugReportConfigProvider,
  Modal,
  setShellAuthBridge,
  setShellWindowRegistry,
  setShellNavIcons,
  setShellApiClient,
  setWindowDefaultPosition,
  createWindowRegistry,
  useLocalStoragePrefs,
  useWindowManager,
  VERSION,
  type BugReportConfig,
  type NotificationsConfig,
} from 'react-os-shell';
import { bundledApps, utilityApps, documentApps, webApps, setFilesDemoTree, type FilesDemoNode } from 'react-os-shell/apps';
// Global-search wiring: sample directory, providers, and the entity windows
// search results open into (person / project detail modals).
import { DEMO_SEARCH, DEMO_ENTITY_WINDOWS } from './searchDemo';
import { DEMO_STATUS_GROUPS } from './demoStatusGroups';
// Mock axios client — serves the directory entities and bridges /auth/me/
// preference patches (window-menu "Add to Desktop", fav stars) to the demo's
// localStorage prefs.
import { demoApiClient, bindDemoApiPrefs } from './demoApiClient';

// Floating panel toggled with Alt+Shift+T to test toast / notification /
// confirm / confirmDestructive / prompt visually. Eagerly imported because
// it's mounted outside the Routes' Suspense boundary — a lazy() here
// throws to a missing boundary and trips React error #426.
import DevToolbox from './DevToolbox';

// Demo profile page wired to the shell's start-menu profile row.
const ProfilePage = lazy(() => import('./ProfilePage'));
// Demo pages that exercise the shell's data/layout primitives.
const KanbanDemo = lazy(() => import('./KanbanDemo'));
const SidebarDemo = lazy(() => import('./SidebarDemo'));
const ListDemo = lazy(() => import('./ListDemo'));
const TopNavDemo = lazy(() => import('./TopNavDemo'));
const BreadcrumbsDemo = lazy(() => import('./BreadcrumbsDemo'));
const PreferencesDemo = lazy(() => import('./PreferencesDemo'));
const GridDemo = lazy(() => import('./GridDemo'));
const HelpCenterDemo = lazy(() => import('./HelpCenterDemo'));
const BadgesDemo = lazy(() => import('./BadgesDemo'));

setShellWindowRegistry(createWindowRegistry(bundledApps, {
  // The shell's menus (desktop right-click, profile menu) open
  // `/settings/customization`; in the demo that's the Preferences window —
  // the sectioned SystemPreferences hosting the split Customization page.
  '/settings/customization': {
    component: PreferencesDemo,
    label: 'Preferences',
    size: 'xl',
    flushBody: true,
  },
  '/profile': {
    component: ProfilePage,
    label: 'Profile',
    size: 'md',
  },
  '/kanban-demo': {
    component: KanbanDemo,
    label: 'Kanban',
    size: 'xl',
  },
  '/sidebar-demo': {
    component: SidebarDemo,
    label: 'Sidebar',
    size: 'lg',
    flushBody: true,
  },
  '/list-demo': {
    component: ListDemo,
    label: 'List',
    size: 'xl',
  },
  '/topnav-demo': {
    component: TopNavDemo,
    label: 'Top Nav',
    size: 'lg',
    flushBody: true,
  },
  '/breadcrumbs-demo': {
    component: BreadcrumbsDemo,
    label: 'Breadcrumbs',
    size: 'lg',
  },
  '/grid-demo': {
    component: GridDemo,
    label: 'Grid',
    size: 'xl',
  },
  '/help-demo': {
    component: HelpCenterDemo,
    label: 'Help Center',
    size: 'xl',
    flushBody: true,
  },
  '/badges-demo': {
    component: BadgesDemo,
    label: 'Status Badges',
    size: 'lg',
  },
  // Entity windows opened by ⌘K search results (see searchDemo.tsx).
  person: DEMO_ENTITY_WINDOWS.person,
  project: DEMO_ENTITY_WINDOWS.project,
}));

// Inject a static demo filesystem so the Files app browses in-memory (no file
// server needed in the demo). A real consumer never calls this and keeps its
// live server. See setFilesDemoTree in react-os-shell/apps.
const DEMO_FILES: FilesDemoNode[] = [
  { name: 'Documents', kind: 'folder', modifiedAt: '2026-05-20T10:00:00Z', children: [
    { name: 'Resume.pdf', kind: 'file', size: 248_000, modifiedAt: '2026-05-18T09:12:00Z' },
    { name: 'Budget.xlsx', kind: 'file', size: 41_300, modifiedAt: '2026-06-01T14:03:00Z' },
    { name: 'Reports', kind: 'folder', modifiedAt: '2026-06-05T11:00:00Z', children: [
      { name: 'Q1-summary.pdf', kind: 'file', size: 1_200_000, modifiedAt: '2026-04-02T16:20:00Z' },
      { name: 'Q2-summary.pdf', kind: 'file', size: 1_350_000, modifiedAt: '2026-06-04T16:20:00Z' },
    ] },
  ] },
  { name: 'Pictures', kind: 'folder', modifiedAt: '2026-05-30T08:00:00Z', children: [
    { name: 'Yosemite.jpg', kind: 'file', size: 3_400_000, modifiedAt: '2026-05-12T07:30:00Z' },
    { name: 'Lake.jpg', kind: 'file', size: 2_800_000, modifiedAt: '2026-05-13T07:30:00Z' },
    { name: 'Screenshots', kind: 'folder', children: [
      { name: 'desktop.png', kind: 'file', size: 540_000, modifiedAt: '2026-06-07T19:45:00Z' },
    ] },
  ] },
  { name: 'Downloads', kind: 'folder', modifiedAt: '2026-06-08T20:00:00Z', children: [
    { name: 'react-os-shell-1.0.0.tgz', kind: 'file', size: 750_000, modifiedAt: '2026-06-09T20:30:00Z' },
    { name: 'invoice-2026-06.pdf', kind: 'file', size: 88_000, modifiedAt: '2026-06-06T12:00:00Z' },
  ] },
  { name: 'Projects', kind: 'folder', modifiedAt: '2026-06-09T09:00:00Z', children: [
    { name: 'README.md', kind: 'file', size: 4_200, modifiedAt: '2026-06-09T09:05:00Z' },
    { name: 'notes.txt', kind: 'file', size: 1_100, modifiedAt: '2026-06-08T17:00:00Z' },
  ] },
  { name: 'welcome.txt', kind: 'file', size: 320, modifiedAt: '2026-06-01T08:00:00Z' },
];
setFilesDemoTree(DEMO_FILES);

// Logout dispatches a CustomEvent the App listens for (the auth bridge is
// set once at module-load and can't close over React state).
setShellAuthBridge({
  user: {
    first_name: 'Demo',
    last_name: 'User',
    email: 'demo@example.com',
    avatar_url: `${import.meta.env.BASE_URL}demo-avatar.webp`,
  },
  logout: () => window.dispatchEvent(new CustomEvent('demo-logout')),
});

setShellApiClient(demoApiClient);

const queryClient = new QueryClient();

// Top-level flat items shown directly in the main start menu (alongside the
// built-in Notifications entry). The remaining utility apps stay in their
// category sub-trays below.
const TOP_LEVEL_ROUTES = new Set(['/spreadsheet', '/notepad', '/documents', '/preview', '/files', '/browser']);
const lookupLabel = (to: string) =>
  (utilityApps as any)[to]?.label
  ?? (documentApps as any)[to]?.label
  ?? (webApps as any)[to]?.label
  ?? to;

// Top-level apps, then a divider, then Preferences as its own row.
type TopNavItem = { to: string; label: string; dividerAfter?: boolean };
const TOP_NAV_ITEMS: TopNavItem[] = (() => {
  const items: TopNavItem[] = Array.from(TOP_LEVEL_ROUTES).map(to => ({ to, label: lookupLabel(to) }));
  if (items.length) items[items.length - 1].dividerAfter = true;
  items.push({ to: '/settings/customization', label: 'Preferences' });
  return items;
})();

const NAV_SECTIONS = [
  ...TOP_NAV_ITEMS,
  {
    // Showcase the library's data + layout primitives in isolation.
    label: 'Components',
    items: [
      { to: '/list-demo', label: 'List' },
      { to: '/grid-demo', label: 'Grid' },
      { to: '/kanban-demo', label: 'Kanban' },
      { to: '/sidebar-demo', label: 'Sidebar' },
      { to: '/topnav-demo', label: 'Top Nav' },
      { to: '/breadcrumbs-demo', label: 'Breadcrumbs' },
      { to: '/badges-demo', label: 'Status Badges' },
      { to: '/help-demo', label: 'Help Center' },
    ],
  },
  {
    // Widgets (Calculator, Weather, Currency, Pomodoro, World Clock, Stocks)
    // are added/removed from the desktop's Widget Manager panel (right-click the
    // desktop → Manage Widgets…), so they're filtered out of the start menu
    // here — only non-widget utilities would remain.
    label: 'Utilities',
    items: Object.entries(utilityApps)
      .filter(([to, e]) => !TOP_LEVEL_ROUTES.has(to) && !(e as any).widget)
      .map(([to, e]) => ({ to, label: (e as any).label })),
  },
];

const START_MENU_CATEGORIES = { erp: [], system: ['Components', 'Utilities'] };

// Per-route icons rendered next to each start-menu item. Keep paths tight —
// they re-render at h-4 w-4 inside the menu.
const path = (d: string) => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const NAV_ICONS: Record<string, JSX.Element> = {
  '/spreadsheet': path('M3.75 6.75h16.5v10.5H3.75zM3.75 11.25h16.5M9 6.75v10.5'),
  '/notepad': path('M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125'),
  '/calculator': path('M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 4.5h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM4.5 9.75h15v9a2.25 2.25 0 01-2.25 2.25h-10.5A2.25 2.25 0 014.5 18.75v-9zM4.5 9.75V7.5a2.25 2.25 0 012.25-2.25h10.5A2.25 2.25 0 0119.5 7.5v2.25h-15z'),
  '/weather': path('M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z'),
  '/currency': path('M12 7.5v9m3.75-9.75H9.375a2.625 2.625 0 100 5.25h2.25a2.625 2.625 0 010 5.25H8.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z'),
  '/pomodoro': path('M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'),
  '/stock': path('M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941'),
  '/preview': path('M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'),
  '/documents': path('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'),
  '/files': path('M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z'),
  '/browser': path('M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418'),
  '/settings/customization': path('M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z'),
  '/profile': path('M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z'),
  '/kanban-demo': path('M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z'),
  '/sidebar-demo': path('M9 4.5v15m-4.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z'),
  '/list-demo': path('M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z'),
  '/topnav-demo': path('M3.75 9h16.5M4.5 5.25h15a.75.75 0 01.75.75v12a.75.75 0 01-.75.75h-15a.75.75 0 01-.75-.75V6a.75.75 0 01.75-.75z'),
  '/breadcrumbs-demo': path('M5.25 4.5l7.5 7.5-7.5 7.5m6-15l7.5 7.5-7.5 7.5'),
  '/grid-demo': path('M3.75 5.25h16.5v13.5H3.75zM3.75 9.75h16.5M3.75 14.25h16.5M9.5 5.25v13.5M15 5.25v13.5'),
  '/help-demo': path('M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z'),
  '/badges-demo': path('M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z'),
};

setShellNavIcons(NAV_ICONS);

// Section header icons (matched by section label).
const SECTION_ICONS: Record<string, JSX.Element> = {
  Components: path('M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z'),
  Utilities: path('M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437L12 10.5'),
  Settings: path('M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z'),
};

const PRODUCT_ICON = `${import.meta.env.BASE_URL}favicon.svg`;
const WALLPAPER_OPTIONS = [
  { src: `${import.meta.env.BASE_URL}wallpaper-yosemite.jpg`, label: 'Yosemite' },
  { src: `${import.meta.env.BASE_URL}wallpaper-winter.jpg`, label: 'Winter' },
  { src: `${import.meta.env.BASE_URL}wallpaper-mojave.jpg`, label: 'Mojave' },
  { src: `${import.meta.env.BASE_URL}wallpaper-wanaka.jpg`, label: 'Wanaka' },
  { src: `${import.meta.env.BASE_URL}wallpaper-lake.jpg`, label: 'Lake' },
];
const WALLPAPER_URLS = WALLPAPER_OPTIONS.map(w => w.src);

// Demo notification store — purely in-memory. Stateful so the DevToolbox
// can fire test notifications and have the bell badge update live.
interface DemoNotification {
  id: string;
  title: string;
  message?: string;
  is_read: boolean;
  created_at: string;
}
let demoNotifications: DemoNotification[] = [];
const demoNotifListeners = new Set<() => void>();
function notifyDemoListeners() { demoNotifListeners.forEach(fn => fn()); }
function subscribeDemoNotifications(fn: () => void) {
  demoNotifListeners.add(fn);
  return () => { demoNotifListeners.delete(fn); };
}
function getDemoUnreadCount() {
  return demoNotifications.reduce((n, x) => n + (x.is_read ? 0 : 1), 0);
}
function pushDemoNotification(title: string, message?: string) {
  demoNotifications = [
    {
      id: crypto.randomUUID(),
      title,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    ...demoNotifications,
  ].slice(0, 50); // cap so the in-memory list doesn't grow forever
  notifyDemoListeners();
}

const DEMO_NOTIFICATIONS: NotificationsConfig = {
  useUnreadCount: () =>
    useSyncExternalStore(subscribeDemoNotifications, getDemoUnreadCount, getDemoUnreadCount),
  list: async () => ({ results: demoNotifications as any }),
  markRead: async (id) => {
    demoNotifications = demoNotifications.map(n => n.id === id ? { ...n, is_read: true } : n);
    notifyDemoListeners();
  },
  markAllRead: async () => {
    demoNotifications = demoNotifications.map(n => ({ ...n, is_read: true }));
    notifyDemoListeners();
  },
  onItemClick: () => {},
};

// Bug-report flow: the shell captures + annotates the screenshot and builds
// the payload; the consumer's submit callback decides where it goes. The
// demo "files" it as an in-app notification so the round trip is visible.
const DEMO_BUG_CONFIG: BugReportConfig = {
  submit: async (p) => {
    console.info('[demo] bug report payload', p);
    pushDemoNotification(
      p.reportType === 'bug' ? 'Bug report received' : 'Suggestion received',
      p.description?.slice(0, 80) || '(no description)',
    );
  },
};

// Pick a wallpaper once per page load; reused across renders.
const LOGIN_WALLPAPER = WALLPAPER_URLS[Math.floor(Math.random() * WALLPAPER_URLS.length)];

const CHANGELOG_URL = 'https://raw.githubusercontent.com/victorymau/react-os-shell/main/CHANGELOG.md';

function VersionBadge() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || text) return;
    setError(null);
    fetch(CHANGELOG_URL)
      .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setText)
      .catch(err => setError(err.message || 'Failed to load changelog'));
  }, [open, text]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View changelog"
        className="fixed right-3 text-[11px] font-mono text-white/60 hover:text-white select-none drop-shadow z-10 transition-colors cursor-pointer"
        style={{ bottom: 'calc(var(--taskbar-height, 56px) * 1px + 8px)' }}
      >
        v{VERSION || '0.0.0'}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={`Changelog · v${VERSION}`} size="lg">
          {error ? (
            <div className="p-6 text-sm text-red-600">
              Could not load changelog: {error}.{' '}
              <a className="text-blue-600 hover:underline" href="https://github.com/victorymau/react-os-shell/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">
                Open on GitHub
              </a>
            </div>
          ) : !text ? (
            <div className="p-6 text-sm text-gray-500">Loading…</div>
          ) : (
            <pre className="p-6 text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed">{text}</pre>
          )}
        </Modal>
      )}
    </>
  );
}

// Opens the default widgets once when the desktop first mounts after sign-in.
// Seeds initial positions so the first-run desktop reads as a tidy row of
// three widgets — 40 px from the top/left, 20 px between each. The seed
// only applies if no saved position exists for that window key, so users
// who have moved the widgets keep their layout.
function DefaultWindows() {
  const { openPage } = useWindowManager();
  useEffect(() => {
    const PAD = 40;
    const GAP = 20;
    const W = 320;
    setWindowDefaultPosition('page:/weather',     { x: PAD,                     y: PAD, w: W, h: 130 });
    setWindowDefaultPosition('page:/currency',    { x: PAD + (W + GAP),         y: PAD, w: W, h: 200 });
    setWindowDefaultPosition('page:/world-clock', { x: PAD + 2 * (W + GAP),     y: PAD, w: W, h: 280 });
    openPage('/weather');
    openPage('/currency');
    openPage('/world-clock');
  }, [openPage]);
  return null;
}

function LoginSplash({ onSignIn }: { onSignIn: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-10"
      style={{
        backgroundImage: `url(${LOGIN_WALLPAPER})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#1e1b4b',
      }}
    >
      <div className="text-center">
        <p className="text-7xl font-light text-white tracking-tight tabular-nums">{time}</p>
        <p className="mt-2 text-sm text-white/60 tracking-wide">{date}</p>
      </div>

      <div className="w-80 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl p-8 text-center">
        <img src={PRODUCT_ICON} alt="" className="h-16 w-16 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-white tracking-wide">react-os-shell</h1>
        <p className="mt-1 text-xs text-white/60">Desktop UI shell for React</p>
        <button
          onClick={onSignIn}
          className="mt-6 w-full rounded-lg bg-white/90 hover:bg-white text-gray-900 text-sm font-medium py-2.5 transition-colors"
        >
          Continue as Demo User
        </button>
        <p className="mt-4 text-[11px] text-white/40">No real auth — local-only demo.</p>
      </div>

      <p className="absolute bottom-4 right-4 text-[10px] font-mono text-white/40 select-none">v{VERSION || '0.0.0'}</p>
    </div>
  );
}

export default function App() {
  // Hide the bundled desktop version watermark — the demo renders its own
  // VersionBadge that opens the in-app changelog modal. Force the value on
  // every mount so existing users (who already have show_desktop_version:
  // true stored from before the dedup) drop the duplicate badge too.
  const prefs = useLocalStoragePrefs('react-os-shell-demo', { show_desktop_version: false });
  // Keep the mock api client writing through the live prefs state — its
  // /auth/me/ bridge backs the window-menu "Add to Desktop" persistence.
  bindDemoApiPrefs(prefs);
  useEffect(() => {
    if (prefs.prefs.show_desktop_version !== false) prefs.save({ show_desktop_version: false });
  }, []);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const handleLogout = () => setSignedIn(false);
    window.addEventListener('demo-logout', handleLogout);
    return () => window.removeEventListener('demo-logout', handleLogout);
  }, []);

  if (!signedIn) return <LoginSplash onSignIn={() => setSignedIn(true)} />;

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <BrowserRouter>
          <ShellAuthProvider value={{ hasAnyPerm: () => true }}>
            <ShellPrefsProvider value={prefs}>
              <ShellEntityFetcherProvider value={() => Promise.resolve({})}>
                <StatusBadgeProvider groups={DEMO_STATUS_GROUPS}>
                  <BugReportConfigProvider value={DEMO_BUG_CONFIG}>
                  <DesktopHostProvider value={{
                    productName: 'react-os-shell',
                    productTagline: 'Desktop UI shell for React',
                    productIcon: PRODUCT_ICON,
                    wallpapers: WALLPAPER_OPTIONS,
                  }}>
                    <WindowManagerProvider>
                      <BugReportProvider>
                      <DefaultWindows />
                      <VersionBadge />
                      <DevToolbox pushNotification={pushDemoNotification} />
                      <Routes>
                        <Route
                          path="*"
                          element={
                            <Layout
                              productName="react-os-shell"
                              productIcon={PRODUCT_ICON}
                              wallpapers={WALLPAPER_URLS}
                              navSections={NAV_SECTIONS as any}
                              navIcons={NAV_ICONS}
                              sectionIcons={SECTION_ICONS}
                              categories={START_MENU_CATEGORIES}
                              notifications={DEMO_NOTIFICATIONS}
                              search={DEMO_SEARCH}
                            />
                          }
                        />
                      </Routes>
                      </BugReportProvider>
                    </WindowManagerProvider>
                  </DesktopHostProvider>
                  </BugReportConfigProvider>
                </StatusBadgeProvider>
              </ShellEntityFetcherProvider>
            </ShellPrefsProvider>
          </ShellAuthProvider>
        </BrowserRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
