# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [3.14.1] — 2026-07-05

### Fixed
- **Two open windows for records that share a display label can now each be
  closed independently.** A window's internal id was derived from the human
  `label` passed to `openEntity` (e.g. a wheel finish used its design name), not
  from the record identity. Two *different* records that share that label — two
  wheel finishes on the same design, say — therefore opened with the **same
  `id`**, even though the dedup guard (which keys on `entityType` + `entityId`)
  correctly let both through. That collision produced duplicate React keys in
  the window render loop and a shared `windowKey`/`boxKey` in the modal store,
  so closing one window filtered both out of state but stranded the other's
  portal panel on screen with a close button that no longer matched anything —
  an un-closeable window. Window ids are now keyed by `entityType:entityId` (the
  same identity the dedup already uses), so no two live windows can share an id.
  A restored session is also healed on load: a window persisted under the old
  label-based id that collides with another is re-keyed to its entity identity
  (and a genuine duplicate dropped), so an existing stuck pair resolves on the
  next reload instead of being restored just as broken. (EFFICIENT
  duplicate-record window close fix.)

## [3.14.0] — 2026-07-05

> Note: the fix and addition below first shipped to npm as `3.12.0` (published
> from a branch before `taskbarGroup` landed as `3.13.0`). `3.14.0` is the first
> main-line release to carry them together with `taskbarGroup`.

### Fixed
- **Pressing (or holding) a window no longer strips the frosted glass off the
  other windows.** A drag/resize gesture drops `backdrop-blur` on every window
  for its duration (so moving the foreground window doesn't force a per-frame
  re-sample repaint of the windows behind it). That suppression was engaged on
  **pointer-down**, before any movement — so a mere press-and-hold, or even a
  plain click, on a window's title bar or resize edge instantly flattened the
  frosted "wallpaper-through-glass" look on every other open window until the
  press ended. The gesture (pointer capture, drag shield, and the blur
  suppression) is now deferred until the pointer actually moves past a small
  threshold, so a press/click that isn't a drag leaves every window's frosted
  glass intact while the real drag optimisation is unchanged.

### Added
- **Entity detail windows now honour `dimensions`.** `ModalRegistryEntry` gains
  an optional `dimensions: [width, height]` (matching `PageRegistryEntry`), and
  the entity-window renderer forwards it to the `Modal`. Like the page path,
  explicit `dimensions` set a fixed open size (clamped to the viewport) and
  override any stale per-window size the shell persisted to `localStorage` —
  so a content-heavy detail window can be pinned to a large default rather than
  reopening at whatever size it was last dragged to.

## [3.13.0] — 2026-07-05

> Note: `3.12.0` was published without this change, so `taskbarGroup` ships as **3.13.0**.

### Added
- **Cross-route taskbar grouping (`taskbarGroup`).** A `PageRegistryEntry` may
  now declare `taskbarGroup: { key, label, icon? }`. Windows sharing the same
  `key` collapse into a SINGLE taskbar button — even across different routes —
  showing the group `label` and a window count, with the hover preview listing
  the individual windows. Previously the taskbar grouped strictly by route, so
  only same-route `multiInstance` copies could stack (e.g. a hub window and the
  editors it opens now share one button). Fully backward-compatible: entries
  without `taskbarGroup` group by route exactly as before.

## [3.11.3] — 2026-07-04

### Fixed
- **`SearchableSelect` dropdown now follows its window when the window is
  dragged.** After 3.11.2 portaled the options list to `document.body` and
  positioned it `fixed`, the list tracked the trigger on scroll and resize but
  not when the shell window was moved: dragging a window with a picker open
  left the dropdown stranded at its open-time spot while the window (and the
  trigger) slid away. Window drags move the trigger via a CSS `transform` on an
  ancestor, which fires neither `scroll` nor `resize`, so the position never
  recomputed. The hook now also polls the trigger's rect on each animation
  frame while the menu is open and recomputes when it shifts (with a rect
  dirty-check to keep the idle loop cheap), so the menu stays glued to its
  trigger through a drag or any other transform-/animation-driven move.

## [3.11.2] — 2026-07-04

