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
export { default as Modal, ModalActions, CopyButton, CancelButton, useWindowMenuItem, WindowTitle, useWindowTitle, useModalActive, useWidgetSettings, setWindowDefaultPosition, setWindowPosition, getWindowPosition, toggleExposeMode, exitExposeMode, setExposeHighlight, getExposeHighlight, subscribeExposeHighlight, commitExposeHighlight, registerModalEscapeInterceptor } from './shell/Modal';
export { default as WindowErrorBoundary, WindowCrashedFallback } from './shell/WindowErrorBoundary';
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
export { default as SidebarActionButton } from './shell/SidebarActionButton';
export type { SidebarActionButtonProps } from './shell/SidebarActionButton';
export { default as SearchableSelect } from './shell/SearchableSelect';
export type { SearchableOption, SearchableSelectProps } from './shell/SearchableSelect';
export { default as TopNav } from './shell/TopNav';
export type { TopNavProps, TopNavItem } from './shell/TopNav';
export { default as Breadcrumbs } from './shell/Breadcrumbs';
export type { BreadcrumbsProps, BreadcrumbItem } from './shell/Breadcrumbs';

// ── Notification system ──
export { default as NotificationBell } from './shell/NotificationBell';
export type { NotificationsConfig, ShellNotification } from './shell/NotificationBell';


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
  DesktopContextMenuItem,
  StickyEntityRef,
  StickyResolver,
} from './shell/Desktop';
export type { ChangelogEntry } from './changelog';

// ── Layout entry point ──
export { default as Layout } from './shell/Layout';
export type { LayoutProps, ClockCalendarConfig } from './shell/Layout';
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
export { default as EntityList } from './data/EntityList';
export type { EntityListColumn, EntityListProps, EntityListContextAction } from './data/EntityList';
export { default as Kanban } from './data/Kanban';
export type { KanbanColumn, KanbanProps } from './data/Kanban';
export { default as ResizableTable } from './data/ResizableTable';
export { default as ListFooter } from './data/ListFooter';
export { default as useTableNav } from './data/useTableNav';
export { useColumnConfig } from './data/useColumnConfig';
export { useInfiniteScroll } from './data/useInfiniteScroll';
export { useSort } from './data/useSort';
export type { ColumnDef, SortState, PaginatedResponse } from './data/types';
export { default as Pagination } from './data/Pagination';
export type { PaginationProps } from './data/Pagination';

// ── Form controls ──
export { default as Button } from './forms/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './forms/Button';
export { default as Input } from './forms/Input';
export type { InputProps } from './forms/Input';
export { default as Textarea } from './forms/Textarea';
export type { TextareaProps } from './forms/Textarea';
export { default as Select, NativeSelect } from './forms/Select';
export type { SelectProps, SelectOption } from './forms/Select';
export { default as Checkbox } from './forms/Checkbox';
export type { CheckboxProps } from './forms/Checkbox';
export { default as Radio } from './forms/Radio';
export type { RadioProps } from './forms/Radio';
export { default as FormField } from './forms/FormField';
export type { FormFieldProps } from './forms/FormField';
export { default as Label } from './forms/Label';
export type { LabelProps } from './forms/Label';
export { default as MediaUploadField, mediaFileName } from './forms/MediaUploadField';
export type { MediaUploadFieldProps } from './forms/MediaUploadField';
export { default as MediaUploadGrid } from './forms/MediaUploadGrid';
export type { MediaUploadGridProps, MediaUploadGridItem } from './forms/MediaUploadGrid';
export { INPUT_BASE, inputClasses } from './forms/styles';

