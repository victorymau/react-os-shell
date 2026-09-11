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
export { default as FormErrorSummary } from '../forms/FormErrorSummary';
export type { FormError, FormErrorSummaryProps } from '../forms/FormErrorSummary';
export { default as Label } from '../forms/Label';
export type { LabelProps } from '../forms/Label';
export { default as MediaUploadField, mediaFileName } from '../forms/MediaUploadField';
export type { MediaUploadFieldProps } from '../forms/MediaUploadField';
export { default as BrandMark, resolveBrandMarkTreatment } from '../forms/BrandMark';
export type {
  BrandMarkProps,
  BrandMarkSlot,
  BrandMarkSurface,
  BrandMarkTreatment,
} from '../forms/BrandMark';
export { default as BrandAssetEditor } from '../forms/BrandAssetEditor';
export type { BrandAssetEditorProps, BrandAssetPreview } from '../forms/BrandAssetEditor';
export {
  PortalBrandingProvider,
  resolvePortalBrandAsset,
  usePortalBranding,
} from '../contexts/PortalBrandingProvider';
export type {
  PortalBrandingContextValue,
  PortalBrandingProviderProps,
  PublicPortal,
  PublicPortalBranding,
  ResolvedPortalBrandAsset,
} from '../contexts/PortalBrandingProvider';
export { default as MediaUploadGrid } from '../forms/MediaUploadGrid';
export type { MediaUploadGridProps, MediaUploadGridItem } from '../forms/MediaUploadGrid';
export { default as DateRangePicker, toISODate } from '../forms/DateRangePicker';
export type { DateRangePickerProps } from '../forms/DateRangePicker';
export { default as Calendar, toKey as toDateKey, fromKey as fromDateKey } from '../forms/Calendar';
export type { CalendarProps, CalendarMode } from '../forms/Calendar';
export { default as TimePicker } from '../forms/TimePicker';
export type { TimePickerProps } from '../forms/TimePicker';
export { default as DatePicker } from '../forms/DatePicker';
export type { DatePickerProps } from '../forms/DatePicker';
export { default as DateTimePicker } from '../forms/DateTimePicker';
export type { DateTimePickerProps } from '../forms/DateTimePicker';
export { INPUT_BASE, INPUT_SIZES, inputClasses } from '../forms/styles';
export type { InputSize } from '../forms/styles';

