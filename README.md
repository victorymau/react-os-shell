# react-os-shell

A desktop-style React UI shell — windows, taskbar, start menu, sticky notes, frosted-glass theming — plus bundled apps.

> **Status:** v0.8.0 — the bundled Email + Calendar apps and their Node IMAP/SMTP/CalDAV bridge have been removed. Mail is now the consuming app's responsibility.

### → [Live demo](https://victorymau.github.io/react-os-shell/)

A backend-less playground hosted on GitHub Pages. Wallpapers, themes, sticky notes, the spreadsheet, all wired to `localStorage` so the page survives a refresh. Source is in [`examples/demo/`](examples/demo/).

[![react-os-shell demo](docs/hero.png)](https://victorymau.github.io/react-os-shell/)

<sub>The screenshot is auto-captured against the deployed demo by [`.github/workflows/screenshot.yml`](.github/workflows/screenshot.yml). Run it manually: `gh workflow run "Capture hero screenshot"` (or use the Actions tab).</sub>

## What's in the box

**Shell:** `<Layout>`, `<StartMenu>`, `<Desktop>` (with sticky notes + folders), `<WindowManager>`, `<Modal>` (standard / compact / widget styles), `<PopupMenu>`, `<ConfirmDialog>`, `<GlobalSearch>` (Cmd-K), `<ShortcutHelp>`, `<NotificationBell>`, `<StatusBadge>`, `<SearchableSelect>`, frosted-glass theming.

**UI primitives:** `<Button>`, `<Input>`, `<Textarea>`, `<Select>`, `<Checkbox>`, `<Radio>`, `<FormField>`, `<Label>`, `<Card>` / `<StatCard>`, `<Avatar>` / `<AvatarGroup>`, `<Banner>`, `<Tabs>`, `<Accordion>`, `<Tooltip>`, `<Pagination>`, `<MetricBar>`, `<BudgetBar>`, `<SettingRow>`, and dependency-free `<Sparkline>` / `<LineChart>` / `<BarChart>` / `<DonutChart>` charts.

**Page templates:** ready-made screens composed from the primitives — `<DashboardTemplate>`, `<DataTablePage>`, `<FormLayoutPage>`, `<CheckoutTemplate>`, `<EmailTemplate>`, `<ChatTemplate>`, `<GalleryTemplate>`, `<AuthScreen>`, `<ErrorPage>`. `<ErrorBoundary>` catches a render crash and shows the 500 page in place of a blank screen.

**Apps:**
- **Utilities:** Calculator, Notepad, Spreadsheet, Weather, CurrencyConverter, PomodoroTimer, WorldClock, TodoList
- **Documents / Web:** Preview, Documents, Files, Browser

Most apps ship in the `bundledApps` registry; a few (WorldClock, Notepad) want consumer-supplied prefs wiring to persist content across reloads. The bundled `Customization` settings page is also exported separately for consumers to register at `/settings/customization`.

**Hooks:** `useWindowManager`, `useWindowDirty`, `useTheme`, full hotkey/nav system.

**Themes:** light + dark (frosted-glass tinting; the package ships base styles, additional theme variants like pink/green/grey/blue can layer on top).

## Install

```bash
npm i react-os-shell
```

Peer deps you should already have in a typical React + Tailwind v4 app:

```bash
npm i react react-dom react-router-dom @tanstack/react-query react-hook-form \
      tailwindcss @headlessui/react @heroicons/react
```

All of those except `react` / `react-dom` are declared **optional** peers. The
shell's components need them — a portal that drops one gets a module-not-found at
build — but a consumer taking only `react-os-shell/markup` needs none of them, and
`autoInstallPeers` would otherwise install the lot on its behalf.

**`pdfjs-dist` is ranged, not wildcarded.** The Preview viewer accepts
`^5.6.205 || ^6.0.0`. pdf.js removes API across majors — 6.0 dropped the
bare-string `getDocument(url)` this viewer used to call, and an unbounded range
let that arrive as a routine upgrade — so a new major goes into the range only
once the viewer has been checked against it.

Preview needs no wiring for pdf.js's WebAssembly decoders. It names
`pdfjs-dist/wasm/jbig2.wasm` and `pdfjs-dist/wasm/openjpeg.wasm` through
`new URL(..., import.meta.url)`, so a production bundle emits them from your own
installed copy and hands them to pdf.js without reaching a CDN. Those are the
decoders JBIG2 (scanned) and JPEG 2000 images need; without a location pdf.js
declines to fetch them and drops such images from an otherwise-rendered page.

Two caveats worth knowing. The specifier is resolved by your bundler at build
time, so this is verified for production builds; a dev server that pre-bundles
dependencies may not resolve it, in which case you get exactly the previous
behaviour rather than a new failure. And a host that would rather serve the
whole `pdfjs-dist/wasm/` directory itself sets
`window.__REACT_OS_SHELL_PDF_WASM__` to its URL before opening a Preview window.

## Quick start (~50 lines)

```tsx
// App.tsx
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
  setShellApiClient,
  setShellAuthBridge,
  setShellWindowRegistry,
  createWindowRegistry,
  useLocalStoragePrefs,
} from 'react-os-shell';
import { bundledApps } from 'react-os-shell/apps';
import 'react-os-shell/styles.css';
import axios from 'axios';

const apiClient = axios.create({ baseURL: '/api' });
setShellApiClient(apiClient);
setShellWindowRegistry(createWindowRegistry(bundledApps));
setShellAuthBridge({ user: { first_name: 'Demo' }, logout: () => {} });

const navSections = [
  { to: '/', label: 'Home' },
  { label: 'Utilities', items: [
    { to: '/calculator', label: 'Calculator' },
    { to: '/notepad', label: 'Notepad' },
    { to: '/files', label: 'Files' },
  ] },
];

const queryClient = new QueryClient();

export default function App() {
  const prefs = useLocalStoragePrefs('my-app');
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <BrowserRouter>
          <ShellAuthProvider value={{ hasAnyPerm: () => true }}>
            <ShellPrefsProvider value={prefs}>
              <ShellEntityFetcherProvider value={(endpoint, id) => apiClient.get(`${endpoint}${id}/`).then(r => r.data)}>
                <StatusBadgeProvider groups={{}}>
                  <WindowManagerProvider>
                    <Routes>
                      <Route path="*" element={<Layout navSections={navSections} navIcons={{}} />} />
                    </Routes>
                  </WindowManagerProvider>
                </StatusBadgeProvider>
              </ShellEntityFetcherProvider>
            </ShellPrefsProvider>
          </ShellAuthProvider>
        </BrowserRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
```

That gives you the full desktop with all utility, document and web apps reachable through the start menu. Add your own entity windows by extending the registry, and wire the notification / bug-report / sticky-note systems through optional config callbacks when you want them.

## Concepts

### Window registry

Every window the shell can open lives in a `WindowRegistry` map. Two entry shapes:

- **Page** — `{ component: LazyExoticComponent, label, size?, widget?, compact?, appStyle?, flushBody?, … }`. Opened via `openPage(routeKey)`. `flushBody` keeps the standard title bar + footer but drops the body padding (pair it with `<SidebarLayout>` for two-pane apps).
- **Entity** — `{ endpoint, render(entity, …), title(entity), footer?, … }`. Opened via `openEntity(typeKey, id)`. The shell GETs `${endpoint}${id}/` (via the consumer-supplied entity fetcher) and hands the result to `render`.

Compose multiple partial maps with `createWindowRegistry(...maps)`:

```ts
import { bundledApps } from 'react-os-shell/apps';
import { erpEntities } from './shell-config/erpEntities';

const windows = createWindowRegistry(bundledApps, erpEntities);
setShellWindowRegistry(windows);
```

### Nav sections

`Layout` renders the start menu from a `(NavSection | NavItem)[]` you pass in:

```ts
const navSections = [
  { to: '/', label: 'Home' },
  { label: 'Clients', items: [
    { to: '/orders', label: 'Sales Orders', perms: ['view_order'] },
    { to: '/reports/ar', label: 'Accounts Receivable Report', menuLabel: 'AR Report' },
    { to: '/clients', label: 'Clients' },
  ]},
];
```

Start-menu rows are always one line. Keep `label` as the full semantic name;
when it does not fit the narrowest menu size, supply `menuLabel` with an
established domain abbreviation such as `AR`, `AP`, `PO`, or `GRNI`. The shell
shows the compact wording, keeps matching search against the full `label`, and
truncates as a final overflow guard. Do not invent a new acronym merely to make
a row shorter.

An abbreviated row is named `"<menuLabel>, <label>"` to assistive technology —
that order matters, because an accessible name must *contain* the text on
screen for voice control to act on it (WCAG 2.5.3). A row showing its own full
`label` gets no `aria-label` at all; its text content already is the name. The
native tooltip appears only where the visible text is not the whole name: an
explicit `menuLabel`, or a label the row had to clip.

Items with `perms` are filtered through `<ShellAuthProvider value={{ hasAnyPerm }}>`.

`perms` is an **any-of** test: the row shows if the user holds at least one of them. When a row should appear only for someone holding *every* permission in a set, use `allPerms` instead — it is an **all-of** test, and the two can be combined on the same entry:

```ts
// Reaching price sheets puts the row in the menu; seeing prices is what the
// page itself needs. Adding both to `perms` would show it to MORE people.
{ to: '/suppliers/price-sheets', label: 'Price Sheets',
  perms: ['view_supplierpricesheet'], allPerms: ['view_supplier_prices'] },
```

Reach for `allPerms` whenever the permission that lists a destination is broader than the one its page enforces — otherwise the row renders and then refuses on click. Both fields work on sections as well as items, and on nested children.

#### Nesting

An item's `children` are items, so a menu nests as deeply as you configure it — there is no maximum:

```ts
{ label: 'HR', items: [
  { to: '/hr/recruitment', label: 'Recruitment', children: [
    { to: '/hr/recruitment/jobs', label: 'Job Postings', children: [
      { to: '/hr/recruitment/jobs/open', label: 'Open' },
      { to: '/hr/recruitment/jobs/closed', label: 'Closed' },
    ]},
  ]},
]}
```

Each level behaves the same way: in the start menu it opens a flyout on hover (flipping to the left of its parent when it runs out of screen), and in the sidebar it expands as an accordion, indented one more step. A group's `to` is a synthetic key by convention — no page sits behind it, and clicking the row opens its submenu rather than navigating. A group whose every branch is permission-hidden is dropped entirely, so a user never gets a row that opens onto nothing.

### useWindowManager

The hook every component uses to open / close / minimise windows:

```ts
const { openPage, openEntity, closeEntity, openWindows } = useWindowManager();

openPage('/calculator');
openEntity('order', 'uuid-123');
```

### useWindowDirty

Register controlled unsaved state from a component rendered by `PageWindow`:

```tsx
const [dirty, setDirty] = useState(false);
useWindowDirty(dirty);
```

The page window uses the standard `Modal` discard confirmation while any
mounted registration is dirty. The page itself is held too: while any
registration is dirty, a reload, Back out of the app or closing the tab gets
the browser's "Leave site?" prompt, because leaving the page discards every
window at once and no `Modal` gets to ask. Set the value to `false` after save
or discard; unmounting also removes the registration. Calls outside a managed
page window are ignored.

### Right-click menu

`Layout` mounts `ShellContextMenu`, one `contextmenu` listener on the document,
so a right-click anywhere in the shell opens a shell menu instead of the
browser's. It is drawn with `PopupMenu`, so it matches every other menu in the
app.

What it offers follows what was clicked:

| Under the pointer | Items |
|---|---|
| Selected text | Copy — with its formatting, so a copied table pastes into a spreadsheet as cells |
| A link | Open link in new tab, Copy link address |
| Anything else | — |

Every menu also carries Back, Forward, Reload and Copy page address, so the
menu is never empty and the page actions never move. A window holding unsaved
changes (`useWindowDirty`) makes Reload and Back ask first.

These keep the browser's own menu, on purpose:

- **Text inputs, textareas and contenteditable.** Spellcheck suggestions and
  "Add to dictionary" cannot be rebuilt by a web page, and a Paste item of our
  own would need a clipboard permission prompt. Non-text inputs (a checkbox, a
  range, a color swatch) have none of that to lose and get the shell menu.
- **Images, canvases, video and audio.** Save image as, Copy image and the
  playback controls are the browser's to offer.
- **A long-press on a touch screen**, which is how text gets selected by touch.
- **Shift+right-click** anywhere, so "Inspect" is still one gesture away for
  developers.
- **`data-native-context-menu`** on an element keeps the browser's menu for
  that element and everything inside it — for a surface the shell has no
  business re-skinning, such as an embedded viewer.

`<Layout contextMenu={false}>` turns the shell menu off altogether.

A surface with its own context menu needs no change and gets none: the listener
stands down on an event whose `preventDefault()` has already been called, which
every `onContextMenu` handler in the shell does. Write yours the same way.
`PopupMenu` does it for right-clicks on itself, so a menu never opens on top of
another one. `keepsNativeMenu(target)` and
`describeContextTarget(target, selectionText)` are exported if you want the
same decisions in your own handler.

`EntityList` is one of those surfaces, and every list gets its row menu without
wiring anything: **Open** (the row right-clicked), **Copy** for text selected
under the pointer, **Copy `<first column>`** and **Copy rows** — the ticked
rows as a table of the visible columns in their on-screen order, which pastes
into a spreadsheet as cells — then **Export selected to CSV** when the list
passes `exportEndpoint`, the page's own `contextActions`, and **Select all**,
**Clear selection** and **Refresh** (when `onRetry` is wired). A consumer's own
menu item that copies something can call `copyToClipboard(label, text, html?)`
for the same copy path and toast.

Note that a cross-origin iframe is outside the reach of any parent listener —
the page inside it shows whatever menu it draws for itself.

## API reference

All exports are named — `import { Modal, ... } from 'react-os-shell'`.

### Components

| Export | Purpose |
|---|---|
| `Layout` | Top-level shell — desktop + taskbar + start menu. Mount once inside your providers. `branding={{ productName, logo, tagline }}` sets the visual identity in one object — start-menu button, startup splash, logout cover, mobile landing; its fields win over the older loose `productName`/`productIcon` props. The About dialog and What's New changelog stay on `DesktopHostConfig`. |
| `BrandMark` | Aspect-preserving tenant mark for favicon, compact-icon and wordmark slots, with load-failure fallback, neutral monogram behaviour and optional tone-aware contrast treatment. |
| `BrandAssetEditor` | Shared staged upload/remove lifecycle with one enforced file contract and standard browser, search-result and shell-slot previews. Persistence is injected through `onSave` and `onRemove`. |
| `ComposerAttachments`, `AttachmentDropZone`, `AttachmentList`, `AttachButton` | Files attached to a message being written — a chat reply, a mail compose, a feedback thread. The paperclip ("Attach files"), a drop anywhere on the composer ("Drop files to attach"), and a paste into the text area all reach one pending `File[]` through the same checks, and a rejected file is announced. Holds the list and stops; the composer's send puts the files in its request. `ComposerAttachments` is the standard layout (text area, chips, trigger row); the three parts compose a composer with an icon rail or a footer of its own. `useFileIntake` is the hook behind every upload primitive, exported for exactly that — never so a consumer renders its own file input. |
| `FilePicker` | Documents on a record: one dashed zone that is a button (click, Enter, Space) and a drop target, listing the chosen `File[]`. It never uploads — the form submits them as it submits everything else. `accept`, `maxSizeBytes` and `maxFiles` are enforced on a drop exactly as on a pick, and a rejected file is announced (`role="alert"`) naming the file and the rule. Forwards its ref to the zone for `FormErrorSummary`. |
| `useFileIntake`, `acceptsFile`, `FileIntakeAlert` | The intake every upload primitive above takes its files through — the file dialog, a drop and a paste reach one set of checks (`accept`, `maxSizeBytes`, `maxFiles`) and one announced rejection list. For a surface with a layout of its own; never so a consumer renders its own file input. Also on the React-only subpath [`react-os-shell/file-intake`](#upload-intake-without-the-shell--react-os-shellfile-intake) for a page that cannot load the shell. |
| `MediaUploadField` | The single image / video slot — logo, cover, avatar, favicon. Dashed zone empty, preview with Replace / Remove filled, both take a drop. `onFile` hands the consumer the chosen `File` to upload (the field owns the gesture); `onPick` opens the consumer's own library picker instead; with neither it emits an object-URL. `maxSizeBytes` joins `accept` on every gesture. |
| `MediaUploadGrid` | The gallery sibling: thumbnails, an Add tile, per-thumb remove, drag-and-keyboard reorder, optional cover badge. `onFiles` receives EVERY file of a multi-file drop or dialog pick; `onPick` defers to a library picker. `maxFiles` counts against the items held. |
| `StartMenu` / `Desktop` / `WindowManagerProvider` | Used internally by `Layout`; rarely instantiated directly. |
| `Modal`, `ModalActions`, `CopyButton`, `CancelButton` | Window primitive supporting standard / compact / widget styles. |
| `PopupMenu`, `PopupMenuItem`, `PopupMenuDivider`, `PopupMenuLabel` | Right-click / context-menu primitive. |
| `ShellContextMenu` | The shell-wide right-click menu, already mounted by `Layout` (`<Layout contextMenu={false}>` turns it off). Mount it yourself only on a screen rendered outside the layout. See [Right-click menu](#right-click-menu). |
| `DropdownMenu` | Trigger-owned action menu with shared dismissal and keyboard behaviour. Use `side="top"` for a trigger in a bottom action bar; the default `side="bottom"` suits toolbar and row actions. |
| `ConfirmProvider`, `confirm` | Imperative `confirm({ title, body })` returning a Promise<boolean>. |
| `GlobalSearch` | Cmd-K command palette. Pass `providers: SearchProvider[]` to add results. |
| `ShortcutHelp` | The keyboard cheatsheet shown on `?`. |
| `NotificationBell` | Taskbar bell — config via `<Layout notifications={…}>`. |
| `BugReportDetail` | Used inside an entity-window registry entry; reads from `<BugReportConfigProvider>`. |
| `StatusBadge` | Colored pill rendering a status string. Map status→semantic group via `<StatusBadgeProvider groups={{...}}>`. `label` overrides the derived text for a status that arrived from elsewhere; the color still comes from `status`. `emphasis` (`subtle` default / `solid`, the same two words `Banner` uses) is the volume: the quiet register is a transparent wash that composites over a raised panel and a hovered row, the loud one is a saturated fill for the detail header where the same fact is the headline. Color comes from the status tokens in `ui.css`, which carry both themes. |
| `SidebarLayout` | Two-pane layout with a drag-to-resize sidebar (`storageKey` persists the width). Pair with a `flushBody` window so the sidebar runs edge-to-edge. |
| `SidebarNavItem`, `SidebarGroupLabel` | Filter-sidebar button (optional `count` badge and `severity` marker dot) plus its group heading. Roll the severity up in the app; omitting it renders exactly as before it existed. An unrecognised `severity` renders a visible "unknown" marker and logs — it never silently disappears. |
| `MetricBar` | Value + proportional bar with optional `warn` / `crit` threshold ticks — the CPU / memory / disk row. `value={null}` renders "no data" (dashed empty track), never a zero-width bar; with no thresholds the fill stays grey rather than claiming health. `max` must be a positive finite number — given `0`/`NaN` the row prints the value but draws no bar, rather than dividing by zero into a full one. |
| `BudgetBar` | A run's wall clock, drawn as **budget consumed** — not work done, which nothing here knows. Three states a glance separates: within budget (a solid fill), past the deadline (a hatched band, never the shape of a finished bar; with a `grace` the track spans budget + grace so it is only full when the reaper is due), and **no estimate at all** (no bar — not a zero one, not an empty track). Keeps `MetricBar`'s rule that `elapsed={null}` is no reading and `elapsed={0}` is a measurement. `budgetState(elapsed, budget)` is the same verdict for a list to sort by. |
| `TimelineTrack` | The time axis both timelines are drawn on, and the reason they look and move alike rather than merely similar. A 6 px rail with a fill, a **date ruler** (month ticks always, week ticks where they clear 14 px, a month label only where it clears 72 px of the last one), dots whose shape, colour and glyph say what kind of event they are, and one of two label strategies: `labels="lanes"` packs them into two rows and folds runs of the same kind into `×N` pills, `labels="active"` draws the one label a scrubber needs. `axis="compressed"` CUTS any stretch holding more than 30% of the window's time down to a fixed notch with a break glyph saying how many days it hides, and shares the rest of the track proportionally; `axis="linear"` keeps time proportional throughout. An optional `thumb` turns it into a scrubber: give it `stops` and it becomes discrete — a drag follows the pointer but snaps to the nearest stop as it goes, arrows step stop to stop, and `valueText` says which one for a screen reader. Hovering a `×N` pill **magnifies** its stretch so the members can carry their own labels (or do it from code with `zoomRange`), and an item's `preview` fills the hover/focus popover with the document in miniature, with an "Open" footer that fires its `onOpen` — the popover has already drawn the mark's label and its date above the preview, so a consumer leaves both out of it. Also `markers`, `phases`, `edgeCaptions`, and a `pending` list for the things that have no date. The marks are an `<ol>` with exactly one `aria-current="step"` and ONE tab stop — arrows traverse, Home/End jump, Enter/Space activates — and every tooltip and pill popover is hoverable, persistent and Escape-dismissible (WCAG 1.4.13). Under a 320 px track it stops squeezing the axis and switches to a vertical variant. Motion is `rosh-tl-*` classes in `ui.css` behind one `prefers-reduced-motion` rule, replayed on every mount, total budget 600 ms. |
| `ProductionTimeline` | The scrubbable production bar, drawn on `TimelineTrack` inside the shared timeline card: a sentence-case heading with the PO as its subject, the window and the lead time as meta, a Play **pill** on the right whose glyph follows its state, and a footer carrying the status line and legend chips drawn with the track's own glyphs. The thumb only ever rests on a date a report was filed on — drag it and it snaps report to report, arrow it and it steps one report at a time, press Play and it walks them at 600 ms a stop — so the bar never shows an estimate dressed as a fact. `onPickReport` selects a report; the optional `onOpenReport` / `onOpenMarker` make the label above the thumb a real button that opens the document behind it. A report carries an optional `preview` for its hover/focus popover — the stage row it filed, the note attached to it — and `renderReportPreview` builds one for the reports that carry none, the convenience for a caller whose list arrives straight off an API; the report's own preview wins where both exist, and the popover prints the report number and the date itself. `useProductionTimeline(opts)` owns the slider state and the derived snapshot so the caller's items table and the bar read the same state; `STAGES` / `calcOverall` / `calcReportOverall` are the stage maths it shares with that table. |
| `MilestoneTimeline` | The static sibling, on the same `TimelineTrack` and in the same card: one dot per milestone on a date axis, no scrubber. `heading` and `subject` split the title from the record it is about (`Mould development` · **001F/1813**), and the meta line states when it started, how long it has run and how many milestones are dated. The axis **cuts** rather than squeezes: a stretch holding more than 30% of the window's time becomes a fixed notch with a break glyph saying how many days it hides, and every stretch that still keeps time gets at least 48 px. Labels are packed into **two lanes** by their **measured** width, and a run of same-kind revisions folds into one `DFM ×4` pill whose members keep their dots on the rail: hovering it magnifies that stretch until each member can carry its own label, a click pins the popover listing them, Escape closes it. A milestone carries an optional `glyph` (a `default` one that names `doc` is drawn as the amber drawing it is), a `preview` for the popover, and an `onOpen` that the popover's "Open" button fires — `onClick` selects the dot on the bar, `onOpen` opens the drawing behind it, and a card that declares only the first keeps its Open button because the footer falls back to it. Label and date are printed by the popover above the preview, so a consumer supplies neither. A milestone with **no date gets no position**, because the only position available would be a date the record does not have: it is listed beside the bar under "Not yet reached" (two rows, then a real `+N more` button) and takes no part in the range, the fill or a phase bracket. `phase` groups of 2+ get a bracket marking parallel work, the fill never runs past today, and today gets its dashed rule and tag even when it IS the right edge — the commonest case, because a programme with no finish date ends at today. |
| `SettingRow` | One setting: its name and current value on one baseline, the explanation at full width beneath in a smaller voice. The value never shrinks, so a short badge keeps its line instead of folding into a narrow column. Handles a value that is a control (`controlId` labels it), a read-only fact, a value nobody knows (an em dash in the faint ink, never an empty cell), and a `quiet` row nothing can write yet. `DescriptionList` is the record-detail neighbour and stays that. |
| `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `FormField`, `Label` | Form controls — controlled (`value`/`onChange`); `Input`/`Textarea` forward native props for react-hook-form. `Button` and `Switch` take `disabledReason`: persistent text beside the control wired with `aria-describedby`, never a `title` — a tooltip needs a hover a disabled control does not reliably get. `Switch` also takes `disabledReasonId`, so a panel whose controls are all dead for one reason states it once and points every control at it. |
| `FormErrorSummary` | The error list at the top of a failed form (WCAG 3.3.1, the GOV.UK pattern): takes focus when errors appear, each message is a link that focuses the offending control by its `FormField` id. Renders nothing while `errors` is empty. |
| `TagInput` | Multi-value field — chosen values as removable chips, typing filters the option list in the same dropdown SearchableSelect uses. `allowFreeText` admits unlisted entries; Backspace in the empty input removes the last chip. The value array stays duplicate-free by construction. |
| `DatePicker`, `TimePicker`, `DateTimePicker`, `DateRangePicker` | Date/time fields. The first three wrap the platform's own inputs in the kit's field styling; all are careful to speak LOCAL dates and wall-clock times (never `toISOString`). `TimePicker` hands back an `HH:MM` string — a time of day names no calendar day, so it never invents a Date. `DateRangePicker` takes `fullWidth` to fill a filter-grid cell instead of shrink-wrapping its label. |
| `Card`, `StatCard` | Surface panel (optional header/footer) + dashboard metric tile. |
| `Avatar`, `AvatarGroup` | User avatar with initials fallback + status dot; overlapping stack with +N overflow. |
| `Banner` | Static in-flow alert (`tone`: info / success / warning / danger). |
| `Tabs`, `Accordion`, `Tooltip` | Controlled tab strip, collapsible sections, frosted hover tooltip. |
| `Stepper` | A linear wizard's progress strip — numbered circles, connectors, `aria-current="step"`. Controlled like Tabs; completed steps are clickable to go back (when `onChange` is wired), upcoming steps never are — moving forward belongs to the wizard's own Continue button, behind its validation. |
| `Pagination` | Numbered page control (pairs with tables; complements `ListFooter`). |
| `Sparkline`, `LineChart`, `BarChart`, `DonutChart`, `ScatterChart` | Dependency-free inline-SVG charts (`currentColor`-themed). `LineChart` is the multi-series trend with optional scale, legend, dots and area fill. `ScatterChart` takes `xDomain` / `yDomain` to override the derived axis, and `xScale` / `yScale` of `'log'` for a long tail; a point outside a supplied domain is dropped and counted in the accessible label. |
| `BulkImportGrid` | Paste-or-upload bulk entry with column mapping, duplicate review and optional sum-merge. Hands resolved rows to `onImport`; owns no persistence. The whole panel takes a dropped CSV; the Upload CSV button opens the same dialog. |
| `UndoProvider`, `UndoControls` | One undo stack per form window, covering its fields, line items and bulk imports. Register state with `useUndoable` and the shell shows the Undo/Redo pair itself, in the window footer's left slot, as soon as the form has state and the user may edit — a form mounts `UndoControls` by hand only for a place the footer is not, and a hand mount stands down while the shell's pair is showing, so nothing doubles up. Binds ⌘Z / ⇧⌘Z (and Ctrl+Y) except while the caret is in a field, where the browser's own undo wins. `WindowManager` already mounts one per window, scoped with `windowId` so a keypress reaches only the frontmost window; pass `windowId` yourself for any provider you mount outside a `<Modal>`, or two open windows will step back together. Offered to anyone who may edit the record — gate with `canEdit` and/or `perms`; a reader sees no controls and records no history. The shell-level provider cannot know the record's permissions, so a read-only form nests its own `<UndoProvider canEdit={false}>` to shadow it. |
| `Calendar` | Month grid with full keyboard navigation (arrows, Home/End, PageUp/Down) and `role="grid"` semantics. Single or range. The shared grid behind `DatePicker` and `DateRangePicker`. |
| `DashboardTemplate`, `DataTablePage`, `FormLayoutPage`, `CheckoutTemplate`, `EmailTemplate`, `ChatTemplate`, `GalleryTemplate`, `AuthScreen`, `ErrorPage` | Zero-prop starter page templates composed from the primitives. |
| `ErrorBoundary` | Catches a render crash and shows `ErrorPage` 500 rather than a blank screen. `showDetails` is off by default, so a visitor is never shown the stack; the fallback is `role="alert"`. Takes `onError` for reporting and `resetKeys` to recover on navigation. |

### Providers + setters

| Export | Use |
|---|---|
| `<ShellAuthProvider value={{ hasAnyPerm }}>` | Permission-filter nav items. |
| `<ShellPrefsProvider value={{ prefs, save }}>` | Where the shell reads/writes user prefs (theme, taskbar pos, sticky notes, …). Use `useLocalStoragePrefs(key)` for a backend-less default. Since 4.92.0 it is also how `<EntityList>` / `<ResizableTable>` column config and sort persist: with no provider mounted, `useShellPrefs()` reads empty and drops saves, so both silently degrade to localStorage-only and never reach the user's profile. |
| `<ShellStringsProvider value={{ … }}>` | Translates the shell's own strings — window controls, taskbar hints, the logout cover, About/What's New, picker and table defaults, the help viewer. English works with NO provider; the override is a typed partial merged per section, so an incomplete catalog falls back rather than breaking. Prop-level text (`emptyText`, placeholders) always wins over the catalog. |
| `<ShellEntityFetcherProvider value={(endpoint, id) => …}>` | How the modal stack fetches entity data. |
| `<BugReportConfigProvider value={{ submit, list?, resolve? }}>` | Wire the bug-report flow to your backend. |
| `<DesktopHostProvider value={{ stickyResolver?, saveShortcuts?, … }}>` | Sticky-note ref resolver + persistence callbacks. |
| `<StatusBadgeProvider groups={{ status: 'success' \| ... }}>` | Status string → semantic group. |
| `<PortalBrandingProvider load={...} fallback={...}>` | Loads public hostname-scoped Company Profile identity before authentication, applies its favicon and optional derived document title, and exposes it through `usePortalBranding()`. |
| `setShellApiClient(axios)` | Module-level: register your axios instance once. |
| `setShellAuthBridge({ user, logout })` | Module-level: register user identity / logout handler. |
| `setShellWindowRegistry(registry)` | Module-level: register your composed `WindowRegistry`. |

### Hooks

| Export | Purpose |
|---|---|
| `useWindowManager()` | `{ openPage, openEntity, closeEntity, openWindows, … }` |
| `useWindowDirty(dirty)` | Registers controlled unsaved state with the enclosing `PageWindow`; multiple registrations aggregate with any-dirty semantics, and calls outside a managed page window are ignored. |
| `useTheme()` | `{ theme, resolved }` — current theme + system-resolved value. |
| `useNewHotkey(handler)` | Cmd/Ctrl+N — for "create new entity" buttons. |
| `useEditHotkey(handler)` | Alt+Shift+E — for "edit" toggle. |
| `useModalNav({ onPrev, onNext })` | ←/→ to step through siblings inside a modal. |
| `useModalSave(handler)` | Cmd-S inside a modal. |
| `useModalDuplicate(handler)` | Alt-D inside a modal. |
| `useTableNav({ rows, cols, onCell })` | Arrow-key cell navigation in editable grids. |
| `useUndoableState(initial, { label, coalesceKey })` | `useState`, with the value in the window's undo stack — a rename, not an extra line. State left as plain `useState` stays out of the history, which is where transient UI, fetched data and validation output belong. |
| `useUndoable(value, apply, { label, coalesceKey })` | The explicit form, for state whose setter the component does not own. `apply` is the setter you already have. `coalesceKey` folds a run of typing into one step. Register the state itself, never a value derived on the way in (`rows.filter(...)`) — changes are detected by identity, so a fresh array each render reads as a change every render. |
| `useUndo()` | `{ undo, redo, canUndo, canRedo, undoLabel, clear, baseline, enabled, hasState }` for the enclosing `UndoProvider` — for custom UI, to `clear()` the history after a save, or to `baseline()` it after a load. Call `baseline()` in the same effect that assigns a fetched record, or the load itself becomes the oldest step and the user's first ⌘Z hands back the empty form. |
| `useUndoCanEdit(canEdit)` | A form's own word on whether the record may be edited right now — `useUndoCanEdit(!isLocked)`. While false the stack records nothing, ⌘Z is left alone and the footer shows no controls. Prefer it over nesting `<UndoProvider canEdit={false}>` in the form's JSX: that shadows the stack for the children only, while the form's own `useUndoableState` calls, made above the nested provider in the tree, keep registering with the outer stack. The nested provider is still right for a read-only child subtree. |
| `useMultiModal()` | Manages multi-window stacking + activate/blur. |
| `useShellAuth() / useShellPrefs() / useShellEntityFetcher() / useBugReport() / useDesktopHost()` | Context readers — the shell uses these internally; consumers may also call them. |

### Apps barrel — `react-os-shell/apps`

| Export | Type |
|---|---|
| `bundledApps` | `WindowRegistry` — 12 ready-to-mount apps. |
| `utilityApps`, `documentApps`, `webApps` | Subsets of `bundledApps`. |
| `Calculator`, `Spreadsheet`, `Weather`, `CurrencyConverter`, `PomodoroTimer`, `TodoList`, `Browser` | Lazy components — use directly in custom registry entries. |
| `PdfViewer` | Lazy component — the PDF reader on its own, for embedding. See below. |
| `BUILTIN_APP_INFO` | Per-app metadata for the document/web apps (Spreadsheets, Notepad, Documents, Preview, Files, Browser): display name, independent app version and one-line description. Drives each app's "About" dialog (window title menu → About <App>), which also shows the shell version. |

#### An embedded PDF — `PdfViewer`

`PdfActionButton` and `setPdfPreview` open a PDF in a Preview **window**. When
the document belongs *inside* something else — a preview beside the form that
generates it, a document tab on a record — render `PdfViewer` directly:

```tsx
import { lazy, Suspense } from 'react';
const PdfViewer = lazy(() => import('react-os-shell/apps').then(m => ({ default: m.PdfViewer })));

<div className="h-[32rem]">
  <Suspense fallback={<p>Loading viewer…</p>}>
    <PdfViewer url={objectUrl} filename="Statement.pdf" fit="page" />
  </Suspense>
</div>
```

| Prop | |
|---|---|
| `url` | Object URL or remote URL. |
| `filename` | Display name, and the filename the built-in Download uses. |
| `fit` | `'width'` (default) fills the container's width and lets a tall page scroll — right for a viewer that owns a window. `'page'` fits the whole page, which is what a pane inside a dialog wants. Either way it is the *initial* mode: the reader can still zoom, and the Fit button re-arms it. |
| `onDownload` | Replaces the built-in "save `url` as `filename`". |
| `onEmail` | Adds an Email button to the toolbar. Omit it and there is none. |

It fills its parent and scrolls inside, so **give the parent a resolved
height** — `h-full` inside a flex column, or an explicit height. It brings its
own toolbar (page nav, zoom, Fit, Print, Download); inside the Preview window
those same buttons merge into the window's single toolbar row instead.

Handing it a new `url` opens that document **on its first page** — the page
number belongs to the document, not to the viewer, so re-rendering one viewer
with a shorter document cannot leave it pointing past the end. No `key` needed.
The reader's zoom is deliberately kept across the change: it is a preference
for how large they want text, not a fact about the file.

Import it **lazily**, as above. It statically imports `pdfjs-dist`, and the
whole reason the bundled apps are `lazy()` is to keep a PDF parser out of a
host's startup bundle — `scripts/verify-dist.mjs` fails the build if one gets
in. `pdfjs-dist` is an optional peer: a consumer that never renders a PDF need
not install it.

The alternative this replaces is `<iframe src={objectUrl}>`, which hands the
document to the browser's own plugin — its toolbar, its thumbnail rail, its
idea of the zoom, none of it themeable and none of it testable.

### UI kit without the window manager — `react-os-shell/ui`

Not every app that wants this package's components wants a desktop. A
point-of-sale till is one full-screen screen; a portal may keep its own routed
pages and sidebar. Both still want the buttons, inputs, cards, badges, tables
and charts.

```tsx
import { Button, Card, Banner, FormField, Input } from 'react-os-shell/ui';
import 'react-os-shell/ui.css';
```

**It reaches nothing but `react` and `react-dom`.** None of the optional peers —
no `react-router-dom`, `@tanstack/react-query`, `axios`, `@headlessui/react` or
`@heroicons/react` — which matters because they are declared *optional*, so a
consumer who has not installed them gets an unresolvable import rather than a
degraded style. CI asserts it against the built artifact
(`scripts/verify-dist.mjs`), not just the source, because leakage can arrive
through a shared chunk.

What you get: every form control, the display and layout primitives
(`Card`/`StatCard`, `Avatar`, `Banner`, `Tabs`, `Accordion`, `Tooltip`,
`StatusBadge`, `ColoredBadge`, `EmptyState`, `PageHeader`, `Spinner`,
`Breadcrumbs`, `TopNav`, `SidebarLayout`, `MetricBar`, `BudgetBar`, `TimelineTrack`,
`MilestoneTimeline`, `ProductionTimeline`, `SettingRow`,
`Markdown`,
`HelpCenter`, `EditableGrid`, `SearchableSelect`, `PopupMenu`), the charts, all
nine page templates, the pageless data primitives (`Pagination`, `Kanban`,
`ListFooter`, `ListLoadError`), `toast`, and the theming hooks (`useTheme`,
`resolveTheme`, `applyThemePrefs`) — you need those last ones to reach dark mode
or an accent at all, since both work by stamping `data-theme`.

What you do not get: `Modal` and the window manager, `Layout`, `Desktop`,
`StartMenu`, `GlobalSearch`, the settings panels, the bundled apps, and the
components that reach an optional peer for their own reasons (`EntityList`,
`ResizableTable` and the react-query data hooks, `FilterBar`, `UndoControls`,
`BulkImportGrid`, `ConfirmProvider`/`confirm`).

**Stylesheets: import exactly one.** `ui.css` is the kit; `styles.css` is the
umbrella over the kit *plus* the window/taskbar/desktop rules. Taking both
doubles every rule. `ui.css` deliberately does not `@import "tailwindcss"` — you
supply Tailwind v4 yourself (every consumer already does), which also lets an
app mid-migration off another component library take the theme and utility
layers without preflight.

`react-os-shell` (the root entry) is unchanged and remains a superset: same
components, same bindings, plus the shell.

### Brand surfaces — `react-os-shell/brand.css`

For output that is not a portal window — a report, a published artifact, a
proposal, an HTML email, a shop page. Those have no React and no build step,
so they cannot compose the kit; they link one stylesheet instead:

```html
<link rel="stylesheet" href="https://unpkg.com/react-os-shell/dist/brand.css">
```

It is `styles.css` compiled and self-contained, plus the tokens a page without
utility classes cannot express (accent and `--accent-text`/`--on-accent`,
status hues and their `-text` variants, radius, type), plus the **report
primitives** — a small semantic layer in
`@layer components`, so a utility on the same element still wins:

| Group | Classes |
|---|---|
| Shell | `ef-report` `ef-shell` `ef-skip-link` `ef-masthead` `ef-identity` `ef-logo-light` `ef-logo-dark` `ef-document-meta` `ef-footer` |
| Opening, structure | `ef-opening` `ef-opening-claim` `ef-opening-proof` `ef-section` `ef-section-title` `ef-flow` `ef-reading` `ef-peers` |
| Type roles | `ef-label` `ef-caption` `ef-mono` `ef-numeric` `ef-visually-hidden` `ef-sources` |
| Figures | `ef-stat-strip` `ef-stat` `ef-stat-label` `ef-stat-value` `ef-stat-unit` `ef-stat-detail` `ef-unavailable` |
| Evidence | `ef-table-wrap` (caption, header, baseline-aligned cells, `ef-numeric` columns) · `ef-status[data-status]` over the nine groups |
| Bars, charts | `ef-bar-list` `ef-bar-label` `ef-bar-track` `ef-bar-fill` (`style="--ef-bar: 48%"`) `ef-bar-value` · `ef-chart` `ef-series-1…6` `ef-series-stroke` `ef-series-fill` `ef-chart-axis` `ef-chart-gridline` `ef-chart-label` |
| Controls | `ef-field` `ef-helper` `ef-error` `ef-button[data-variant]` |

A page that stamps no `data-theme` follows the reader's OS preference: the
stylesheet carries the dark ramp under `prefers-color-scheme`, guarded so any
explicit stamp wins. Utility color classes remap only under
`[data-theme="dark"]`, so a page that paints with utilities stamps the
attribute itself.

The list is the API. The stylesheet is compiled, so an `ef-` name outside it
renders as nothing, the same as `h-[440px]`. The layout primitives exist to
make the recurring generated-page defects unexpressible rather than merely
detectable: `ef-table-wrap` owns the full width of its section, `ef-bar-list`
owns one shared label, plot and value lane, `ef-stat-strip` owns the peer
grid. The organisation contract that governs these surfaces, and the audit
that checks them, live in the EFFICIENT harness (`52-brand-surface.md`).

### Editorial markup — `react-os-shell/markup`

One grammar for copy a human types into a plain text box, so a toolbar button and
a parser can never disagree about what a delimiter means: `**bold**`, `_italic_`,
`~~strike~~`, `==highlight==` (the brand accent, applied to a selection).

**Its own subpath because it imports nothing** — no React, no JSX, no DOM, none
of this package's peers. A public site can take the rule without inheriting a 3D
viewer and a PDF renderer; `dist/markup/index.js` is a standalone file with zero
import statements.

What is shared is the RULE, not the rendering. A web renderer paints with
theme-token classes and an email renderer must inline every style, so each host
keeps its own renderer and walks the same token list.

| Export | Notes |
|---|---|
| `applyMark(text, start, end, style)` | Pure writer behind a toolbar button — returns the new text plus where the selection should sit. Pressing the same button again unwraps. |
| `MARKUP_TOOLS`, `COPY_FIELD_TOOLS`, `markupTools(styles)` | Button descriptors, and the four a copy field offers (bold / italic / strike / highlight). A host renders its own buttons; only the rule is shared. |
| `tokenizeInline(value, rules)` | Parses to `InlineToken[]`. Tokens ALTERNATE, starting and ending with a `text` token that may be empty — a renderer that wraps every segment depends on the empty ones to keep its markup stable. |
| `stripInline(value, rules)` | The plain words — the only correct source for an `alt`, an `aria-label` or a structured-data field. Deleting delimiter characters by hand breaks the moment the grammar grows a marker. |
| `STANDARD_MARKUP` | The four marks above. |
| `STOREFRONT_MARKUP`, `CAMPAIGN_MARKUP` | Standard plus a host's own LEGACY runs, so already-published copy keeps rendering as it does today. Designed to be deleted once stored content has been converted. |

Two delimiter choices worth knowing. Italic is `_phrase_`, not `*phrase*`,
because a single asterisk already means the accent color in the products that
use this. And `_` never fires inside a word (CommonMark's own rule), which is
what stops a mail-merge line holding `{{first_name}}` and `{{last_name}}` from
italicising everything between them — checked with plain character tests, never a
lookbehind, which is a parse error on Safari below 16.4.

### Markdown — `react-os-shell/markdown`

CommonMark + GFM for a body a person or a service WROTE: a note, a chat message,
a bug report, a help article. React elements out; no HTML string exists at any
point in the pipeline.

**Its own subpath, for the mirror image of `markup`'s reason.** It is the one
module in this package that needs a third-party runtime, so `react-markdown`,
`remark-gfm` and `remark-breaks` are declared **optional** peers and only a
consumer who imports this subpath ever installs them. The package's
`dependencies` stay empty. Cost when you do take it: ~46 KB gzipped.

```bash
npm i react-markdown remark-gfm remark-breaks
```

```tsx
import Markdown from 'react-os-shell/markdown';
import 'react-os-shell/ui.css';

<Markdown>{report.description}</Markdown>
<Markdown variant="article" resolveImageSrc={s => `/media/help/${s}`}>{doc.body}</Markdown>
```

| Prop | Notes |
|---|---|
| `variant` | `note` (default) — typed copy inside a card: headings cap one step above body text, a single newline is a line break. `article` — authored documentation: full heading scale, soft wraps, callout blockquotes, screenshot placeholders, capped measure. |
| `clamp` | Collapses to ~6 text lines with a mask fade. The fade appears only when the content actually overflows, measured after layout. The "Show more" control is yours. |
| `resolveImageSrc` | Rewrites a relative image `src` before fetch — article bodies name screenshots by a path only the host can serve. |
| `components` | Per-element overrides, merged over the variant's set. |

**Four constructs are disabled**, each because a body that predates markdown
would otherwise render surprisingly: a four-space-indented paste (a quoted
email) does not become a code block; `<John>` renders as the text it is rather
than being silently DROPPED as a raw-HTML node; and `Title` over `----` stays a
paragraph and a rule. Fenced blocks and `<https://…>` autolinks are untouched.

**No sanitiser, deliberately** — there is nothing to sanitise. Raw HTML is never
parsed and `javascript:` URLs are neutralised, so the output cannot carry markup
a writer did not intend. Adding `rehype-raw` would undo exactly that.

**No syntax highlighting**, for the same reason as the bundle budget above: a
highlighter costs more than this package's whole UI kit. Code blocks are
monospace with their own horizontal scroll, and the fence's info string is
passed through as `data-language` so a host can light them up itself.

#### `MarkdownLite` — when you cannot afford a parser

`react-os-shell/ui` exports `MarkdownLite`, a regex renderer that imports
nothing. It covers headings, emphasis, links, inline code, fenced blocks, flat
lists, pipe tables, callouts and rules — and it cannot nest, because a regex
cannot. It is why the till can render prose at all. Reach for it when the bundle
is the constraint and the body is short; reach for `react-os-shell/markdown`
when someone else wrote the text.

### Upload intake without the shell — `react-os-shell/file-intake`

The hook behind every upload primitive, for a page that must not load the rest
of this package: a public applicant form, a storefront's return request.

```tsx
import { useFileIntake } from 'react-os-shell/file-intake';

const intake = useFileIntake({
  onAccept: ([file]) => setCv(file),
  multiple: false,
  accept: limits.accept,          // from the endpoint's published limits
  maxSizeBytes: limits.maxSizeBytes,
});

<input {...intake.inputProps} />  {/* hidden, never a tab stop */}
<button type="button" onClick={intake.open} {...intake.zoneProps}>Choose file</button>
{intake.rejections.length > 0 && (
  <ul role="alert">{intake.rejections.map(r => <li key={r.file.name}>{r.message}</li>)}</ul>
)}
```

**It reaches `react` and nothing else** — not `react-dom`, no stylesheet, no
toast container, no window manager. `scripts/verify-dist.mjs` walks the built
graph of `dist/file-intake/index.js` on every build and fails it otherwise, and
pins the export list below. The exports are the same bindings the kit exports,
so an app importing from both has one hook.

| Export | Notes |
|---|---|
| `useFileIntake(options)` | `inputProps` for the hidden native input, `zoneProps` for the one focusable control that is also the drop target, `pasteProps` for a composer's text area, `open()`, `dragOver`, `rejections`, `clearRejections()`. `accept`, `maxSizeBytes` and `maxFiles` apply to every gesture. It validates and hands back `File[]`; it never uploads. |
| `acceptsFile(file, accept)` | The `accept` test the hook applies — extension rules match the name, `type/*` the MIME prefix. |
| `FileIntakeAlert` | The rejection list as `role="alert"`, styled with Tailwind utilities (`text-xs text-red-600`). A page whose Tailwind does not scan this package renders `rejections` itself, as above — keep the `role="alert"`. |
| `FileIntakeOptions`, `FileIntakeLimits`, `FileRejection`, `FileRejectionReason` | Types. |

### Misc

| Export | Notes |
|---|---|
| `createWindowRegistry(...maps)` | Variadic merge — later partials override earlier on the same key. |
| `isPageEntry`, `isEntityEntry` | Type guards for `WindowRegistryEntry`. |
| `glassStyle()` | Returns the theme-aware frosted-glass `style` object. |
| `reportBug(submit)` | Captures a screenshot via `getDisplayMedia`, opens the dialog, hands the payload to your `submit`. |
| `formatDate(iso)` | Locale-aware date formatter. |
| `budgetState(elapsed, budget)` | `no-reading` \| `no-budget` \| `within` \| `over` — the verdict `BudgetBar` draws by, exported so a run list sorts and filters by the same rule rather than re-deriving "late" a second time. |
| `GROUP_COLORS`, `GROUP_COLORS_SOLID`, `groupColors(group, emphasis?)` | The status palette, both registers, as the class strings the badges emit — for a surface that has to build its own pill (a virtualised cell, a canvas legend) and must not guess at the colors. |
| `severityOf(value, warn?, crit?)` | The `SeverityTone` (`success` \| `warning` \| `danger`) a reading earns against **inclusive** bounds; `null` when there's no reading or no usable bounds — the shell hardcodes no threshold. Backs `MetricBar`; use it to roll a `SidebarNavItem severity` up. |
| `isSeverityTone(value)` | Type guard for the three tones. Validate a backend rollup with it at the fetch boundary, where a bad token can still be reported against its payload, rather than letting it surface as a wrong pixel. |
| `toast.success / .error / .info` | Toast notifications — auto-mounts container. |
| `Kbd` constants — `MOD`, `ALT`, `SHIFT`, `ENTER`, `ALT_SHIFT_E`, `CMD_K`, … | Symbol constants for rendering keyboard shortcuts. |

## Why it exists

Most "desktop UI" demos on the web are toys with hardcoded windows and no escape hatch. This one was extracted from a working ERP where every entity (sales orders, invoices, vendors, …) opens as its own window with consistent header, footer, hotkeys, depth stacking, and split-view. The shell is **fully decoupled** from any specific backend — every subsystem that needs server data (notifications, bug reports, desktop shortcuts, search, entity fetching) takes its data through callback configs supplied by the consumer. Drop-in localStorage fallbacks ship for prefs and sticky notes so the package works out of the box without a backend.

## Examples

- [`examples/demo`](examples/demo/) — small Vite app showcasing the shell + bundled apps with mock data. Live at [victorymau.github.io/react-os-shell](https://victorymau.github.io/react-os-shell/), deployed automatically by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) on every push to `main`.

## Contributing

PRs welcome. Open an issue first for non-trivial changes so we can align on shape.

```bash
npm run typecheck   # tsc --noEmit, then tsc -p tsconfig.test.json (src + tests)
npm test            # specs in tests/, run by node's test runner
npm run build       # tsup → dist/
```

`npm test` bundles `tests/*.test.tsx` with esbuild and runs them under `node --test`, rendering components with `react-dom/server`. No test framework is installed — the runner is `scripts/test.mjs`, ~60 lines. `esbuild` (the runner imports it) and `@types/node` (the specs import `node:test`) are declared devDependencies rather than borrowed from `tsup`'s transitive tree, so a change in its dependency layout cannot break the build job with a module-not-found.

Typecheck runs twice on purpose: `tsconfig.json` is the *build* config, so `rootDir: "./src"` fixes the shape of `dist/` and its `include` stops at `src/**`. `tsconfig.test.json` widens the scope to cover `tests/` as well — esbuild strips types without checking them, so without it a type error in a spec is invisible to CI.

## License

[MIT](./LICENSE)