// ── Display & layout primitives ──
export { default as Card, StatCard } from './shell/Card';
export type { CardProps, StatCardProps } from './shell/Card';
export { default as Avatar, AvatarGroup } from './shell/Avatar';
export type { AvatarProps, AvatarGroupProps, AvatarSize, AvatarStatus } from './shell/Avatar';
export { default as Banner } from './shell/Banner';
export type { BannerProps, BannerTone } from './shell/Banner';
export { default as Tabs } from './shell/Tabs';
export type { TabsProps, TabItem } from './shell/Tabs';
export { default as Accordion } from './shell/Accordion';
export type { AccordionProps, AccordionItem } from './shell/Accordion';
export { default as Tooltip } from './shell/Tooltip';
export type { TooltipProps } from './shell/Tooltip';
export { default as ColoredBadge } from './shell/ColoredBadge';
export type { ColoredBadgeProps } from './shell/ColoredBadge';
export { default as EmptyState } from './shell/EmptyState';
export type { EmptyStateProps } from './shell/EmptyState';
export { default as PageHeader } from './shell/PageHeader';
export type { PageHeaderProps } from './shell/PageHeader';
export { default as LoadingSpinner } from './shell/Spinner';
export type { LoadingSpinnerProps } from './shell/Spinner';
export { default as FilterBar, useFilters } from './shell/FilterBar';
export type { FilterOption } from './shell/FilterBar';
export { SidebarNavItem, SidebarGroupLabel } from './shell/SidebarNav';
export { default as MetricBar } from './shell/MetricBar';
export type { MetricBarProps } from './shell/MetricBar';
export { severityOf, isSeverityTone } from './shell/severity';
export type { SeverityTone } from './shell/severity';

// ── Portal-promoted components (phase 2/3 — app concerns lifted to props) ──
export { default as BulkImportGrid } from './shell/BulkImportGrid';
export type { BulkImportGridProps, BulkColumn, BulkColumnKind } from './shell/BulkImportGrid';
export { mergeBulkItems, findDuplicateKeys } from './utils/mergeBulkItems';
export type { BulkRow, DuplicateGroup, MergeBulkResult, MergeBulkOptions } from './utils/mergeBulkItems';
export { default as ContainerFillChart } from './shell/ContainerFillChart';
export type { ContainerFillChartProps, ContainerFillItem } from './shell/ContainerFillChart';
export { default as ServerStatusIndicator } from './shell/ServerStatusIndicator';
export type { ServerStatusIndicatorProps, ServerStatusUser, HealthCheckResult } from './shell/ServerStatusIndicator';
export { default as ChangePasswordForm } from './shell/ChangePasswordForm';
export type { ChangePasswordFormProps } from './shell/ChangePasswordForm';
export { default as PdfActionButton } from './shell/PdfActionButton';
export type { PdfActionButtonProps } from './shell/PdfActionButton';
export { default as MilestoneTimeline } from './shell/MilestoneTimeline';
export type { Milestone, MilestoneKind, MilestoneTimelineProps } from './shell/MilestoneTimeline';

// ── Charts (dependency-free SVG) ──
export { default as Sparkline } from './charts/Sparkline';
export { default as BarChart } from './charts/BarChart';
export { default as DonutChart } from './charts/DonutChart';
export type { SparklineProps, BarChartProps, DonutChartProps, DonutSegment } from './charts/types';

// ── Page templates (starter screens; see src/templates) ──
export { default as DashboardTemplate } from './templates/DashboardTemplate';
export { default as DataTablePage } from './templates/DataTablePage';
export { default as FormLayoutPage } from './templates/FormLayoutPage';
export { default as CheckoutTemplate } from './templates/CheckoutTemplate';
export { default as EmailTemplate } from './templates/EmailTemplate';
export { default as ChatTemplate } from './templates/ChatTemplate';
export { default as GalleryTemplate } from './templates/GalleryTemplate';
export { default as AuthScreen } from './templates/AuthScreen';
export type { AuthScreenProps } from './templates/AuthScreen';
export { default as ErrorPage } from './templates/ErrorPage';
export type { ErrorPageProps } from './templates/ErrorPage';

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
export { formatDate } from './utils/date';

// ── Hooks (theming, hotkeys, modal nav) ──
export { default as useClickOutside } from './hooks/useClickOutside';
export { default as useNewHotkey } from './hooks/useNewHotkey';
export { default as useEditHotkey } from './hooks/useEditHotkey';
