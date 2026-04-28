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
export { default as Modal, ModalActions, CopyButton, CancelButton, useWindowMenuItem, WindowTitle, useWindowTitle, useModalActive, useWidgetSettings } from './shell/Modal';
export { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from './shell/PopupMenu';
export { ConfirmProvider, confirm, confirmDestructive } from './shell/ConfirmDialog';
export { default as GlobalSearch } from './shell/GlobalSearch';
export type { SearchResult, SearchProvider, SearchConfig } from './shell/GlobalSearch';
export { default as ShortcutHelp } from './shell/ShortcutHelp';
export { ALT_SHIFT_E, ALT_SHIFT_D, ALT_SHIFT_N, CMD_ENTER, CMD_S, CMD_K, CMD_DOT, CMD_A, MOD, ALT, SHIFT, ENTER, isMac } from './shell/Kbd';
export { default as toast } from './shell/toast';

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
} from './shell/BugReportDialog';
export { default as BugReportDetail } from './shell/BugReportDetail';

// ── Status badges ──
export { default as StatusBadge, StatusBadgeProvider } from './shell/StatusBadge';
export type { SemanticGroup } from './shell/StatusBadge';

// ── Window manager ──
export {
  WindowManagerProvider,
  useWindowManager,
  DocFavStar,
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

// ── Layout entry point ──
export { default as Layout } from './shell/Layout';
export type { LayoutProps } from './shell/Layout';
export { default as StartMenu } from './shell/StartMenu';
export { default as Desktop } from './shell/Desktop';

// ── Built-in settings pages (consumer registers via window registry) ──
export { default as Customization } from './settings/Customization';

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
export { setShellAuthBridge } from './contexts/AuthContext';

// ── Utilities ──
export { glassStyle, GLASS_DIVIDER, GLASS_INPUT_BG } from './utils/glass';
export { reportBug } from './utils/reportBug';
export { formatDate } from './utils/date';

// ── Hooks (theming, hotkeys, modal nav, Google) ──
export { default as useClickOutside } from './hooks/useClickOutside';
export { default as useNewHotkey } from './hooks/useNewHotkey';
export { default as useEditHotkey } from './hooks/useEditHotkey';
// useTheme, useGoogleAuth, useEmailUnread are exported from their own files
// and route through the consumer-supplied apiClient.
