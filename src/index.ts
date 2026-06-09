/**
 * react-os-shell — public API barrel.
 */

// ── Window registry composer + types ──
export { createWindowRegistry } from './windowRegistry/createWindowRegistry';
export { setShellNavIcons } from './shell-config/nav';
export {
  isPageEntry,
  isEntityEntry,
  setShellWindowRegistry,
} from './windowRegistry/types';
export type {
  WindowRegistry,
  WindowRegistryEntry,
  PageRegistryEntry,
  ModalRegistryEntry,
} from './windowRegistry/types';

// ── Shell components ──
export { default as Modal, ModalActions, CopyButton, CancelButton, useWindowMenuItem, WindowTitle, useWindowTitle, useModalActive, useWidgetSettings, setWindowDefaultPosition, setWindowPosition, getWindowPosition, toggleExposeMode, exitExposeMode, setExposeHighlight, getExposeHighlight, subscribeExposeHighlight, commitExposeHighlight } from './shell/Modal';
export { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from './shell/PopupMenu';
export { ConfirmProvider, confirm, confirmDestructive, prompt } from './shell/ConfirmDialog';
export { default as GlobalSearch } from './shell/GlobalSearch';
export type { SearchResult, SearchProvider, SearchConfig } from './shell/GlobalSearch';
export { default as ShortcutHelp } from './shell/ShortcutHelp';
export { default as HelpCenter } from './shell/HelpCenter';
export type { HelpCenterProps, HelpCenterDoc } from './shell/HelpCenter';
export { default as Markdown } from './shell/Markdown';
export type { MarkdownProps } from './shell/Markdown';
export { ALT_SHIFT_E, ALT_SHIFT_D, ALT_SHIFT_N, CMD_ENTER, CMD_S, CMD_K, CMD_DOT, CMD_A, MOD, ALT, SHIFT, ENTER, isMac } from './shell/Kbd';
export { default as toast } from './shell/toast';
export { default as EditableGrid } from './shell/EditableGrid';
export type { GridColumn, CellStyle, EditableGridProps } from './shell/EditableGrid';
export { default as SidebarLayout } from './shell/SidebarLayout';
export type { SidebarLayoutProps } from './shell/SidebarLayout';
export { default as TopNav } from './shell/TopNav';
export type { TopNavProps, TopNavItem } from './shell/TopNav';
export { default as Breadcrumbs } from './shell/Breadcrumbs';
export type { BreadcrumbsProps, BreadcrumbItem } from './shell/Breadcrumbs';

// ── Notification system ──
export { default as NotificationBell } from './shell/NotificationBell';
export type { NotificationsConfig, ShellNotification } from './shell/NotificationBell';

// ── Bug-report system ──
export {
  BugReportProvider,
  BugReportConfigProvider,
  useBugReport,
  openBugReportDialog,
} from './shell/BugReportDialog';
export type {
  BugReport,
  BugReportConfig,
  BugReportSubmitPayload,
  BugReportSubmission,
  BugReportExtraField,
  BugReportExtraSelectField,
  ReportType,
} from './shell/BugReportDialog';
export { default as BugReportDetail } from './shell/BugReportDetail';

// ── Status badges ──
export { default as StatusBadge, StatusBadgeProvider } from './shell/StatusBadge';
export type { SemanticGroup } from './shell/StatusBadge';

// ── Dev-environment chrome (localhost-only tray badge + tab-title prefix) ──
export { default as DevIndicator } from './shell/DevIndicator';
export { isDevEnv, applyDevTitle, DEV_BANNER_TEXT } from './utils/env';

// ── Window manager ──
export {
  WindowManagerProvider,
  useWindowManager,
  DocFavStar,
  getActiveWindowRoute,
} from './shell/WindowManager';

// ── Desktop host config (sticky resolver, persistence) ──
export {
  DesktopHostProvider,
  useDesktopHost,
} from './shell/Desktop';
export type {
  DesktopHostConfig,
  StickyEntityRef,
  StickyResolver,
} from './shell/Desktop';
export type { ChangelogEntry } from './changelog';

// ── Layout entry point ──
export { default as Layout } from './shell/Layout';
export type { LayoutProps } from './shell/Layout';
export { default as StartMenu } from './shell/StartMenu';
export { default as Desktop } from './shell/Desktop';
export { default as WidgetManager } from './shell/WidgetManager';

// ── Built-in settings pages (consumer registers via window registry) ──
export { default as Customization } from './settings/Customization';
export type { CustomizationProps, CustomizationOmitSection, CustomizationSection } from './settings/Customization';
export { default as BehaviorPanel } from './settings/BehaviorPanel';
export { default as SoundsPanel } from './settings/SoundsPanel';
export { default as SystemPreferences } from './settings/SystemPreferences';
export type { SystemPreferencesProps, SystemPreferencesSection } from './settings/SystemPreferences';

// ── Pageless data grid primitives ──
export { default as EntityList } from './data/EntityList';
export type { EntityListColumn, EntityListProps } from './data/EntityList';
export { default as Kanban } from './data/Kanban';
export type { KanbanColumn, KanbanProps } from './data/Kanban';
export { default as ResizableTable } from './data/ResizableTable';
export { default as ListFooter } from './data/ListFooter';
export { default as useTableNav } from './data/useTableNav';
export { useColumnConfig } from './data/useColumnConfig';
export { useInfiniteScroll } from './data/useInfiniteScroll';
export { useSort } from './data/useSort';
export type { ColumnDef, SortState, PaginatedResponse } from './data/types';

// ── Package version (tsup-injected at build time) ──
export { VERSION } from './version';

// ── Bridge surfaces (consumer wires these once at App startup) ──
export { ShellAuthProvider, useShellAuth } from './shell/ShellAuth';
export type { ShellAuth } from './shell/ShellAuth';
export {
  ShellPrefsProvider,
  useShellPrefs,
  useLocalStoragePrefs,
} from './shell/ShellPrefs';
export type { ShellPrefsAdapter } from './shell/ShellPrefs';
export {
  ShellEntityFetcherProvider,
  useShellEntityFetcher,
} from './shell/ShellEntityFetcher';
export type { EntityFetcher } from './shell/ShellEntityFetcher';
export { setShellApiClient } from './api/client';
export { setShellTodoProvider } from './apps/_todoStore';
export type { TodoProvider } from './apps/_todoStore';
export type { TodoTask } from './apps/_todoTypes';
export { setShellAuthBridge } from './contexts/AuthContext';

// ── Utilities ──
export { glassStyle, GLASS_DIVIDER, GLASS_INPUT_BG } from './utils/glass';
export { reportBug } from './utils/reportBug';
export { formatDate } from './utils/date';

// ── Hooks (theming, hotkeys, modal nav) ──
export { default as useClickOutside } from './hooks/useClickOutside';
export { default as useNewHotkey } from './hooks/useNewHotkey';
export { default as useEditHotkey } from './hooks/useEditHotkey';
