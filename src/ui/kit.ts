/**
 * react-os-shell/ui — the UI kit, without the window manager.
 *
 * This package has always been two things wearing one entry point: a desktop
 * shell (windows, taskbar, start menu, desktop) and the UI kit those windows
 * are furnished with. A consumer who wanted the second had no way to decline
 * the first — and paid for react-router-dom, @tanstack/react-query, axios,
 * @headlessui/react and @heroicons/react to render a button.
 *
 * This barrel is the kit half. Everything reachable from here imports nothing
 * but `react` and `react-dom`, which is asserted two ways: at source by
 * `tests/uiEntryIsPeerFree.test.ts`, and against the built output by
 * `scripts/verify-dist.mjs` in CI — the second matters because leakage can
 * arrive through a shared chunk, where no source-level test can see it.
 *
 * ── This file is the source of truth for the kit's surface ──
 * `src/index.ts` re-exports it wholesale (`export * from './ui'`), so the root
 * entry is unchanged for existing consumers and there is exactly ONE list to
 * maintain. Add a kit component here, never in both.
 *
 * Careful: TypeScript resolves an explicit local export ahead of a star export
 * SILENTLY. Re-declaring one of these names in `src/index.ts` would shadow it
 * with no error and no warning, and the two entries would drift apart while
 * both compiled. `tests/uiBarrelMatchesRoot.test.ts` is what catches that.
 *
 * ── Stylesheet ──
 * Import `react-os-shell/ui.css`, and NOT `react-os-shell/styles.css` — that
 * one is the umbrella and additionally carries the window/taskbar/desktop
 * rules. Importing both doubles every rule. You supply Tailwind v4 yourself,
 * exactly as the shell's own consumers already do.
 *
 * ── What is deliberately NOT here ──
 * The window manager and everything that needs it: `Modal` and its family,
 * `Layout`, `Desktop`, `StartMenu`, `WindowManagerProvider`,
 * the settings panels and the bundled apps. Also the components that reach an
 * optional peer for their own reasons — `EntityList`, `ResizableTable` and the
 * react-query data hooks (react-query + axios), `FilterBar`, `UndoControls`,
 * `BulkImportGrid`, and `useNewHotkey`/`useEditHotkey` (they ask which window
 * is active).
 *
 * Several of those are one small refactor from being clean, and can join this
 * barrel later without breaking anyone — adding an export is a minor bump.
 */

// ── Form controls ──
export { default as Button } from '../forms/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from '../forms/Button';
export { default as IconButton } from '../forms/IconButton';
export type { IconButtonProps } from '../forms/IconButton';
export { default as Input } from '../forms/Input';
export type { InputProps } from '../forms/Input';
export { default as Textarea } from '../forms/Textarea';
export type { TextareaProps } from '../forms/Textarea';
export { default as Select, NativeSelect } from '../forms/Select';
export type { SelectProps, SelectOption } from '../forms/Select';
export { default as Checkbox } from '../forms/Checkbox';
export type { CheckboxProps } from '../forms/Checkbox';
export { default as Radio } from '../forms/Radio';
export type { RadioProps } from '../forms/Radio';
export { default as FormField } from '../forms/FormField';
export type { FormFieldProps } from '../forms/FormField';
export { default as Label } from '../forms/Label';
export type { LabelProps } from '../forms/Label';
export { default as MediaUploadField, mediaFileName } from '../forms/MediaUploadField';
export type { MediaUploadFieldProps } from '../forms/MediaUploadField';
export { default as MediaUploadGrid } from '../forms/MediaUploadGrid';
export type { MediaUploadGridProps, MediaUploadGridItem } from '../forms/MediaUploadGrid';
export { default as DateRangePicker, toISODate } from '../forms/DateRangePicker';
export type { DateRangePickerProps } from '../forms/DateRangePicker';
export { default as Calendar, toKey as toDateKey, fromKey as fromDateKey } from '../forms/Calendar';
export type { CalendarProps, CalendarMode } from '../forms/Calendar';
export { default as TimePicker, parseTime, formatTime } from '../forms/TimePicker';
export type { TimePickerProps } from '../forms/TimePicker';
export { default as DatePicker } from '../forms/DatePicker';
export type { DatePickerProps } from '../forms/DatePicker';
export { default as TimePicker } from '../forms/TimePicker';
export type { TimePickerProps } from '../forms/TimePicker';
export { default as DateTimePicker } from '../forms/DateTimePicker';
export type { DateTimePickerProps } from '../forms/DateTimePicker';
export { INPUT_BASE, INPUT_SIZES, inputClasses } from '../forms/styles';
export type { InputSize } from '../forms/styles';

