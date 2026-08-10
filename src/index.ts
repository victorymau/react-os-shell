/**
 * react-os-shell — public API barrel.
 *
 * This entry is the SHELL: the window manager, the desktop, and everything
 * that needs them — plus the whole UI kit, re-exported from `./ui` below.
 *
 * The kit's list lives in `src/ui/kit.ts` and is re-exported here wholesale, so
 * there is exactly one list to maintain and this entry stays a superset.
 * Add a kit component there, never in both: TypeScript resolves an explicit
 * local export ahead of a star export SILENTLY, so re-declaring one of those
 * names here would shadow it with no error and let the two entries drift while
 * both still compiled. `tests/uiBarrelMatchesRoot.test.ts` catches that.
 *
 * The star must point at `./ui/kit` and NOT at `./ui`: the latter is a tsup
 * entry, and esbuild does not expand a star re-export of an entry module — the
 * built root barrel then ships with none of the kit on it, silently.
 */

// ── The UI kit, in full ──
// Also available as `react-os-shell/ui`, which is the same modules with no
// window manager in the graph — for consumers that want the kit and not a
// desktop. Nothing here differs; this is the same binding, re-exported.
export * from './ui/kit';

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
export { default as Modal, ModalActions, CopyButton, CancelButton, useWindowMenuItem, WindowTitle, useWindowTitle, useModalActive, useIsActiveWindow, useEnclosingModalId, useWidgetSettings, setWindowDefaultPosition, setWindowPosition, getWindowPosition, toggleExposeMode, exitExposeMode, setExposeHighlight, getExposeHighlight, subscribeExposeHighlight, commitExposeHighlight, registerModalEscapeInterceptor } from './shell/Modal';
export { requestWindowFront } from './shell/Modal';
export { createWindowTarget, useWindowTarget } from './shell/windowTarget';
export type { WindowTarget, WindowTargetOptions, StagedTarget } from './shell/windowTarget';
export { default as WindowErrorBoundary, WindowCrashedFallback } from './shell/WindowErrorBoundary';
// GlobalSearch moved to the kit barrel (src/ui/kit.ts) when its window-manager
// import was removed. Re-declaring it here would shadow the star export
// silently — see tests/uiBarrelMatchesRoot.test.ts.
export { default as ShortcutHelp } from './shell/ShortcutHelp';

// ── Notification system ──
export { default as NotificationBell } from './shell/NotificationBell';
export type { NotificationsConfig, ShellNotification } from './shell/NotificationBell';

// ── Dev-environment chrome (localhost-only tray badge + tab-title prefix) ──
export { default as DevIndicator } from './shell/DevIndicator';
export { isDevEnv, applyDevTitle, DEV_BANNER_TEXT } from './utils/env';

// ── Window manager ──
export {
  WindowManagerProvider,
  useWindowManager,
  useWindowDirty,
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
  DesktopContextMenuItem,
  StickyEntityRef,
  StickyResolver,
} from './shell/Desktop';
export type { ChangelogEntry } from './changelog';

// ── Layout entry point ──
export { default as Layout } from './shell/Layout';
export type { LayoutProps, ClockCalendarConfig, MobileAppConfig } from './shell/Layout';
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

// ── Standalone image annotator (the same markup tool embedded in the Preview
//    app). Pass `src` + `filename` plus the standalone `onApply`/`onCancel`
//    pair to embed it outside Preview (e.g. a bug-report dialog) and receive
//    the flattened PNG back. ──
export { default as ImageAnnotator } from './apps/ImageAnnotator';
export type { ImageAnnotatorHandle, ImageAnnotatorProps } from './apps/ImageAnnotator';

// ── Pageless data grid primitives ──
// The rest of the data primitives (Kanban, Pagination, ListFooter,
// ListLoadError, the types) come through `./ui`. These four stay here: they
// reach axios and react-query, which the kit entry must not.
export { default as EntityList } from './data/EntityList';
export type { EntityListColumn, EntityListProps, EntityListContextAction } from './data/EntityList';
export { default as ResizableTable } from './data/ResizableTable';
export { default as useTableNav } from './data/useTableNav';
export { useColumnConfig } from './data/useColumnConfig';
export { useInfiniteScroll } from './data/useInfiniteScroll';
export { useSort } from './data/useSort';