// Anchored-popup placement, exported because a consumer that has to build its
// own popup — a hover card, a typeahead over an endpoint the kit does not
// model — must still land it inside the shell window that owns its trigger
// (UI-11). `popupBounds` is the primitive: swap it in wherever a hand-rolled
// popup was clamping to `window.innerWidth`/`innerHeight`, which measures a
// screen rather than a window and puts the popup on the desktop beside it.
export { popupBounds, useDropdownPosition, MENU_MAX_HEIGHT, POPUP_MAX_WIDTH } from '../forms/dropdownPosition';
export type { MenuPos, DropdownPositionOptions } from '../forms/dropdownPosition';

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
export {
  default as ComposerAttachments,
  AttachmentDropZone,
  AttachmentList,
  AttachButton,
  PaperclipGlyph,
} from '../forms/ComposerAttachments';
export type {
  ComposerAttachmentsProps,
  AttachmentDropZoneProps,
  AttachmentListProps,
  AttachButtonProps,
  FileIntake,
} from '../forms/ComposerAttachments';
// The intake behind every upload primitive, exported for a composer with a
// layout of its own — never so a consumer can render its own file input.
export { useFileIntake, FileIntakeAlert, acceptsFile } from '../forms/useFileIntake';
export type { FileIntakeOptions, FileIntakeLimits, FileRejection, FileRejectionReason } from '../forms/useFileIntake';
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
export { default as SettingRow } from '../shell/SettingRow';
export type { SettingRowProps } from '../shell/SettingRow';
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
export { default as StatusBadge, StatusBadgeProvider, groupColors } from '../shell/StatusBadge';
export type { SemanticGroup, StatusEmphasis } from '../shell/StatusBadge';
export { GROUP_COLORS, GROUP_COLORS_SOLID } from '../shell/StatusBadge';
export { default as EmptyState } from '../shell/EmptyState';
export type { EmptyStateProps } from '../shell/EmptyState';
export { default as PageHeader } from '../shell/PageHeader';
export type { PageHeaderProps } from '../shell/PageHeader';
export { default as LoadingSpinner } from '../shell/Spinner';
export type { LoadingSpinnerProps } from '../shell/Spinner';
export { default as MetricBar } from '../shell/MetricBar';
export type { MetricBarProps } from '../shell/MetricBar';
export { default as BudgetBar, budgetState } from '../shell/BudgetBar';
export type { BudgetBarProps, BudgetState } from '../shell/BudgetBar';
// The time axis both timelines are drawn on: rail, fill, date ruler, dots with
// meaning in their shape, two packed label lanes with `×N` clustering (or one
// active label), an optional scrubber thumb, the pending list, the motion and
// the keyboard contract. Exported so a consumer can put its own domain on the
// same axis rather than drawing a fourth bar.
export { default as TimelineTrack } from '../shell/TimelineTrack';
export type {
  TimelineTrackProps,
  TimelineTrackItem,
  TimelineTrackKind,
  TimelineTrackPending,
  TimelineTrackPhase,
  TimelineTrackThumb,
} from '../shell/TimelineTrack';
export { default as MilestoneTimeline } from '../shell/MilestoneTimeline';
export type { Milestone, MilestoneKind, MilestoneTimelineProps } from '../shell/MilestoneTimeline';
// The scrubbable production timeline: a hook that owns the slider, playback
// and the interpolated per-part snapshot, plus the bar that draws it. The
// stage maths (`STAGES`, `calcOverall`, `calcReportOverall`) ships with it so
// a consumer's items table and the bar's "N% overall" agree by construction.
export {
  default as ProductionTimeline,
  useProductionTimeline,
  calcOverall,
  calcReportOverall,
  STAGES,
  POST_PRODUCTION_STATUSES,
} from '../shell/ProductionTimeline';
export type {
  ProgressItem,
  TimelineReport,
  TimelineMarker,
  TimelineMarkerKind,
  ProductionTimelineSnapshot,
  ProductionTimelineProps,
  UseProductionTimelineOpts,
} from '../shell/ProductionTimeline';
export { DAY_MS, toDayMs, fmtSliderDate } from '../shell/timelineDates';
export { default as ContainerFillChart } from '../shell/ContainerFillChart';
export type { ContainerFillChartProps, ContainerFillItem } from '../shell/ContainerFillChart';
// The regex renderer. It carries `Lite` in its name now that there are two,
// and the name is the honest half of the pair: it covers headings, emphasis,
// links, fences, flat lists, pipe tables and callouts, and it CANNOT nest,
// because a regex cannot. Reach for it when a body is short and the bundle is
// the constraint — it is why the till can render prose at all.
//
// For a body a person or a service wrote — a note, a message, a bug report —
// take `react-os-shell/markdown` instead: a real CommonMark parser behind an
// optional peer, which a consumer who never imports it never installs.
export { default as MarkdownLite } from '../shell/Markdown';
export type { MarkdownProps as MarkdownLiteProps } from '../shell/Markdown';
/** @deprecated Renamed to `MarkdownLite`. Removed in 5.0. */
export { default as Markdown } from '../shell/Markdown';
/** @deprecated Renamed to `MarkdownLiteProps`. Removed in 5.0. */
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
export type { DropdownMenuProps, DropdownMenuItem, DropdownMenuAlign, DropdownMenuSide } from '../shell/DropdownMenu';
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
// The shell's user-facing strings — English defaults with no provider; mount
// the provider once with a partial override to translate. See strings.tsx.
export { ShellStringsProvider, useShellStrings, DEFAULT_SHELL_STRINGS } from '../shell/strings';
export type { ShellStrings, ShellStringsOverride } from '../shell/strings';

// ── Utilities & hooks ──
// GLASS_INPUT_BG is intentionally absent: its CSS lives in shell.css, so the
// class would name a rule a ui-only consumer has not loaded.
export { glassStyle, GLASS_DIVIDER } from '../utils/glass';
export { formatDate } from '../utils/date';
export { default as useClickOutside } from '../hooks/useClickOutside';
export { useIsMobile } from '../shell/useIsMobile';
export { ALT_SHIFT_E, ALT_SHIFT_D, ALT_SHIFT_N, CMD_ENTER, CMD_S, CMD_K, CMD_DOT, CMD_A, MOD, ALT, SHIFT, ENTER, isMac } from '../shell/Kbd';