// ── Touch controls (a finger on glass — a till, a warehouse tablet) ──
export { default as NumericKeypad } from '../forms/NumericKeypad';
export type { NumericKeypadProps } from '../forms/NumericKeypad';
export { appendKey, backspace, MAX_FRACTION_DIGITS } from '../forms/keypadInput';
export { default as TileButton } from '../forms/TileButton';
export type { TileButtonProps, TileSize } from '../forms/TileButton';
export { default as Segmented } from '../forms/Segmented';
export type { SegmentedProps, SegmentedOption, SegmentedSize } from '../forms/Segmented';
export { default as Switch } from '../forms/Switch';
export type { SwitchProps, SwitchSize } from '../forms/Switch';
export { default as InputNumber } from '../forms/InputNumber';
export type { InputNumberProps } from '../forms/InputNumber';
export { default as FilePicker } from '../forms/FilePicker';
export type { FilePickerProps } from '../forms/FilePicker';
export { default as SearchableSelect } from '../shell/SearchableSelect';
export type { SearchableOption, SearchableSelectProps } from '../shell/SearchableSelect';
export { default as TagInput } from '../forms/TagInput';
export type { TagInputOption, TagInputProps } from '../forms/TagInput';

// ── Display primitives ──
export { default as Card, StatCard } from '../shell/Card';
export type { CardProps, StatCardProps, CardPadding } from '../shell/Card';

// ── Typography and layout ──
export { Text, Title, Paragraph } from '../shell/Text';
export type { TextProps, TitleProps, ParagraphProps, TextTone, TextSize, TextWeight, TitleLevel } from '../shell/Text';
export { Stack, Inline, Grid } from '../shell/Stack';
export type { StackProps, InlineProps, GridProps, Gap, GridCols, Align, Justify } from '../shell/Stack';
export { default as Divider } from '../shell/Divider';
export type { DividerProps, DividerSpacing } from '../shell/Divider';

// ── Display ──
export { default as Skeleton } from '../shell/Skeleton';
export type { SkeletonProps, SkeletonVariant } from '../shell/Skeleton';
export { default as DescriptionList } from '../shell/DescriptionList';
export type { DescriptionListProps, DescriptionItem, DescriptionColumns } from '../shell/DescriptionList';
export { default as Result } from '../shell/Result';
export type { ResultProps, ResultStatus } from '../shell/Result';
export { default as CountBadge } from '../shell/CountBadge';
export type { CountBadgeProps, CountBadgeTone } from '../shell/CountBadge';
export { default as Statistic } from '../shell/Statistic';
export type { StatisticProps, StatisticSize, StatisticTone } from '../shell/Statistic';
export { default as Avatar, AvatarGroup } from '../shell/Avatar';
export type { AvatarProps, AvatarGroupProps, AvatarSize, AvatarStatus } from '../shell/Avatar';
export { default as Banner } from '../shell/Banner';
export type { BannerProps, BannerTone, BannerEmphasis } from '../shell/Banner';
export { default as Tabs } from '../shell/Tabs';
export { tabButtonId, tabPanelId } from '../shell/Tabs';
export type { TabsProps, TabItem } from '../shell/Tabs';
export { default as Stepper } from '../shell/Stepper';
export type { StepperProps, StepItem } from '../shell/Stepper';
export { default as Accordion } from '../shell/Accordion';
export type { AccordionProps, AccordionItem } from '../shell/Accordion';
export { default as Tooltip } from '../shell/Tooltip';
export type { TooltipProps } from '../shell/Tooltip';
export { default as ColoredBadge } from '../shell/ColoredBadge';
export type { ColoredBadgeProps } from '../shell/ColoredBadge';
export { default as StatusBadge, StatusBadgeProvider } from '../shell/StatusBadge';
export type { SemanticGroup } from '../shell/StatusBadge';
export { GROUP_COLORS } from '../shell/StatusBadge';
export { default as EmptyState } from '../shell/EmptyState';
export type { EmptyStateProps } from '../shell/EmptyState';
export { default as PageHeader } from '../shell/PageHeader';
export type { PageHeaderProps } from '../shell/PageHeader';
export { default as LoadingSpinner } from '../shell/Spinner';
export type { LoadingSpinnerProps } from '../shell/Spinner';
export { default as MetricBar } from '../shell/MetricBar';
export type { MetricBarProps } from '../shell/MetricBar';
export { default as MilestoneTimeline } from '../shell/MilestoneTimeline';
export type { Milestone, MilestoneKind, MilestoneTimelineProps } from '../shell/MilestoneTimeline';
export { default as ContainerFillChart } from '../shell/ContainerFillChart';
export type { ContainerFillChartProps, ContainerFillItem } from '../shell/ContainerFillChart';
export { default as Markdown } from '../shell/Markdown';
export type { MarkdownProps } from '../shell/Markdown';
export { default as HelpCenter } from '../shell/HelpCenter';
export type { HelpCenterProps, HelpCenterDoc } from '../shell/HelpCenter';
export { severityOf, isSeverityTone } from '../shell/severity';
export type { SeverityTone } from '../shell/severity';