// ── Display primitives that reach an optional peer ──
// (The peer-free ones — Card, Banner, Tabs, Avatar, … — come through `./ui`.)
export { default as FilterBar, useFilters } from './shell/FilterBar';
export type { FilterOption } from './shell/FilterBar';

// ── Perf HUD and its analysis modules ──
export { default as PerfStats, type PerfStatsProps, type PerfReport } from './shell/PerfStats';
export {
  classify as classifyPerf,
  summariseFrames,
  SMOOTH_FPS,
  BLOCKED_PCT_CPU,
  type PerfReading,
  type Verdict,
  type BottleneckKind,
} from './shell/perfVerdict';
export {
  appendRecord as appendPerfRecord,
  summariseLog as summarisePerfLog,
  toCsv as perfLogToCsv,
  isInteracting,
  classifyActivity,
  LOG_CAP,
  MIN_GROUP_SAMPLES,
  MIN_EVENT_SAMPLES,
  type PerfLogRecord,
  type LogSummary,
  type FpsGroup,
  type ActivityKind,
} from './shell/perfLog';
// Marks for hosts with menus or drag surfaces of their own — the shell's own
// start menu and window gestures already mark themselves.
export { markMenuOpen, beginWindowGesture, type MenuLayer } from './shell/perfEvents';
// Rendering a report for a bug tracker — shared so the portals cannot drift
// into three different descriptions of the same thing.
export { describePerfReport, perfReportFile } from './shell/perfDescribe';
export {
  readEnvironment as readPerfEnvironment,
  requestAsyncEnvironment,
  describeMachine,
  type PerfEnvironment,
  type AsyncEnvironment,
  type PlatformHints,
  type BatteryInfo,
} from './shell/perfEnvironment';

// ── Portal-promoted components (phase 2/3 — app concerns lifted to props) ──
export { default as BulkImportGrid } from './shell/BulkImportGrid';
export type { BulkImportGridProps, BulkColumn, BulkColumnKind } from './shell/BulkImportGrid';
export { mergeBulkItems, findDuplicateKeys } from './utils/mergeBulkItems';
export type { BulkRow, DuplicateGroup, MergeBulkResult, MergeBulkOptions } from './utils/mergeBulkItems';
export { default as UndoControls } from './shell/UndoControls';
export type { UndoControlsProps } from './shell/UndoControls';
export { default as ServerStatusIndicator } from './shell/ServerStatusIndicator';
export type { ServerStatusIndicatorProps, ServerStatusUser, HealthCheckResult } from './shell/ServerStatusIndicator';
export { default as ChangePasswordForm } from './shell/ChangePasswordForm';
export type { ChangePasswordFormProps } from './shell/ChangePasswordForm';
export { default as PdfActionButton } from './shell/PdfActionButton';
export type { PdfActionButtonProps } from './shell/PdfActionButton';

// ── Bridge surfaces (consumer wires these once at App startup) ──
// ShellPrefs comes through `./ui` — the kit's theming needs it.
export { ShellAuthProvider, useShellAuth } from './shell/ShellAuth';
export type { ShellAuth } from './shell/ShellAuth';
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
// glassStyle + GLASS_DIVIDER come through `./ui`. GLASS_INPUT_BG stays here:
// its CSS rule lives in shell.css, so the class would name a rule a ui-only
// consumer has not loaded.
export { GLASS_INPUT_BG } from './utils/glass';

// ── Hooks (hotkeys, modal nav) ──
// useClickOutside and the theming hooks come through `./ui`. These ask which
// window is active, so they belong to the shell.
export { default as useNewHotkey } from './hooks/useNewHotkey';
export { default as useEditHotkey } from './hooks/useEditHotkey';
// Cmd+S / Alt+Shift+D receivers. These existed here unexported (so every portal
// kept its own unguarded copy); they are exported now because the window-scoping
// guard has to live beside the dispatch that supplies the id.
export { default as useModalSave } from './hooks/useModalSave';
export { default as useModalDuplicate } from './hooks/useModalDuplicate';
export { UndoProvider, useUndo, useUndoable, useUndoableState } from './shell/UndoProvider';
export type { UndoControlsApi, UndoableOptions, UndoProviderProps } from './shell/UndoProvider';
export type { UndoStep, UndoState, UndoSnapshot } from './hooks/undoHistory';