### Fixed
- **`SearchableSelect` dropdown no longer clipped by a scrolling ancestor.** The
  options list is now portaled to `document.body` and positioned `fixed` at the
  trigger's viewport rect instead of being rendered in place with
  `position: absolute`. In place, any `overflow` ancestor — every form's scroll
  container, a window panel — clipped the list, so a picker near the bottom of a
  form (e.g. a customer's Default Payment Term) had its options cut off by the
  modal footer. The menu now floats above surrounding chrome, flips above the
  trigger when the space below is cramped, caps its height to the viewport, and
  tracks the trigger on scroll/resize. Same reasoning as `PopupMenu`'s `portal`
  prop.

## [3.11.1] — 2026-07-04

### Fixed
- **Windows keep their frosted glass while being dragged/resized.** The
  per-gesture optimization (3.8.5) that drops `backdrop-filter` to avoid
  per-frame backdrop re-sampling was too broad — it stripped the glass from the
  very window under the cursor, so a window turned flat/opaque the moment you
  started moving it. The blur-drop now spares the window being dragged (marked
  `.rosh-gesture-window`) and still sheds the backdrop-filter on the other,
  static windows and chrome, so the grabbed window stays glassy with no repaint
  regression.

## [3.11.0] — 2026-07-04

### Added
- **`MediaUploadField` — the shell's standard "choose a media asset" control.**
  A single-slot media picker matching the storefront's media-upload design: an
  empty **dashed dropzone** (upload glyph + a dim prompt line + a "Choose from
  library or upload" link CTA) that swaps to a **preview** (image *or* video)
  with an optional filename badge and **Replace** / **Remove** actions once set.
  It is presentational and controlled the kit way (`value` URL + `onChange(url)`),
  and owns **no** picker modal or upload call — each portal has its own media
  library and endpoint, so that behaviour is **injected** via `onPick(droppedFile?)`
  (fired on click *and* on drag-drop). With `onPick` omitted it falls back to a
  native `<input type=file>` emitting an object-URL (handy for demos and
  staged-then-submit forms). Drives image-vs-video preview, the fallback dialog,
  and the default copy from `accept`; supports `fit` (`cover`/`contain` for
  logos), a px `height`, `busy`/`disabled` states, and custom copy. Reuses the
  shell `Button` for its actions and the `FormField` wrapper for label/hint/error.
  Also exports **`mediaFileName(url)`** — the shared filename-from-URL helper
  (strips the upload hash prefix, URL-decodes) so a field and its picker show the
  same name. See it under **Form Controls** in the demo.
- **`MediaUploadGrid` — the multi-image sibling of `MediaUploadField`.** The same
  dashed dropzone when empty, then a thumbnail grid with an **＋ Add** tile, a
  per-thumb remove **✕**, optional **drag-to-reorder**, and an optional **Cover**
  badge on the first item. Presentational and controlled (`items` in) — it owns
  no picker/upload/ordering: adding is injected via `onPick(droppedFile?)` (click
  or file-drop onto the zone), removing via `onRemove(id)`, reordering via
  `onReorder(from, to)`. Shares the dropzone look and `mediaFileName` with the
  single field. This is the primitive for gallery slots (product/part pictures,
  media zones, attachment thumbs).

## [3.10.0] — 2026-07-04

### Added
- **`SidebarLayout` pinned action slots.** New optional `sidebarTop` and
  `sidebarBottom` props render a node pinned above / below the sidebar's
  scrolling middle (`sidebar`) — the standard list-window pattern of a primary
  "New X" button at the top and an "Export CSV" button flush to the bottom. The
  padding, the bottom divider, and the grow-to-fill middle live in the shell, so
  every list page is laid out identically. Fully backward-compatible: panes with
  neither slot render exactly as before.
- **`SidebarActionButton`** — a full-width action button for those slots, with
  `variant="primary"` (solid blue create) / `"secondary"` (white outline) and an
  optional `hotkey` chip, so the button markup isn't copy-pasted across every
  list page.

## [3.9.0] — 2026-07-03

### Added
- **Image annotator text labels can now be given a box** — a border colour, a
  background fill, and adjustable padding. When a text tool or text annotation is
  active, the toolbar gains **Border** / **Fill** (each off by default, add via a
  colour swatch, clear with ✕) and a **Pad** slider. The box renders behind the
  glyphs as a rounded `<rect>` in the SVG layer, so it exports and copies with the
  rest of the annotation, and the in-place editor mirrors it (WYSIWYG). Adding a
  box also makes the whole label — not just the thin glyphs — a click target, so
  bordered labels are far easier to select and move.

### Fixed
- **Annotator text no longer disappears when you click elsewhere or press Enter.**
  Committing a text label now reads the live `<textarea>` value (instead of the
  possibly-stale React state), and starting a second label first *commits* the one
  in progress rather than silently overwriting it. Previously, clicking away while
  a text box was open raced the textarea's blur-commit against a `pendingText`
  reset and often discarded whatever had been typed.

## [3.8.6] — 2026-07-02

### Fixed
- **Dragging or resizing a window over an overlapping window no longer stutters
  or freezes.** The drag (`startDrag`) and resize (`startResizeCorner`) handlers
  register their `pointermove`/`pointerup` listeners on `window` but never took
  pointer capture, so as soon as the cursor crossed an overlapping window whose
  body is an `<iframe>` (e.g. an embedded editor preview), the browser routed
  the pointer stream into that iframe's own document — the parent listeners fell
  silent, the window froze mid-drag and could stick to the cursor. Each gesture
  now (1) calls `setPointerCapture` on the grabbed handle, (2) mounts a
  transparent full-viewport shield so events never reach a background iframe and
  background windows don't react to the moving pointer, and (3) flags `<body>`
  (`rosh-gesturing`) to drop the per-frame `backdrop-blur` that re-samples the
  overlapped window and to promote each window to its own compositor layer so
  moving the foreground window doesn't repaint the ones behind it. Resize also
  now writes `left/top/width/height` straight to the DOM per frame (syncing
  React state once on drop, like drag already did) instead of re-rendering — and
  reflowing a heavy `<iframe>` body — every animation frame. (EFFICIENT
  overlapping-window drag/resize lag fix.)

## [3.8.5] — 2026-07-01

### Fixed
- **`useInfiniteScroll` now de-dupes rows by `id` across pages.** Offset
  pagination over a non-unique ordering key — or a background refetch of the
  already-loaded pages while the underlying data shifts (e.g. a live balance
  changing between the page-1 and page-3 fetches) — can hand back the same
  record on two pages. The hook flattened every page's `results` with no
  de-dupe, so that record rendered twice. Seen on the EFFICIENT admin Customers
  list sorted by BALANCE: one customer appeared both at the top and near the
  bottom. The flatten now keeps the first occurrence of each `id`; items with
  no `id` are left untouched. (Pairs with the backend `pk`-tiebreaker fix that
  removes the server-side cause.)

## [3.8.4] — 2026-07-01

### Fixed
- **Shift-click now range-selects rows in `EntityList` again.** Ticking one row
  then Shift-clicking another is meant to select every row in between, but it
  only toggled the two clicked rows. The selection *anchor* was recorded by a
  bubble-phase `document` click listener in `useTableNav`, while the row
  checkbox's own `onClick` calls `stopPropagation()` (so a tick doesn't also
  open the row). React delegates events at the root container, which sits below
  `document`, so that `stopPropagation` blocked the bubble listener and the
  anchor never updated. The listener now runs in the **capture phase**, so it
  records the anchor before the event reaches the checkbox — keyboard
  Shift+Space range-select and the existing Shift-click-on-row-body path are
  unchanged. (EFFICIENT list range-selection fix.)

## [3.8.3] — 2026-07-01

### Fixed
- **The Start menu now stays above all application windows.** It was pinned at
  `z-[260]`, but normal windows climb past that as more are opened and
  pinned-on-top windows render at `z-index: 999`, so they painted over an open
  Start menu. The desktop menu root is now `z-[1100]` — above the whole window
  stack (its flyouts ride the same stacking context) — while still sitting below
  Exposé / mission-control and the transient overlay tier (toasts, startup,
  logout). (EFFICIENT BG#00259.)

### Fixed
- **Window-thumbnail close (✕) button is now clearly visible over any
  snapshot.** The close button on the taskbar hover preview and mobile app
  switcher (`ThumbCard`) had a 40%-opacity resting background (`bg-black/40`),
  so it faded into light or busy window snapshots and was hard to find until
  hovered. It now uses a more opaque `bg-black/70` with a subtle white ring
  (`ring-1 ring-white/70`) so it reads clearly regardless of the thumbnail
  content, and a fully solid red hover. (EFFICIENT SG#00240.)

## [3.8.1] — 2026-06-28

### Fixed
- **`SearchableSelect` server-search mode no longer client-filters.** When a
  parent wires `onSearchChange` (feeding server-side results for the typed
  text), the option list is now shown verbatim instead of being re-filtered on
  label/sublabel — which previously hid valid matches the server made on other
  fields, making the search look capped. (Brings the shell in line with the
  EFFICIENT admin portal's local copy so it can adopt the shared component.)

## [3.8.0] — 2026-06-28

### Added
- **More shared components promoted from the EFFICIENT portals** (phase 2/3 of
  the consolidation) — app concerns lifted to props so the shell stays
  product-agnostic:
  - `BulkImportGrid` (+ `mergeBulkItems`/`findDuplicateKeys` helpers) — CSV/grid
    bulk-import with column mapping, duplicate review, and optional sum-merge;
    `columns` carry a generic `kind` (`key`/`price`/`qty`/`text`) instead of
    hardcoded part-number fields.
  - `ContainerFillChart` — shipping-container fill visualization; per-unit volume
    is supplied via a `getVolume(item)` callback (no fetching in the shell).
  - `ServerStatusIndicator` — health-poll tray badge + popover; `healthCheck`/
    `healthUrl` and `user` are injected by the host.
  - `ChangePasswordForm` — password form with validation/success screen; the host
    supplies `onSubmit(old, new)` (API + re-login stay app-side).
  - `PdfActionButton` — Preview/Download/Email dropdown built on the Preview app;
    transport-agnostic via a `fetchPdf()` resolver, with an optional `onEmail`.
  - `MilestoneTimeline` (+ generic `Milestone`/`MilestoneKind` types) — date-laid
    timeline; consumers map their domain data to the generic `Milestone` shape.

## [3.7.0] — 2026-06-28

### Added
- **Shared UI primitives promoted from the EFFICIENT portals** (phase 1 of the
  portal-component consolidation), so admin/customer/supplier stop maintaining
  divergent copies:
  - `ColoredBadge` — color-class pill (generic counterpart to `StatusBadge`).
  - `LoadingSpinner` — centered animated ring with `size`/`padding` props
    (distinct from the grids' internal "Loading…" text).
  - `FilterBar` + `useFilters` + `FilterOption` — horizontal filter row with a
    glass searchable dropdown for long option lists.
  - `EmptyState` — empty-list placeholder; superset API accepting both the
    `title`/`description` and `message`/`hint`/`frameless` prop shapes the
    portals previously used, with one unified look.
  - `PageHeader` — page title + muted description + right-aligned actions;
    accepts both `description`/`actions` and `subtitle`/`children` shapes.
  - `SidebarNavItem` + `SidebarGroupLabel` — presentational sidebar building
    blocks (count fetching stays in the consuming app).

## [3.6.1] — 2026-06-27

### Fixed
- **First-run widgets now stack in the top-left corner instead of the centre.**
  A brand-new account (no saved window session) seeds the default desktop
  widgets — Weather, Currency Converter, World Clock — down the left edge,
  mirroring the Widget Manager's placement, rather than letting Modal's
  no-saved-position fallback pile them on top of each other in the middle of the
  screen. Seeding runs through `setWindowDefaultPosition` before the widgets
  mount, so it never disturbs a returning user who has already dragged things
  around.

## [3.6.0] — 2026-06-26

### Added
- **Page templates.** Zero-prop starter screens composed from the primitives and
  charts, exported from the main barrel: `DashboardTemplate`, `DataTablePage`,
  `FormLayoutPage`, `CheckoutTemplate`, `EmailTemplate`, `ChatTemplate`,
  `GalleryTemplate`, `AuthScreen` (login/register/forgot) and `ErrorPage`
  (403/404/500). They use static table/list markup (not the React-Query data
  components) so they render without any provider. Ships authored design-sync
  previews for each (with `config.json` viewport/cardMode overrides), a **Page
  Templates** demo window, and the `.design-sync` conventions/NOTES + README +
  Help Center docs covering all three waves. Additive only.

## [3.5.0] — 2026-06-26

### Added
- **Dependency-free charts.** `Sparkline`, `BarChart` and `DonutChart` — inline
  SVG/CSS with no charting dependency; color follows `currentColor`, so a parent
  `text-*` class themes them (and they sidestep the design-sync compiled-CSS
  constraint entirely). Authored design-sync previews for each, and the **UI
  Primitives** demo window now includes a charts section. Additive only.

## [3.4.0] — 2026-06-26

### Added
- **UI primitives — buttons, form controls, and layout/display components.**
  The kit gains a set of standalone, pre-styled primitives so full application
  screens can be built without dropping to bare HTML: `Button`
  (primary/secondary/ghost/danger, loading + icon slots), the form controls
  `Input`, `Textarea`, `Select` (native — `SearchableSelect` remains the
  searchable/free-text one), `Checkbox`, `Radio`, `FormField` and `Label`, plus
  `Card`/`StatCard`, `Avatar`/`AvatarGroup`, `Banner` (static in-flow alert),
  `Tabs`, `Accordion`, `Tooltip` and `Pagination`. All are controlled the kit
  way (`value`/`onChange`; `Input`/`Textarea` forward native props so
  react-hook-form's `register()` spreads onto them), provider-free, and
  theme-aware (primary buttons and the check/radio fills follow the active
  accent in light and dark mode).
- design-sync previews for every new primitive (all authored cards, not floor
  cards), and a **UI Primitives** demo window in the start menu.

  First of three waves (primitives → charts → page templates). Purely additive
  — no existing exports changed.

## [3.3.2] — 2026-06-26

### Fixed
- **Random / default desktop wallpaper now renders.** `Layout` resolved its
  background-image pool from the `wallpapers` *prop* only, while the
  Customization picker reads the pool from the `DesktopHostProvider`. A consumer
  that registers wallpapers on the host (as the EFFICIENT portals do) but omits
  the prop got an empty pool, so `desktop_bg: 'random'` — which is also the
  default when a user has never picked a wallpaper — collapsed to `'none'` and
  no background drew at all. `Layout` now falls back to `host.wallpapers` when
  the prop is omitted, so the rendered background matches the picker's pool.

## [3.3.1] — 2026-06-26

### Fixed
- **`examples/demo` builds again.** The bundled demo still imported the
  `BugReport*` providers, hooks and the `<BugReportDetail>` viewer that were
  removed from the shell in v3.0.0, so Vite's esbuild dependency scan failed
  with `No matching export in "../../dist/index.js" for import
  "BugReportProvider"` (and four other symbols) — breaking both `npm run dev`
  and `vite build`, and with them the GitHub Pages demo deploy. Dropped the
  dead BugReport surface from the demo: removed the provider wrappers from
  `App.tsx`, deleted the Bug Reports window (and its start-menu / registry
  registration) and its in-memory store, and stripped the `useBugReport` /
  `reportBug` usage from the Status Badges demo (keeping `StatusBadge`). Also
  added `three` to the demo's dependencies so `dxf-viewer`'s `import('three')`
  resolves under a strict `node_modules` (the same fix the EFFICIENT portals
  applied), un-breaking the Preview app's DXF path. Demo-only — the published
  package is unchanged from 3.3.0.

## [3.3.0] — 2026-06-26

### Added
- **Drag a desktop app shortcut onto the taskbar to pin it there.** A page
  shortcut on the desktop can now be dragged over the taskbar and dropped to add
  it to the taskbar strip (`prefs.favorite_pages`) — the taskbar lights up while
  a draggable page hovers over it. Previously the strip could only be populated
  from the host's Favorites settings; the shell offered no add-to-taskbar gesture
  of its own (only a right-click "Remove from Favorites" on existing pins).
  Dropping a shortcut that's already pinned is a no-op, and the icon snaps back
  to its place on the desktop (the drag pins rather than moves it). Implemented
  inside the desktop's existing pointer-drag pipeline, so multi-select drags,
  drop-into-folder and reordering are unaffected; the taskbar is tagged
  `data-taskbar-dropzone` as the hit-test target.

## [3.1.1] — 2026-06-26

### Fixed
- **The DXF Preview "Measure" tool no longer silently breaks in consumers that
  install `dxf-viewer` without a top-level `three`.** The measure overlay needs
  `THREE.Vector3` to project scene coordinates to screen pixels, and the DXF
  path used to reach it via `import('three')`. Under a consumer using pnpm's
  strict `node_modules` — where `three` is only a transitive dependency of
  `dxf-viewer` and isn't resolvable at the top level — that bare import was left
  external and rejected at runtime: `pxFromScene` fell back to `{0,0}`, so the
  measure line and label collapsed to a zero-length segment at the origin
  (invisible, even though the measured value still displayed). The fix drops the
  separate `three` resolution entirely and instead plucks the `Vector3`
  constructor from `dxf-viewer`'s own loaded scene/camera (both `Object3D`-
  derived, so `.position` is a `Vector3` from the bundled THREE) — the same
  scene-pluck trick the 3D model path already uses. `project`/`unproject` only
  read the camera's matrices, so a cross-instance `Vector3` is safe here. DXF
  measuring now works with only `dxf-viewer` installed; `three` is no longer
  required.

## [3.1.0] — 2026-06-23

### Added
- **`DesktopHostConfig.onReportBug`** — an optional callback that, when set,
  restores a **"Suggestion or Bug"** item to the desktop **and** taskbar
  right-click menus and invokes the host's own handler. The shell dropped its
  built-in bug-report dialog in v3.0.0; this lets a consumer that files feedback
  natively surface the familiar right-click entry again without re-introducing
  the shell's dialog. Purely additive — consumers that don't set it are
  unchanged (no menu item shown).

## [2.9.4] — 2026-06-17

### Fixed
- **`autoHeight` windows no longer open as a collapsed sliver on first open
  when their content loads asynchronously.** A detail window whose component
  fetches its own data renders a small spinner first, then swaps in the real,
  taller content. The 2.9.2/2.9.3 measurement froze the window ~140ms after
  the first stable measurement — which, on an uncached first open, was the
  spinner — so the window locked at the `autoMinHeight` floor (~240px) before
  the data arrived; reopening (with the data cached, so full content rendered
  immediately) looked fine. Two changes fix the race:
  - **The freeze is disarmed whenever the content sits at the floor** (a
    loading placeholder, or a brief open-animation transient), evaluated on
    every measure — so an early transient can no longer lock the collapsed
    height. The window freezes only once real content, taller than the floor,
    has settled. Fill-height content reports the ladder height, so it still
    freezes promptly.
  - **The ResizeObserver now tracks the live content root** (re-pointed via a
    MutationObserver when the root element is replaced) rather than the
    fixed-height body, so content that grows after first paint — async rows,
    late images, font swaps — re-triggers measurement instead of being missed.

## [2.9.3] — 2026-06-16

### Fixed
- **The Currency Converter and Stock dashboard widgets hug their content again,
  instead of opening pinned to their full height with empty space below their
  rows.** The [2.9.2] `autoHeight` fix renders the panel at a definite height
  and classifies content as fill-height (keep the ladder height, scroll
  internally) vs naturally-flowing (shrink to hug). Both widgets' roots used
  `h-full` with a `flex-1` inner region, so the new fill-detection read them as
  fill-height and pinned them to their `dimensions` height (320×480 and
  320×360). Those classes were vestigial — a widget has no footer to pin
  against, so nothing needed to fill — and are now removed, leaving plain
  naturally-flowing roots (matching the World Clock and Weather widgets) that
  hug their rows and still grow as rows/data load. The shell's fill-detection is
  unchanged, so the [2.9.2] fix for genuine detail windows is unaffected.

## [2.9.2] — 2026-06-16

### Fixed
- **`autoHeight` windows no longer collapse to a tiny sliver when their content
  fills its container.** The measurement rendered the body content-sized
  (`flex-none`, `height: auto`) on first paint — fine for a naturally-flowing
  form or table, but the common detail-modal layout (a `h-full` root with a
  `flex-1` scroll region between a header and footer) has no intrinsic height, so
  it collapsed to ~0 and the window froze at the `autoMinHeight` floor (~240px).
  Entity detail windows across all three portals opt into `autoHeight`, so they
  opened as clipped, near-empty slivers. The panel now always renders at a
  definite height (seeded from the normal size ladder) and the measurement
  distinguishes content that *fills* its container from content that doesn't: a
  fill-height layout keeps the ladder height (and scrolls internally) instead of
  collapsing, while naturally-flowing content still shrinks to hug its content.

## [2.9.1] — 2026-06-16

### Fixed
- **Start-menu flyout submenus no longer overflow the taskbar or run off the
  bottom of the screen.** A section flyout (e.g. "System") with more items than
  the menu itself is tall was clamped to the *main menu's* bounding box, so when
  it didn't fit it pinned to the top and spilled past the bottom — over the
  taskbar and below the viewport, making the lowest items unreachable. Flyouts
  (and 3rd-level sub-flyouts) now clamp into the usable viewport span — the
  screen minus the taskbar edge and an 8px gutter — and, when a section still
  has more items than fit above the taskbar, cap at that height and scroll
  instead of overflowing.
- **System Preferences sidebar items now match the rest of the shell's sidebar
  style.** The Preferences section list (`SystemPreferences`) rendered each item
  as a square, edge-to-edge highlight, so the active row was a flush rectangle
  unlike the rounded, inset pills the OS-shell sidebar uses everywhere else.
  Items are now `rounded-lg` with a small horizontal inset (`px-1`), so the
  active row reads as a pill consistent with `Sidebar.tsx`.

## [2.9.0] — 2026-06-14

### Changed
- **`toast.info` now renders a brief top-center toast, not the persistent
  notification card.** Every `toast.info` call site was using it for transient
  "nothing happened / no match" feedback, but the card lingered top-right for
  10s with a bell + "NOTIFICATION" header — far heavier than the message. `info`
  now joins `success`/`error` as a brief auto-dismissing toast (neutral blue
  info icon, ~4.5s — a touch longer than success/error since info messages tend
  to be a full sentence). Toasts also wrap long messages now instead of forcing
  a single nowrap line.

### Added
- **`toast.notify(message, opts?)`** — the persistent top-right notification
  card (the old `toast.info` presentation), kept for the rare alert that's worth
  lingering on. Reach for it deliberately; default to `toast.info`/`success`/`error`.

## [2.8.1] — 2026-06-13

### Fixed
- **Theme switching no longer waits on the prefs save round-trip.** Picking a theme/accent/custom color in Customization now stamps `data-theme` + the `--accent-*`/custom-color CSS vars onto `<html>` synchronously on click, then persists through `save()` in the background — so the desktop repaints on the same frame. Previously the repaint was gated on `prefs` reflecting the new value, which on a backend-backed adapter (the admin/supplier portals PATCH `/auth/me/` then refetch) could lag by the full server round-trip — sometimes tens of seconds — leaving the user staring at the old theme. The picker's own selected-ring + live preview are mirrored locally too, so they update instantly rather than after the save settles. `useTheme()` still reconciles from `prefs` for first paint and cross-tab/system changes; the new imperative path is exported as `applyThemePrefs`.

## [2.8.0] — 2026-06-13

### Added
- **`themes.css` — the per-theme accent variants now ship with the package.** The pink / green / grey / blue accent + surface-tint remaps and the `data-custom-accent` custom-accent remaps (previously maintained only inside the admin portal's `index.css`) now live in the package as `themes.css`. `styles.css` imports it, so every consumer of `import 'react-os-shell/styles.css'` gets the full theme set with no extra wiring; it is also exported standalone as `react-os-shell/themes.css`. Fixes pink/green/grey/blue/custom-accent being half-applied (window tints only, no accent remap) in the customer and supplier portals.
- **Extended dark-mode tint families in `styles.css`.** Upstreamed the admin portal's 2026-06-10 dark-mode audit: red / amber / yellow / green / emerald / orange / sky / teal / cyan / purple / violet / pink / rose `-50`/`-100`/`-200` surfaces and `-600…-900` inks, blue interaction gaps (`active:`, alpha-ladder hovers, `border-blue-*`, `file:` selector buttons), gray interaction-state variants (`hover:`/`active:`/`disabled:`/`even:`), `bg-white/85` + `hover:bg-white` panel surfaces, solid `text-black` ink remaps, and the sticky-note `text-black/15` ghost ink. Portals no longer need any local dark-mode rules — deleting their forks is the point of this release.

### Changed
- Hover/active steps in the upstreamed blue family were rescaled to sit one ladder step above the package's resting tints where the admin fork had diverged (`bg-blue-50` dark base is 0.26 here vs the fork's 0.18 — actives/`file:` buttons follow the 0.26 ladder).

### Fixed
- **Sidebar: no stray divider when the top nav group is empty.** The divider between top-level items and the ERP sections rendered unconditionally, so a nav config with every top-group entry in the footer group (the EFFICIENT portals) showed a stray rule collapsed against the search box. It now requires content on both sides, mirroring the StartMenu condition fixed in 0.7.4 — portals can drop their CSS workaround.

## [2.7.0] — 2026-06-12

### Added
- **Pinned favorites on the taskbar.** Every app the user has favorited (the star on list-page titles → `prefs.favorite_pages`) now shows as an icon launcher right next to the start-menu button — click to open the app, right-click for Open / Remove from Favorites. Works on all four taskbar positions (icons wrap into rows on vertical taskbars); hidden in sidebar layout mode, where the sidebar replaces the start-menu role.
- **"Add to Desktop" in every window menu.** The window menu (window icon click, or right-click on a taskbar tab) now always offers Add to / Remove from Desktop for app windows — including detail windows that render their own Modal (`rendersOwnModal`), which previously had no such item. The shortcut lands on the desktop as an icon, exactly like ones created from the document fav star.

### Changed
- **Desktop-shortcut toggles now persist through the ShellPrefs adapter** instead of PATCHing `/auth/me/` directly — so "Add to Desktop" also works for backend-less consumers (e.g. the demo's localStorage prefs). EFFICIENT portals are unaffected: their prefs adapter writes to the same `/auth/me/` preferences.

## [2.6.0] — 2026-06-12

### Changed
- **The desktop "Documents" folder is now "Recent Documents" — and a permanent system folder.** Like the Trash, it is a fixture of every desktop: it exists from first load (previously it only appeared after the first file preview) and it cannot be deleted or renamed — its context menu offers only Open. Previewed files keep dropping their shortcuts into it, and it still opens in the Files app. Existing desktops migrate automatically: a stored "Documents" folder keeps its position and contents but takes the new canonical name.

## [2.5.0] — 2026-06-11

### Added
- **DXF Preview: AutoCAD-style command bar.** A command line sits at the bottom of the DXF panel — type anywhere over the drawing and the keystrokes route into it, AutoCAD-style. Space or Enter executes; Enter on an empty line repeats the last command; Esc cancels the input, then the measure tool. Commands: `DI`/`DIST` (straight-line distance), `DIM`/`DLI`/`DIMLINEAR` (linear dimension), `H`/`V` (force the axis without losing picks), `AUTO`, a bare number (lock the H/V Δ, same as the fixed-distance input), `U` (undo last pick), `Z`/`ZOOM`/`FIT` (zoom extents), `LA`/`LAYERS` (layer panel), `?` (help). Familiar drawing/editing commands (`L`, `EX`, `TR`, `CO`, …) answer with a "Preview is a read-only viewer" hint instead of a generic error. Results echo above the input — `DIST` prints the AutoCAD-style `Distance = … ΔX = … ΔY = …` breakdown. (Preview app → 1.2.0.)
- **DXF Preview: Auto (DIMLINEAR) measure mode.** New default mode in the measure pill — like AutoCAD's DIMLINEAR it measures ΔX or ΔY, whichever delta between the two picks is larger. Both dashed axis guides show after the first pick until the second resolves the axis; H/V still force it. The toolbar chip arrow follows the resolved axis.
- **DXF Preview: midpoint and node snaps.** The cursor now also snaps to segment midpoints (triangle glyph) and POINT entities (circle-with-X glyph), alongside the existing endpoint / intersection / nearest-on-line snaps.
- **`registerModalEscapeInterceptor(fn)`** — window content can claim an Escape press before the shell's Esc-closes-the-topmost-window handler acts on it (return `true` to consume; interceptors must verify they belong to the active modal via `getActiveModalId()`). The DXF Preview uses it for the AutoCAD Esc cascade: first Esc clears the command input, the next exits the measure tool, and only a further Esc closes the window.
- **Kanban: per-column "+ Add item" button.** Pass the new `onAddItem(toColumn)` prop and each column grows an add button at its foot, revealed on column hover (or keyboard focus) and hidden otherwise — it always reserves its row so revealing it never shifts the layout. The label is customisable via `addItemText` (default "Add item"). Backward-compatible: columns render exactly as before when `onAddItem` is omitted.

### Fixed
- **DXF Preview: snapping was broken on real drawings — phantom snap points in empty space, "NaN mm" labels, and almost no snaps on actual geometry.** The snap cache walked dxf-viewer's vertex buffers as 3-component XYZ triplets, but dxf-viewer packs **2-component XY** pairs — every cached segment paired one vertex's Y with the next vertex's X, and the stride-6 loop read past the end of the buffer (the NaN). The walk also ignored index buffers (`INDEXED_LINES` — any polyline over 3 vertices) and per-instance INSERT transforms, which dxf-viewer applies in the vertex shader rather than `matrixWorld` — so block geometry snapped at its definition coordinates instead of where it's actually drawn. The cache now reads positions through the BufferAttribute API, follows the index buffer, bakes instance transforms (full 2×3 affine and point-translation forms) into world coords, filters non-finite values, and skips layers that are hidden when the measure session starts.
- **DXF Preview: endpoint snaps were nearly impossible to hit while hovering the segment itself.** "Nearest-on-line" always won the closest-distance contest (the cursor's projection onto a hovered line is by definition closer than the line's endpoint), so the endpoint glyph only appeared beyond the segment's end. Snap types are now tiered AutoCAD-style: intersection and endpoint/node co-rank (closest wins), then midpoint, then nearest-on-line.
- **Measure labels show two decimals (`18.56 mm`).** Values ≥ 10 mm were rounded to one decimal (`18.6 mm`), losing real precision against AutoCAD's dimension readout. Applies to the DXF and 3D measure tools.

## [2.4.0] — 2026-06-11

### Added
- **Preview: PDF text is now selectable.** PDF pages carry a pdf.js text layer — transparent text positioned over the rendered canvas — so you can drag-select and copy text like in a native PDF reader, at any zoom level and on any page. Scanned/image-only PDFs have no embedded text and so nothing to select. (Preview app → 1.1.0. Listed under 2.3.0 at first, but 2.3.0 was published from a build that predated the feature — it actually ships here.)

## [2.3.0] — 2026-06-11

### Added
- **`3xl` window size** — a 1408 px preset above `2xl` (1152 px), for dashboards and side-by-side editors that want more room without maximizing. Accepted everywhere `size` is: registry entries and `<Modal>` directly.
- **`PopupMenu` `portal` prop.** Menus opened from *inside* a window were invisible: the window panel is a transformed, backdrop-filtered, `overflow-hidden` container, which re-anchors `position: fixed` descendants to itself and clips them. `portal` renders the menu into `document.body` so viewport coordinates work as written. Default off — existing call sites are unchanged.

### Changed
- **Demo start menu restructured.** The component showcases now lead the menu as flat top-level rows (List, Grid, Kanban, Form Controls, Window Styles, Sidebar, Top Nav, Breadcrumbs, Status Badges, and a new Keyboard Shortcuts entry that pops the `?` overlay), followed by Preferences with Help Center beneath it, and the bundled apps (Spreadsheets, Notepad, Documents, Preview, Files, Browser) tucked into the Utilities tray.
- **Demo Window Styles:** added a **Giant (`3xl`)** card, and the widget example now paints its own frosted-glass background — widget windows are a transparent canvas by design (Weather, Calculator bring their own), so the unstyled demo body was unreadable over other windows.

### Fixed
- **Demo: the Form Controls "Open menu…" button did nothing** — the menu rendered clipped inside the window panel. It now uses the new `portal` prop.

## [2.2.0] — 2026-06-11

### Added
- **`WindowErrorBoundary` + `WindowCrashedFallback`** exported for consumers who render window-like surfaces of their own outside the shell's window manager (see Fixed below for what the shell now does with them).
- **Demo: Window Styles page.** Components ▸ Window Styles opens a launcher with one live window per chrome variant — standard, full-size (`2xl`), compact title bar, widget (no title bar, body-drag, no taskbar tab), app-style (zero padding, for self-chromed apps), flush body (standard chrome, edge-to-edge two-pane content), auto-height, and pin-on-top — each card listing the registry flags that produce it.

### Fixed
- **A crashing window no longer takes down the whole desktop.** A page or entity component that threw during render propagated to the root with no error boundary in between, unmounting the entire shell to a blank screen (observed live in a portal: a settings page choking on malformed data). Window content now renders inside an error boundary: the crashed window shows an inline "This window crashed" state with the error message and a **Reload window** button that remounts the content, its title bar — including close — keeps working, and the desktop, taskbar and every other window are unaffected. A second boundary around each open window catches crashes outside the body (e.g. a registry `title()` throwing on bad data, or a `rendersOwnModal` component dying before its window mounts) and replaces that window with a plain one carrying the same crash state.
- **Trash now moves with a group selection.** Rubber-band or shift-select the Trash together with other icons and dragging any of them moves the whole selection — previously everything else moved and the Trash stayed behind. Grabbing the Trash itself while it's part of a selection drags the group too; on its own it still moves individually. (The Trash stays bottom-anchored and exempt from snap-to-grid, as before.)

## [2.1.0] — 2026-06-11

### Added
- **`SearchableSelect`** — combobox-style form control, promoted from the EFFICIENT admin portal where it fronts every entity picker. Renders as a normal form input; focusing it turns it into a filter box over the supplied options (label + optional right-aligned `sublabel`, both searchable), with a frosted-glass dropdown that follows every color theme, viewport-aware left/right anchoring, Enter-picks-a-unique-match, Escape-to-close, a hover-revealed × to clear, duplicate-option dedupe, and a disabled state. Options: `allowFreeText` (Enter/blur commits typed text not in the list), `onSearchChange` (feed a debounced server-side query and keep streaming results through `options`), and `rightAdornment` (e.g. a `StatusBadge` riding inside the field's right edge, hidden while typing). Exported with `SearchableOption` / `SearchableSelectProps` types.
- **Demo: Form Controls page.** New Components ▸ Form Controls window showing five `SearchableSelect` variants (basic, sublabels + status-pill adornment, free text, debounced async search over a fake 250-row server, disabled) plus a button-triggered `PopupMenu` example (labels, items, divider, danger item).

## [2.0.1] — 2026-06-11

### Fixed
- **Hover-revealed actions inside windows showed all at once.** The window/widget frame carried a bare Tailwind `group` class (unused by the shell itself), so any `group-hover:` utility in app content — note actions, row delete buttons, etc. — activated as soon as the cursor entered the window instead of when hovering the individual item. The frame no longer declares a hover group; per-item `group`/`group-hover:` pairs in app content now behave as written.

## [2.0.0] — 2026-06-10

### Removed
- **BREAKING: all bundled games removed.** Chess, Checkers, Sudoku, Tetris, 2048 and Minesweeper are gone — their app sources, their `/chess` … `/minesweeper` registry routes (no longer part of `bundledApps`), the `gameApps` subset export, the per-game lazy component exports (`Chess`, `Checkers`, `Sudoku`, `Tetris`, `Game2048`, `Minesweeper`), and the internal game-score analytics module that backed the Minesweeper leaderboard. `bundledApps` now contains the 8 utility, 3 document and 1 web app. **Migration:** drop any `gameApps` import/spread and any game routes from nav config; everything else is unchanged.

## [1.6.0] — 2026-06-10

### Added
- **Documents: letter-size page.** Word-style documents (including the blank document the app opens with) now render on a US-letter page — 8.5 × 11 in with 1-in margins, centered on a gray desk that scrolls when the window is narrower than the page — instead of a content-height box. The page grows past 11 in as content does (Documents app → 1.1.0).
- **Documents: images.** Insert via the new toolbar **Image** button, paste from the clipboard, or drag-drop image files onto the window (non-image files still open as documents). Images embed as data URLs so saved files stay self-contained, never overflow the page, and clicking one opens a menu with width presets (25 / 50 / 75 / 100% / original) and **Remove image**. Images inside imported .docx files render too (mammoth embeds them the same way).
- **Documents: text alignment.** Align left / center / right and justify toolbar buttons.

### Fixed
- **Documents: list buttons produced invisible lists.** The bulleted / numbered list commands created proper `<ul>`/`<ol>` markup, but Tailwind's preflight strips list markers, so they rendered as plain lines. The editor now ships its own content styles (markers, indentation, paragraph spacing) in `styles.css`.

## [1.5.0] — 2026-06-10

### Added
- **Desktop folders open in the Files app.** Double-clicking a desktop folder (or its right-click **Open**) now opens the Files app on that folder instead of the old standalone manila folder window. Files gained a **Desktop** sidebar section listing every desktop folder with its item count; the folder view lists the shortcuts with name, type tag and per-row **Open** / **Move to desktop** / **Remove** actions, and double-click opens the shortcut exactly like the desktop icon does (Files app → 1.1.0). Folder contents update live while the window is open. Drop-to-upload is disabled in this view — desktop folders are virtual shortcut collections, not server directories.
- **Trash icon is selectable.** The desktop Trash now participates in selection like every other icon: click selects it, shift / cmd / ctrl toggles it within a multi-selection, and the rubber-band lasso picks it up too.

### Changed
- **Unified desktop icon styling.** Page/app shortcuts no longer render as bare white outline glyphs — each now sits on a colored gradient tile (iOS-style, white glyph), using the same per-route gradient hash as the mobile home grid so an app keeps its color across surfaces. Desktop folder icons switched from the white outline folder to the solid amber folder glyph the Files app uses, so folders read as the same object everywhere.

### Removed
- **Standalone folder window.** The manila-paper folder modal (free icon positioning, drag-out-to-desktop) is gone in favor of the Files-app folder view; persisted `folderX` / `folderY` fields are still parsed but no longer used. Moving items out of a folder is now the **Move to desktop** action in Files.

### Fixed
- **Files could ignore the requested view in dev/StrictMode.** Opening Files via the Trash icon (and now desktop folders) while no Files window is open consumed the pending-view flag inside the `useState` initializer, which React StrictMode double-invokes — the second invocation read an already-cleared flag and landed on "My files". The initializer now peeks without clearing; the flag is cleared once after mount. Production builds were unaffected.

## [1.4.0] — 2026-06-10

### Added
- **Taskbar clock: host-rendered day panel.** New optional `Layout` prop `clockCalendar` (`ClockCalendarConfig`, exported). With `renderDay` set, the clock popover's mini month grid becomes interactive: opening the popover selects today and renders the host's panel for it below the grid (e.g. tasks due that day); clicking any day re-renders the panel for that day (days spilled from the previous/next month also flip the grid there). `markedDates` (local `YYYY-MM-DD`) draws a dot under days that have items. Selection carries the accent fill; an unselected today shows as an accent-coloured number. The popover widens 260 → 300 px in interactive mode; the panel is capped at 280 px and scrolls. Without the prop the popover is unchanged.

### Added
- **Spreadsheets: Email button for staged previews.** `SpreadsheetPreviewData` accepts an optional `onEmail(csv, filename)` callback; when provided (e.g. by a consumer's CSV-export flow), the toolbar shows an **Email** button next to Save CSV that serializes the sheet *at click time* — current edits included — and hands the CSV text plus a filename derived from the window title back to the consumer (Spreadsheets app → 1.1.0).

### Fixed
- **Dark mode: selected grid cells were unreadable.** The spreadsheet grid's selection styling uses Tailwind's `!` important utilities (`!bg-blue-50`, `!bg-blue-100`, `!bg-blue-200`, `!text-gray-700`), which compile to their own class names (`.\!bg-blue-100` …) and so escaped the dark-theme remaps — selected cells and row/column headers kept their light-mode background while the cell text went light. Added explicit dark overrides for the bang variants.

## [1.2.0] — 2026-06-10

### Added
- **About dialogs for the document & web apps.** Spreadsheets, Notepad, Documents, Preview, Files and Browser gained an "About <App>" item in the window title menu (the icon menu next to Minimize / Maximize / Add to Desktop). The dialog shows the app's icon, name, **its own app version** — each app is now versioned independently of the package, so app-level changes are easier to track — a one-line description, and a "Part of the react-os-shell desktop environment" attribution with the shell version. All six apps start at app version 1.0.0.
- **`BUILTIN_APP_INFO`** (from `react-os-shell/apps`) — the per-app metadata registry behind the About dialogs (`{ name, version, description, route }` keyed by app id), exported so consumers can read app versions programmatically. Types `BuiltinAppId` / `BuiltinAppInfo` ship alongside.

## [1.1.2] — 2026-06-10

### Added
- **`setBrowserStartUrl(url)`** (from `react-os-shell/apps`) — stage a URL for the next Browser window mount, pairing with `openPage('/browser')`. Lets consumers route external links (e.g. links inside an email body) into the built-in Browser. Uses the same discard-safe peek/claim staging as Spreadsheet/Preview.

### Fixed
- **Spreadsheet / Preview staged content lost on first open.** `setSpreadsheetPreview` / `setPdfPreview` followed by opening the app could produce an empty "Untitled" window in production builds: both components drained the staged payload **during the render phase**, and under React 18 concurrent rendering the first render pass of a lazy component (suspending on its chunk) can be discarded and replayed — the discarded pass swallowed the payload. The render phase now only *peeks* at the stage; it is claimed (cleared) in the mount effect, so discarded render passes no longer lose content. Affected every consumer flow that stages-then-opens (CSV export preview, email attachment open, PDF preview) when the app chunk wasn't already loaded.
- **Dark mode: pale translucent panels stayed light.** The `bg-gray-50/50`, `bg-gray-50/60` and `bg-blue-50/30..60` alpha utilities had no `[data-theme="dark"]` override (the bare-class overrides don't match alpha variants), so surfaces built on them — e.g. a consumer app's sidebar — rendered as a washed-out light panel on dark windows. Added explicit dark equivalents alongside the existing `/40` overrides.
- **Taskbar tab preview with the taskbar on top**: the popover hangs *below* the tab there, so the window snapshot now sits closest to the tab and the title moves beneath the snapshot. Every other taskbar position keeps the title above, as before.

## [1.0.0] — 2026-06-09

First stable release. The window manager, start menu, theming, data primitives
(`EntityList`, `Kanban`), layout primitives (`SidebarLayout`, `TopNav`,
`Breadcrumbs`) and bundled apps are considered mature.

### Changed
- **The settings menu now reads "Preferences"** (desktop right-click, profile menu, mobile sheet) and opens the sectioned `SystemPreferences` window. The `Customization` component is unchanged and still exported (it renders as the Appearance / Layout / Behavior sections inside Preferences).
- **Dark-mode contrast fixed.** Bare `bg-*-100` / `text-*-700` utilities (status pills, badges, avatars, dialog icons, menu selection) had no dark override and rendered light-on-light; they now mute the background and lighten the text, and the selected-item highlight is more legible on dark glass.
- **Files** gained a folder sidebar (`SidebarLayout`) and a `Breadcrumbs` path bar, and can browse an in-memory demo filesystem (see `setFilesDemoTree`) with no file server — real-server behaviour is unchanged when no demo tree is injected.
- **Notepad** now uses `SidebarLayout` (a resizable, width-persisted notes rail).
- **Stocks** ships static demo data — no API key or server required.

### Added
- `setFilesDemoTree(tree)` + the `FilesDemoNode` type (from `react-os-shell/apps`) — inject a static filesystem so the Files app browses in-memory.

### Removed
- The bundled **Todo List** app (`/todo`). The shared task store (`_todoStore` / `_todoTypes`, used by the Pomodoro widget) and the `setShellTodoProvider` API are retained.

## [0.14.0] — 2026-06-09

### Added
- **`<TopNav>` — horizontal tab-style navigation bar.** A controlled top-nav primitive with an optional `brand` slot (left) and `actions` slot (right, pinned to the far edge). Tabs accept an `icon`, a `badge` (e.g. a count) and a `disabled` state; the active tab gets an accent underline. Self-contained, themed via the shell's Tailwind utilities.
- **`<Breadcrumbs>` — path/trail navigation.** An ordered crumb trail (root → current). Every crumb except the last renders as a button when given an `onClick`; the last is rendered inert as the current location (`aria-current="page"`). A `maxItems` prop collapses the middle of a long trail into an ellipsis, and the `separator` is customisable (chevron by default).
- **`Customization` can render a single section.** New `section` prop (`'appearance' | 'layout' | 'behavior'`) renders just one logical group — Appearance (theme, wallpaper, transparency), Layout (layout mode, taskbar, menu) or Behavior (windows, desktop, sounds) — so the page can be split across separate `SystemPreferences` entries. Omitting `section` renders the whole page exactly as before (backward compatible). Exposes the `CustomizationSection` type.

### Demo
- New **Components** entries: **List** (`EntityList`), **Top Nav** (`TopNav`), **Breadcrumbs** (`Breadcrumbs`) and **Preferences** (a `SystemPreferences` window hosting the split `Customization`), alongside the existing Kanban and Sidebar demos.

## [0.13.2] — 2026-06-09

### Fixed
- **Same-column downward reorder is no longer dropped.** Dragging a Kanban card *down* onto its neighbour set the insertion point to that neighbour's own index ("before the neighbour"), which equals the card's current slot — so the reorder was treated as a no-op and discarded. `dragenter` is now direction-aware: dragging downward targets *after* the hovered card, dragging upward targets *before* it.

## [0.13.1] — 2026-06-09

### Fixed
- **Kanban cards no longer snap back before landing on drop.** Dropping a card showed a two-stage animation — the native drag-image flew back to the card's original slot, then the card jumped to its new position — making a clean reorder feel like a swap or a return. This is the browser's "cancelled drag" fly-back, a separate artifact from the v0.13.0 drop-settle animation (which only animates the *real* cards once the order changes). The board's drop target now explicitly accepts the drag as a *move* (`dropEffect = 'move'` on `dragover`) and prevents the default drop action (`preventDefault` on `drop`), so the browser ends the drag at the drop point and only the drop-settle slide plays — one smooth motion.

## [0.13.0] — 2026-06-09

### Added
- **Kanban drop-settle (FLIP) animation.** When a card's column or order changes, the board now slides each affected card from its old position to its new one (200ms) instead of snapping — the dropped card and the cards making room for it animate into place. Implemented with a FLIP pass (`getBoundingClientRect` invert-then-play) in a layout effect, keyed on grouping/drag changes so search and typing don't thrash layout, and skipped while a drag is in progress.

## [0.12.1] — 2026-06-08

### Fixed
- **iOS no longer zooms in when focusing an input in mobile mode.** Touch/phone viewports now pin text-bearing form controls (`input`, `select`, `textarea`) to a 16px font-size — the threshold below which iOS Safari auto-zooms the page on focus. Scoped to the same breakpoint as the mobile shell (`max-width: 767px` / `pointer: coarse`) and keeps pinch-to-zoom working (no `maximum-scale` viewport lock).

## [0.8.0] — 2026-06-07

### Removed
- **Email + Calendar apps and the Node mail bridge.** The bundled `Email` (IMAP/SMTP) and `Calendar` (CalDAV) apps, the `MailConnectModal`, the `useMailAuth` / `useEmailUnreadCount` hooks, the `setShellMailServer` setter, the `mailApps` registry subset, and the entire `server/` bridge are gone. `bundledApps` no longer includes `/email` or `/calendar`, and the taskbar Mail & Calendar connect button is removed. Consumers needing mail implement it in their own app (the EFFICIENT admin portal now does this against its Django backend). **Breaking** — bumped to 0.8.0.

## [0.7.3] — 2026-06-07

### Added
- **Stocks widget.** New desktop widget (`/stock`, registered in `utilityApps` with `widget: true`) for tracking a watchlist of equities — each row shows the ticker, last price, and the day's change as a colour-coded absolute/percent delta. Right-click → **Settings** manages the watchlist (add/remove symbols, capped at 8) and the shared appearance sliders; the list, the API key, and the appearance all persist to `localStorage`. Quotes come from Finnhub's browser-friendly `/quote` endpoint, polled once a minute with a 1-minute cache that keeps the last good value on a failed refresh. Because there is no reliable keyless + CORS stock feed, the user pastes a free Finnhub key in settings — until then the widget shows a "Track live stock prices → Set up" call-to-action. Like the other bundled widgets it's added/removed from the Widget Manager and is filtered out of the Start Menu.

## [0.7.2] — 2026-06-06

### Added
- **Dev-environment indicator, shared.** New `DevIndicator` system-tray badge (drop into a host's `taskbarTrayLeft`) plus `isDevEnv()` / `applyDevTitle()` helpers, so consumer apps no longer each maintain their own copy. The badge renders only when served from `localhost`/`127.0.0.1` (a developer's machine) and is `null` everywhere else; `applyDevTitle({ faviconHref? })` prefixes the tab title with `[DEV]` (and optionally swaps the favicon) on the same hosts, idempotently. Nothing is auto-injected into `Layout` — a consumer opts in by rendering `<DevIndicator/>` and calling `applyDevTitle()` in `main.tsx`.

## [0.7.1] — 2026-06-06

### Fixed
- **Widgets are now content-aware in height.** `autoHeight` windows measured their height once on first paint, which (a) caught the lazy/Suspense body or a mid-animation frame and (b) was immediately clobbered by the "restore saved position" effect re-applying the stale/seeded height — so widgets opened at their full `dimensions[1]` with dead space below (e.g. the Currency widget showed four rows in a 480 px panel). `autoHeight` now tracks the panel with a ResizeObserver: widgets stay content-sized for their whole life (a World Clock grows as each city's weather loads or when you add a city; Currency/Weather hug their content), while non-widget `autoHeight` dialogs measure-then-freeze once stable. The reset-on-open effect no longer overwrites a measured height.
- **Elastic widgets keep their designed size.** Calculator and Pomodoro deliberately fill a fixed height (keypad grid / timer column), so content-measuring squashed them. They no longer set `autoHeight` and render at their `dimensions` again. World Clock dropped an `h-full` wrapper so it sizes to its city rows.

### Added
- **Widget Manager places new widgets tidily.** Adding a widget now drops it into the top-left corner and stacks it below existing widgets (reading their live on-screen rects) so it never covers one, wrapping to a new column when a column fills and never running off-screen. **Add all** lays the set out column-by-column. New `setWindowPosition(key, box)` / `getWindowPosition(key)` exports back this (companions to `setWindowDefaultPosition`).

## [0.7.0] — 2026-06-06

### Added
- **Widget manager — add/remove desktop widgets from one place.** New `WidgetManager` panel (right-click the desktop → **Manage Widgets…**) lists every widget-flagged page in the live window registry (the bundled Calculator, Currency Converter, Pomodoro Timer, Weather, and World Clock, plus anything a consumer registers with `widget: true`), shows which are currently on the desktop, and lets you toggle each on/off — with **Add all** / **Remove all** and a live "N of M on your desktop" count. It drives the same plumbing the Start Menu already uses (`openPage` to drop a widget on the desktop, `closeEntity` to remove it), so there's no new persistence layer — widgets still restore via the open-windows session store and keep their dragged positions. Each card uses the consumer's per-route `navIcon` (falling back to a generic widget glyph) and is keyboard/pointer toggleable; the active checkmark turns into a "×" on hover to signal removal. Exported from the package root so a consumer can also register it as a window or wire it to a taskbar tray button.

### Removed
- **Notifications row dropped from the Start Menu and Sidebar.** The `/notifications` launcher row no longer renders in either nav surface — the system-tray notification bell remains the entry point. Both `StartMenu` layouts (horizontal and vertical) and the `Sidebar` are affected; consumers that relied on the menu row should point users at the tray bell (or add their own nav item).

## [0.6.9] — 2026-06-06

### Fixed
- **Level-3 start-menu flyout opens on the first hover.** A pair of post-paint `useEffect` resets (`setMeasuredFlyoutH(null)` keyed on `hoveredSection` / `hoveredChild`) were undoing the measurement that the `useLayoutEffect` had just captured — so the level-2 flyout rendered correctly, painted, then bounced through one extra render at the estimated position before settling. That intermediate paint shifted items vertically right when the user was moving onto an item-with-children, so the `onMouseEnter` for the child never registered. The measurement now tracks the target it was taken for (`{ key, h }`), so a stale value from a previous section/child naturally falls back to the estimate without needing a reset. One frame of estimate, then a clean transition to measured — no bounce.

## [0.6.8] — 2026-06-06

### Fixed
- **Start-menu flyout no longer needs a scrollbar.** 0.6.3 capped the flyout to `maxHeight: menuBottom - flyoutTop` with `overflow-y: auto`, but when the height estimate underestimated the real content (dividers, wrapping labels) the cap kicked in and a scrollbar appeared even though the flyout would have fit if positioned a few pixels higher. The flyout now renders at its intrinsic height and a `useLayoutEffect` captures the real `offsetHeight` after layout — the next paint repositions the flyout using that measured value, so it shifts up to fit fully inside the main menu's bounds without ever clipping. Applies to both the level-2 section flyout and the level-3 child flyout.

## [0.6.3] — 2026-06-01

### Fixed
- **Start-menu flyout no longer overlaps the taskbar.** The flyout's vertical clamp now reads the live `getBoundingClientRect()` of the main menu (rather than viewport ± taskbar height), so the flyout stays strictly within the main menu's top/bottom edges instead of drifting a few px past them onto the taskbar. Both the level-2 section flyout and the level-3 child flyout also get a `maxHeight` matching the available space + `overflow-y: auto`, so very tall lists (or items with wrapping labels) scroll inside the flyout instead of bleeding past the menu bottom.

## [0.6.2] — 2026-06-01

### Fixed
- **Taskbar start button centers its label.** The start button (product icon + name) now centers its contents within the button instead of left-aligning them, so a short product name no longer sits flush-left with empty space to its right. Applies in both the horizontal taskbar (fixed `min-w-[140px]`) and the vertical taskbar (`w-full`).

## [0.6.1] — 2026-05-30

### Added
- **`footerItems` start-menu category.** `StartMenuCategories` gains an optional `footerItems?: NavItem[]` to complement `footer`. Where `footer` lists section labels (rendered as hover flyouts), `footerItems` lists flat clickable rows — pinned next to the user profile and separated from the ERP group by a divider in both `StartMenu` and `Sidebar`. Use for single-destination entries like System Preferences or a bug-report link that don't need their own section. Items honour the same `perms` filter as the rest of the nav and remain searchable.

## [0.6.0] — 2026-05-29

### Added
- **`footer` start-menu category.** `StartMenuCategories` gains an optional `footer?: string[]`. Section labels listed there render pinned next to the user profile — below the ERP group in `StartMenu`, and at the end of the body in `Sidebar` — separated from the rest by a divider. Lets consumers park a "Help & Feedback"-style section at the very bottom of the menu instead of mixing it into the system group. Footer sections render non-bold (like system sections), keep their hover flyout in `StartMenu`, and remain searchable. Consumers that don't set `footer` are unaffected.

## [0.5.0] — 2026-05-28

### Added
- **3rd-level nav items.** `NavItem` gains an optional `children?: NavItem[]` field, so any item inside a section can carry its own sub-menu. In `StartMenu`, hovering a parent in the section flyout opens a second flyout to the right (chevron on the parent, same animation + clamping as the section flyout). In `Sidebar`, the parent expands inline as a nested accordion with one extra level of indent. Search (desktop start-menu, mobile start sheet, and sidebar) walks the full tree so nested entries stay discoverable. Mobile home folders keep their one-level grid by design — nested items are reachable from the mobile start sheet's flat list.

## [0.4.0] — 2026-05-27

### Added
- **`SystemPreferences` component — generic two-pane settings window.** A reusable container with a sidebar of consumer-provided sections on the left and the active section's body on the right. Each entry carries `{ key, label, description?, icon?, render }`, so portals can compose preferences pages by mixing shell-provided panels with their own (notification subscriptions, delivery defaults, formatting prefs, etc.). Exports `SystemPreferences`, `SystemPreferencesProps`, and `SystemPreferencesSection`.
- **`BehaviorPanel` — pulled out of `Customization` as a standalone export.** Renders the window-position / double-click-desktop / default-window-size / show-version-on-desktop / auto-enter-fullscreen controls. Reads and writes shell prefs via `useShellPrefs` so it can be dropped into any `SystemPreferences` sidebar entry.
- **`SoundsPanel` — sound effects toggle + per-event pack picker.** Was previously a private `SoundSettings` function inside Customization; now a public export with preview-on-pick behaviour.

### Changed
- **`Customization` accepts an `omit` prop.** `omit?: readonly ('behavior' | 'desktop')[]` hides the corresponding inline sections so consumers who surface them elsewhere (typically as separate `SystemPreferences` sidebar entries) don't render duplicate UI. Existing callers that don't pass the prop are unaffected. Exports `CustomizationProps` and `CustomizationOmitSection`.

## [0.3.22] — 2026-05-23

### Changed
- **DXF Preview measure tool: AutoCAD-style per-type snap glyphs and a wider snap zone.** The single orange diamond is replaced with three type-specific markers — a hollow **square** for endpoint, an **X** for intersection, and a **bowtie/hourglass** for nearest-on-line. The snap radius bumps from 12 px to 18 px so picks "stick" earlier and the cursor doesn't have to land exactly on a feature to snap. Priority is unchanged: intersection > endpoint > line, all within the wider tolerance.

## [0.3.21] — 2026-05-23

### Fixed
- **DXF Preview measure tool: snap lag on dense drawings.** 0.3.20's intersection-snap pass was calling `pxFromScene` (Vector3 + matrix-multiply) for every candidate pair, which added ~k² projections per mouse move and stalled the cursor on busy drawings. The pairwise check now runs entirely in screen space against the projected endpoints we'd already computed for the per-segment endpoint/line snap, and recovers the scene-space intersection by linear interpolation on the segment (exact for the orthographic camera dxf-viewer uses). Also added a cheap bounding-box reject up front — segments with both endpoints clearly off one side of the cursor's snap radius skip the rest of the loop entirely.

## [0.3.20] — 2026-05-23

### Added
- **DXF Preview measure tool: intersection snap.** When the cursor hovers near where two line segments cross, the snap indicator now lands on the crossing point itself — even though no vertex exists there in the source DXF. Intersection snaps take priority over plain "nearest point on a line" snaps within the same 12 px tolerance, so picks land on real geometric crossings rather than approximate line surfaces. T-junctions (one segment's endpoint touching another mid-segment) snap to the touch point, and corners where two segments meet at shared endpoints behave the same as before. Implementation: after the existing endpoint/line pass, the finder collects every segment within ~3× snap radius of the cursor and runs a pairwise segment-segment intersection check on that small set — typically only a handful of segments are that close, so cost stays well under 1 ms per mouse move even on dense drawings.

## [0.3.19] — 2026-05-23

### Changed
- **DXF Preview measure tool: drop the ⊥ style toggle; AutoCAD DIMLINEAR rendering is now always on.** Arrow heads at both dim-line ends + extension line from the second pick are part of every H/V measurement now — the visual is no longer behind a separate switch.

### Added
- **DXF Preview measure tool: fixed-distance input for H/V.** A small numeric input appears next to the mode pill whenever H or V is active. Typing a value (e.g. `30`) locks the second pick's axis-aligned coordinate to `first_pick + 30` (signed by which side of A the user clicks). The dim now renders as a *chain*: an A→R leg labelled with the fixed value, and an R→B perpendicular leg showing the actual measurement, which becomes the orthogonal distance (Δy in H, Δx in V). Editing or clearing the fixed value re-locks the second pick on the fly without losing it — useful for "this feature is 30mm horizontal from A; how far is it vertically?" workflows.

## [0.3.18] — 2026-05-23

### Changed
- **DXF Preview measure tool: AutoCAD DIMLINEAR-style rendering, plus picks survive mode switches.** The measure pill is now `Point | H | V` with a separate `⊥` button before it that toggles AutoCAD-style decoration on or off. When `⊥` is on (default), the dim line renders with outward arrow heads at both ends and an extension line from the second pick to the dim line — the classic DIMLINEAR look. When off, just a plain orange line. Switching mode (Point ↔ H ↔ V) or toggling `⊥` no longer resets the two picks — the overlay just re-renders against the same picks, so the user can compare Δx, Δy, and Euclidean distance for the same pair without re-picking. Default mode is now H (was Point); clicking `⊥` when in Point mode also switches to H since plain Point doesn't really benefit from AutoCAD styling. The old snap-to-line ⊥ mode (which required the first pick to land on a line) is removed — `⊥` is now purely a style flag.

## [0.3.17] — 2026-05-22

### Added
- **DXF Preview: Horizontal (H) and Vertical (V) measurement modes.** The measure tool's mode pill grows from `Point | ⊥` to `Point | ⊥ | H | V`. H reports the horizontal distance (Δx) between two picks, V reports the vertical distance (Δy) — equivalent to AutoCAD's `DIMLINEAR` with the H/V option. Unlike `⊥` mode neither requires snapping to a line first; the reference direction is the X or Y axis through the first pick, and the dashed reference-axis preview line draws horizontally / vertically so the user can confirm which axis the dimension is being taken on before the second pick.

## [0.3.16] — 2026-05-22

### Fixed
- **Preview measurement label no longer leaves a phantom "…mm" chip stuck in the top-left of the canvas.** The on-canvas orange label is centered on the midpoint of the measurement (via `transform: translate(-50%, -50%)`). When the user panned/zoomed (DXF) or orbited (3D) the measurement off-screen, the midpoint projected to negative pixel coordinates — but the label's right half still rendered against the canvas's top-left edge, showing just "mm" or "…mm" with no indication of what it was measuring. The label now hides itself whenever its midpoint projects outside the canvas bounds, and is parked off-screen on creation so it never flashes at (0,0) before the first positioning pass.

## [0.3.15] — 2026-05-22

### Fixed
- **Preview: Show Edges toggle now works when Section View is on.** Section view adds stencil-helper meshes as children of each original mesh so the cap can mask correctly. OV's `GenerateEdgeModel` walks every `isMesh` in `mainModel`, so when the user toggled Show Edges (or changed the threshold) with section view active, OV produced a duplicate set of `LineSegments` *for the helpers too*, with fresh `LineBasicMaterial`s that didn't carry our clipping plane — so the new edges rendered past the cut and the toggle looked broken. The edge-settings effect now strips helper-derived edges after `SetEdgeSettings` (identifiable via the `userData.__sectionHelper` flag OV copies onto the line) and reapplies the section clipping plane to the surviving edge materials.

## [0.3.14] — 2026-05-21

### Fixed
- **Opening a second Preview / Spreadsheet no longer overwrites the first one's content.** `setPdfPreview` and `setSpreadsheetPreview` previously dispatched a global `CustomEvent` that *every* open Preview/Spreadsheet window listened to — so staging a second file before the new window mounted swapped the first window's content out from under it. Each window now drains the staged payload at mount and remembers its own token; the staging functions return a `PdfPreviewHandle` / `SpreadsheetPreviewHandle` whose `.update(next)` method targets only that window (use it for the documented `converting: true` placeholder → resolved-URL pattern). Existing callers that ignored the return value keep working unchanged.

## [0.3.13] — 2026-05-20

### Fixed
- **Newly opened windows now come to the front.** Clicking a row in a list (e.g. opening DF#11654 from DFM Logs, or any detail popup from Sales Orders, Goods Issues, etc.) opened the detail window *behind* the list window if that detail had been opened before in this session. Root cause: `mountModal` slots a remounted modal back into its previously-saved z-order from localStorage — correct for restoring layout on page refresh, wrong for a user-initiated open. `openEntity` and `openPage` now explicitly activate the just-spawned window after React renders its panel.

## [0.3.12] — 2026-05-19

### Added
- **`react-os-shell/data` primitives officially documented.** The pageless data-grid surface — `EntityList`, `ResizableTable`, `ListFooter`, `useTableNav`, `useColumnConfig`, `useInfiniteScroll`, `useSort`, plus types `EntityListColumn`, `EntityListProps`, `ColumnDef`, `SortState`, `PaginatedResponse` — first landed in 0.3.10 and got iterated through 0.3.11 without CHANGELOG entries. `EntityList` composes the resizable table with infinite-scroll pagination, keyboard navigation, persistent column show/hide + widths, sort state, and a footer with total count. Modelled on the shape Django REST Framework's `PageNumberPagination` returns, but provider-agnostic. 0.3.12 picks up this morning's tweaks to `EntityList` / `ResizableTable` / `useSort` and commits the source (previously published without git tracking).

## [0.3.9] — 2026-05-19

### Changed
- **Modal `autoHeight`: measure-then-freeze on open.** Previously the auto-height window stayed in CSS `height: auto` mode for its whole lifetime, so its height would jiggle every time the user dragged it (since the cap depended on the window's top offset) or the browser resized. Now the algorithm is one-shot: render the content at its natural size on the first paint (clamped to the viewport via `max-height: calc(100vh - box.y - taskbar - 24px)`), measure the rendered height in `useLayoutEffect`, write it back into the window's `box.h`, and from then on render with a fixed pixel height like any other window. Dragging and viewport resizes no longer change the height; manual corner-resize and persisted-position restore both keep working as before.

## [0.3.8] — 2026-05-18

### Fixed
- **Layout: `--taskbar-height` / `--taskbar-width` / `--sidebar-width` now include `px` units.** Layout was setting these CSS custom properties as unitless numbers (`"56"` instead of `"56px"`). The shell's own JS readers used `parseInt(...)` so they didn't notice, but any CSS rule that did `calc(100vh - var(--taskbar-height) - 24px)` produced an invalid expression — and the browser silently drops invalid calc properties. That's why the 0.3.7 Modal autoHeight cap didn't actually clamp on hosts whose taskbar was visible (the calc just evaporated, leaving the window free to grow past the viewport). The values are now serialized with `px`, so calc consumers get a real length and parseInt-style consumers keep working unchanged.

## [0.3.7] — 2026-05-18

### Fixed
- **Modal `autoHeight`: cap respects the window's top offset.** The CSS cap on auto-height windows was `calc(100vh - taskbar - 24px)` — the maximum window height, but the calc didn't subtract `box.y` (where the window's top edge sits). A cascaded `2xl` window opening at y ≈ 120 with tall content could therefore grow to `100vh - taskbar - 24` and end up extending past the bottom of the viewport. The cap is now `calc(100vh - box.y - taskbar - 24px)`, so the window always fits between its current top edge and the bottom of the usable area (body scrolls when content is taller).

## [0.3.6] — 2026-05-16

### Changed
- **Window initial-open heights: floor at 320 px, cap xl/2xl.** New windows previously had no upper bound for `size: 'xl'` or `size: '2xl'` — both fell through to `availH`, so on tall displays a freshly-opened Email / Spreadsheet / Browser / Calendar window filled the entire viewport. The ladder is now `sm: 500 / md: 600 / lg: 700 / xl: 800 / 2xl: 920`, every value still clamped to the available viewport. The open-time floor is unified at 320 px (was a 300/400 split by size); the existing CSS `minHeight: 240` at the panel stays as the manual-resize floor so users can still drag a window smaller than 320.

## [0.3.5] — 2026-05-16

### Fixed
- **Modal body: `overscroll-contain` on scroll regions.** Mobile bounce-scroll inside a window no longer bleeds into the page behind the shell.

## [0.3.4] — 2026-05-16

### Changed
- **Browser app: favicon service switched to DuckDuckGo** (`icons.duckduckgo.com/ip3/<host>.ico`). Removes the last `google.com` URL from the shell.
- **Layout: dropped the one-time `shell_migration_v2_mail` localStorage migration.** It cleared `google_access_token` / `google_token_expiry` / `google_user_info` / `google_oauth_client_id` and stripped `gtaskId` / `gtaskListId` / `syncedAt` from stored todos. Anyone upgrading from 0.2.x has run it by now; keeping the code just bloats the bundle.

## [0.3.3] — 2026-05-16

### Fixed
- **Dynamic axios import to break the chunk graph entirely.** `src/api/mailClient.ts` now does `await import('axios')` inside `getMailClient()` / `setShellMailServer()` instead of importing axios statically. With axios out of the shell's static module graph the rolldown/esbuild splitter cannot order it ahead of consumer code that expects to set up its own axios instance — the actual root cause of the `axios.create is not a function` surface reported against 0.3.0/0.3.1 (and only partially mitigated by 0.3.2's dead-import removal). `getMailClient()` keeps a synchronous signature by returning a Proxy that resolves axios on first method call, so existing callers awaiting `client.get(...)` keep working.

### Breaking
- **`setShellMailServer(url | axios)` is now async.** Consumers that call it once at app startup should `await` the call (or `.then(...)`) before mounting the shell. Passing an axios instance directly is still effectively synchronous (no axios import is triggered), but the signature is uniformly async.

## [0.3.2] — 2026-05-16

### Fixed
- **Chunk-graph: drop dead axios runtime import from `src/api/client.ts`.** The internal `apiClient` Proxy never actually called axios — only the `AxiosInstance` type was needed — but the file's `import axios, { AxiosInstance } from 'axios'` plus its dead `export { axios }` re-export forced tsup to emit a bare `import 'axios'` side-effect import in the chunk that hosts `apiClient`. In consumer bundles that re-inlined axios (despite the peer-dep + `external: ['axios']` rule added in 0.3.0), this gave the bundler two chunks each referencing axios with different module-init ordering requirements — surfacing as `axios.create is not a function` when one chunk's live-binding to the other's `axios` was undefined at eval time. After this fix the chunk graph has exactly one runtime axios importer (`src/api/mailClient.ts`); the apiClient chunk no longer mentions axios at all, so consumer dedup behaves as intended.
- (0.3.1 was published with `package.json` claiming 0.3.1 but containing no chunk-graph fix — see commit `008138a`. This release is the actual fix, republished as 0.3.2 because npm rejects re-publish of an existing version.)

## [0.3.0] — 2026-05-16

### Removed
- **All Google service integrations.** Deleted `useGoogleAuth`, `GoogleConnectModal`, `GeminiChat`, `_googleTasks`, `google-demo-fixtures`, the `googleApps` registry export, and every `gmail.googleapis.com` / `calendar.googleapis.com` / `tasks.googleapis.com` / `generativelanguage.googleapis.com` / `accounts.google.com/gsi/client` call site. The Email app no longer speaks Gmail, the Calendar app no longer speaks Google Calendar, the Todo List no longer syncs with Google Tasks, and the Gemini AI chat is gone.

### Added
- **`server/` — Node/Express bridge.** New top-level workspace (separate `package.json` so the library's published bundle stays unchanged). Speaks IMAP via `imapflow`, SMTP via `nodemailer`, CalDAV via `tsdav`, with `mailparser` for incoming RFC 822 and `sanitize-html` for inline HTML bodies. In-memory session map keyed by an `HttpOnly` cookie; per-session lazy connection pool (one persistent IMAP connection with NOOP keep-alive, one pooled SMTP transport, one CalDAV client). Routes under `/api/auth`, `/api/mail`, `/api/calendar`. Run with `npm run server:install && npm run server:dev`, or both at once with `npm run dev:all`.
- **`MailConnectModal` + `useMailAuth`.** Replaces `GoogleConnectModal` and `useGoogleAuth`. Provider presets for Fastmail, iCloud, Yahoo, Gmail (app-password), Outlook (app-password). Stores no plaintext creds on the client; only a `mail_session_known` flag that triggers a `GET /api/auth/me` on reload.
- **`setShellMailServer(url | axios)` + `mailClient`.** Dedicated axios instance with `withCredentials: true` so the cookie rides. Default `http://localhost:3001`; consumers override for production.
- **Calendar CRUD via CalDAV.** Editor now offers a "Save to" picker listing each fetched calendar plus a local option (`useShellPrefs`). Existing CalDAV events round-trip with `If-Match: <etag>`; 409 from the server triggers a "modified elsewhere" toast instead of silently overwriting.
- **One-time localStorage migration.** `Layout.tsx` mount effect clears `google_access_token`, `google_token_expiry`, `google_user_info`, `google_oauth_client_id`, and strips `gtaskId` / `gtaskListId` / `syncedAt` from any stored todos. Gated by a `shell_migration_v2_mail` sentinel so it runs exactly once.

### Changed
- **Email UI: folder tree + smart views** instead of Gmail labels. Sidebar lists Inbox / Starred / Unread / Drafts / Sent / Trash / Spam as smart views, then the IMAP folder hierarchy underneath. "Move to folder" replaces "apply label". Threading via server-supplied `threadId` (IMAP `THREAD=REFERENCES` when available, References-header walk otherwise). Unread counts polled every 30s from `/api/mail/unread-counts`.
- **TodoList simplified to local-only.** Stripped sync state, conflict resolution, and the "Connect Google Tasks" header chip. The store still uses `useShellPrefs` so consumers can persist however they like.
- **Public API surface.** Drops `useGoogleAuth`, `GoogleConnectModal`, `googleApps`, `GeminiChat`. Adds `useMailAuth`, `MailConnectModal`, `setShellMailServer`, `mailApps`. Renamed event `open-google-connect` → `open-mail-connect`.

### Shell
- **Folder windows: free-form item positions.** Items inside a folder remember `folderX` / `folderY` instead of snapping to a fixed grid. Drag any folder item back onto the desktop to pop it out; multi-select with rubber-band / shift / cmd works inside folders too, and dragging carries the whole selection.
- **Shared `FileIconTile`.** Desktop and folder-window icon renderers now route through a single tile component so the two surfaces never visually diverge.
- **Window z-order persists across reloads.** New `mountModal` registration uses stable per-window keys (persisted under the `erp_activation_order` localStorage key) to slot remounted modals back into their previous z-order.
- **Internal: stable panel lookups.** DOM queries that used to grep class names (`.text-lg, .text-sm.font-medium`) now use a dedicated `[data-window-title]` attribute, fixing taskbar-tab and window-activation glitches when titles were styled differently.

## [0.2.62] — 2026-05-09

### Added
- **`setSpreadsheetPreview({ csv, filename })`.** New API that mirrors `setPdfPreview` for the Spreadsheet app — consumers stage CSV/TSV text and call `openPage('/spreadsheet')`; the window mounts with the data parsed into Sheet 1 and the title set to the filename (extension stripped). If the Spreadsheet window is already open, the call swaps in the new content via a custom event. Exported from `react-os-shell/apps` alongside `SpreadsheetPreviewData`. Unlocks "preview a list export in the spreadsheet" flows for consumers.

## [0.2.59] — 2026-05-06

### Added
- **BugReportDialog: paste a clipboard image to attach.** While the dialog is open, pressing ⌘V / Ctrl+V (anywhere — including from inside the description textarea, where the browser would otherwise silently swallow the image half of the clipboard) replaces the screenshot with the pasted image. Lets users grab a system screenshot (Cmd+Shift+4 on macOS, Win+Shift+S on Windows) and drop it in without leaving the dialog. Listener attaches/detaches with `open` and explicitly does NOT `preventDefault`, so any text in the same clipboard payload still pastes into the textarea normally. The screenshot preview's hint text and the upload-fallback dropzone hint both surface the new affordance.

## [0.2.43] — 2026-05-03

### Changed
- **World Clock: per-card day/night gradients.** Each city is now its own iOS-style rounded card sitting on the panel's slate backdrop, and the gradient flips based on the local hour at that city — bright sky-blue (`from-sky-400 via-sky-300 to-sky-500`) when 06–18, deep navy (`from-slate-800 via-blue-950 to-slate-900`) otherwise. Same palette as the Weather widget so the two read as a set when stacked. The local-time card sits at the top (with its own day/night colour and a larger time face). Translucency moved to background-color alpha (slate-900 base) so the card gradients keep their saturation at lower opacity.

## [0.2.42] — 2026-05-02

### Fixed
- **TaskbarClock pin opens the registered World Clock widget.** Previously the pin button rendered its own inline `<Modal>` *inside the taskbar DOM tree* with ad-hoc `size="sm"` and the old `ClockContent` layout — which (a) came out at a different width than the other widgets and (b) leaked right-clicks up to the taskbar context menu. The pin now calls `openPage('/world-clock')` so the widget detaches into a normal window with the registered `[320, 480]` dimensions and the standard widget right-click menu (Position / Size / Settings / Always on Top / Close), matching Currency and Weather.

## [0.2.41] — 2026-05-02

### Changed
- **World Clock is now a widget.** Same dimensions as the other utility widgets (`320 × 480`, `autoHeight`), same theme-aware background as the Currency widget (`rgb(var(--window-content-rgb) / opacity)` so it reads in both light and dark themes). Local time sits at the top, then a list of cities — no inline "+ Add World Clock" button. Adding/removing cities and the appearance sliders moved to the widget's right-click → Settings menu (the standard `useWidgetSettings` + `WidgetSettingsModal` pattern, identical to Weather and Currency).
- **`WorldClock` joins `bundledApps`.** Now reads/writes the city list via `useShellPrefs()` (`world_clocks` key) instead of the consumer-specific `getMe`/`updateMe` auth API, so it can ship without consumer-side wiring. Without a `ShellPrefsProvider` the list still works in-memory; persistence requires a prefs adapter as before.

## [0.2.36] — 2026-05-02

### Fixed
- **Annotator no longer dismisses the bug-report dialog.** The annotator overlay renders as a sibling node (full-screen, on top), not a descendant of the bug-report `<Dialog>`. HeadlessUI was treating clicks inside the annotator as outside-clicks on the dialog and calling `onClose`, wiping the report mid-edit. The dialog's `onClose` is now suppressed for the duration of the annotation; closing has to come from the annotator's own Cancel/Apply.

## [0.2.35] — 2026-05-02

### Changed
- **Weather widget: iOS-style city cards.** Each city is now its own rounded-2xl card sitting on the panel's slate backdrop with `gap-2` between cards (separated, not edge-to-edge). Layout matches Apple Weather: city name + local time on the top-left, large `text-4xl` extralight temperature on the top-right, condition + H/L on the bottom row. Day cards use `from-sky-400 via-sky-300 to-sky-500`, night cards use `from-slate-800 via-blue-950 to-slate-900`. Reverts the edge-to-edge experiment from 0.2.33.

## [0.2.34] — 2026-05-02

### Added
- **Bug-report fallback: upload an image when capture fails.** When automatic screenshot capture is unavailable (user denied the Screen Capture permission, or the API isn't supported), the dialog used to show a flat message and only let the user send text. It now shows a drag-and-drop zone — drop an image file, or click to pick one with the file picker. The selected image flows through the same path as a captured screenshot (annotate / send), so the user can still mark it up before submitting.

## [0.2.33] — 2026-05-02

### Changed
- **Weather widget: per-row day/night background.** Each city row now sits on a bright-blue gradient (`from-sky-400 to-blue-500`) when the sun is up at that city, and a dark-blue one (`from-blue-950 to-slate-900`) when it isn't. Rows fill the panel edge-to-edge — no padding, no gap — so the gradients butt against each other and the panel rounded-clip. The user's translucency preference (`appearance.activeOpacity`) is applied as the panel's background-alpha (slate-900 base) instead of CSS `opacity` so it doesn't wash the row colors into gray. Replaces the old single-gradient panel + faint `bg-black/15` overlay on night rows — a panel with cities split between day and night now reads at a glance.

## [0.2.32] — 2026-05-02

### Added
- **Admin can delete a report.** New `BugReportConfig.delete?: (id: string) => Promise<void>` callback. When wired, `<BugReportDetail>` shows a Delete pill (left side of the action row) that opens a confirm dialog ("Delete this bug? / Delete this suggestion? · This is permanent and cannot be undone.") before calling the consumer's delete and closing the parent window via the new `onClose` prop. The button is hidden when `delete` is omitted from the config — the consumer's permission system decides whether to expose the capability.

### Changed
- **Neutral wording in `<BugReportDetail>`.** The dialog now picks "Bug" or "Suggestion" based on `report.report_type` so toast text reads naturally for both ("Bug marked resolved." / "Suggestion marked resolved." / "Suggestion deleted."). Resolve modal title falls back to the kind label if `report_code` is absent. Screenshot filename uses the same kind prefix.

### Notes for consumers
- The `report_code` prefix (e.g. `BG#12345` → `BS#12345`) and the entity window's title (`Bug Report …` → `Bug or Suggestion …`) are **not** generated by the package — they're consumer data. Update them in your backend's code-generation logic and your entity-registry `title` function for `bug_report`.

## [0.2.31] — 2026-05-02

### Added
- **Annotate the screenshot inside the bug-report dialog.** New "Annotate" button overlaid on the screenshot preview opens the same `ImageAnnotator` Preview uses (rect, ellipse, arrow, mosaic, text, freehand pen, crop). Apply replaces the captured screenshot blob with the annotated PNG before the user sends; Cancel discards the markup. Lets the user circle the bug, blur sensitive info, or scribble notes on the screenshot directly — no round-trip through Preview required.
- **`ImageAnnotator` standalone mode.** New optional `onApply: (blob: Blob) => void` and `onCancel: () => void` props. When `onApply` is provided the annotator's toolbar renders Apply / Cancel pills (right side, next to the existing crop confirm area) — Apply composites canvas + SVG into a PNG blob and hands it to the consumer instead of triggering a download. Used by the bug-report dialog; available to any other consumer that wants to embed the annotator outside Preview.

### Changed
- The annotator is `lazy`-imported by `BugReportDialog` so its SVG/canvas weight only enters the bundle the moment the user opens the markup overlay.

## [0.2.30] — 2026-05-02

### Changed
- **Exposé exit: slower, more readable choreography.** Bumped the glide-home transition from 280 ms (unpicked) / 320 ms (picked spring) up to 600 ms / 640 ms so the user can clearly see every window slide back to where it lives, with the picked one settling last. The `setExposeExiting(false)` timeout was bumped to 700 ms to wait for the spring tail, otherwise the transition rule was being stripped mid-animation and the picked panel snapped to its final position. Spring curve softened slightly (`cubic-bezier(0.34, 1.42, 0.64, 1)`) so the larger overshoot from the longer duration doesn't feel cartoony.

## [0.2.29] — 2026-05-02

### Changed
- **Bug report → Suggestion or Bug.** The wallpaper / taskbar right-click menu item is now labelled **Suggestion or Bug** so people use the same channel to send improvement ideas, not just complaints. The dialog gains a Bug / Suggestion segmented toggle (Bug is the default) and adapts its label and placeholder to match — the rest of the flow (screenshot capture, optional description, Cancel / Send) is unchanged.

### Added
- `BugReportSubmitPayload.reportType: 'bug' | 'suggestion'` — the chosen type is now passed through to the consumer's `submit` callback so it can be persisted server-side. Existing consumers that ignore the field will keep working; the toast text adapts to the type ("Bug sent to admins." / "Suggestion sent to admins.").
- `BugReport.report_type?: 'bug' | 'suggestion'` — optional field on the generic record shape so consumer-side list/detail UIs can render a Bug vs Suggestion badge.

## [0.2.28] — 2026-05-02

### Changed
- **Exposé exit: every window glides back, picked one is the focal point.** Clicking a thumbnail kept making everyone disappear except the chosen one — felt jarring. All tileable windows now animate from their thumbnail back to their real position simultaneously (the existing 280 ms `cubic-bezier(0.2, 0.8, 0.2, 1)` glide). The picked window swaps in a spring-y `cubic-bezier(0.34, 1.56, 0.64, 1)` curve over 320 ms with an elevated z-index so it reads as the focal point of the move while still being part of the same coordinated motion. New module-level `_exposeExitFocusId` store carries the picked id across panels.

## [0.2.27] — 2026-05-02

### Changed
- **Exposé replaces split view** — the taskbar action that used to permanently tile windows side-by-side is now a non-destructive Exposé / Mission-Control-style overview. Click the **Exposé** button (or trigger the existing `modal-split-view` event) and every open app window scales down into a thumbnail of its actual live content, arranged in a roughly-square grid (cols = `ceil(√N)`, rows = `ceil(N / cols)`). Each thumbnail keeps its real layout — title bar, body, footer, all readable — and shows the window title underneath. Click any thumbnail to bring that window forward and exit Exposé, click the dimmed backdrop (or press Escape, or click the button again) to return to the previous arrangement with no resizing. Last-row tiles are centred when the row is short, gaps between cells are generous so windows read as separate. Widgets and pinned-on-top windows are excluded from the grid so they don't shrink. Window positions and sizes are preserved exactly — Exposé is purely a transient overlay.
- **Exposé: hover glow + animated exit** — hovered thumbnails get a soft blue glow that radiates well past the panel edges (no ring, no highlight on the title text — the glow on the thumbnail itself is the affordance), and the panel lifts above its neighbours so the glow isn't clipped. Clicking a thumbnail no longer snaps back instantly — every window glides back to its real position over ~280 ms while the picked one is brought to the front, and the dim backdrop fades out over the same window so the whole transition reads as a single coordinated motion.

## [0.2.26] — 2026-05-01

### Fixed
- **Currency widget: dark mode** — its background was hard-coded `rgba(255,255,255,…)`, so it stayed bright white regardless of theme (and made the dark text colors that the shell already overrides unreadable). Switched to `rgb(var(--window-content-rgb) / opacity)` — the widget now picks up the active theme automatically (white in light, Catppuccin base in dark, plus the per-theme tints for pink / green / grey / blue).

## [0.2.25] — 2026-05-01

### Added
- **Annotator: Pen / Draw tool** — freehand strokes (SVG `<path>` with linecap/join round). Each stroke is a vector annotation; selectable, movable, recolorable, deletable like any other.
- **Live restyling of selected annotations**:
  - Color picker recolors the selected shape in place
  - Weight slider re-strokes selected rect / circle / arrow / draw
  - Rectangle gains a Radius slider (0–48 px) for tunable corner roundness
  - Text gains font picker (System / Serif / Mono / Cursive), Bold / Italic / Underline toggles, and a Size slider (10–96 px)
  - Inline text editor reflects the chosen font / style / size live
- **Cmd-Z / Ctrl-Z** as an undo shortcut (in addition to the existing Undo button).
- **Toolbar split** — Save / Copy moved to the OUTER Preview toolbar (same level as Open). The annotator's inline toolbar carries only the editing controls.

### Removed
- Annotator "Exit" button. Use the View button on the outer toolbar to return to the viewer (or close the Preview window).

### Changed
- Toolbar restructured to be context-aware: secondary controls (weight, radius, font/style/size) appear only when the relevant tool is active or a matching annotation is selected. Less clutter, fewer dead inputs.

## [0.2.24] — 2026-05-01

### Fixed
- **Annotator: black canvas on entry** — the image-render effect ran before the canvas mounted (canvas only renders once `displaySize` is computed, which depends on a different effect). Effect found `canvasRef.current === null` and bailed; canvas only filled in once the user happened to make any state change. Added `fitSize` to the effect's deps so it re-runs the moment the canvas mounts.
- **Annotator: text input now actually opens** — replaced `autoFocus` with a `requestAnimationFrame` + `ref.current.focus()` that runs after the textarea is laid out. Wrapped in a div that stops pointer events from bubbling so the SVG below doesn't interfere.
- **Annotator: selection broken at low zoom** — shapes had `fill="none"`, so default `pointer-events="visiblePainted"` only registered clicks on the (~1 px at low zoom) stroke. Added `pointer-events="all"` so the entire shape geometry is hit-testable at any zoom level.

### Added
- **Annotator: resize handles** — selected shapes (rect / circle / mosaic) get 4 corner handles; selected arrows get 2 endpoint handles. Drag a handle to resize / re-aim. Handles stay constant ~10 px on screen via inverse-zoom scaling. Text resizes via the toolbar size slider.
- **Annotator: Copy button** — composites image + annotations and writes a PNG to the system clipboard via `ClipboardItem`. Toast confirms success / surfaces permission errors.

### Changed
- **Annotator: drag uses window-level pointer listeners** during gestures. Drawing, moving, resizing, and cropping no longer rely on the cursor staying inside the SVG — works reliably at high zoom and when scrolled.

## [0.2.23] — 2026-05-01

### Changed
- **Image annotator: vector model** — annotations are now first-class editable objects (state-driven) instead of raster commits to the canvas. Two-layer rendering: image + mosaic on the canvas (real pixels, since mosaic edits pixels), shapes / arrows / text on an SVG overlay (interactive).
- **Select / move / delete** — new Select tool (now the default). Tap a shape to select it (blue dashed bbox appears), drag to move, Delete or Backspace to remove. Esc deselects. Click whitespace to deselect.
- **Editable text** — double-click any text annotation to re-edit it. Enter commits, Esc cancels. Empty text on edit removes the annotation.
- **Color recolor** — picking a color in the toolbar while a shape is selected updates that shape's color in place.
- **Zoom** — toolbar +/- buttons (25 % – 400 %) and a Fit button. SVG `viewBox` is locked to image-pixel coords, so zooming is purely a CSS transform — coordinates and saved exports are unaffected.
- **Crop** keeps its old "drag → Apply / Cancel" flow but now actually crops the underlying image (and translates / culls existing annotations) rather than just resizing the canvas.

### Fixed
- **Text input now works** on letterboxed images. The previous version positioned the textarea using a `displayScale` derived at click time; on the new vector model the textarea is positioned in the same coordinate system as the SVG so it always lands where the user clicked.
- **Save** rasterises both layers (canvas + SVG-cloned-without-selection-chrome) at full image resolution. The downloaded PNG no longer captures the selection outline.

## [0.2.22] — 2026-05-01

### Fixed
- Image annotator: drawings drifted away from where the user dragged when the image was bigger than the canvas display area. The bug was a CSS sizing mismatch — the main canvas used `maxWidth/maxHeight: 100%` (preserves aspect ratio) while the overlay used `width/height: 100%` (stretches to wrapper), so they resolved to slightly different pixel sizes whenever the image had to letterbox-fit. Live preview was drawn at one scale, the commit landed at another. Now both canvases share an explicit-pixel-sized wrapper computed in JS (fits the image while preserving aspect), so the in-progress overlay and the committed bitmap always overlap exactly.

## [0.2.21] — 2026-05-01

### Added
- Preview's image viewer now has an **Annotate** mode (new toolbar button when an image is open). Tools:
  - **Rectangle** with rounded corners
  - **Ellipse / circle**
  - **Arrow** (line + filled head)
  - **Mosaic** (averages an area into 12 px blocks — useful for redacting names, faces, account numbers)
  - **Text** (click to drop a textarea, Enter to commit, Escape to cancel; multi-line via Shift+Enter)
  - **Crop** (drag to select, Apply / Cancel buttons appear in the toolbar)
- 8-color palette + variable stroke width (2–12 px), Undo (50-step history), Save (PNG download named `<original>-annotated.png`), Exit returns to the normal viewer.
- Implementation: dual-canvas (committed bitmap + live preview overlay), `ImageData` snapshots for undo. Lives in new `src/apps/ImageAnnotator.tsx`.

## [0.2.20] — 2026-05-01

### Added
- Mobile swipe-from-left-edge becomes a real "back" gesture: closes the current window and reveals whichever window was active when this one opened (e.g. swiping back from a detail entity returns you to the parent list). New `MinimizedItem.openedFrom` is stamped at `openPage` / `openEntity` time and threaded into Modal as `openedFromKey`. A new `mobileSwipeStore` lets the parent Modal un-hide itself underneath the sliding panel during the swipe.
- Mobile shell renders a wallpaper backdrop in every mode (not just home) so swipe-to-back from a top-level app reveals the home wallpaper instead of another open app.

### Changed
- Mobile: closing a window only falls back to home when no other windows are open. With siblings still in the stack, the next-most-recent window stays in 'app' mode (matches phone-OS expectations: closing a child entity returns you to its parent, not all the way to the launcher).

## [0.2.19] — 2026-05-01

### Changed
- Taskbar tab preview: dropped the wrapper's `bg-white/40 backdrop-blur-sm border` chrome on the multi-tab grouped popover. Each `ThumbCard` already carries its own glass treatment, so the wrapper was double-glassing and leaking through on certain backgrounds. Wrapper is now just a transparent `flex flex-wrap gap-2` container.

## [0.2.18] — 2026-04-30

### Fixed
- Folder popup title left edge now aligns with the first icon's left edge. Title and card share a `max-w-[304px]` wrapper, so the title's `ml-4` and the card's `px-4` inner padding both resolve to the same 16 px offset from the shared wrapper edge — robust against viewport changes (was previously off by ~20 px because the title respected outer `px-6` while the card was centered in a wider parent).

## [0.2.17] — 2026-04-30

### Changed
- Mobile home: gap between icons (and matching edge padding) raised from 12 px to 16 px (gap-3 → gap-4, +33% — closest Tailwind step to the requested 35%). Edge-padding still equals grid-gap so the spacing reads uniformly across the row.

## [0.2.16] — 2026-04-30

### Fixed
- Desktop widgets (Weather, Currency, etc.) now collapse to their content's natural height. The 240 px `min-height` floor that `autoHeight` applies to fit-the-content app windows was wrongly reaching widget panels too — Weather had ~70 px of empty grey at the bottom. The floor now applies only to non-widget app windows (`!widget`); widgets default to 0.

## [0.2.15] — 2026-04-30

### Changed
- Mobile folder popup: grid drops from 4 columns to 3 (more breathing room, matches iOS folder layout).
- Folder popup title indented (`ml-4`) so its left edge sits at the same x as the first icon inside the card.

## [0.2.14] — 2026-04-30

### Fixed
- `Dockerfile`: removed a stale `COPY index.css` referencing a file that doesn't exist at the repo root. The package's CSS lives at `src/styles.css` (already covered by `COPY src ./src`); `docker compose up --build` now works on a clean checkout.

## [0.2.13] — 2026-04-30

### Changed
- Mobile home: dropped the `mx-auto max-w-[356px]` cap and the icon `max-w-[80px]` cap. Edge padding (`px-3` = 12 px) now matches grid-gap (`gap-3` = 12 px) so the space between the screen edge and the first icon equals the space between two icons. Icons fill their cells exactly and grow proportionally with the viewport on bigger phones.

## [0.2.12] — 2026-04-30

### Fixed
- Mobile home `max-width` adjusted from 380 px to 356 px (= `4×80 + 3×12`) so cell width matches the icon's 80 px cap exactly. Widget `col-span-2` edges now line up to the pixel with icon edges (previously ~1.5 px off on iPhone 14 Pro).

## [0.2.11] — 2026-04-30

### Added
- `Dockerfile` (multi-stage), `docker-compose.yml`, and `.dockerignore` — `docker compose up --build` now spins up the demo on `http://localhost:4173/`. Stage 1 builds the package + demo bundle; stage 2 serves the built demo via `vite preview`.
- New `isShellApiClientConfigured()` helper exported from `src/api/client.ts`. Internal shell queries (profile sidebar, favorites star, entity detail fetcher) gate on it so consumers / demos without a backend don't fire doomed HTTP calls.

### Changed
- `apiClient` proxy: when no client is wired, HTTP methods now resolve with empty data instead of throwing. The previous hard error broke the demo (which intentionally has no backend).

## [0.2.10] — 2026-04-30

### Changed
- Mobile widgets and icons share a single `grid-cols-4 gap-3` inside a centered `max-w-[380px]` container. Widgets span 2 columns (so width = 2 × icon + 1 gap) and align with the icon columns by construction.

### Fixed
- Removed the noisy `apiClient.get() called before setShellApiClient()` runtime error fired on every shell-internal query in demos with no backend. Internal callers now check configuration first.

## [0.2.9] — 2026-04-30

### Added
- Folder popup close animation (220 ms backdrop fade + 200 ms card scale-down). Triggers on tap-outside AND tap-an-app-inside.
- Mobile switcher: new "Close All" pill at the bottom, just above the bottom nav. Iterates over visible (non-widget) windows and closes each.

### Changed
- Folder popup: dropped the "Open" section listing already-open windows in this folder. Folder is a pure launcher now; switcher remains the place to see running apps. Inner grid changed from `cols-3` to `cols-4` so visible icon spacing matches the home grid.

## [0.2.8] — 2026-04-30

### Fixed
- Bottom nav reverted to 100 px (was wrongly bumped to 168 in 0.2.7). The 168 was meant for the widget tile width.

### Changed
- Widgets render as flex-wrap row of fixed `168 × 168` cards — packs two-per-row on most phones, reflows to one column on narrow viewports.

## [0.2.7] — 2026-04-30

### Changed
- Bottom nav: bigger icons (`h-6` → `h-8`), larger profile avatar / initial. Removed the open-app count badge from the Apps button.
- Home: removed the blue dot indicating an app has open windows; removed the count badge on folder tiles. Plain icons only.
- Widgets: 3 per row instead of 2.
- Bottom nav height to 168 px *(corrected to 100 px in 0.2.8)*.

## [0.2.6] — 2026-04-30

### Changed
- Mobile bottom nav to 120 px.

## [0.2.5] — 2026-04-30

### Changed
- Mobile widgets aligned with the icon grid: shared `grid-cols-4 gap-3` layout, each widget spans 2 columns. Widget width = 2 × cell + 1 gap; column lines line up between widget row and icon row.

## [0.2.4] — 2026-04-30

### Changed
- Mobile bottom nav to 100 px.

## [0.2.3] — 2026-04-30

### Changed
- Mobile bottom nav to 98 px (later adjusted to 100 in 0.2.4).

## [0.2.2] — 2026-04-30

### Added
- App icon tiles use a per-route gradient (hashed into a 15-color palette) with a white glyph — each app gets a stable color across sessions.
- Folder tile shows a 2×2 preview of the apps inside, iOS-style. Empty cells stay blank when the folder has fewer than 4 apps.
- Folder popup opens with a scale + fade animation; backdrop fades in.

### Changed
- Mobile widget gap doubled (`gap-3` → `gap-6`); icon tile slightly larger (`max-w-[80px]`, `h-11` glyph).
- Bottom nav re-styled as glass (frosted blur with soft inner highlight) instead of flat white.
- Apps switcher and the open-count badge ignore widgets — the running-apps view only shows real apps.

### Fixed
- Long-press text-selection / iOS callout disabled across the home overlay and folder popup.

### Removed
- Per-widget up/down reorder buttons (widget order still persists across sessions; long-press drag is the icon-grid mechanism).

## [0.2.1] — 2026-04-30

Mobile-interface era opens. Version jumped from 0.1.70 to 0.2.1 to mark the transition.

### Added
- New `MobileNotificationSheet` — full-screen list driven by the same `NotificationsConfig` Layout already receives. Mark-all-read; tap to open the mentioned entity (same flow as the desktop bell popup).
- New `MobileProfileSheet` — avatar / name / email / group chips on top, Customization route + Sign out actions below.

### Changed
- Mobile home grid: icon tile up to 72×72, inner glyph to `h-10`. Widget gap and icon gap unified at `gap-3`.
- Swipe-from-left-edge no longer closes the app — it sends the user back to home; the app stays alive in the openWindows stack and can be reopened from the switcher.
- Bottom nav 25% taller (56 → 70 px) and restructured into four buttons: Home, Apps, Notifications (sheet), Profile (sheet). Replaces the previous Menu button.

## [0.1.70] — 2026-04-30

### Added
- Open apps on mobile support **swipe-right-from-left-edge to close**: 22 px gesture zone on the panel's left edge captures pointerdown; the panel translates with the finger; release past 30% of viewport width slides it off and closes; release before threshold animates back. Vertical movement abandons the gesture so content scrolling still works.

### Changed
- Mobile folder popup matches iOS layout: title floats above the card (no header bar inside); card uses frosted-glass `rounded-3xl bg-white/15 backdrop-blur-xl`.
- Open apps render fully chromeless on mobile — top bar removed, footer hidden — so apps fill the viewport edge-to-edge.

## [0.1.69] — 2026-04-30

### Changed
- Mobile widgets: 2-column square cards (`aspect-square`, `overflow-hidden`) instead of a single full-width column.
- Mobile icon tile: `h-14` → `h-16`, glyph `h-8` → `h-9`, grid gap `gap-3` → `gap-1`, page padding `px-3` → `px-2`.
- Closing an app on mobile always returns to home (matches phone-OS expectations) instead of falling back to whatever was layered behind.

## [0.1.68] — 2026-04-30

### Changed
- Reverted the `onClick` option on `toast.info` (per feedback that the toast utility shouldn't carry click semantics). Actionable in-page notification card now lives directly in `NotificationBell` as React state. Behavior is unchanged: tap the body to open the mentioned entity, X to dismiss.

## [0.1.67] — 2026-04-30

### Added *(superseded by 0.1.68)*
- Toast notification body click now opens the mentioned entity (mark-read + `onItemClick`), same flow as clicking the same notification in the bell popup. The X dismisses without firing the action.

## [0.1.66] — 2026-04-30

### Added
- Mobile home: long-press any icon (400 ms) to drag it. The dragged icon becomes a "ghost" following the finger; live reorder; release to drop. Order persists to `erp_mobile_home_order` in localStorage so it carries across sessions, mirroring how the desktop remembers window positions.
- Apps and folders share a single grid (was two separate sections). Folder ids namespaced as `folder:Label`; app ids as `app:/route`.

## [0.1.65] — 2026-04-30

### Added
- Mobile home renders open widget components inline at the top as cards (their components mount directly; same lazy load path as desktop modals).
- Folders open as a centered popup with a blurred backdrop instead of a sub-screen. Tap-outside closes; popup also surfaces any open windows from that folder.
- Each widget card had tiny up/down handles to reorder; new order persisted to `erp_mobile_widget_order` *(handles removed in 0.2.2)*.

### Changed
- Wallpaper carries through from desktop to the mobile home overlay (via shared `wallpaperStyle` computed in Layout).
- Dropped the "react-os-shell" title bar from the mobile home.

## [0.1.64] — 2026-04-30

### Added
- Mobile shell. New `useIsMobile()` hook (`max-width: 767px` or `pointer: coarse`) drives an adaptive shell — the chrome (taskbar / start-menu sidebar / windowed apps) is replaced by a phone-friendly layout while everything else (registry, providers, Modal, apps) stays shared.
- New shell components: `MobileShell` (orchestrator + bottom nav), `MobileHome` (folder + app grid driven by `navSections`), `MobileSwitcher` (Chrome-tab snapshot grid via the now-exported `ThumbCard`), and `mobileShellStore` for the home/switcher/app mode machine.
- Modal: fullscreen rendering on mobile (no drag/resize handles, mobile-style top bar with back arrow + close).
- StartMenu: full-screen slide-up sheet with search-first flat list on mobile.

### Fixed
- Split-view skips widget windows (used to leave a phantom column gap when a widget was open).

## [0.1.63] — 2026-04-30

### Added
- 3D viewer (`StepPanel`): floating Meshes panel (top-left) and Model Display panel (top-right), iOS-Layers-panel-style frosted glass. Default closed; toolbar buttons toggle them so the viewport gets the full window on open.
- New PSP/ORT toolbar button toggles perspective vs. orthographic projection via `Viewer.SetProjectionMode()`.

## [0.1.62] — 2026-04-30

### Changed
- Preview: collapsed format-specific toolbars into the outer toolbar via a new `ToolbarSlotContext` + `<PanelActions>` portal wrapper. Each panel (PDF / DXF / Image / 3D) renders its controls into the right end of the outer toolbar instead of stacking below it. ~32 px reclaimed per Preview window. Removed redundant "DXF filename" / "Image filename" labels.

## [0.1.61] — 2026-04-30

### Fixed
- Preview: PDF page now centers in the available viewer space (was pinned to top with empty grey below when shorter than the viewport). Wrapped the canvas in a `min-h-full flex items-center justify-center` inner container; scrolls naturally when the page overflows.

## [0.1.60] — 2026-04-30

### Changed
- Documents app opens straight into a blank `Untitled` paper-style canvas instead of an empty-state landing screen. Open / Save / formatting toolbar are always available; drag-and-drop still loads files. Preview keeps its role as the read-only viewer.

## [0.1.59] — 2026-04-30

### Added
- New `appStyle: true` window preset alongside `widget` and `compact`. Small (compact-sized) title bar that keeps minimize/maximize controls; body padding stripped to `p-0` so app toolbars sit flush against the frame; body `overflow-hidden`; footer hidden. Designed for self-chromed apps that ship their own toolbars/menus.
- Flipped on Preview, Files, Browser, Documents, Email, Spreadsheet (Spreadsheet moved off `compact` so it regains minimize/maximize).

## [0.1.58] — 2026-04-30

### Fixed
- Preview: PDF zoom dropdown now actually changes the displayed size. pdf.js v5 stamps inline `canvas.style.width/height` during render — once the inline values exist they win against intrinsic sizing, so changing `canvas.width` only altered the backing-buffer resolution (image went blurry) while the rendered element kept the original size. Lock `canvas.style.width/height` to the current viewport on every render so zoom percentages reflect on screen.

## [0.1.57] — 2026-04-30

### Added
- `autoHeight` windows now respect a `minHeight` floor (default 240 px, configurable via new `autoMinHeight`) and a `maxHeight` cap to viewport. Prevents tiny near-empty panels and prevents content overflow off-screen.
- Entity registry entries can now opt into `autoHeight` / `autoMinHeight` (parity with page entries).

### Changed
- Split view tiles across the entire work area with no padding gap; integer pixel distribution so the last column ends flush against the right edge.

## [0.1.56] — 2026-04-30

### Added
- Preview: PDF zoom percentage is now a `<select>` dropdown offering preset zoom levels (50, 75, 100, 125, 150, 200, 300, 400 %). If the current scale doesn't match a preset (e.g. after using +/− or Fit), the actual value is preserved as a "custom" option so it still displays correctly.

## [0.1.55] — 2026-04-30

### Fixed
- StartMenu: `NavItem.dividerAfter` was only honored inside flyout submenus — the main top-items list (both vertical and horizontal taskbar layouts) skipped it. Now renders the divider in all three places. The demo's start menu now shows the expected separator between Browser and Customization.

## [0.1.54] — 2026-04-30

### Added
- Demo-mode mock data for Google apps. Set `window.__REACT_OS_SHELL_DEMO_MODE__ = true` and Email shows a small static thread list / reading pane against bundled fixtures, and Calendar fills the current week with six sample events. The public Pages demo opts in by default so Email/Calendar are populated without requiring a Google OAuth Client ID. A clear "Demo mode — sample data" banner in Email distinguishes it from real Gmail.
- New `docs/google-auth.md` documents the three integration paths — demo mode, BYO Client ID (current default), and full backend OAuth code flow with refresh tokens for production deployments. Includes the Google Cloud setup checklist, verification gotchas (100-user cap, CASA Tier 2 audit for restricted scopes), and an estimate for the backend implementation.

## [0.1.53] — 2026-04-30

### Added
- `useGoogleAuth` now does silent token refresh in-browser. ~60s before the access token expires we call `tokenClient.requestAccessToken({ prompt: '' })` — Google reissues a fresh token without showing UI as long as the user's Google session is still active. The hook also attempts one silent refresh on mount if we held a token last session that has since expired, so reopening the tab no longer flashes the Connect button. If silent renewal fails (user signed out of Google, revoked access, etc.) the stored token is dropped quietly and the consumer falls back to the regular Connect flow. Renewal does not run while the tab is closed — that needs a backend refresh-token flow, out of scope here.

## [0.1.52] — 2026-04-30

### Changed
- Demo start menu: removed the "Settings" section. **Customization** is now a top-level entry, with a divider above it (via `dividerAfter` on the previous item) so it sits visually below the line.
- Trash desktop icon: solid heroicons trash glyph filled with silver (`#c0c4cc`) and a slate-blue stroke for a metallic edge — replaces the previous outline-only version.

## [0.1.51] — 2026-04-30

### Fixed
- Trash desktop icon was hidden underneath the bottom taskbar. Default position now offsets by `--taskbar-height` (or `--taskbar-width` when the taskbar is on the right) so it always sits on the work-area edge.

### Added
- Trash desktop icon is now draggable. New `prefs.desktop_trash_position` saves a `{ right, bottom }` offset; the position persists across reloads. Pure click / double-click still work — only movement past a 3 px threshold counts as a drag. Still excluded from favDocs so it can't be deleted, renamed, or dropped into a folder.

## [0.1.50] — 2026-04-30

### Added
- Built-in **Trash** icon in the bottom-right corner of the desktop. Not stored in `favDocs`, so it can't be deleted, dragged, renamed, or moved into a folder. Double-click opens the Files app in trash view.
- New `openFilesInTrashMode()` export from `react-os-shell/apps`. Sets a `window.__REACT_OS_SHELL_FILES_VIEW__` flag (read on first mount) and dispatches a `react-os-shell:files-show-trash` event (handled by an already-open Files instance), so callers don't need to know whether Files is currently open.

## [0.1.49] — 2026-04-30

### Added
- **Window snapping** in `Modal`: drag a window to a screen edge to tile it.
  - Top edge → maximized
  - Left / right edges → vertical halves
  - Top-left / top-right / bottom-left / bottom-right corners → quarters
  Translucent blue preview overlay appears at the snap target during drag (single shared DOM node, lazily created). Dragging a snapped window restores it to its previous "natural" size, repositioned around the cursor, so a snapped window can be picked up and moved to a different snap zone or back to free-position. Widgets opt out of snapping. Edge threshold 8 px, corner threshold 32 px.
- **Trash for Files**: deletes are now soft. Items move to `data/{userId}/.trash/{trash-id}/` with a `meta.json` sidecar capturing the original path + deletion timestamp. Trash entries still count toward the user's quota — empty the trash to free space. New endpoints:
  - `GET /api/trash` — list `[{ id, name, originalPath, deletedAt, kind, size }]`.
  - `POST /api/trash/restore` `{ id }` — move the item back to its original path. On collision the restored item gets a `(restored)` / `(restored 2)` etc. suffix; intermediate folders are recreated as needed.
  - `DELETE /api/trash/:id` — permanent delete one entry.
  - `DELETE /api/trash` — empty the entire trash.
- Files app gains a Trash toolbar button. Trash view lists name + original location + deleted-at + size, with per-row Restore / Delete forever, and an Empty trash button at the top. Both delete prompts route through the in-app `confirm()` dialog with the danger variant.

## [0.1.48] — 2026-04-30

### Added
- New `prompt()` export from `react-os-shell` (alongside the existing `confirm` / `confirmDestructive`). Same Promise-returning shape — `await prompt({ title, message, defaultValue, placeholder, confirmLabel, cancelLabel, allowEmpty })` resolves to the trimmed string or `null` on cancel. Auto-focuses + selects, Enter saves, Escape cancels, click-outside dismisses.
- Demo: floating **Dev Toolbox** panel toggled with `Alt+Shift+T`. Buttons fire test instances of `toast.success`, `toast.error`, push notification, `confirm`, `confirmDestructive`, and `prompt` so each can be visually QA'd.
- Demo notification store is now stateful (in-memory, capped at 50 entries) so the bell badge updates live when a notification is pushed.

### Changed
- Files app: replaced the last `window.prompt` (New Folder, Rename) and `window.confirm` (Delete) calls with the in-app `prompt` and `confirm` dialogs. Delete now runs through the destructive variant of `confirm` (`variant: 'danger'`).
- Browser app: replaced the right-click "Remove bookmark?" `window.confirm` with the in-app `confirm` dialog.



### Changed
- Browser: clicking the star to add a bookmark now opens a small inline popover (URL preview + name field + Save / Cancel) anchored under the toolbar instead of hijacking the page with a native `window.prompt`. Enter saves, Escape or click-outside dismisses, the input auto-focuses with the hostname pre-selected.

## [0.1.46] — 2026-04-30

### Changed
- **file-server**: dropped bearer-token auth in favor of a server-assigned `HttpOnly` cookie (16 bytes random base64url, 10-year lifetime, `SameSite=None; Secure`). First request without a cookie gets one and a fresh `data/{userId}/` folder. CORS now reflects the request `Origin` and sets `Access-Control-Allow-Credentials: true` so cross-origin fetches with `credentials: 'include'` work. **Clearing site cookies = losing access** — by design for the simple-demo case.
- **file-server**: per-user quota cap, default 100 MB (override via `QUOTA_BYTES` env). Uploads that would push the user over the cap are rejected with `413 { error, used, limit, attempted }`. New `/api/quota` endpoint returns `{ used, limit }`; `/api/me` now also includes those fields.
- **Files app**: removed the sign-in screen and server-URL / token fields. Identity is implicit via the cookie; every fetch sends `credentials: 'include'`. Toolbar gains a live "X.X MB / 100 MB" usage bar (turns amber at 75%, red at 90%). Server unreachable now shows a clear retry screen instead of failing silently. Quota-exceeded uploads surface a "X.X MB free, file is Y.Y MB" toast.
- Server URL still configurable per-deployment via `window.__REACT_OS_SHELL_FILE_SERVER__`.

## [0.1.45] — 2026-04-30

### Changed
- Browser app: replaced the browser-default "refused to connect" blank page with a friendly inline panel for sites known to refuse iframe embedding (Google, YouTube, Facebook, Twitter/X, GitHub, LinkedIn, Reddit, Amazon, Apple, Microsoft, Outlook, Netflix, Spotify, PayPal, OpenAI/ChatGPT, Claude, etc.). The panel shows a brief explanation of why X-Frame-Options / CSP makes embedding impossible and a prominent "Open in a new tab" button. A small "Try loading it here anyway" link lets the user override and attempt the iframe load if they want.

## [0.1.44] — 2026-04-30

### Added
- New **Browser** app (`/browser`, multi-instance). Iframe-backed: URL bar with back / forward / refresh / home, bookmark bar (persisted to localStorage, right-click to remove, defaults to Wikipedia / MDN / example.com), star toggle to bookmark / unbookmark the current page, "set as homepage" link, and an "open in new tab" escape hatch for sites that refuse iframe embedding (Google, GitHub, banks — most majors block via `X-Frame-Options` / CSP). Bare URLs and search terms in the address bar are normalized: `wikipedia.org` → `https://wikipedia.org`, free text → `https://duckduckgo.com/?q=…`. Iframe is sandboxed with `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-modals`.
- New `webApps` registry export collecting all browser/web-related apps; rolls up into `bundledApps` alongside `utilityApps` / `gameApps` / `googleApps` / `documentApps`.

## [0.1.43] — 2026-04-30

### Added
- New **Files** app (`/files`). Browses the per-user folder on the file-server in `examples/file-server`. Lists files/folders with size + modified time, navigates via breadcrumbs and double-click, uploads via button or drag-from-OS, creates folders, renames, deletes. Supported types (PDF, DXF, images, STEP and other 3D) open straight into Preview; other types download. Server URL + bearer token are configurable in-app and persisted to localStorage. Demo wires it into the start menu.

## [0.1.42] — 2026-04-30

### Changed
- Preview 3D section view: cap now matches the model's main material color automatically (sampled from the source material) so the cut surface reads as a slice of the same material instead of a contrasting fill. The Cap Color picker is gone — a low-intensity emissive of the same hue keeps the cap visible regardless of scene lighting.

## [0.1.41] — 2026-04-30

### Fixed
- Preview 3D capped section: `TypeError: t[s].clone is not a function` thrown by `Material.copy` (which `Material.clone` delegates to) — three.js deep-clones each `clippingPlanes[i]` by calling `.clone()` on it, but our duck-typed plane object had no such method, so cloning the source material for stencil helpers and the cap blew up. Plane now ships a `clone()` that returns a structurally-identical object (and the clone-of-the-clone has its own `clone()` for safety).

## [0.1.40] — 2026-04-30

### Fixed
- Preview 3D capped section, real fix this time: the v0.1.39 canvas patch only added `stencil: true` when `attrs.stencil === undefined`, but three.js 0.176 explicitly passes `stencil: false`, so the override was skipped and the WebGL context was still created without stencil. Patch now forces `stencil: true` unconditionally on all webgl/webgl2/experimental-webgl context requests.

## [0.1.39] — 2026-04-30

### Fixed
- Preview 3D capped section: cap was failing to render because the WebGL context didn't have a stencil buffer. three.js 0.176 (the version online-3d-viewer bundles) defaults `WebGLRenderer({ stencil })` to `false`, so the canvas's WebGL context was created without stencil and every stencil op was a no-op — the cap mask `NotEqualStencilFunc(stencil, 0)` always failed and the cap never drew. Now we monkey-patch `HTMLCanvasElement.prototype.getContext` once before the EmbeddedViewer creates its canvas to inject `stencil: true` into webgl/webgl2 context attributes.

## [0.1.38] — 2026-04-30

### Fixed
- Preview 3D toggle switches: the "Show Edges" / "Section View" pills had collapsed into flat rectangles with no visible thumb. Switched from `relative + absolute` positioning to `inline-flex items-center` with explicit `translate-x-[18px]` for the on state, plus `shrink-0` so flex containers can't squash them, and added `role="switch"` / `aria-checked` for a11y.
- Preview 3D capped section view, harder push to make the cap actually visible:
  - Cap material's `emissive` color now matches the cap color with `emissiveIntensity = 0.6`, so it self-illuminates and never blends into the model under arbitrary scene lighting.
  - Cap gets `polygonOffset` toward the camera to win z-fights against any model geometry that lands exactly on the plane.
  - `renderer.localClippingEnabled = true` is set before any `material.clippingPlanes` writes (matches three.js's documented order, avoids one wasted shader recompile).
  - `renderer.autoClearStencil` is forced `true` so stencil starts at 0 every frame (without this the cap mask drifts).
  - Diagnostic `[Preview] section: ...` log now reports stencil buffer state, target mesh count, helper count, and cap presence so the cause is verifiable from the browser console.

## [0.1.37] — 2026-04-30

### Fixed
- Preview 3D capped section: the cap was failing to render so the cut still read as a hollow shell. Two changes:
  - Stencil-only helpers and the cap mesh now `sourceMaterial.clone()` from an existing scene mesh instead of constructing fresh `new Material()` instances. Cloning preserves the renderer's shader-compile state and uniform setup so the helpers actually write to the stencil buffer (and the cap's lighting matches the rest of the scene).
  - Detect the WebGL stencil buffer up front via `renderer.getContext().getContextAttributes()`. If unavailable we skip the cap path entirely instead of producing an invisible-cap result. A diagnostic `[Preview] section: stencil buffer = …` log is emitted to the console when the section view is enabled, making it easy to confirm.

## [0.1.36] — 2026-04-30

### Changed
- Preview 3D section view: brought back capping so the cut surface reads as solid instead of a hollow opening. Uses the standard three.js stencil-cap technique (back-face increments / front-face decrements / cap quad masked by `NotEqualStencilFunc`). To work around the duplicate-three.js issue (online-3d-viewer bundles 0.176, the root has 0.161), THREE constructors are plucked from a sample mesh in the loaded scene rather than imported — that guarantees the renderer recognizes the resulting objects. Stencil/side constants are universal numeric values and are hardcoded.

### Added
- Preview 3D Cap Color picker is back in the section view panel, defaulting to `#c8ccd1`.

## [0.1.35] — 2026-04-30

### Changed
- Preview 3D panel: switched from the dark slate theme (3dviewer.net-style) to the same light gray-on-white palette the rest of the apps use. Toolbar, Meshes sidebar, Model Display sidebar, mesh tree rows, axis buttons, Reset to Default button — all repainted. The accent blue toggles and camera-preset highlights are unchanged.

## [0.1.34] — 2026-04-30

### Fixed
- Preview app: "Drop to open" overlay no longer gets stuck on after dragging a file out and dropping it elsewhere (e.g. the desktop trash). Drag-enter / drag-leave now use a counter (so child-element transitions don't flicker the overlay), and a window-level `dragend` / `drop` listener clears the overlay even when the drag terminates outside our component. Pressing Escape also clears it.

### Changed
- Preview drag-and-drop now only applies to the active (frontmost) Preview window. With multiple Previews open the inactive ones no longer flash the drop overlay; click a window to activate it before dragging a file in.

## [0.1.33] — 2026-04-30

### Fixed
- Preview app: opening a file via the Open button or drag-drop in one Preview window no longer also replaces the file in any other open Preview window. The local ingest path now updates the current instance's state directly instead of routing through the global `setPdfPreview` event (which all open Previews listen to). External callers of `setPdfPreview` still broadcast as before.
- Preview 3D camera presets (ISO / TOP / FRT / SDE) and Fit: `GetBoundingSphere` is on the underlying `Viewer`, not `EmbeddedViewer`, so the previous calls to `v.GetBoundingSphere(...)` silently returned `undefined` and the presets did nothing. Now uses `v.viewer.GetBoundingSphere(...)`.

### Changed
- Preview 3D section view: switched from capped (stencil) sectioning to plain clipping. The user-visible result: the cut-off half disappears cleanly, with no cap quad or fill color. The underlying problem was that our `import('three')` resolved to a different three.js instance than the one online-3d-viewer bundles, so our `THREE.Plane` / stencil constants weren't recognized by the renderer; the new path uses a duck-typed plane object (`{ normal: {x,y,z}, constant }`) that three.js's `WebGLClipping.copy()` can read directly without any THREE imports. The "Cap Color" picker is gone.

## [0.1.32] — 2026-04-29

### Fixed
- Preview 3D section view: enabling the section toggle crashed with `RangeError: Maximum call stack size exceeded` in `Object3D.traverse`. `EnumerateMeshes` is a live scene traversal — adding stencil-helper meshes inside the callback meant the traversal kept visiting the helpers we just added, recursively expanding forever. Snapshot the mesh list first, then add helpers; also skip `__sectionHelper` meshes in the visibility-update enumerator so stale helpers can't ever trip the same path.

## [0.1.31] — 2026-04-29

### Added
- Preview 3D panel: capped section view. Toggle in the Model Display panel to slice the model along X / Y / Z, with a position slider, flip-direction button, and cap color picker. Uses the standard three.js stencil-cap technique — each mesh gets two stencil-only helper passes that count interior intersections, and a cap quad fills the cut surface where the stencil count is non-zero, so the section reads as a solid rather than a hollow opening.

## [0.1.30] — 2026-04-29

### Changed
- Preview 3D panel rebuilt with a richer UI modeled on 3dviewer.net: dark sidebars, a top toolbar (Fit, ISO/TOP/FRONT/SIDE camera presets, Snapshot PNG, Download), a left **Meshes** tree with expand/collapse and per-node visibility toggles (drives `mesh.visible` directly on the THREE scene), and a right **Model Display** panel for background color, show-edges toggle, edge color, and edge threshold slider with a Reset to Default. Both side panels are collapsible from the toolbar.

## [0.1.29] — 2026-04-29

### Added
- Preview app: STEP / IGES / STL / OBJ / GLTF / GLB / 3MF / PLY / FBX support via the new optional `online-3d-viewer` peer dep. New `kind: '3d'` on `PdfPreviewData`. Open button + drag-drop ingest these formats automatically. STEP/IGES files load OpenCascade WASM (occt-import-js) on first use — assets served from jsdelivr by default; override the libs base URL via `window.__REACT_OS_SHELL_O3DV_LIBS__` to self-host.
- 3D panel ships toolbar (Fit / Download / optional Email) plus the same auto-hiding navigation hint pattern as DXF (Drag to rotate • Right-click drag to pan • Scroll to zoom).

### Fixed
- DXF default font URLs (Roboto / Noto Sans Display / Nanum Gothic) now point at the correct path inside `vagran/dxf-viewer-example-src` (was `src/fonts/…`, fixed to `src/assets/fonts/…`). The previous URLs 404'd, surfacing as `Unsupported OpenType signature` when dxf-viewer tried to parse jsdelivr's HTML 404 page.

## [0.1.28] — 2026-04-29

### Added
- Preview DXF panel now loads default fonts (Roboto, Noto Sans Display, HanaMin) so TEXT/MTEXT entities render as readable glyphs instead of empty boxes. Override via `window.__REACT_OS_SHELL_DXF_FONTS__`.
- Layer toggle panel — opens from the toolbar, lists every layer with a color swatch + visibility checkbox, plus All/None bulk toggles.
- Floating navigation hint (Drag to pan • Scroll to zoom • Fit to reset) auto-shows on load and auto-hides after 5s; toggleable via the `?` button in the toolbar.

## [0.1.21] — 2026-04-29

### Added
- `PdfPreviewData.kind: 'image'` — Preview app now renders raster screenshots / photos in a dedicated panel with zoom (− / 100% / + / 1:1), Download, and optional Email actions. Same windowed UX as PDF and DXF mode.
- `BugReportDetail` opens its captured screenshot in the Preview window (was opening in a new tab).

## [0.1.20] — 2026-04-29

### Added
- `PdfPreviewData.kind: 'pdf' | 'dxf'` — the Preview app now renders DXF drawings natively in the browser via the optional `dxf-viewer` peer dep, alongside the existing PDF mode. Mode selection is per-call via `setPdfPreview({ kind: 'dxf', url, filename })`. The DXF panel ships its own toolbar (Fit, Download, optional Email).

## [0.1.19] — 2026-04-29

### Added
- `PdfPreviewData` accepts `converting: true` + `convertingMessage` so consumers can stage a placeholder window while a server-side conversion is in flight (e.g. DWG → PDF). The Preview app shows a progress bar and the supplied headline, then swaps to the PDF view when `setPdfPreview` is called again with a real `url`.

## [0.1.17] — 2026-04-29

### Fixed
- Preview app: default `pdfjsLib.GlobalWorkerOptions.workerSrc` now points at unpkg (`https://unpkg.com/pdfjs-dist@<version>/build/pdf.worker.min.mjs`) instead of cdnjs. cdnjs does not host arbitrary pdfjs-dist npm versions, so the worker URL 404'd and PDFs silently failed to render. unpkg mirrors npm exactly.

## [0.1.16] — 2026-04-29

### Added
- `DesktopHostConfig.productChangelog` lets the consumer wire its own changelog into the "What's New" dialog. The shell ships with no built-in changelog, so the dialog showed empty until consumers passed one in. `ChangelogEntry` is re-exported from the package barrel.

## [0.1.15] — 2026-04-29

### Added
- Hover thumbnails surface the window title above the snapshot card (rounded white pill) instead of as a bottom gradient overlay. Applies to single-window tabs and grouped tabs alike, so the full title is always readable.
- Demo: `/preview` (PDF Preview) joins the top-level start-menu items, with a document icon. The bundled `documentApps` registry is now imported alongside `utilityApps` / `gameApps` / `googleApps`.

## [0.1.14] — 2026-04-29

### Added
- Folder window is now visually distinct from regular windows: amber gradient background, folder glyph in the title bar, and a sticky "selected" toolbar that appears when one or more files are selected.
- Inside a folder you can now: shift / cmd / ctrl-click to add to the selection, rubber-band drag on empty space to box-select, drag a file onto another file to reorder, and drag selected files back to the desktop via the "Move to desktop" toolbar action.
- New `Preview` PDF viewer app (multi-instance) registered at `/preview` and exposed as `setPdfPreview` for consumers to open documents programmatically. `pdfjs-dist` is an optional peer dependency.
- `DesktopHostConfig.productVersion` lets consumers override the desktop watermark string. Falls back to the package version when omitted.

## [0.1.13] — 2026-04-29

### Fixed
- "Snap to Grid" actually moves the icons. The local-position overlay key now includes each icon's coordinates, so it invalidates when `doSnapAll` patches them; previously the cache held the pre-snap positions and only released them after a per-icon click.
- Demo forces `show_desktop_version: false` on every mount, so existing users who already had the bundled desktop version watermark stored as `true` (from before 0.1.12) lose the duplicate badge without clearing localStorage.

## [0.1.12] — 2026-04-29

### Added
- `useLocalStoragePrefs(key, defaults)` accepts a defaults object that's merged behind the stored prefs — useful for opting out of bundled UI (e.g. `{ show_desktop_version: false }`).
- Drop-into-folder animation: when a single icon is dropped on a folder it shrinks toward the folder's center and the folder gives a quick scale pulse before the icon disappears.
- Hover preview gracefully handles hidden windows. When the source modal is `display: none` or zero-sized, the thumbnail shows a "Hidden" placeholder card with the window's icon and label instead of an empty white frame.

### Fixed
- Hover preview is reliably centred on its taskbar tab. Replaced the static once-on-mount measurement with a `ResizeObserver` so the popover re-centres after `ThumbCard` finalises its aspect-aware size.
- Sticky-note color toggle (the small dot in the top-left) no longer triggers a drag when clicked rapidly. The buttons in the sticky-note header now `stopPropagation` on `onPointerDown` as well as `onClick`, so the parent's drag-start never fires.
- Demo no longer renders two version labels in the bottom-right. The bundled desktop version watermark is opted out via `show_desktop_version: false` in the demo's prefs defaults; the demo's `VersionBadge` (with the in-app changelog modal) is the single visible badge.

## [0.1.11] — 2026-04-29

### Added
- Multi-select drag on the desktop. After rubber-banding (or shift-/cmd-clicking) a set of icons or folders, dragging any one of them moves the whole group by the same delta. Each icon's final position is persisted independently on drop. Folder fold-in still only fires on a single-icon drag, matching the existing UX.
- Shift/Cmd/Ctrl-click an icon to add it to the current selection without clearing the rubber-band set.

## [0.1.10] — 2026-04-29

### Added
- Demo: package version is also rendered in the bottom-right of the login splash so users can see the build before signing in.

### Fixed
- Right-click → "New folder" and "New sticky note" on the desktop persist again. `saveDocs`, `saveFolders`, and `saveSnap` now fall back to the prefs adapter (`favorite_documents`, `desktop_folders`, `desktop_snap`) when no `host.saveShortcuts` / `saveFolders` / `saveSnap` callback is wired — matches the sticky-note fix from 0.1.9.

### Changed
- CI / Pages / screenshot workflows opt into Node 24 for JavaScript actions via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` so the runner stops warning about the September 2026 Node 20 deprecation. CI matrix bumped from `[20, 22]` to `[22, 24]`.

## [0.1.9] — 2026-04-29

### Added
- `VERSION` exported from `react-os-shell`, injected by tsup at build time.
- Demo: clicking the version badge opens an in-app changelog modal that fetches `CHANGELOG.md` from the GitHub raw URL.

### Fixed
- Sticky-note positioning now persists. Desktop falls back to the `useShellPrefs` adapter (`notepad_notes`) when no `host.saveNotes` callback is wired, so dragging a note no longer snaps it to the left edge after a refresh.

## [0.1.8] — 2026-04-29

### Added
- Notepad windows expose the title-bar pin button (`allowPinOnTop: true` on the registry entry).
- Rubber-band selection on the desktop survives the click that fires on pointerup. The desktop click handler skips its "clear selection" branch when a drag was just completed.

### Fixed
- Desktop reads its preferences (`favorite_documents`, `desktop_folders`, `desktop_snap`, `notepad_notes`, `taskbar_position`, `show_desktop_version`) from the prefs adapter, not just `profile.preferences`. Apps that write through the adapter (Notepad, Customization) now show their changes on the desktop in real time.

## [0.1.7] — 2026-04-29

### Added
- Modal panels expose `data-window-key` matching the `openWindows` item id. Activation lookups now use the unique key instead of fuzzy title matching, so two windows with the same title (e.g. multi-instance Spreadsheets) activate the right one.
- Hover thumbnails resize to the source window's aspect ratio, clamped to a 240×160 box. No more letterboxed empty space around tall or short windows.

## [0.1.6] — 2026-04-29

### Added
- `PageRegistryEntry.multiInstance` flag. Setting it on `/spreadsheet` makes a fresh window spawn each time the menu item is picked.
- Taskbar groups same-route windows under one tab. Hovering a grouped tab shows a row of thumbnails — click any to activate that specific instance, or close it via the X overlay.
- Tab title reflects whatever the running window has set via `useWindowTitle` / `<WindowTitle>`.
- Demo: version badge in the desktop bottom-right links to the GitHub releases page.

### Fixed
- Single-click on a hidden window's taskbar tab restores the window. The activate path was matching `.text-lg`, which missed compact title bars (Spreadsheets, Sudoku, etc.); unified to `.text-lg, .text-sm.font-medium` everywhere.

## [0.1.5] — 2026-04-29

### Added
- Hover preview thumbnails on taskbar window tabs. Hovering a tab shows a scaled live snapshot of the window above (or beside) it, debounced 350 ms in / 150 ms out so quick mouse passes don't flash.

## [0.1.4] — 2026-04-29

### Fixed
- Double-clicking the desktop wallpaper ("show desktop") now keeps widget windows pinned. Previously the action cleared the entire modal activation order, hiding widgets and pages alike. Modal tracks widget ids in a side Set so deactivate-all only drops non-widget ids.

## [0.1.3] — 2026-04-29

### Added
- All widgets (Calculator, Weather, Currency, Pomodoro) opt into `autoHeight`, so their windows shrink to content. Currency was the visible offender — its 480px fixed height left a tall blank strip below the rate rows.

### Changed
- Weather prefs (`showLocalTime`, `useFahrenheit`, `use24Hour`) move into the consumer prefs adapter via `useShellPrefs` so toggles survive a settings reopen reliably.

## [0.1.2] — 2026-04-29

### Changed
- NotificationBell drops a redundant outside-click listener; the popup's own `onClose` handles dismissal.

## [0.1.1] — 2026-04-29

### Added
- npm package metadata: `homepage`, `repository`, `bugs` URLs.

## [0.1.0] — 2026-04-28

Initial public packaging. The shell has been running in production inside a small ERP for some time; this is the first standalone release.

### Added

- **Shell**: `<Layout>`, `<StartMenu>`, `<Desktop>` (with sticky notes + folders), `<WindowManager>`, `<Modal>` (standard / compact / widget styles), `<PopupMenu>`, `<ConfirmDialog>`, `<GlobalSearch>` (Cmd-K), `<ShortcutHelp>`, `<NotificationBell>`, `<BugReportDetail>`, `<StatusBadge>`, frosted-glass theming, `<GoogleConnectModal>`.
- **Bundled apps (12 in `bundledApps`)**: Calculator, Spreadsheet, Weather, CurrencyConverter, PomodoroTimer, Chess, Checkers, Sudoku, Tetris, Game2048, Email, GeminiChat. Four more (Calendar, Notepad, WorldClock, Minesweeper) ship in the package but are not yet in `bundledApps` because they require consumer-supplied prefs / leaderboard wiring.
- **Hooks**: `useWindowManager`, `useTheme`, full hotkey/nav system (`useNewHotkey`, `useEditHotkey`, `useModalNav`, `useModalSave`, `useModalDuplicate`, `useTableNav`, `useMultiModal`), `useGoogleAuth`, `useEmailUnread`, `useClickOutside`.
- **Consumer-config surfaces**: `<ShellAuthProvider>`, `<ShellPrefsProvider>`, `<ShellEntityFetcherProvider>`, `<BugReportConfigProvider>`, `<DesktopHostProvider>`, `<StatusBadgeProvider>`. Plus module-level setters used at app-startup: `setShellApiClient`, `setShellAuthBridge`, `setShellWindowRegistry`.
- **Window-registry composer**: `createWindowRegistry(...partials)` lets consumers merge the package's `bundledApps` with their own entity-window definitions.
- **Toast system**: `toast.success / .error / .info` with auto-mounted container.
- **Themes**: light, dark (frosted-glass tinting baked into `styles.css`).

### Notes

- TypeScript declarations ship for the full public surface (`dist/index.d.ts` ~22 KB).
- Built with **tsup**, ESM-only output. React, react-dom, react-router-dom, @tanstack/react-query, react-hook-form, tailwindcss, @headlessui/react, @heroicons/react are peer dependencies.
- The 16 apps ship as `lazy()` components; consumers don't pay code-size cost for apps they don't open.