// ── Chart primitives ──
// The layer every chart is built from, exported on its own so a consumer with
// a chart type the package does not cover composes one rather than forking one.
// The palette is here so a legend swatch or a status pill can carry the same
// token the chart used, instead of guessing a hex.
export {
  SERIES_VARS, SERIES_SLOT_COUNT, STATUS_VARS, CHART_INK,
  seriesColor, resolveSeriesColor,
} from '../charts/palette';
export { linearScale, logScale, bandScale, ladderScale, niceMax, angleScale, radiusScale, binValues } from '../charts/scale';
export type { LinearScale, BandScale, LadderScale, AngleScale, Range } from '../charts/scale';
export { curvePath, monotonePath, splinePath, bumpPath, stepPath, linearPath, areaFrom, areaBetween, arcPath, polygonPoints } from '../charts/curve';
export type { Curve, Point } from '../charts/curve';
export { squarify } from '../charts/treemapLayout';
export type { TreemapItem, TreemapTile } from '../charts/treemapLayout';
export { ChartDefs, MOTION, stagger, fillFor, dashFor, fillId, glowId, maskId, groundId } from '../charts/effects';
export type { ChartDefsProps, FillVariant, StrokeVariant, RevealDirection, BackgroundVariant } from '../charts/effects';
export { ChartHighlightProvider, useHighlight, highlightOpacity, autoHighlightIndex } from '../charts/highlight';
export { usePlotWidth } from '../charts/usePlotWidth';
export type {
  ChartStatusTone, ChartCurve,
  ChartFillVariant, ChartStrokeVariant, ChartRevealDirection, ChartBackgroundVariant,
} from '../charts/types';

// ── Inline marks ──
// The small forms that belong inside a table cell or a summary card, where a
// full chart frame would cost more room than the number is worth.
export { default as RankedBars } from '../charts/RankedBars';
export { default as Meter } from '../charts/Meter';
export { default as StatTile } from '../charts/StatTile';
export type { RankedBarsProps, RankedBarsRow, MeterProps, StatTileProps } from '../charts/types';

// ── Chart chrome and the cartesian family ──
export { default as ChartFrame } from '../charts/ChartFrame';
export { default as ChartTooltip } from '../charts/ChartTooltip';
export { default as ChartSkeleton } from '../charts/ChartSkeleton';
export { default as ChartDot } from '../charts/ChartDot';
export { default as ChartBrush } from '../charts/ChartBrush';
export { default as CartesianPlot } from '../charts/CartesianPlot';
export type { PlotGeometry, CartesianPlotProps } from '../charts/CartesianPlot';
export { default as TimeSeriesChart } from '../charts/TimeSeriesChart';
export { default as ColumnChart } from '../charts/ColumnChart';
export { default as ScatterChart, SCATTER_SERIES_CAP } from '../charts/ScatterChart';
export { default as RangeChart } from '../charts/RangeChart';
export { default as WaterfallChart } from '../charts/WaterfallChart';
export { default as HistogramChart } from '../charts/HistogramChart';
export { default as BoxPlotChart } from '../charts/BoxPlotChart';
export { default as CandlestickChart } from '../charts/CandlestickChart';
export { default as HeatmapChart } from '../charts/HeatmapChart';
export type {
  ChartLegendEntry, ChartLegendSwatch, ChartFrameProps, ChartTooltipProps, ChartTooltipRow,
  ChartSkeletonProps, ChartDotProps, ChartDotVariant, ChartBrushProps, ChartRange,
  ChartReferenceLine, TimeSeriesChartProps, TimeSeriesSeries,
  ColumnChartProps, ColumnSeries,
  ScatterChartProps, ScatterPoint, ScatterSeries,
  RangeChartProps, RangeRow,
  WaterfallChartProps, WaterfallStep,
  HistogramChartProps, HistogramBin,
  BoxPlotChartProps, BoxPlotBox,
  CandlestickChartProps, Candle,
  HeatmapChartProps,
} from '../charts/types';

// ── Radial, hierarchical and flow ──
export { default as RadarChart, RADAR_SERIES_CAP } from '../charts/RadarChart';
export { default as PieChart } from '../charts/PieChart';
export { default as RadialBarChart } from '../charts/RadialBarChart';
export { default as FunnelChart } from '../charts/FunnelChart';
export { default as TreemapChart } from '../charts/TreemapChart';
export { default as SunburstChart } from '../charts/SunburstChart';
export { default as SankeyChart } from '../charts/SankeyChart';
export { default as ChordChart } from '../charts/ChordChart';
export type {
  RadarChartProps, RadarAxis, RadarSeries,
  PieChartProps, PieSegment,
  RadialBarChartProps, RadialBarRow,
  FunnelChartProps, FunnelStage,
  TreemapChartProps,
  SunburstChartProps, SunburstNode,
  SankeyChartProps, SankeyNode, SankeyLink,
  ChordChartProps,
} from '../charts/types';

// ── Package version (tsup-injected at build time) ──
export { VERSION } from '../version';