// ── Layout & navigation (page furniture, not window chrome) ──
export { default as SidebarLayout } from '../shell/SidebarLayout';
export type { SidebarLayoutProps } from '../shell/SidebarLayout';
export { default as SidebarActionButton } from '../shell/SidebarActionButton';
export type { SidebarActionButtonProps } from '../shell/SidebarActionButton';
export { SidebarNavItem, SidebarGroupLabel } from '../shell/SidebarNav';
export { default as TopNav } from '../shell/TopNav';
export type { TopNavProps, TopNavItem } from '../shell/TopNav';
export { default as Breadcrumbs } from '../shell/Breadcrumbs';
export type { BreadcrumbsProps, BreadcrumbItem } from '../shell/Breadcrumbs';
export { default as DropdownMenu } from '../shell/DropdownMenu';
export type { DropdownMenuProps, DropdownMenuItem, DropdownMenuAlign } from '../shell/DropdownMenu';
export { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from '../shell/PopupMenu';

// ── Feedback ──
export { default as toast } from '../shell/toast';
export type { ToastOptions, ToastPlacement } from '../shell/toast';

// ── Dialogs (modal sheets, NOT shell windows — see Dialog's docstring) ──
export { default as Dialog } from '../shell/Dialog';
export type { DialogProps, DialogSize } from '../shell/Dialog';
export { default as Drawer } from '../shell/Drawer';
export type { DrawerProps, DrawerSide, DrawerSize } from '../shell/Drawer';
export { useFocusTrap, useScrollLock } from '../shell/focusTrap';
export { ConfirmProvider, useConfirm, confirm, confirmDestructive, prompt } from '../shell/ConfirmDialog';
export { default as GlobalSearch } from '../shell/GlobalSearch';
export type { GlobalSearchProps, SearchResult, SearchProvider, SearchConfig } from '../shell/GlobalSearch';

// ── Data primitives (pageless — no react-query, no axios) ──
export { default as EditableGrid } from '../shell/EditableGrid';
export type { GridColumn, CellStyle, EditableGridProps } from '../shell/EditableGrid';
export { default as Kanban } from '../data/Kanban';
export type { KanbanColumn, KanbanProps } from '../data/Kanban';
export { default as Pagination } from '../data/Pagination';
export type { PaginationProps } from '../data/Pagination';
export { default as DataTable } from '../data/DataTable';
export type { DataTableProps, DataTableColumn, DataTableColumnGroup, DataTableHeader } from '../data/DataTable';
export { default as ListFooter } from '../data/ListFooter';
export { default as ListLoadError } from '../data/ListLoadError';
export type { ListLoadErrorProps } from '../data/ListLoadError';
export type { ColumnDef, SortState, PaginatedResponse } from '../data/types';

// ── Charts (dependency-free SVG) ──
export { default as Sparkline } from '../charts/Sparkline';
export { default as BarChart } from '../charts/BarChart';
export { default as DonutChart } from '../charts/DonutChart';
export { default as LineChart } from '../charts/LineChart';
export type { SparklineProps, BarChartProps, DonutChartProps, DonutSegment, LineChartProps, LineChartSeries } from '../charts/types';

// ── Page templates (starter screens; see src/templates) ──
export { default as DashboardTemplate } from '../templates/DashboardTemplate';
export { default as DataTablePage } from '../templates/DataTablePage';
export { default as FormLayoutPage } from '../templates/FormLayoutPage';
export { default as CheckoutTemplate } from '../templates/CheckoutTemplate';
export { default as EmailTemplate } from '../templates/EmailTemplate';
export { default as ChatTemplate } from '../templates/ChatTemplate';
export { default as GalleryTemplate } from '../templates/GalleryTemplate';
export { default as AuthScreen } from '../templates/AuthScreen';
export type { AuthScreenProps } from '../templates/AuthScreen';
export { default as ErrorBoundary } from '../templates/ErrorBoundary';
export type { ErrorBoundaryProps } from '../templates/ErrorBoundary';
export { default as ErrorPage } from '../templates/ErrorPage';
export type { ErrorPageProps } from '../templates/ErrorPage';

// ── Theming ──
// A ui-only consumer needs these: the kit's dark mode and accent themes work by
// remapping utility classes under `[data-theme]`, so without a supported way to
// stamp that attribute the whole themes.css layer is inert and dark mode is
// unreachable. `resolveTheme` is the pure 'system' → light|dark resolution for
// consumers that own their own theme switcher and want only the contract.
export { useTheme, resolveTheme, applyThemePrefs } from '../hooks/useTheme';
export type { Theme } from '../hooks/useTheme';
export {
  ShellPrefsProvider,
  useShellPrefs,
  useLocalStoragePrefs,
} from '../shell/ShellPrefs';
export type { ShellPrefsAdapter } from '../shell/ShellPrefs';

// ── Utilities & hooks ──
// GLASS_INPUT_BG is intentionally absent: its CSS lives in shell.css, so the
// class would name a rule a ui-only consumer has not loaded.
export { glassStyle, GLASS_DIVIDER } from '../utils/glass';
export { formatDate } from '../utils/date';
export { default as useClickOutside } from '../hooks/useClickOutside';
export { useIsMobile } from '../shell/useIsMobile';
export { ALT_SHIFT_E, ALT_SHIFT_D, ALT_SHIFT_N, CMD_ENTER, CMD_S, CMD_K, CMD_DOT, CMD_A, MOD, ALT, SHIFT, ENTER, isMac } from '../shell/Kbd';

// ── Package version (tsup-injected at build time) ──
export { VERSION } from '../version';
