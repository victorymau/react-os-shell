# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## 4.90.0

- **Right-clicking a grouped taskbar tab now acts on the group.** A tab that
  stands for several windows — same-route `multiInstance` copies, or a
  cross-route `taskbarGroup` — used to borrow one window's own menu, so
  "Close" there closed a single instance and left the rest of the stack open.
  That made the item no better than closing each window by hand, which is the
  one thing a group menu exists to save you. A grouped tab now gets its own
  menu, headed by the group's name: **Minimize all**, **Restore all**, and
  **Close all (N)** with the count spelled out. A tab standing for one window
  is unchanged — it still delegates to that window's menu, which carries
  per-window items the taskbar knows nothing about (pin on top, Add to
  desktop, anything the page registered).

- **A taskbar menu opened on exactly one window, instead of on every window
  sharing its label.** `modal-context-menu` and `modal-center` addressed a
  window by matching its title against a label, but multi-instance windows
  deliberately share one registry label so the taskbar can group them. Every
  copy therefore claimed the event: three open purchase invoices meant three
  identical context menus stacked at the same point, and the "Close" you
  clicked belonged to whichever one happened to draw on top. Both events now
  carry the `windowKey` and are claimed by that window alone; the label match
  survives only as the fallback for a sender with no key.

- **The discard prompt names the window it would discard.** "Close all" fires
  one close per window, each through that window's own guard, and confirms
  queue rather than drop — so several unsaved windows produce several prompts
  in turn. An unnamed *"You have unsaved changes"* is unanswerable in that
  queue: every dialog looks the same and none says what it is about to throw
  away. The message now opens with the window's title, falling back to the old
  wording for a title carrying no plain text.

  Deliberately *not* one aggregated dialog listing every unsaved window: that
  needs a public close path that bypasses the per-window guard, which is the
  thing `forceRemoveWindow` is kept private to prevent.

## 4.89.1

- **"Reset" in the column picker no longer un-hides every `defaultHidden`
  column.** `useColumnConfig`'s `resetColumns` rebuilt the column state as
  `{ key, width }` and never wrote `hidden`, so a reset made every column the
  consumer had marked `defaultHidden` visible — and reset also persists, to
  `localStorage` and then to the user's profile on the `PATCH /auth/me/`
  debounce, so the saved config won on every later load and nothing healed it.
  On a wide list this was drastic rather than cosmetic: a grid whose
  `ColumnDef` list hides 35 of 45 columns by default came back with all 45,
  permanently, from one click. Reset now carries `defaultHidden` through and
  pins `_select` first and visible, which is what the hook's two sibling paths
  — the initial state and the server-prefs merge — already did.

  Configs already saved with the columns un-hidden are left alone. Re-hiding
  them would mean rewriting state a user may since have chosen deliberately,
  and telling those two cases apart is not something the data supports.

- **Consistency, not the bug above:** the `localStorage` merge in the same
  hook also dropped `defaultHidden` for columns absent from the cache, where
  its server-side twin kept it. That one only affected a column added to a
  consumer's `ColumnDef` list after the cache was written, and only until the
  profile fetch landed a moment later — a first-paint flash, not persisted
  state. Both merges now read the same.

## 4.89.0

The follow-ups deferred from the charts-tier audit
([#191](https://github.com/victorymau/react-os-shell/issues/191)): the
radial and hierarchical charts stop being pointer-only and colour-only, the
family's two tooltip behaviours become one, and ten small geometry and
identity defects are fixed.

- **The opaque charts now carry their data as a hidden table.** `role="img"`
  makes an SVG a single node to assistive tech — descendants are
  presentational — so the per-mark `<title>` tooltips Sunburst, Treemap,
  Sankey, Chord and Radar relied on were never exposed to anyone. Each now
  renders the same data as a visually-hidden table right after its SVG
  (`AccessibleTable`, internal), so a screen reader walks rows instead of
  hearing a count.

- **RadarChart has a legend.** Up to three series were distinguishable only by
  colour — the one channel a chart may never rely on alone. It now renders the
  same swatch list the pie draws.

- **Scatter and Heatmap are keyboard-reachable.** Both had styled tooltips
  that only a pointer could open. Both svgs now take focus, arrow keys walk
  the points (Heatmap in both dimensions), and Escape clears through the
  modal seam — the same conventions `CartesianPlot` already had.

- **One tooltip surface across the whole family.** Pie, RadialBar, Radar,
  Funnel, Sunburst, Treemap, Sankey and Chord used native `<title>` — the
  delayed, unstyled OS tooltip — while every cartesian chart rendered the
  shared `ChartTooltip` card. All eight now render the same card, and all
  eight consume the highlight context, so pointing at a `ChartFrame` legend
  entry recedes their marks the way it always did for TimeSeries and Column.

- **The tooltip can no longer overflow a narrow container.** The card is
  `min-w-44` (176px) but its `left` was clamped only in percent, so any
  container under ~590px let it spill past the right edge. The clamp now
  budgets the card's own width, in `CartesianPlot` and `TimeSeriesChart`
  both.

- **SunburstChart survives hostile trees.** A cyclic `children` graph used to
  recurse to a stack overflow; depth is now capped at eight rings. Wedge
  identity is the path from the root rather than `key`+depth, so the same key
  reused in two branches no longer collides React keys or lights both wedges
  on hover.

- **SankeyChart stays inside its height.** The 2px node floor was never part
  of the column budget, so many near-zero nodes walked off the bottom of the
  svg; the un-floored nodes now give back exactly the overflow. Links are
  keyed by route instead of array index.

- **ChartBrush honours its own null contract.** `data` documents `null` as "a
  gap, drawn as one", but the miniature outline drew gaps to the floor —
  which reads as a value of zero. The strip is now one area per contiguous
  run. The handles-cannot-cross spec also drives the real component now; the
  previous spec asserted a private copy of the clamp arithmetic.

- **Waterfall connectors span the gap, not the bars.** Each connector ran
  from the left edge of one bar to the right edge of the next — under both
  bodies — which showed through whenever a bar dimmed to translucent.

- **Histogram bin labels sit on the edge they name.** Lower-bound labels were
  centred under the band, half a bin right of the boundary they state.
  `CartesianPlot` grew an `xTickAnchor` prop ('center' | 'start') for exactly
  this.

- **Candlestick ticks stop printing float noise.** The default `formatValue`
  was `String(v)` on an axis whose domain is padded off the data, so ticks
  printed `102.72999999999999`. Non-integers now default to two decimals.

- **In-tile text switches to ink where a ramp nears the surface.** Treemap
  and Funnel painted surface-coloured text on tiles whose fill mixes as
  little as a third of the hue into that same surface — text on itself, at
  the light end. Below the mix threshold the text takes the label ink.

- `TimeSeriesChart` no longer shadows the global `window` with a local
  range — in a file whose own escape seam listens on the real one.

## 4.88.0

- **A fenced code block is now rendered as one, instead of being flattened into
  a paragraph.** `Markdown` split its input on blank lines before looking for
  anything, so a fence containing one was torn into pieces and every piece fell
  through to the paragraph branch — which joins its lines with a space. A YAML
  block came back as a single long line, with the opening ``` read as an empty
  code span, the language tag beginning another, and two bare backticks printed
  to the reader. Fences are line-shaped, so they are now found by walking lines,
  before anything is split. Tilde fences, longer closers and CommonMark's
  unclosed-fence rule are covered; the info string is passed through as
  `data-language` rather than drawn.

- **The inline-code chip is visible in dark mode.** It used `bg-gray-100`, which
  `ui.css` remaps to `--surface` — and so does `bg-white`, which is what every
  host panel that draws this component uses, `HelpCenter`'s own `<main>` among
  them. The chip was therefore the exact colour of the surface behind it:
  present, styled, unreadable. It is `bg-gray-200` (`--surface-raised`) now.

  Both of these had survived because the renderer had no spec at all. It has
  one now, and it includes a static check that every colour class the component
  paints is remapped in `ui.css` AND does not collapse into `bg-white`'s token —
  which is the class of bug the second one belongs to.

- **New: `react-os-shell/markdown`** — CommonMark + GFM for bodies a person or a
  service wrote (notes, chat messages, bug reports, help articles), with
  `react-markdown`, `remark-gfm` and `remark-breaks` as **optional** peers. Only
  a consumer who imports this subpath ever installs them; the package's
  `dependencies` stay empty, and the till and the storefront pay nothing.

  Two variants — `note` for typed copy inside a card, `article` for authored
  documentation — plus `clamp`, `resolveImageSrc` and per-element `components`
  overrides. Four constructs are disabled so that pre-markdown bodies do not
  render surprisingly (indented code, raw HTML in both positions, setext
  headings); raw HTML is never parsed and `javascript:` URLs are neutralised, so
  no sanitiser is needed or wanted. No syntax highlighting: the fence's info
  string is exposed as `data-language` for a host that wants to add it.

  `scripts/verify-dist.mjs` now walks this entry too, in both directions: the
  markdown entry may reach its parser and nothing else, and the parser may not
  be reachable from the root or `ui` entries — either would quietly promote an
  optional peer to a required install.

- **`Markdown` is renamed `MarkdownLite`** (`MarkdownProps` → `MarkdownLiteProps`)
  now that there are two renderers and the difference matters at the call site.
  The old names remain as deprecated aliases and are removed in 5.0.

- Review follow-ups, folded in before publish: the fence opener accepts a
  multi-word info string and up to three spaces of indentation (both
  CommonMark-legal — either used to fall back into the flattened-paragraph
  path this release fixes), a tilde fence may carry backticks in its info
  string while a backtick fence may not, and `data-language` carries the info
  string's first word. `MarkdownLite` links now pass the same scheme
  allowlist the full renderer gets from react-markdown's urlTransform — a
  `javascript:` href renders disarmed. `resolveImageSrc` applies to the
  `note` variant, not only `article`. `text-lg` joins the size classes a
  host's `className` can win with. `verify-dist` catches deep parser imports
  (`react-markdown/lib/…`), not only bare ones.
## 4.87.1

Review follow-ups across the 4.84.0–4.87.0 chart tier, before anything ships
to npm.

- **Escape goes through the modal seam.** `CartesianPlot` and `TimeSeriesChart`
  handled Escape on the svg itself, where `Modal`'s window-capture listener
  wins: inside a shell window the crosshair stayed lit and the WINDOW closed —
  the same defect fixed in Tooltip (4.30.1), DropdownMenu (4.54.0) and
  DatePicker (4.66.0). Both now register `registerModalEscapeInterceptor`
  while a band is active, and an idle chart leaves Escape to the window.
- **Signed columns.** Grouped columns foot on the zero line, not the plot
  floor, and stacked series stack positives up and negatives down from zero —
  a negative segment used to be clamped away entirely.
- **Series colour is pinned to the caller's order.** A series dropped for
  having no data no longer shifts its neighbours' colours out from under a
  caller-built legend (TimeSeriesChart, ColumnChart).
- **Histogram `bins` honours explicit boundaries.** An edge list was collapsed
  to a bin COUNT and re-spread evenly over the data's own range — backend
  latency buckets silently redrew the distribution.
- **Hostile data cannot take a chart down.** `binValues` skips non-finite
  observations instead of crashing; a NaN `RankedBars` row draws as missing
  (em dash) rather than as the widest bar; a `RadarChart` axis with an
  explicit `max` of 0 no longer erases the polygon; a ragged `ChordChart`
  matrix degrades to zeros; `ScatterChart` no longer crashes when a polling
  caller shrinks the data mid-hover.
- **Dark mode kept its marks.** The RankedBars/Meter tracks moved off
  `bg-gray-100` (which collapses into the host card's `--surface`) to
  `bg-gray-200`, and Meter's objective marker moved off unmapped `bg-gray-600`
  onto the axis ink.
- **Reduced motion hides the shimmer and the ping** instead of freezing them
  fully lit — their resting state is invisible, so the entrance treatment
  (freeze at `opacity: 1`) was exactly wrong for them.
- **Degenerate radial input stays legible.** The sunburst depth ramp is
  floored before it crosses into invalid negative `color-mix()` shares (deep
  rings painted black); `ChordChart` defaults `maxNodes` to the palette's
  eight slots and documents that the tail is DROPPED, not folded;
  `RadialBarChart` track mode draws the rows that fit rather than walking its
  radii negative.
- **Tooltips keep the missing-versus-zero contract everywhere.** RangeChart
  and HeatmapChart printed 0 for an absent row or ragged cell.
- **ChartBrush drags by pointer capture alone** — no window listeners to leak
  on unmount mid-drag, `pointercancel` ends a drag, and `touch-action: none`
  keeps touch drags from being stolen for scrolling.
- **API before it becomes permanent:** the three stray `colour` props
  (`ChartDefsProps.fills`, `ChartDotProps`, `ChartBrushProps`) renamed to
  `color` to match every other prop in the kit; `usePlotWidth` and
  `autoHighlightIndex` are exported; the `ChartCurve`/`ChartStatusTone`
  unions are now aliases of their source-of-truth definitions instead of
  second copies.

## 4.87.0

- **The radial, hierarchical and flow families.** `RadarChart`, `PieChart`,
  `RadialBarChart`, `FunnelChart`, `TreemapChart`, `SunburstChart`,
  `SankeyChart`, `ChordChart` — completing the tier begun in 4.84.0.

- **Radius is square-rooted wherever a radial mark encodes a quantity.** Area is
  what the eye reads, so scaling the radius linearly overstates a large value by
  its square.

- **`SankeyChart` does not run crossing-minimisation.** The iterative relaxation
  a full implementation does is several hundred lines that mostly matter above
  about thirty nodes, and a caller who orders its nodes sensibly gets a clean
  diagram without it. Node ordering is therefore part of the contract rather
  than something the component quietly rearranges. Ribbons use the same `bump`
  curve the line family does — flat where they leave a node, flat where they
  arrive — rather than the private copy the first draft inlined.

- **`TreemapChart` uses the squarified layout** (Bruls–Huizing–van Wijk), so
  tiles stay close to square and their areas remain comparable by eye.

## 4.86.0

- **Charts you can read values off, not just glance at.** The four charts this
  package shipped are decorative on purpose — a stretched `0 0 100 100` viewBox,
  `aria-hidden`, no axis, the numbers living as text somewhere else on the page.
  That is right for a dashboard tile and wrong for anything an operator reads a
  value off, so every consumer that needed one built its own axes, its own
  tooltip and its own colours. `ChartFrame`, `ChartTooltip`, `ChartSkeleton`,
  `ChartDot`, `ChartBrush` and `CartesianPlot` are that missing chrome, and nine
  charts sit on it: `TimeSeriesChart`, `ColumnChart`, `ScatterChart`,
  `RangeChart`, `WaterfallChart`, `HistogramChart`, `BoxPlotChart`,
  `CandlestickChart`, `HeatmapChart`. Still dependency-free SVG.

- **`TimeSeriesChart` has a `step` mode, and no second y-axis.** A value that
  can only land on a known level — a histogram-derived percentile, a tier, a
  discrete state — is not a sample of a continuous signal, and joining two
  levels with a sloped segment draws a transition that never happened. Pair
  `mode: 'step'` with `levels` and the y-axis becomes the level ladder, spaced
  evenly per rung, with the levels themselves as the ticks.

  There is no prop for a second y-scale and there will not be one: the alignment
  between two scales is arbitrary, and the crossing point it produces is a
  correlation the data does not contain. `mode: 'column'` puts volume behind a
  rate in one chart — the Combination form — still on ONE shared axis.

- **`referenceLines` draws a threshold.** Dashed, and above the series: a dash
  reads as "a line someone drew" rather than "a value the data reached".

- **A missing value in a tooltip is an em dash, never a zero.** "No data for
  this bucket" and "zero in this bucket" are different facts, and printing 0 for
  both lies about one of them. Tooltip rows read in stack order, bottom segment
  first, because that is the order a stacked column is read in.

## 4.85.0

- **Inline marks: `RankedBars`, `Meter`, `StatTile`.** The small forms that
  belong inside a table cell or a summary card, where a full chart frame would
  cost more room than the number is worth. They sit on the 4.84.0 primitives, so
  a meter and a chart on the same page carry the same status token rather than
  two hand-picked greens.

  `RankedBars` colours by status or by an explicit series slot, never by
  position in the list. Cycling tones down a list makes colour look like it
  encodes something when it encodes nothing.

## 4.84.0

- **Chart primitives, on their own.** The layer every chart is built from, split
  out and exported before any chart that uses it: `palette`, `curve`, `scale`,
  `treemapLayout`, the fill/motion `effects` and the `highlight` coordination.
  A consumer with a chart type this package does not cover can now compose one
  instead of forking one.

- **A chart palette, at last.** There was no series token anywhere in `ui.css`
  or `themes.css`, so `currentColor` was the only answer and each portal picked
  hues by hand. Eight categorical `--viz-series-*` slots, a reserved
  `--viz-good`/`neutral`/`warning`/`serious`/`critical` status set, and the
  chart inks now ship as tokens, validated for colour-vision separation against
  this package's own surfaces in both themes. Slots are assigned in fixed order
  and never cycled: a ninth series gets the de-emphasis ink rather than a hue
  indistinguishable from an existing one.

  These tokens are deliberately NOT remapped by `themes.css`. Every other accent
  in the package follows the user's chosen theme; a series colour must not,
  because "4xx is amber" is an identity encoding and an identity that changes
  with a cosmetic preference has stopped being one.

- **Five curve types, and the choice is a claim about the data.** `monotone` is
  the curved one to reach for: Fritsch-Carlson interpolation, which cannot
  overshoot between two samples. If the data rises from A to B so does the
  curve — no invented peak, no bump nobody measured.

  It carries a guard the textbook magnitude test does not imply: at a local
  extremum the two neighbouring secants disagree in sign, and any non-zero
  tangent there is an overshoot by construction. That test squares its terms, so
  it throws away exactly the sign that would catch it, and the tangent has to be
  flattened before it runs. Without that, a traffic series that peaks and falls
  draws a burst above the peak that never happened.

  `spline` is the looser Catmull-Rom variant, converted to cubic Bézier so it
  passes through every point, and clamped to the series range because a smooth
  curve through 0, 10, 0 otherwise dips below zero and draws negative requests.
  It can still bulge past an interior point on the way to the next one — that is
  the difference between the two, kept for when the rounder shape is wanted
  knowingly. `step` holds the value, `bump` is flat at each point and curved
  between them, and `linear` remains the default and the only unarguable option
  when the samples are all you know.

- **Fills are named variants backed by patterns**, borrowed from
  [EvilCharts](https://github.com/legions-developer/evilcharts) (MIT) —
  `gradient`, `gradient-reverse`, `solid`, `dotted`, `lines`, `hatched`. Texture
  is first-class rather than a hack, and a hatch is exactly what a colour-vision
  or forced-colors reader needs when hue alone stops separating two series.
  Every entrance animation is disabled under `prefers-reduced-motion`.

## 4.83.2

- **A missing wasm decoder is now reported instead of quietly ignored.** The
  factory added in 4.83.0 accepted any response the host answered with, and
  every portal consuming this package is a single-page app — an SPA serves its
  own `index.html` under HTTP 200 for a path its router does not recognise, so
  a build that failed to emit `jbig2.wasm` or `openjpeg.wasm` returned a PAGE
  rather than a 404. `res.ok` was true, pdf.js was handed `<!doctype html>`,
  and it instantiated that inside a `try` that only warns before dropping to
  its JS fallback. The result was the exact silent degrading 4.83.0 set out to
  remove, with nothing in the console pointing at the emit. The bytes are now
  checked for the four-byte WebAssembly preamble, and a response that fails it
  raises an error naming the file, the URL, what arrived instead, and the
  `window.__REACT_OS_SHELL_PDF_WASM__` escape hatch.

  This is a guard against a future build regression rather than a fix for a
  fault anyone has hit: real builds of the admin and customer portals at
  4.83.1 do emit both binaries. What changes is that if one ever stops, it
  fails loudly at the point of the fault.

## 4.83.1

- **A spreadsheet cell is shown as text, not run as markup.** `EditableGrid`
  rendered each cell by setting `innerHTML` on its `contentEditable` node with
  the raw value, so a cell could carry an element into the page. The value is
  not always the product's own: the admin portal's CSV preview feeds this grid
  an export of storefront form submissions, which anonymous visitors type. Cell
  values are now escaped. Every read path already took `textContent`, so nothing
  wanted markup, and escaping round-trips through `textContent` unchanged — a
  cell holding `a < b` still reads back `a < b`.

  This also stops a quieter data bug. A cell whose text looked like markup was
  rendered as an element, so `textContent` read back less than was stored, and
  the blur handler wrote that shorter value over the row — `<b>x</b>` silently
  became `x` on a blur the user never edited.

- `escapeHtml` moved to `src/utils/escapeHtml.ts`; `Documents` now imports the
  same function it used to define privately. Its own two sinks were already
  correct and are unchanged.
## 4.83.0

- **The `pdfjs-dist` peer range no longer admits an unreviewed major.** It was
  `*` while the devDependency pinned `^5.6.205`, so the viewer was tested at
  5.x and consumed at 6.x; pdf.js 6 removed the bare-string `getDocument(url)`
  overload and every PDF preview in the admin portal failed for ten days before
  4.79.4 repaired the call. The range is now `^5.6.205 || ^6.0.0` and the
  devDependency sits at the top of it, so a future pdf.js 7 has to be added
  deliberately. A new test fails if the call reverts to the bare form, if a
  peer clause loses its major ceiling, or if the devDependency drops below the
  highest major the range promises.

- **Preview now supplies pdf.js's WebAssembly decoders.** pdf.js loads its
  JBIG2 and OpenJPEG decoders from WebAssembly and refuses to fetch them
  without a location from the caller, so those images were silently dropped
  from an otherwise-rendered page — a `warn()` in the worker and nothing on
  screen. The viewer now names the two modules through
  `new URL('pdfjs-dist/wasm/...', import.meta.url)`, which the consumer's own
  bundler resolves and emits, and serves them to pdf.js through a
  `BinaryDataFactory`. No consumer wiring, no CDN, and the binaries always come
  from the same `pdfjs-dist` install as the worker that instantiates them. A
  host serving the whole `pdfjs-dist/wasm/` directory itself can point at it
  with `window.__REACT_OS_SHELL_PDF_WASM__`.

## 4.82.0

- **Tenant portal branding has one shared lifecycle.** `BrandMark` renders
  compact icons and wordmarks without stretching or cropping, falls back
  cleanly when an asset fails, keeps the slot size stable, and uses server
  transparency/tone hints to add a contrast plate only when arbitrary tenant
  artwork would disappear into its surface. The new `PortalBrandingProvider`
  loads hostname-scoped public identity once, before sign-in, and applies the
  browser title and favicon from it.

- **Brand asset settings reuse one editor.** `BrandAssetEditor` owns staged
  upload, drag-and-drop, type/size validation, save/remove states, inherited
  fallback previews, and standard browser-tab, search-result, and shell-slot
  previews while leaving persistence to each product adapter. Programmatic and
  drag-and-drop selection enforce the same configured MIME/extension allow-list
  as the native file picker — including the several media types a browser
  reports for a `.ico` file.

## 4.81.0

- **Entity windows no longer report a missing record while its request is
  still running.** Snapshot-free opens, including Command K results, keep a
  centred, labelled loading state until the detail request settles. Missing,
  permission, authentication, retryable, and other client failures then render
  distinct terminal states, and usable cached data stays on screen through a
  background refresh.

- **A window whose detail query never runs shows a terminal state instead.** A
  disabled query reports `pending` forever, so a `new-` draft opened with no
  snapshot, a duplicate, and every entity window on a host that never called
  `setShellApiClient` would otherwise wait on a request that is never made.

## 4.80.0

- **Start-menu labels stay on one row.** Desktop rows now reserve space for
  their icon and chevron and keep the visible label on a single truncated
  line. A row carries a native tooltip only where the text you can read is not
  the whole name — an explicit compact label, or a label the row had to clip —
  so an ordinary row gains no hover chrome it did not have before.

- **Nav entries can carry a compact `menuLabel`.** `NavItem`, `NavSection` and
  `VirtualSection` take an optional `menuLabel`, used only inside menus, so a
  long report name can show an established abbreviation without shortening the
  page or window title. Search still matches the full label, and an abbreviated
  row is named "<compact>, <full>" to assistive technology — the accessible
  name still starts with the text on screen, which is what voice control acts
  on.

## 4.79.5

- **Date pickers stay usable inside dialogs.** The portalled calendar now opens
  above the dialog and its scrim instead of appearing dimmed behind them. This
  brings `DatePicker` onto the same overlay layer already used by the shared
  select and tag-input menus.

## 4.79.4

- **PDF preview works with pdfjs-dist 6.x.** The Preview viewer called
  `getDocument(url)` with a bare string, an overload pdfjs-dist removed in
  6.x — on a consumer with pdfjs 6 installed every PDF preview failed with
  "Failed to load PDF" and a 0-page document. The call now passes the
  parameter-object form, which both 5.x and 6.x accept.

## 4.79.3

- **Dropdown menus can open above their trigger.** `DropdownMenu` now accepts
  `side="top"`, giving bottom action bars the same shared menu interaction and
  appearance without letting the menu escape beneath a window. The existing
  `side="bottom"` placement remains the default for toolbar and row actions.

- **Searchable select menus keep their trigger's width.** The option menu no
  longer grows to fit its widest option — long labels and sublabels truncate
  inside the menu instead, so a long email address or reference can't resize
  the control's dropdown.

- **Rich radio labels stay inside their option card.** Radio label content can
  now shrink and truncate inside a fixed-width card instead of long rendered
  metadata escaping the option's boundary.

- **Stepper stages sit in equal-width columns.** Every stage — first, middle,
  and last — is centred in its own column, and the connectors anchor to the
  circle centres regardless of label length. Completed/current/upcoming
  colouring and connector behaviour are unchanged.

## 4.79.2

- **A preview whose file arrives before its window no longer hangs on "LOADING
  PDF".** `PdfActionButton` stages a placeholder, opens the window, and
  swaps the document in with `handle.update()` once `fetchPdf()` resolves. That
  update travels as a DOM event, and Preview is a lazy chunk — so whenever the
  fetch won the race against the chunk load, the event was dispatched to a
  window that had not mounted yet, nobody was listening, and the payload was
  gone. The window then sat on the placeholder for ever. Reliably reproducible
  as the FIRST preview of a session (the chunk is uncached and the document
  usually is not); the second preview always worked, which is what made it look
  intermittent.

  The 4.79.0 timeout cannot catch this one: `fetchPdf()` settles perfectly
  normally, so there is nothing to time out. The fetch succeeded, the blob was
  built, and the only thing lost was the delivery.

  `update()` now rewrites the staged payload as well as dispatching the event,
  for as long as the staging is unclaimed — so a window that mounts later drains
  the resolved file instead of the placeholder it was staged with. The window
  adopts it in the same commit that claims the stage, before the listener is
  bound, so the two delivery paths meet with no gap between them. An update
  after the claiming window has closed is still a no-op, and still cannot leak
  into the next Preview someone opens.

- **The Spreadsheets stage had the identical hole, and is fixed the same way.**
  `setSpreadsheetPreview` is the same protocol against the same lazy chunk, so
  an `.update()` that resolved before the window mounted was dropped exactly as
  the PDF one was. Nothing shipped triggers it today — `openPreviewFile` and
  the portals' attachment handler both fetch the CSV before they stage it — so
  this is a latent contract fix rather than a bug anyone has hit, and it keeps
  the two staging surfaces reading the same.

## 4.79.1

- **The notification dropdown no longer grows a horizontal scrollbar.** The list
  was `overflow-y-auto` and nothing else, and CSS computes the *other* axis to
  `auto` the moment one axis is not `visible` — so any horizontal overflow at all
  hung a scrollbar under a panel of fixed width that has nowhere to scroll
  sideways to. A notification title with no break opportunity in it (a container
  or reference number pasted into a subject line) is enough on its own: it
  overflowed the item by ~180px, because only the *message* line carries
  `truncate`. The list is now `overflow-x-hidden` as well, and the title wraps on
  `break-words` so nothing is lost to the axis that is now hidden. Item heights
  and the wrapping of ordinary titles are unchanged.

- **Swept the same bug out of the Start menu.** All four of its scroll regions —
  the mobile search list, the desktop search results, the main nav list and
  every flyout panel — were `overflow-y-auto` and nothing else. A nav label with
  no break opportunity in it ran 110px past a 174px flyout, measured at the
  smallest density. They now name both axes and carry `wrap-anywhere`.

  `wrap-anywhere` rather than `break-words`, because the label is a flex item:
  it refuses to shrink below its min-content size, and `overflow-wrap:
  break-word` does not change min-content, so the row would have been clipped by
  the newly hidden axis instead of wrapping. Ordinary labels already wrapped at
  their spaces and render identically — including the two-line rows a narrow
  flyout has always produced.

## 4.79.0

- **`PdfActionButton` stops waiting for a document that is never coming.** The
  Preview window opens on a "LOADING PDF" placeholder and swaps in the document
  when the consumer's `fetchPdf()` resolves. If that promise never settles — a
  connection torn down mid-flight, a worker killed, a request the browser
  abandoned — the placeholder stayed on screen indefinitely, so a document that
  was merely slow and one that was genuinely dead looked identical to the person
  waiting. A new `timeoutMs` prop gives up after 30 s by default (the slowest
  document measured through the live stack arrived in ~4 s); `0` or `Infinity`
  waits for ever, which is the old behaviour.

  That ambiguity is report BG#00511 — a proforma preview that "would not load",
  with no backend error recorded anywhere for that tenant on the day. The only
  evidence left afterwards was the user's memory of what the screen showed, and
  a placeholder that says nothing is not evidence.

  **A timeout and a failure deliberately say different things.** Internally the
  timeout resolves to a `TIMED_OUT` sentinel rather than rejecting, because it is
  not an error the consumer raised — it is this side deciding to stop waiting.
  The preview placeholder now reads "This document took too long to load. Close
  this window and try again."; a `fetchPdf()` that settles with nothing still
  reads "Failed to load PDF." Download and email toast the timeout rather than
  dropping it, since `null` means the consumer has already told the user why and
  a timeout is ours to explain. All three actions test for the sentinel
  explicitly — it is a symbol, so it is truthy, and the existing `!blob` guard
  in `handleEmail` would otherwise have handed it to the consumer's email
  composer as if it were the document.

  **The losing request is not cancelled.** The shell is transport-agnostic and
  never owns it, so a `fetchPdf()` that settles at 45 s still settles — its
  result is simply dropped, and the person has already been told the document was
  too slow. Consumers whose documents legitimately outrun 30 s should raise
  `timeoutMs`, or pass `0` to opt out; real cancellation means wiring an
  `AbortController` into their own `fetchPdf`. Rejections are untouched: this
  converts silence into a value, never a failure into a success. The helper
  behind it (`withTimeout`, `TIMED_OUT`) is internal and not exported from the
  package entry — `timeoutMs` is the whole public surface.


## 4.78.1

- **Removed the window-restore path that has been unreachable since the portals
  stopped writing `access_token`.** `restoreWindowState()` gated everything it
  did on `localStorage.getItem('access_token')`. Every portal moved its tokens
  into memory on 2026-08-17 and now only ever *removes* that key, and the shell
  has never written it — so the guard has been permanently false and the
  function returned `[]` on every call. Its initial state is now simply `[]`,
  which is exactly what it already produced.

  **No behaviour changes.** Session restore itself is unaffected: that is
  `SessionWindowRestore`, which replays per-user `prefs.session_windows`
  through `ShellPrefs` and never consulted a token. Deleted alongside the
  guard, all of it reachable only through it: `healWindowIds` (a heal for an
  id-collision bug fixed in 3.14.1, applied only to the legacy blob),
  `DEFAULT_WIDGETS` and `seedDefaultWidgetPositions`.

  Worth knowing, because it inverts the obvious reading: the seeding was NOT
  quietly still working. `SessionWindowRestore` skips its restore when a window
  is already open, so while `restoreWindowState()` returned the three default
  widgets it *suppressed* the per-user restore on every load. The dead guard is
  the reason per-user restore runs at all today, and reviving the guard would
  switch it back off.

  A brand-new account therefore opens on an empty desktop rather than a seeded
  Weather / Currency / World Clock stack. That is the state on 4.78.0 as well —
  this release removes the code, not the behaviour. Seeding first-run widgets is
  worth doing again, but it belongs in `SessionWindowRestore` beside the prefs
  it would have to respect.

- **Stopped writing `erp_open_windows`.** `saveWindowState` wrote the open-window
  list to that key on every window change and nothing read it back — the only
  reader was the removed path. The key is browser-global, so it also carried
  record-bound window labels and entity ids across accounts on a shared machine
  (the supplier portal namespaces it per user for exactly that reason,
  BG#00340). Consumers scoping or pruning it can drop that handling once they
  are on this version; it is inert either way.

## 4.78.0

- **`Select` sizes its touch branch for a finger.** On touch it already swapped
  the custom listbox for the native `<select>` — the OS picker being the better
  affordance — but it passed the caller's desktop rung straight through, so it
  rendered a 39px control under a finger at `size="lg"` (measured), and a rung
  shorter again at the default `md`. Both are below the 44px WCAG 2.5.5 floor
  every `Button` touch rung is held above. The touch branch now takes the `touch` rung and discards
  the desktop one: `sm`/`md`/`lg` are the desktop ladder, and this branch only
  renders when there is no desktop.

  **This changes the height of every mobile `Select` in every consumer.** A
  `size="lg"` Select goes 39-40px → 56px; a Select with no `size` — the common
  case, and 15 of the 21 mobile call sites in the dealer portal — goes from the
  `md` rung to 56px, close to double, and from `text-sm` to `text-base`. The
  unsized ones are the bigger jump, and they are the ones nobody thought about
  when reading this.

  Worth a look on any phone layout that puts a Select in a row or stack with
  another control. `Select` is currently the only control in the kit that picks
  its own touch rung: `Input`, `Textarea`, `DatePicker`, `TimePicker`,
  `DateTimePicker`, `InputNumber` and `TagInput` all render what they are given
  on every viewport, and `SearchableSelect` has no size axis at all. A field
  that renders a Select or an Input depending on its data will now change
  height with the data.

- **`Select` takes a `touchSize`.** Defaults to `touch`, so the fix above is
  what you get for free. Pass a desktop rung to line a Select back up with the
  neighbours it shares a row with — `touchSize="md"` against an unsized `Input`
  — without dropping to `NativeSelect`, which is a native `<select>` on the
  desktop too and brings back BG#00421 (the OS popup swallows every key event,
  so shell hotkeys die while it is open). `NativeSelect` is unchanged and
  remains the way out of the branch entirely.

## 4.77.0

- **`EntityList` can name the entity in its load error.** New optional
  `errorTitle` / `errorMessage` props are forwarded to the `ListLoadError`
  rendered when `isError` is set and no rows have loaded. `ListLoadError` has
  always accepted `title`/`message`, but `EntityList` rendered it bare, so a
  list adopting the native `isError` prop had to trade its own copy —
  "Couldn't load the talent database", "Couldn't load blog posts" — for the
  generic "Couldn't load this list", and the custom `ListLoadError` such lists
  used to render through the `emptyState` ternary is unreachable once `isError`
  is passed. Both props are optional and omitting them keeps the generic
  defaults, so existing callers are unaffected.

## 4.76.0

- **Cmd+Enter finds `.btn-submit` buttons.** The submit-button selector
  `Modal.submitModal` falls back to when a window has no `<form>` matched
  `type="submit"`, `[data-submit]`, `.bg-green-600` and `.bg-blue-600` — but
  not the `.btn-submit` utility class. Converting a button from a hardcoded
  `bg-blue-600` fill to the themable `.btn-submit` therefore dropped it out of
  the selector silently: Cmd+Enter stopped working while the button's own ⌘⏎
  badge went on advertising it. Consumers had to add `data-submit` alongside
  the class to keep the hotkey (the admin portal did so across ~26 buttons).
  `.btn-submit` is now matched on its own, and those `data-submit` attributes
  become redundant — though they remain valid and are still required for any
  consumer whose `^` range can resolve an older shell.
- **`MODAL_SUBMIT_SELECTOR` is exported.** The selector string was previously
  private, so consumers asserting on Cmd+Enter behaviour hardcoded a copy of it
  in their own specs and had no way to notice it drifting. Import it instead.

## 4.75.0

- **Entity windows can declare `flushBody`.** `ModalRegistryEntry` now
  accepts the same `flushBody` flag page windows have had: standard title
  bar and footer, but no body padding and no body scroll — the detail
  component owns its own layout and scrolling. Until now the flag was
  silently ignored on entity entries (the type didn't declare it and the
  entity `<Modal>` never forwarded it), so full-height tabbed/split detail
  views rendered inside the default `p-4` scrolling body. The page-window
  path is unchanged.

## 4.74.1

- **Entity windows: a render-callback close actually closes while editing.**
  The chrome close (title-bar X / ESC) deliberately exits edit mode first on
  a pristine editing window — but `entry.render()` received that same guarded
  close as its `onClose`, so a programmatic close from inside the window was
  silently converted into "exit edit mode". The flagship casualty was every
  delete flow wired `onDeleted={onClose}`: the record was deleted, the close
  was swallowed, and the window fell back to a detail view of a record that
  no longer existed. `entry.render()` now gets the raw close; the chrome's
  exit-edit-first behaviour is unchanged (both spec-pinned).

## 4.74.0

- **Snap layouts picker.** Rest the pointer on — or focus — a window's
  maximize button and a small palette of the snap zones appears: the left and
  right halves and the four quarters, as click targets. Pure UI over the
  snapping module's own `calcSnapBox`, so a picker snap behaves exactly like
  a drag-to-edge snap or Ctrl/Cmd+arrows: it saves the pre-snap box, and
  Ctrl/Cmd+↓ or the next drag restores the window's natural size
  (spec-pinned). Opens after a short delay so a pass-over doesn't flash it,
  closes on blur/mouse-leave with a grace period, and each zone carries a
  catalog-translatable label. The quarters are new reachable-by-click
  geometry for the mouse; the keyboard's half/maximize/restore set is
  unchanged.

## 4.73.0

- **Notification Do Not Disturb.** The badge keeps counting, the
  interruptions stop: with DND on (the moon toggle in the bell's popover,
  persisted per user via ShellPrefs as `notifications_dnd`), a new
  notification raises no pop-up card, no browser Notification and no sound —
  but the unread count still climbs and the bell shows a quiet moon marker,
  because muting alerts must not hide their existence. The suppressed
  notifications are not lost: the bell's dropdown has always been the
  history, fed by the consumer's own `list`. Turning DND off does not replay
  the backlog — the counter advances while muted, so only the NEXT
  notification interrupts (spec-pinned).

  The bell's strings ("Notifications", "Mark all read", "All caught up",
  the pop-up card's labels) also joined the 4.68.0 catalog.

## 4.72.0

- **`FormErrorSummary`** — the error list at the top of a failed form.
  `FormField` announces its own error, which is right for one field and
  useless as a map: a long form failing in three places gave a keyboard or
  screen-reader user no count and no route. This is the WCAG 3.3.1 pattern
  as GOV.UK ships it — a box that takes focus when the errors APPEAR (and
  does not re-steal it on every re-render while the user works through the
  list, which a spec pins), listing each message as a link that focuses the
  offending control. The links target the same control ids FormField already
  wires, so adoption costs a `{ fieldId, message }` list, not a rewire; the
  heading comes from the strings catalog.

## 4.71.0

- **`toast.promise(p, { loading, success, error })`** — one toast for one
  async operation. A spinning loading toast (sticky, `role="status"`, no
  sound — the sound belongs to the outcome) while the promise is pending,
  swapped for the success or error toast when it settles. "Saving… then
  Saved, or the failure" was previously two hand-orchestrated toasts at
  every call site. `success` and `error` may be functions of the resolved
  value / the rejection ("Saved 3 rows"), and the promise is returned
  untouched, so the caller's own error handling still runs.

  `error` is required, and there is deliberately no fallback that prints the
  exception itself: a raw `e.message` in a toast is how internals leak to
  the screen — the same reasoning that keeps ErrorBoundary's stack behind
  `showDetails`. A spec pins that an `ECONNREFUSED …` rejection never
  reaches the DOM.

## 4.70.0

- **`DataTable` takes `selection`** — `{ selected, onChange }`, a leading
  checkbox column controlled by row key. Bulk actions over a server-driven
  list used to force `EntityList`, which drags in axios and react-query;
  this is the peer-free version. Selection is by KEY, so it survives paging:
  the header checkbox adds or removes only the current data's keys and
  leaves foreign keys alone — "select three here, two more on page 4"
  accumulates, and clear-all on one page cannot silently drop another
  page's choices (spec-pinned). The header checkbox reads indeterminate for
  a partly-chosen page, a checkbox click never also opens a clickable row,
  the column composes with pinned columns (their offsets shift right) and
  with `virtualized`, and the checkboxes carry catalog-translatable labels.

## 4.69.0

- **Windows reopen after login — and after F5.** Window state is in-memory,
  so logging out or refreshing always meant an empty desktop. The shell now
  saves each open window's identifying refs (a page's route, an entity's
  registry key + id — never window content) through ShellPrefs, and replays
  them on a fresh mount when nothing is open yet. A deep link that already
  opened a window wins over the replay; part-number lookup windows are
  deliberately not restored (they open through a search round-trip, and a
  stale search re-running itself at login is a surprise, not a restoration).
  Off switch in Preferences → Behavior ("Reopen windows from the last
  session"); saves are debounced; and persisting starts only after the
  restore attempt, so mounting with an empty desktop cannot overwrite the
  saved set it was about to replay — the ordering that would otherwise make
  the feature erase its own input, and the thing the specs pin.

## 4.68.0

- **`ShellStringsProvider`** — the shell's own strings become translatable.
  Every user-facing string was hardcoded English at its call site — "Goodbye",
  "Nothing to show", the window-control tooltips, the About dialog — so the
  shell stayed English no matter what the consuming portal did. They now live
  in one typed catalog (`ShellStrings`) that components read through
  `useShellStrings`; with NO provider the English defaults apply, so nothing
  changes for an app that never mounts it, which a spec pins.

  An override is a typed partial merged per section — translating the window
  controls does not oblige anyone to translate the help viewer, and a catalog
  that falls behind a release falls back to English instead of breaking.
  Prop-level text (`emptyText`, `emptyOptionLabel`, placeholders) always wins
  over the catalog: it replaces hardcoded DEFAULTS, never a caller's words.
  Deliberately not an i18n library — no message IDs, no interpolation DSL;
  the shell's strings are labels and short sentences, and a typed object
  keeps a translation honest when a string is added.

  Wired so far: window chrome (controls, context menu, title-bar aria),
  taskbar and exposé, the logout cover, About / What's New, DataTable and
  picker defaults (SearchableSelect, TagInput), and HelpCenter. Remaining
  strings migrate incrementally; the widget context menu and ShortcutHelp
  descriptions are the known stragglers. Two capitalisation drifts were
  unified along the way ("Pin on Top" vs "Pin on top" said both, in different
  menus).

- **CI tests the suite under React 19** as well as 18 — the admin portal runs
  the shell on React 19 in production, and the `>=18` peer range is now a
  tested promise rather than a hopeful one.

## 4.67.0

- **A dropdown opened inside a dialog is no longer hidden behind it.** `Select`,
  `SearchableSelect` and `TagInput` all portal their menu to `<body>` at
  `z-[400]`, and the modal layer is `z-[9999]` — so a select inside a Dialog or
  Drawer, which is where form controls usually are, opened its list behind the
  thing that owns it. Nothing looked broken; the options simply were not there.

  All three now open above the modal layer, and a spec pins the ordering.

- **A `Select` menu is the width of its field.** It set `minWidth` from the trigger
  and capped nothing, so the list grew to its longest option — in a 512px dialog a
  464px field opened a 583px menu that hung 95px past the dialog edge. It takes the
  field's width now, clamped to the viewport, and the rows truncate as a native
  `<select>` does.

- **A side `Drawer` is full width on a phone**, its asked-for width from the `sm`
  breakpoint up. A 320px drawer on a 375px screen left a 55px strip of scrim — too
  narrow to aim at, too wide to read as an edge — and made the panel look like a
  desktop rail that had been squeezed rather than a sheet built for the screen.

  The width moved from an inline style to a class to make that possible: an inline
  width beats every `sm:` variant, so the responsive step could never have taken.
  The classes are written out rather than interpolated, because Tailwind emits a
  utility only when it has seen the literal string.

- **`Dialog` can be dismissed, and shows it.** Clicking away did nothing: the
  scrim carried the handler and the centring layer sat on top of it covering the
  same viewport, so every click outside landed on the layer and reached nothing.
  And there was no close button at all — a dialog whose body was, say, an image
  could be left only with Escape, which is on no screen.

  The backdrop dismissal moved to the layer that actually receives the click, and
  a close button sits in the corner. `blocking` opts out of both, for the dialogs
  that must be answered, and so does having a `footer`: a confirm already gives
  two labelled ways out, and an unlabelled cross beside "Discard" and "Keep
  Editing" is a third exit that says nothing about which it means — worst on the
  decision where it matters most. The button is LAST in the DOM though drawn
  top-right: first, it became the dialog's first tab stop and shadowed the real
  choice.

- **A spec that fails no longer costs the file's timeout.** A React root keeps the
  event loop alive, so a test whose assertion threw before its own `unmount()` did
  not merely fail — the file stopped exiting, node waited out the per-file timeout,
  and reported "the file timed out" with the actual assertion nowhere in the
  output. Measured on `drawer.test.tsx`: 82 seconds and no failure named, against
  1.4ms and a named failure once the unmount was guaranteed.

  `tests/dom.ts` now tracks every root it hands out and unmounts the survivors in
  an `afterEach`, so no individual spec has to remember.

## 4.66.0

- **`Calendar`** — a month grid that can be driven from the keyboard. `DateRangePicker`
  had one inline: 42 buttons in a `<div>`, no arrow keys (reaching the 20th meant twenty
  presses of Tab), each cell named by its number alone — "15", of which month? — and no
  grid semantics, so a screen reader announced a list of buttons rather than a date table.

  Now `role="grid"` with rows, column headers and `aria-selected`; a roving tabindex so the
  whole grid is one tab stop; arrows to move, Home/End for the week, PageUp/PageDown for the
  month and Shift+PageUp/Down for the year; each day named as "15 August 2026"; `aria-current`
  on today; `min`/`max` honoured by mouse and key alike; and the month/year quick-jump panels
  the range picker had. Single or `range` mode.


- **`DatePicker` draws the kit's calendar.** It was a native `<input type="date">`, which
  renders one widget in Chrome and another in Safari and neither is the one `DateRangePicker`
  draws — two date fields on a row looked like two products. The platform control is still
  one prop away (`native`), which is the right call on a mobile-first surface. The value still
  rides a hidden input, so a plain `<form>` posts it exactly as before.

- **`DateRangePicker` uses `Calendar`** rather than its own copy of one — 481 lines down to
  338, and it inherits every keyboard and ARIA fix above. No API change.
## 4.65.0

- **`Segmented` no longer breaks when an option wraps.** A two-word label on a phone
  wrapped to a second line while the pill kept its fixed height, so the selected segment
  was shorter than its own text and the track sat crooked around it. Options are now one
  line each and the track scrolls when they do not fit — the right failure for a segmented
  control, since letting it grow pushes whatever is beside it off the screen.

- **`Drawer` without a title no longer reserves an empty header row.** The close button
  shares the header with a title when there is one and floats over the body when there is
  not. A navigation drawer has no title bar by design — its own content is the heading —
  and the reserved row cost a bordered strip of nothing at the top of the panel, which is
  exactly the space a phone does not have.

## 4.64.0

- **`Dialog` and `Drawer` name themselves properly.** Both derived their
  accessible name from `title`, and only when `title` happened to be a plain
  string. Two ways that failed, both silent:

  - A title built from elements — an icon beside a word, a count in a badge — is
    a `ReactNode`, fell through the `typeof === 'string'` check, and left the
    overlay with no name at all while the heading sat visible on screen.
  - An overlay with no title had no way to be named. A navigation drawer is
    exactly that case: its content is its own heading, so there is nothing to put
    in a title bar, and it was unnamed by construction.

  The name now comes from `aria-labelledby` pointing at the rendered heading, so
  an element title works. Both also take an **`aria-label`** for the untitled
  case; it is ignored when `title` is set, because two names for one thing drift
  and the one a sighted user can read is the one that has to survive.
## 4.63.0

- **`Layout` takes `branding`** — `{ productName, logo, tagline }`, the
  product's visual identity in one object. The start-menu button, the startup
  splash, the logout cover and the mobile landing all read from it; its
  fields win over the older loose `productName` / `productIcon` props, so a
  consumer can move over field by field. The two full-screen covers also stop
  hard-coding `/favicon.svg`: both take a `logo`, and the logout cover takes
  the `tagline` the splash already showed. Defaults are exactly what they
  were, which a spec pins.

  The About dialog and What's New changelog were already configurable and
  stay where they belong, on `DesktopHostConfig` (`productName`,
  `productIcon`, `productChangelog`, …) — that is the desktop's identity;
  `branding` is the chrome around it. `src/changelog.ts` keeps its empty stub
  role, and its comment now points at the real wiring instead of an
  "eventual" one.

## 4.62.0

- **`Stepper`** — the progress strip of a linear wizard, Tabs' one-way
  sibling: the consumer owns the current step and renders the body, the strip
  draws the numbered circles, connectors and labels. Semantically an `<ol>`
  with `aria-current="step"` on the current item; the circles are decoration
  and hidden from assistive technology, the label names the step.

  The one-way rule is the design: completed steps are clickable to go back
  (when `onChange` is wired — omitted, the strip is a pure indicator with no
  controls), and upcoming steps never are. Moving forward belongs to the
  wizard's own Continue button, behind whatever validation the current step
  demands — a strip that lets the user jump to Payment from Contact has
  silently promised that nothing in between mattered.

## 4.61.0

- **`DataTable` takes `virtualized`** — `{ height, rowHeight, overscan? }`.
  Pagination and infinite scroll bound what is *fetched*; nothing bounded what
  is *rendered*, so a few thousand loaded rows all got DOM and every sort or
  filter re-laid-out the lot. With the prop, the wrapper becomes a vertical
  scroll container, only the rows near the viewport exist (two spacer rows
  keep the scrollbar honest about the rest), and the header pins to the top —
  including the corner cell of a pinned column, which stays put in both axes,
  and a grouped header's second row, which pins below the first at a measured
  offset.

  Rows keep their ABSOLUTE index: `render`, `rowClassName` and `rowKey` never
  see window-relative positions, so striping and identity survive scrolling.
  `rowHeight` is a promise, not a measurement — every row renders at exactly
  that height, so `ellipsis` long columns rather than letting them wrap.
  Off-screen rows are absent for assistive technology too, the trade every
  windowed list makes. A table without the prop renders exactly as before,
  which a spec pins.

## 4.60.0

- **`TagInput`** — SearchableSelect's multi-value sibling. The field holds the
  chosen values as removable chips with an inline input after them; typing
  filters the option list in the same portaled frosted dropdown, and picking
  an option appends it and keeps the list open, because multi-add is the
  entire point. Assigning several categories, roles or suppliers to a record
  is this shape, and each portal was one afternoon away from hand-rolling it.

  The contracts: the value array stays duplicate-free by construction (chosen
  options leave the list, re-adding is a no-op); `allowFreeText` gates
  unlisted entries (Enter / comma / Tab / clicking away commit, and it is off
  by default); Backspace in the empty input removes the last chip.

- **The dropdown positioning hook moved to `src/forms/dropdownPosition`** —
  promoted out of SearchableSelect verbatim when TagInput needed the identical
  flip/track/clamp behaviour. No behaviour change; SearchableSelect now
  imports it.

- **Specs can type into portal-rendering components.** The test runner now
  preloads a DOM (`node --import`) before spec bundles evaluate. esbuild
  hoists external imports above the bundled modules, so a component that
  statically imports `react-dom` (Modal, SearchableSelect, TagInput) evaluated
  it before `tests/dom.ts` could install the globals — react-dom's one-time
  environment sniff then concluded `input` events are unsupported and routed
  text-input events through its IE polyfill, where onChange never fires and a
  keydown throws. Specs in such files could click and press keys on divs, but
  never type; now they can.

## 4.59.0

- **`TimePicker` and `DateTimePicker`** — the form kit had `DatePicker` and
  `DateRangePicker` but nothing for time, so a delivery window or a scheduled
  report run could not be expressed. Both follow the DatePicker bargain: a
  native input (`type="time"` / `type="datetime-local"`) wearing the kit's
  field styling, so the browser supplies the wheel, the locale's 12/24-hour
  convention and the keyboard behaviour.

  The timezone rules are the DatePicker ones, applied one step further.
  TimePicker's `onChange` hands back an `HH:MM` string, never a Date — a time
  of day names no calendar day, so a Date built from one has a made-up date
  inside it. A Date passed as `value` contributes its LOCAL wall-clock fields
  (never `toISOString`). DateTimePicker serialises and parses local fields
  only, hands `onChange` a Date built from the parsed integers with the local
  constructor, and rejects rolled-over values (`2026-02-31T10:00`) rather than
  letting the constructor slide them into March. A sub-minute `step` makes
  TimePicker speak seconds, in both directions.

## 4.58.0

- **`LineChart`** — the chart family stopped at `Sparkline` for trends: no
  axes, no series, fixed pixel width. Any page showing orders-per-week had
  nothing to reach for. LineChart is Sparkline's big sibling — multi-series
  over shared x positions, container-filling width, optional scale gutter with
  reference lines, color-dot legend, point dots with tooltips, per-series area
  fill — and still a dependency-free inline SVG themed by `currentColor`, like
  the rest of the family.

  The plot is a stretched 0–100 viewBox so it can fill whatever the dashboard
  gives it; `vector-effect: non-scaling-stroke` keeps lines a uniform
  screen-space width under that stretch, and the dots are zero-length
  round-capped strokes because a stretched circle is an ellipse. Decorative
  like its siblings (`aria-hidden`) — the numbers it draws should also exist
  as text on the page.

## 4.57.0

- **The startup and logout covers respect `prefers-reduced-motion`.** They are
  the two longest animations in the shell — spin-in, bouncing dots, a pulsing
  glow, a spin-out — and the two that ignored the setting, while WindowManager
  and Modal already honour it. Under reduced motion the fades stay and the
  movement goes: keyframe animations park at their base state and the
  slide/scale phases become plain cross-fades. Timings, the startup `ready`
  gating and the logout cover-and-swap are untouched — the preference is about
  motion, not about how long a splash holds.

## 4.56.0

- **Keyboard window management.** The title bar is the pointer's drag handle,
  and it is now the keyboard's too: a tab stop where plain arrows move the
  window in 24 px steps, Shift+arrows resize it against the same 384×400 floor
  the pointer resize enforces, Ctrl/Cmd+←/→ snap to the half-screen zones,
  Ctrl/Cmd+↑ maximizes, Ctrl/Cmd+↓ restores the pre-snap box — or minimizes
  when there is nothing to restore — and Enter mirrors the maximize button.
  Moving, resizing and snapping a window were pointer-only, which left the
  window itself outside WCAG 2.1.1 — the same reasoning that put clickable
  table rows into the tab order in 4.53.0.

  Keys pressed on the bar's own controls stay theirs (Enter on Close still
  closes), locked layouts (sidebar mode) and exposé get no tab stop because
  the keys could do nothing there, and `ShortcutHelp` gained a Windows
  section listing the keys.

## 4.55.0

- **`ErrorBoundary`** — catches a render crash and shows the 500 page instead of a
  blank screen. `WindowErrorBoundary` guards one desktop window's body; this one is
  for a plain React app, which is what the portals are. Each portal had written its
  own, and each hard-coded its own colours to do it.

  Two defects the hand-written ones shared, and the reason this is a component
  rather than a snippet: they printed `error.stack` into the page unconditionally,
  which hands a visitor the internal module layout — here the detail is opt-in via
  `showDetails` and off by default; and they replaced the content in silence, so
  the fallback is now `role="alert"`.

  Takes `onError` for reporting to Sentry or the app's own logger, `resetKeys` so
  navigating away from a crashed page recovers without a reload, `actions` for a
  link home, and `fallback` to replace the page entirely.

## [Unreleased]

## [4.54.0] — 2026-08-13

### Added
- **`DropdownMenu`** — a trigger and the menu it opens. `PopupMenu` is a
  surface: the caller positions it and decides when it exists, which is right
  for a context menu summoned at a cursor. A dropdown hangs off a control, and
  everything that makes it usable — where it lands, when it closes, which item
  the arrows are on, where focus goes afterwards — is the same wherever it
  appears, so writing it again beside each trigger is how three portals ended
  up with three of them.

  Arrows move between items, Home and End jump to the ends, disabled items are
  skipped, the ends wrap, and the menu is one tab stop. Escape closes it and
  returns focus to the trigger; a click elsewhere closes it and leaves focus
  where the user put it. Opening with ArrowUp lands on the last item.

  The surface is `PopupMenu`, so a dropdown and a context menu look the same
  and follow the same `--menu-density`.
- `PopupMenuItem` accepts `role`, `tabIndex`, `id`, `onMouseEnter` and a `ref`,
  so a menu can carry its semantics without a second copy of the item styling.

## [4.53.0] — 2026-08-13

### Fixed
- **A clickable table row can be reached from the keyboard.** `onRow`'s
  `onClick` was on a `<tr>` with no tab stop and no key handler, so a table
  whose rows open a record was mouse-only — and there is no other control in
  the row to tab to instead, because the row *is* the control (WCAG 2.1.1). It
  is now focusable, Enter and Space open it, and Space does not also scroll the
  page out from under the row the user was aiming at. A row with no click stays
  out of the tab order: one stop per row on a 200-row table is an obstacle
  course, not an affordance.
- **A sortable column says it is sortable.** `aria-sort` was omitted until a
  column was actually sorted, so the only columns announcing themselves as
  sortable were the ones already sorted. Unsorted sortable columns now carry
  `none`; a column that cannot be sorted still carries nothing, which is what
  makes `none` mean something.

## [4.52.0] — 2026-08-13

### Added
- **`DataTable` takes column groups** — a header spanning several columns,
  rendered as a second header row. A statement puts Debit and Credit over an
  amount and a balance each, and both amount columns are called "Amount": the
  group is the only thing telling them apart, for a reader and for a screen
  reader, which reads a `scope="colgroup"` header as part of each column's
  context. Flattening is not a workaround for the same reason.

  A leaf beside a group spans both header rows, so its label sits level with
  the group's children rather than floating above an empty cell. Sorting,
  pinning and alignment are unchanged and belong to the leaf. A table with no
  group renders one header row exactly as before, which a spec pins.

## [4.51.0] — 2026-08-13

### Added
- **`DataTableColumn.sortFirst`** — which way the first click sorts, ascending
  by default. `desc` is right wherever the interesting end is the top: a price
  column, a quantity, a date where the newest matters. Making those start
  ascending costs every user two clicks to reach the thing they opened the
  column for. The cycle is unchanged either way — first, reverse, then back to
  the server's own ordering.

## [4.50.0] — 2026-08-13

### Added
- **`DataTable` takes a `caption`**, rendered as a visually hidden
  `<caption>`. A table with no name is announced as "table" and nothing else,
  so a page with two of them — the invoice lines and the payments against it —
  gave a screen-reader user two identical landmarks and no way to tell which
  was which. The heading above it does not help: table navigation jumps between
  tables, not through the prose around them.

## [4.49.0] — 2026-08-13

### Added
- **The kit declares the radius and type tokens.** It had none, so "inherit the
  kit's radius" resolved to "inherit Tailwind's default" — there was no opinion
  here to inherit, and a portal that wanted one declared its own `@theme` and
  stopped taking anything from this package at all.

  Every value equals Tailwind's own default, so **nothing renders
  differently**. What changes is where the value comes from: a portal that
  deletes its own block now takes its shape from here, and one edit moves all
  of them. A consumer's `@theme` still wins, because Tailwind merges the blocks
  and the later declaration replaces this one — a portal keeps its own shape by
  saying so, rather than by this package having no view.

  On type: the token is here, the **typeface** is not. Shipping a face means
  hosting and licensing it, which is a product decision rather than a packaging
  one; until it is made, a portal that sets nothing gets the system stack, the
  same as before.

## [4.48.0] — 2026-08-13

### Added
- **The dark neutral ramp is twelve variables.** Dark mode is 200 `!important`
  rules remapping Tailwind utility names, and every neutral in them was a
  literal — so a consumer wanting a different dark (warmer, higher contrast,
  its own brand) had to fork the file. The rules now read `--surface`,
  `--surface-sunken`, `--surface-raised`, `--line-subtle`, `--line`,
  `--line-strong` and `--ink-faintest` through `--ink-strongest`, declared on
  `[data-theme="dark"]` with the values they already had.

  **Nothing renders differently.** With the shipped defaults every rule
  resolves to exactly the value it resolved to before, which a spec asserts by
  substituting the variables back and comparing all 200 blocks.

  The status hues — red for danger, amber for warning — stay literal on
  purpose. They mean the same thing in every product, and redefining "danger"
  is a different conversation from restyling greys.

  The names say what a step *does* rather than which Tailwind number it
  replaces, because in a light theme the numbers run the other way round while
  the roles do not.

## [4.47.0] — 2026-08-13

### Added
- **`DataTableColumn.numeric`** — the column holds a figure or a code (money, a
  quantity, a part or order number). It renders monospaced and right-aligns by
  default. The table already sets `tabular-nums`, so digits line up down every
  column without this; what `numeric` adds is a fixed advance for *every*
  character, which is what lets `00620L6N25KMFCBTDTM2QND` be compared against
  its neighbour by shape. An explicit `align` still wins — a part number is a
  code that reads left-to-right like a word.

## [4.46.0] — 2026-08-13

### Fixed
- **A `FormField` error announces itself.** A validation message appears after
  the user submits, without focus moving to it, so without a live region it
  reached nobody — and of everything a form says, this is the one it cannot
  afford to lose (WCAG 4.1.3). It is now `role="alert"`. A hint is not: it was
  there before anything went wrong, and announcing it assertively would cut
  across whatever the user was reading.
- **The required marker is decoration.** The `*` was exposed, so it became part
  of the label on every required field of every form — "Company name star".
  `required` on the control is what assistive technology should read.

## [4.45.0] — 2026-08-13

### Fixed
- **`ErrorPage` no longer draws two buttons that do nothing.** It rendered "Go
  back" and "Take me home" with no handlers on either. They looked like the way
  out of a dead end and did nothing, which is worse than offering nothing —
  the user spends a click and a moment of trust finding out. The way out now
  comes from the consumer through `actions`, because the kit has no router and
  cannot know the destination. Omitted, no control is drawn.

  **This changes what existing consumers render**: the two buttons disappear.
  They were inert, so nothing that worked stops working — but a page that
  looked like it offered a way home now visibly does not until `actions` is
  passed.

## [4.44.0] — 2026-08-13

### Fixed
- **A toast is announced.** It carried no `role` and no live region at all, so
  a message that appears without the user moving focus reached a screen-reader
  user not at all — the same criterion `Result` was fixed against in 4.25.0
  (WCAG 4.1.3), on the one component whose entire job is a status message.
  Every toast in every portal was silent. A failure is `alert`, which
  interrupts; everything else is `status`, which waits. `aria-atomic` reads the
  whole toast rather than the word that changed.
- **A toast waits while you read it.** The dismiss timer now holds while the
  pointer rests on it. Three seconds is enough for a confirmation and not
  enough for an address someone leaned in for, and a toast that vanishes as you
  reach for it cannot be re-read — there is no history to open.

## [4.43.0] — 2026-08-13

### Added
- **`toast.warning`.** The kit had `success`, `error` and `info`. A portal
  reporting a partial outcome — "saved, but the tax rate could not be
  refreshed" — had to choose between `error`, which says the thing did not
  happen, and `info`, which says nothing needs attention. Neither is true. It
  is amber rather than the error red on purpose: painting both the same colour
  teaches people to stop reading it. It takes part in `dedupe` like the others.

## [4.42.0] — 2026-08-12

### Added
- **A `Card` can be a labelled region with a real heading.** A card with a
  title *is* a region of the page — the thing a screen-reader user jumps
  between, and the thing a heading list is for. It rendered as a `div` whose
  title was a bold `div`: it looked like a heading to everyone who could see it
  and was invisible to everyone navigating by structure. `headingLevel` renders
  the header as that heading and the card as a `<section>` named by it;
  `aria-label` names a card that has no header to name it.

  The level is the caller's because only the caller knows the page's outline —
  a card inside a section that already has an `h2` needs an `h3`, and guessing
  produces a jumbled outline rather than no outline.

  **Both are opt-in and every card shipping today is unchanged.** A `<section>`
  is only a landmark once it has a name, so an unnamed card stays a `div`: a
  dashboard of twelve would otherwise become twelve unnamed regions, which is
  worse for navigation than none.
- **`Card` gains `headerActions`** — a count, a filter or a "View all" opposite
  the title. A separate slot because it has to stay OUT of the heading: folded
  into `header`, a card titled "Team Members" with a "Team active" chip beside
  it announces itself as "Team Members Team active", and that is the string a
  heading list shows and a voice command has to match.
- **`Card` gains `bodyClassName` and `style`.** The body is a wrapper the
  component owns, so `className` could not reach it — a card whose contents are
  a column with a gap had to nest a div inside the one already there just to
  say so. `bodyClassName` is additive to the padding rather than replacing it.
  `style` is for what cannot be a class: an animation delay computed per item,
  a measured height.

## [4.41.0] — 2026-08-12

### Added
- **`ColoredBadge` takes a `tone`.** The kit had two badges and no way to ask
  for a colour by name: `StatusBadge` maps a domain status *string* through a
  consumer-supplied provider, and `ColoredBadge` took raw Tailwind classes. A
  consumer that already knew it wanted "success" — a plain label, not an entity
  status — had to hardcode `bg-green-100 text-green-800` at the call site,
  which is the thing `StatusBadge`'s own docblock exists to prevent. `tone`
  reads the **same table** `StatusBadge` does, so the two can never disagree
  about what success looks like. `colorClass` is now optional and still wins
  when both are given; neither renders neutral.
- **`ColoredBadge` accepts `className`.** A badge in a table cell needs
  alignment and tabular numerals from the call site, and there was no way to
  pass them.
- `GROUP_COLORS` is exported, so a consumer building its own palette map can
  read the table rather than copy it.
- **A `ColoredBadge` can be closable** — a filter chip the user can drop. The
  close control's accessible name is derived from the badge's own text
  ("Remove Winter tyres", not "Remove"), because a row of chips with five
  identical buttons tells a screen-reader user nothing about which filter each
  one drops. `closeLabel` overrides it, and is what to reach for when the
  children are not plain text.

## [4.40.0] — 2026-08-12

### Changed
- **`DescriptionList` shows an em dash where a value is absent**, rather than an
  empty cell. A blank answers nothing, and inside `bordered` — where the cell
  has an outline of its own — it reads as a rendering fault rather than as
  "there is no tracking number". Only `null`, `undefined` and `''` are
  replaced: `0` and `false` are answers, and reporting a zero balance as "we do
  not know" would be a different and worse statement. `emptyText` overrides the
  dash, and `emptyText={null}` restores the previous rendering.

  **This changes what existing consumers render** wherever a value was empty.

## [4.39.0] — 2026-08-12

### Added
- **`EmptyState` takes an icon, not just a switch.** `icon` was a boolean
  toggling one hardcoded inbox, so every empty state in every app was an inbox
  — an empty catalogue, an empty invoice list and an empty message drawer drawn
  identically, when the icon is the fastest thing on that screen to read. It
  now also accepts an element. The boolean behaviour is untouched, including
  `variant="card"` defaulting to no icon.

### Fixed
- `EmptyState`'s icon is `aria-hidden`. It repeats what the title already says,
  and announcing it is noise on the one screen whose whole message is that
  there is nothing to read.

## [4.38.0] — 2026-08-12

### Added
- **`Tabs` can be wired to its panels.** The strip is only ever the strip — the
  consumer renders the body — so ARIA's tab/panel pair had no way to be
  completed: `role="tab"` carried no `aria-controls`, the buttons had no ids for
  a panel to name itself with, and nothing a consumer could pass supplied
  either. Passing `idPrefix` now gives each tab a stable id and an
  `aria-controls`; the consumer builds the matching panel id with the exported
  `tabPanelId` and names it with `tabButtonId`. Both halves come from one prop
  through two exported helpers, because the panel lives on the consumer's side
  and agreeing on an id by convention is how these drift. Omitted, nothing is
  emitted — a strip used as a filter has no panel, and pointing at an id that
  does not exist is a dangling reference rather than a helpful one.
- **`Tabs` accepts `aria-label` / `aria-labelledby`.** There was no way to name
  the strip at all, so a page with two of them — order sections above, media
  types below — gave a screen-reader user two unnamed "tab list"s with nothing
  to tell them apart.
- **A tab's icon is decoration.** `TabItem` requires a label, so its icon is
  always supplementary — but it was exposed to assistive technology, so a text
  or emoji icon was read as part of the tab's name ("# Lines" rather than
  "Lines"). It is now `aria-hidden`.

## [4.37.0] — 2026-08-12

### Fixed
- **`InputNumber` reports the number it displays.** On blur it rounded for
  display but handed `onChange` the unrounded parse — and only called
  `onChange` at all when clamping had changed the value. A `precision={2}`
  field given `12.345` therefore showed `12.35` and left the consumer holding
  `12.345`: on a price, an order posted for a different number from the one the
  user read back before submitting. Rounding now happens before the value is
  reported, and composes with clamping. A field with no `precision` is
  untouched — there is no rounding to agree with, and a quantity must not
  silently become an integer.

## [4.36.0] — 2026-08-12

### Fixed
- **`InputNumber` steps with the arrow keys again, and announces its range.**
  Rendering `type="text"` with a numeric `inputMode` was the right call — a
  number input discards non-numeric text so the buffer could never hold "1.",
  scrolls the value on a stray wheel event, and draws spinners with a 12px hit
  target — but it silently took two things the browser had been giving for
  free. Arrow keys step by `step`, PageUp/PageDown by ten of them, and both
  stop at `min`/`max` instead of passing them; a sub-unit step rounds to the
  field's precision, so three 0.1 steps land on 0.30 rather than
  0.30000000000000004. The field now carries `role="spinbutton"` with
  `aria-valuenow`/`valuemin`/`valuemax`, plus an `aria-valuetext` that matches
  the formatting on screen. The role is claimed only because the keys behind it
  are implemented.

## [4.35.0] — 2026-08-12

### Fixed
- **An invalid form control says so.** `invalid` painted the control red and
  told assistive technology nothing on four of the six controls — `Input`,
  `Textarea`, `DatePicker` and the native `Select` — while `InputNumber` and
  the listbox `Select` trigger already set `aria-invalid`. A sighted user saw a
  red border; a screen-reader user was told the field was fine (WCAG 3.3.1).
  All six now set it, and a valid control still claims nothing rather than
  asserting `aria-invalid="false"`.
- **`Select` describes and names its trigger.** `aria-describedby`,
  `aria-label` and `aria-labelledby` reached only the `sr-only` `<select>`
  behind the trigger, through the props spread. Focus lands on the trigger, so
  the error message they pointed at was announced to nobody. They now go to the
  combobox button; the hidden select keeps the native form attributes that are
  its job.

## [4.34.0] — 2026-08-12

### Added
- **A desktop size ladder for the form controls.** `InputSize` had only `md` on
  the desktop side, so a consumer wanting a smaller filter row or a larger
  sign-in field had to reach for `touch` — which is 56px, sized for a finger —
  or append its own padding through `className`, the exact failure
  `forms/styles.ts` is shaped to prevent. `sm` and `lg` join it as swapped-in
  rungs. The `touch` rung is unchanged, and `INPUT_BASE` and the no-argument
  `inputClasses()` are byte-identical, so no existing caller moves.
- **`size` on `Select` and `Textarea`.** Both already rendered through
  `inputClasses`; only the prop was missing, so a form could not be sized
  consistently — an `Input` beside a `Select` would take the rung and the
  `Select` would not. On `Select` it shadows the native `size` attribute (the
  row count of a list box), which is now omitted rather than left to collide,
  and is kept off the DOM.

### Fixed
- `forms/styles.ts` pointed at `tests/inputSizes.test.ts` for the `INPUT_BASE`
  contract pin. That file does not exist; the pin lives in
  `tests/touchPrimitives.test.tsx`.

## [4.33.0] — 2026-08-12

### Added
- **`Button` size `lg`** — a third rung on the DESKTOP ladder, between `md` and
  the touch rungs. `sm`/`md` alone left nothing for a page's primary action to
  reach for without borrowing a 44px hit target. The touch ladder is unchanged
  and still has to be asked for by name. `IconButton` gains the matching square
  rung, so the two stay rung for rung.
- **`Button` variant `link`** — an action that belongs in running text or
  beside a field, where a boxed button would claim more of the page than the
  action deserves. It sheds the box rather than overriding it: the padding from
  the size table is never applied, because `px-0` in a variant string does not
  reliably beat `px-3` from a size string — two padding utilities in one class
  attribute resolve by compiled-stylesheet order. It keeps the text size of
  whichever rung was asked for. `IconButton` excludes it at the type level: the
  variant exists to shed the box, and a square icon button is nothing but the
  box.

## [4.32.0] — 2026-08-12

### Fixed
- **The tab strip can be operated by keyboard.** `Tabs` carried
  `tabIndex={active ? 0 : -1}` — the roving-tabindex half of the ARIA tablist
  pattern, which deliberately makes the whole strip a single tab stop — but
  nothing did the roving. Tab therefore skipped every inactive tab and the
  arrow keys did nothing, so a keyboard user who reached the strip could not
  switch tabs by any means (WCAG 2.1.1). The arrow keys now move between tabs,
  Home and End jump to the ends, disabled tabs are skipped, and the ends wrap.
  Selection follows focus, and keys the strip does not use are left for the app.

### Changed
- `Tabs` renders one strip for both variants rather than two near-identical
  branches. The class strings are unchanged.

## [4.31.0] — 2026-08-12

### Fixed
- **Cmd+S and Alt+Shift+D no longer fire in every open window.** `Modal`
  restricted the *dispatch* to the frontmost window, then sent an identity-free
  `CustomEvent` to `document` — and every consuming form subscribed
  unconditionally, so a single keystroke ran the save (or duplicate) callback of
  every window that was open. Depending on each form's mode that PATCHed a
  background record or created a brand new one, each with its own success toast,
  so nothing looked broken: the user simply could not tell which window had
  written.

  `modal-save` and `modal-duplicate` now carry `detail.modalId`, and the
  receiving hooks match on it.

  The guard is deliberately NOT `useModalActive`. That answers "is the frontmost
  modal mine", and every nested dialog a form opens pushes itself onto the
  activation order — so a form with a child dialog open would read as inactive
  and Cmd+S would silently do nothing where it used to save. Matching the
  originating id asks the right question and is immune to nesting.

### Added
- `useModalSave` and `useModalDuplicate` are **exported**. They existed here
  unexported, which is why each portal kept its own unguarded copy; the scoping
  rule has to live beside the dispatch that supplies the id, so the canonical
  implementation is now the shared one. A consuming portal should delete its
  local copy and import these instead.
- `useEnclosingModalId()` — the id of the `<Modal>` a component is rendered
  inside, or `''` outside one. Reads the same context `useWindowMenuItem` and
  `useWidgetSettings` already use.

### Compatibility
- An event carrying no `detail.modalId` is still answered, so an app on 4.31.0
  running against an older shell keeps a working Cmd+S rather than losing the
  shortcut. The two halves can land in either order.

## [4.30.1] — 2026-08-12

### Fixed
- **`Tooltip`'s Escape reaches the tooltip instead of closing the window.**
  4.25.0 added Escape-to-dismiss on a plain `document` listener, which loses
  inside a window: `Modal` listens on `window` in the capture phase and stops
  propagation when it closes, and capture runs window before document. So
  Escape closed the whole window and the dismissal never ran — in the three
  portals that render tooltips inside windows, which is where WCAG 1.4.13
  actually applies. It now registers on the shell's Escape interceptor seam,
  the one path that serves both cases: `Modal` consults it before closing, and
  since 4.27.0 the Set drains itself where no shell is mounted. A tooltip
  opened inside a dialog takes the first Escape and the dialog the second.
- **A trigger's own `aria-describedby` survives being wrapped in a `Tooltip`.**
  The clone assigned over it, so describing a control and then giving it a
  tooltip dropped the original description — permanently, since the closed
  state wrote `undefined`. The two are merged now.
- **A labelled `Divider` is announced with its label.** `separator` takes its
  name from the author only — it is not a name-from-content role — so the label
  sitting inside the element was not the separator's accessible name, and
  4.25.0's `role="separator"` announced an unnamed rule with the text loose
  beside it. `aria-labelledby` attaches it.
- **`Checkbox` no longer re-attaches the caller's ref on every render.** The
  merged ref was a fresh closure each time, and React detaches and reattaches a
  callback ref whose identity changed — so a form library holding the field was
  handed `null` and then the node again on renders that had nothing to do with
  it.

## [4.30.0] — 2026-08-12

### Fixed
- **A broken avatar image falls back to its initials.** There was no `onError`,
  so an avatar whose URL had gone away — a deleted upload, an expired CDN link,
  a host briefly down — rendered the browser's broken-image glyph and kept it
  for the rest of the session. The initials fallback existed, but only for the
  no-`src` case, which is the one that never fails. A new `src` gets its own
  attempt, so one bad URL no longer poisons the component.
- **An avatar showing initials is named.** The role and the accessible name now
  sit on the wrapper rather than on the `<img>`, so an avatar is announced as
  the person it shows whether or not a photo loaded. Before, the initials form
  was a bare `<span>` and a screen reader read out the two letters.
- **A nameless avatar is skipped by assistive technology** instead of being
  announced as "question mark". The `?` stays on screen — it is doing visual
  work — but an avatar nobody can name has nothing to say.

## [4.29.0] — 2026-08-12

### Fixed
- **`BreadcrumbItem.onClick` receives the event.** 4.26.0 added `href` so a
  crumb could be a real link, and said a router could intercept the plain-click
  case — but the handler took no argument, so it could not call
  `preventDefault()`. An `href` crumb could therefore only ever do a full page
  load, which is the thing a single-page app is avoiding, and a routed consumer
  was back to using a button.

  Widening the parameter is backwards compatible: an existing `() => void`
  handler ignores it.

## [4.28.0] — 2026-08-12

### Fixed
- **`Switch` forwards its ref and spreads native attributes**, so it can be a
  form field.

  A form library hands a field three things: a change handler, a name, and a ref
  it uses to move focus there when validation fails. Only the first had anywhere
  to go — which contradicts `.design-sync/conventions.md`, where the kit's
  controls are documented as dropping into `react-hook-form`.

  The ref points at the `<button role="switch">` itself, including in the
  labelled form where it sits inside a wrapper, because that is where focus
  should land. Rendered output is otherwise unchanged.

  `Segmented`, `FilePicker` and `DateRangePicker` are still ref-less; nothing
  needs it from them yet, and each would want its own answer about which element
  the ref should point at.

## [4.27.0] — 2026-08-12

### Fixed
- **Escape closes a `Dialog` or `Drawer` with no shell mounted.** Both register
  an Escape interceptor and have no other key handler, and the only caller of
  `runEscapeInterceptors` is `Modal` — the window manager. So on a till and on a
  routed portal, the two places these components exist to serve, the Set was
  never drained and **Escape did nothing at all**. Both were already shipping
  that way.

  The Set now drains itself: the first registration attaches one document-level
  capture listener, the last removal takes it away.

  It cannot double-fire where a shell is present. `Modal` listens on `window` in
  the capture phase, and capture runs window before document — Modal's handler
  goes first, calls `runEscapeInterceptors`, and stops propagation when one
  consumes, so this listener never sees the event. Ordering across stacked
  dialogs is unchanged, because the same reverse walk still decides who
  consumes; the listener only starts it.

- **`Dialog` and `Drawer` describe themselves with their own body.** Neither
  set `aria-describedby`, so a screen reader announced "Cancel order, dialog"
  and left the user to go looking for what cancelling actually does. The body
  is the description, and now says so. A dialog with no body claims none.

## [4.26.0] — 2026-08-12

### Fixed
- **`Checkbox` can show a partial selection.** `indeterminate` was reaching the
  `<input>` through the props spread, which React cannot honour: it is a DOM
  **property** with no attribute form, so React set a bogus attribute, logged
  *"Received `true` for a non-boolean attribute"*, and the box rendered as plain
  unchecked. A select-all control had no way to show a partial state at all.

  It is now a declared prop, applied through a ref. `checked` is in the effect's
  dependencies as well, because a browser clears `indeterminate` whenever the
  checked state is assigned and React assigns it on every render — without that
  the box would go blank on the next unrelated update. A native checkbox in this
  state reports itself as `mixed` to assistive technology on its own, so no
  `aria-checked` is written; one would risk contradicting the element.

  The caller's ref still receives the input.

### Added
- **`BreadcrumbItem.href` — a crumb can be a real link.** The trail was
  `<button onClick>` only, which is right for the desktop shell (no URLs to
  point at) and wrong for a routed app: an `<a href>` can be middle-clicked into
  a new tab, copied, and read off the status bar before committing to it. None
  of that is available from a button, however well it behaves once pressed.

  Given both, the anchor still calls `onClick`, so a client-side router can
  intercept the plain-click case and leave the other click kinds to the browser.
  `onClick` alone renders a button exactly as before, and the last crumb is
  never a link either way.

  Both forms share one class string, so they cannot drift apart.

  Asked for by the dealer portal, whose breadcrumbs are route destinations.

## [4.25.0] — 2026-08-12

### Fixed
- **A failing `Result` announces itself.** It appears without the user moving
  focus, so a screen reader said nothing at all and the user waited for a page
  that had already failed. `error` and `500` now carry `role="alert"`
  (WCAG 4.1.3 Status Messages).

  `success`, `info`, `warning`, `404` and `403` deliberately stay quiet:
  `alert` is assertive and cuts off whatever is being read, which is right for
  a failure and wrong for an outcome the user asked for or already knows about.

- **A labelled `Divider` is a separator again.** The plain form is an `<hr>`,
  which carries the meaning by itself; once there is a label the `<hr>` cannot
  be used, and losing the element had also lost what it meant. The labelled
  form now declares `role="separator"` with the label as its accessible name,
  and the two rules either side are marked decorative.

- **A `Tooltip` describes its trigger, and Escape dismisses it.** Two defects:

  `aria-describedby` sat on the wrapper. A screen reader announces the
  description of the element that HAS focus, focus lands on the trigger, and an
  ancestor's `describedby` is not inherited — so the tooltip was being read by
  nobody. It is now cloned onto the trigger element, falling back to the wrapper
  when the child is not an element.

  There was no way to dismiss it without moving the pointer or the focus
  (WCAG 1.4.13 Content on Hover or Focus). Escape now closes it, listened for on
  the document because a tooltip opened by hover holds no focus and a keydown
  never reaches the component.

  Found by porting the dealer portal onto this kit: its local versions of all
  three had these behaviours, so adopting the kit would have been a regression.

## [4.24.0] — 2026-08-12

### Added
- **`PageHeader` gains `icon` and `breadcrumbs`.** Both optional; existing
  callers render byte-identically, which the first spec in
  `tests/pageHeader.test.tsx` pins.

  The icon sits **inside** the `<h1>`, muted and at the title's own size: it
  marks the page, it is not a second headline.

  `breadcrumbs` renders through the kit's own `Breadcrumbs` rather than a
  second trail implementation inside this file. That is not tidiness — a
  header trail and a standalone trail collapsing differently, or only one of
  them marking the current crumb with `aria-current="page"`, is exactly the
  drift a shared kit exists to prevent. The specs assert on behaviour that can
  only come from that component, so reimplementing it here would fail them.

  Asked for by the dealer portal, where every page has an icon and a trail —
  it was the last thing keeping it on a local `PageHeader`.

## [4.23.0] — 2026-08-12

### Changed
- **`GlobalSearch` no longer reaches for the window manager, and has moved to
  the `./ui` barrel.**

  It imported `useWindowManager` for exactly one line: opening the chosen
  result. Nothing about that was a runtime failure — the hook is only a
  `useContext` and would not have thrown without a provider. But an import is
  resolved statically, so that one line pulled `WindowManager`, and through it
  react-query and axios, into the module graph of anything containing the ⌘K
  overlay. A self-contained search box was unreachable from
  `react-os-shell/ui` because of it.

  It now takes an optional `onSelect(result)`. `Layout` passes `openEntity`, so
  **the desktop shell behaves exactly as before and no consumer of `Layout`
  changes anything** — admin, customer and supplier each pass only
  `providers`/`typeIcons`/`placeholder`, which are untouched. A routed app
  passes its own navigation and gets the same overlay without the window
  manager.

  The alternative was a second, "headless" palette component beside this one.
  That would have put two components with the same job in one barrel, where a
  duplicate name loses to the root's explicit export silently — the trap
  `tests/uiBarrelMatchesRoot.test.ts` exists to catch.

  `GlobalSearch`, `SearchResult`, `SearchProvider` and `SearchConfig` are
  therefore declared in `src/ui/kit.ts` now and no longer in `src/index.ts`;
  the root entry still re-exports every one of them through `export * from
  './ui'`, so **existing imports are unchanged**. `GlobalSearchProps` is newly
  exported.

## [4.22.0] — 2026-08-12

### Added
- **`IconButton` — a button that is only an icon.**

  `Button` has carried `leftIcon`/`rightIcon` for a long time but has no
  icon-only form: it sizes with horizontal padding, so a square button meant a
  consumer overriding the kit's sizing, and two competing `px-*` utilities in
  one class attribute resolve by compiled-stylesheet order rather than by the
  order they were written. That renders one size or the other essentially at
  random and looks correct in whichever one the reviewer happens to see.

  A separate component rather than a `Button` prop, for a reason that is
  type-level: an icon-only control has no accessible name unless someone
  supplies one, and a **required** `aria-label` in the props is the only way to
  make forgetting it a compile error instead of a screen-reader user's dead
  end. `Button` cannot require it — most buttons have text, which names them.

  Square at every rung, matching `Button`'s heights exactly, so a row mixing
  the two lines up. Defaults to `ghost` where `Button` defaults to `primary`:
  an unlabelled button is nearly always a secondary action, and a grid of solid
  blue squares is not what an overflow menu wants.

- **`DatePicker` — one calendar date.**

  `DateRangePicker` is the other one: two dates, a rendered calendar, presets
  and its own placement logic. This is a native `<input type="date">` wearing
  the kit's field styling, so the browser supplies the calendar, the locale,
  the keyboard behaviour and the mobile date wheel, and there is nothing here
  to keep in step with any of them.

  Every date bug this component could have is the same bug:
  `new Date('2026-08-11')` is UTC midnight, which is the 10th anywhere west of
  Greenwich, and `toISOString()` on a locally-built Date is the previous day
  anywhere east of it. So it never crosses that boundary — a bare `YYYY-MM-DD`
  string is passed through untouched, a `Date` is serialised through the
  existing `toISODate` (which reads local calendar fields), and the `Date`
  handed to `onChange` is built from the three integers with the local
  constructor. `DateRangePicker` learned this the same way, which is why
  `toISODate` already existed to reuse.

### Changed
- **`Button`'s internal `BASE`/`VARIANTS` are now `BUTTON_BASE`/`BUTTON_VARIANTS`**,
  exported from the module so `IconButton` shares them rather than copying —
  the two can no longer drift apart in colour or focus ring. Deliberately
  **not** added to `src/ui/kit.ts`: they are package-internal, because a
  consumer restyling a button is a consumer the theme system cannot reach.
  `Button`'s rendered output is unchanged, pinned by
  `tests/iconButtonAndDatePicker.test.tsx`.

## [4.21.1] — 2026-08-11

### Fixed
- **`NumericKeypad` no longer reports a change when the press was rejected.**

  `appendKey` returns the value unchanged when a press is not allowed — a third
  decimal place, a second decimal point — and the keypad called `onChange` with
  that unchanged value anyway. On screen this is invisible, because the number
  really is identical either way. What it corrupts is everything downstream
  that reasonably treats "onChange fired" as "the user did something": a dirty
  flag, a cleared validation error, a reset idle timer.

  Found by the POS till's own keypad spec while migrating it onto this kit —
  it had asserted `not.toHaveBeenCalled()` on a rejected press since before
  this component existed, which is a contract the kit should have matched from
  the start.

## [4.21.0] — 2026-08-11

### Added
- **`Button` gains a `touch-sm` rung (44px) and a `ghost-danger` variant.**

  Both came out of migrating the POS till onto the kit, which is the useful
  thing about them: they are not speculative API, they are the two places a
  real consumer had built something the kit could not express.

  `touch-sm` is 44px — the WCAG 2.5.5 floor, and a floor is not a comfortable
  size. It is for chrome that sits outside the task (switching screens, ending
  a shift) and never for the path someone is working through. It exists so a
  dense toolbar has something legitimate to reach for instead of borrowing the
  desktop `sm`, which is less than half the height and looks fine to whoever is
  holding a mouse.

  `ghost-danger` is a destructive action sitting in a row of ordinary ones —
  Clear, Discard, Remove — where solid `danger` would be wrong. Two solid
  shouting buttons on one screen means neither gets read, so this keeps
  `ghost`'s weight and takes only the colour. The colour is the point: it lets
  someone tell what a button costs without reading it, which under time
  pressure is what actually happens.

  Both are additive. Every existing size and variant renders exactly as before,
  pinned by equality in `tests/touchPrimitives.test.tsx`, and a new spec asserts
  no touch rung ever drops below 44px.

## [4.20.0] — 2026-08-11

### Added
- **`DataTable` — a table for server-driven lists.** It renders and it reports:
  the caller owns `sort` and `page` and hands back new data, and the component
  never touches the array it was given.

  That restraint is the whole design. A table that sorts its own `data` prop
  sorts THE CURRENT PAGE, and against a paginated endpoint that is wrong in the
  most expensive way available — page one looks perfectly sorted, so nobody
  checks it, and page two silently disagrees. Everything else follows from
  keeping the ordering where the rows come from.

  Sort uses the package's existing `SortState` (`{ field, direction: 'asc' |
  'desc' }`) rather than a table-specific vocabulary, so `DataTable`, `useSort`
  and `ResizableTable` all speak one language. A column's `sortField` is the
  name sent upward, so a column titled "Part" keyed `no` can sort by
  `part_number` without the call site mapping names. Clicking cycles
  **asc → desc → unsorted**; the third state exists because otherwise there is
  no way back to the server's own default ordering once a column is touched.

  Also: `fixed: 'left'` columns that pin with their own background (without one
  the scrolling columns show through), `minWidth` for horizontal scroll,
  `rowKey` as a field name or a function, `rowClassName`, `onRow`, `emptyText`,
  a `footer` slot for an infinite-scroll sentinel, and optional `pagination`
  that composes the existing `Pagination`.

  `loading` draws an overlay rather than replacing the rows, so the table keeps
  its height and scroll position — replacing them throws the page around under
  the user on every re-sort.

  How it differs from its neighbours: `EditableGrid` is a spreadsheet,
  `ResizableTable` persists column widths and needs react-query and axios, and
  `EntityList` is a whole list view including fetching and export. This one has
  no data layer and no peers.

- **`Drawer` — the same modal contract as `Dialog`, in a different shape.**
  Focus trapped, page behind locked, Escape claimed through the shell's
  interceptor. Slides from the right, left or bottom.

  Reach for it when the content is a list or a long form that wants height, and
  for `Dialog` when it is a question that wants answering and dismissing — a
  drawer holding one sentence and two buttons is a dialog wearing the wrong
  clothes, and a dialog holding twenty fields is a scroll trap. Only the body
  scrolls, so the header and the action row stay reachable in a long form,
  which is usually the reason a drawer was chosen.

  A `blocking` drawer renders no close control, rather than advertising an exit
  that Escape and the scrim both refuse.

- `docs/antd-migration.md` gains the `Table` → `DataTable` and `Drawer` rows,
  including the `'ascend'`/`'descend'` → `'asc'`/`'desc'` translation and the
  list of antd table features deliberately not implemented.

## [4.19.0] — 2026-08-11

### Added
- **Thirteen components, so a portal can leave Ant Design.** These are the
  pieces the dealer portal was still importing a component library for, and
  each is the smallest thing that does the job rather than a reimplementation
  of antd's version of it.

  **Typography** — `Text`, `Title`, `Paragraph`. `tone` is semantic
  (`secondary`, `danger`, `success`, …) and every tone resolves to a utility
  class the dark-mode remaps know about. That is the point of them: text
  coloured through a token object or an inline style is correct in light mode
  and permanently wrong in dark, invisibly. `Title`'s `level` drives both the
  heading tag and the size, so the document outline and the visual hierarchy
  cannot drift apart.

  **Layout** — `Stack`, `Inline`, `Grid`. `gap` and column counts are closed
  unions mapped to literal class strings, because Tailwind reads source text:
  an interpolated `gap-${n}` compiles to nothing, everything sits flush, and it
  looks like a styling opinion rather than a bug. A union makes an unsupported
  value a compile error instead. `Grid` takes `cols`/`smCols`/`lgCols` and is
  not a grid system — no twelfths, no span arithmetic.

  **Display** — `Skeleton`, `DescriptionList`, `Result`, `Divider`,
  `CountBadge`, `Statistic`. `DescriptionList` renders `<dl>/<dt>/<dd>`, which
  is what label/value pairs actually are, and takes responsive `columns`
  because a thirteen-item shipment header at three columns has to fall back to
  one on a phone. `CountBadge` hides a zero unless asked — a badge reading "0"
  is noise that trains people to stop looking at badges. `Result`'s 404 is
  coloured as information rather than as an error, because a missing page is
  not a mistake the user made.

  **Form controls** — `Segmented`, `Switch`, `InputNumber`, `FilePicker`.

- **`Segmented` covers both a button group and a radio group,** and the
  difference is whether you pass `name`. With it you get real
  `<input type="radio">` elements in a `radiogroup` — it submits, it restores
  on back, and a screen reader understands it. Without it you get buttons, for
  a view toggle that is UI state rather than data. They are one component
  because they look identical, and having two is how a form ends up containing
  a button group that submits nothing.

- **`InputNumber` keeps the text you are typing.** A controlled numeric field
  that stores `Number(e.target.value)` and renders it back destroys every
  intermediate state: type `1.` and it parses to `1`, re-renders as `"1"`, and
  the decimal point disappears under the cursor. The same happens to a leading
  `-` and to the trailing zero of `1.50`. It passes any test that types `"1.5"`
  in one go, because the parsed result is identical — which is how it reaches
  production and gets found by someone entering a price. This keeps the raw
  text in local state and reports the parsed value upward, re-syncing only when
  the incoming value genuinely differs from what the text already represents.
  Clamping to `min`/`max` happens on blur, not on change, so typing `25` into a
  field with `min={10}` does not rewrite the `2` before the `5` arrives.
  `tests/inputNumber.test.tsx` types character by character, which is the only
  way any of this shows up.

- **`FilePicker` does not upload.** It hands the caller a `File[]` and stops.
  An uploader that owns transport also owns retry, progress, cancellation, auth
  and the endpoint, and every consumer ends up fighting one of them. Rejected
  files report why — that is the case where someone is most certain they did
  the thing and most confused that nothing happened.

- **`docs/antd-migration.md`** — the mapping table, including what replaces
  `theme.useToken()`. Nothing does, deliberately: dark mode here remaps utility
  class names, so a hook returning hex values would be correct in light and
  permanently wrong in dark at every call site. The doc maps each antd token to
  the class that survives both themes.

## [4.18.0] — 2026-08-11

### Added
- **`Dialog` — a modal sheet that is not a shell window.** `Modal` is a window:
  it has a title bar, it minimises, drags, stacks and restores, and it lives in
  the window manager's activation order. This is the other thing — an overlay
  that interrupts, is answered, and goes away. A till has no desktop to put a
  window on and a routed portal page has no window manager, so both needed one.

  It imports nothing but React. Focus containment and scroll locking come from
  a new `focusTrap` module (`useFocusTrap`, `useScrollLock`, both exported)
  rather than a library, and the panel is plain DOM with `role="dialog"` and
  `aria-modal`. `blocking` makes Escape and backdrop clicks inert, for a state
  the user must resolve rather than dismiss.

  A closed `Dialog` renders nothing at all, where the Headless UI dialogs it
  replaces stayed mounted whether or not they were open.

### Changed
- **`confirm`, `confirmDestructive` and `prompt` no longer cost a consumer
  `@headlessui/react` and `@heroicons/react`.** They were the last thing
  standing between the UI kit and a yes/no question: asking one pulled in two
  peer libraries, so `react-os-shell/ui` could not offer them at all and an app
  taking the kit had to hand-roll its own. They are rebuilt on `Dialog`, the
  two Heroicons are inlined as SVG, and all four now export from
  `react-os-shell/ui` as well as the package root.

  Behaviour is unchanged except where stated here. Confirms still **queue**
  rather than drop — a dropped one would resolve a question the user was never
  asked, and the caller cannot tell that from a genuine "no". `confirm()` with
  no provider mounted still answers **false**: a dialog nobody can see must
  never authorise anything.

- **`confirmDestructive`'s `confirmWord` is now optional.** Omitting it gives a
  plain two-button destructive confirm. Type-to-confirm assumes a keyboard, and
  on a device that has none — a till, a warehouse scanner — it made the dialog
  literally unanswerable. Ask for a typed word when the cost of a mis-tap
  justifies making someone work for it, not by default. Existing callers that
  pass one are unaffected.

- **Cancel is now the focused control in every one of these dialogs,** and the
  destructive action sits on the right where Enter cannot reach it by accident.
  Previously nothing was focused, so a keypress went wherever the browser
  decided.

- **Escape interceptors run most-recently-registered first, instead of in
  registration order.** Registration order tracks stacking order, and Escape
  belongs to whatever is on top. Two stacked dialogs each register one;
  oldest-first handed Escape to the dialog *underneath*, dismissing something
  the user could not see while the one in front of them stayed put. This was
  invisible until now because `ConfirmDialog` registered a single interceptor
  and hand-ordered its three dialogs inside it. Interceptors that check
  `getActiveModalId()` are unaffected — at most one of them can consume an
  event, so the order they are offered it in cannot change which one takes it.

### Removed
- The Headless UI test double (`tests/headlessui.tsx`) and the second, isolated
  esbuild pass in `scripts/test.mjs` that existed to inject it. It was there
  because Headless UI's portal and transition layer needs browser layout and CSS
  animation APIs jsdom does not implement. `Dialog` is plain DOM, so there is
  nothing left to double and every spec now builds in one pass.

## [4.17.0] — 2026-08-11

### Added
- **A touch scale, so a finger-sized control is something the kit offers rather
  than something an app re-implements.** `ButtonSize` gains `touch` (56px),
  `touch-lg` (64px) and `touch-xl` (80px) alongside `sm` and `md`, and
  `inputClasses` gains a matching `size: 'touch'` for a 56px field.

  They are a separate ladder rather than a bigger `lg` on the existing one,
  because a till's idea of "medium" is 56px and reusing the name would have
  made one word mean two sizes depending on which app you were reading. Nothing
  selects a touch size automatically — an app asks for it, so a desktop portal
  cannot grow finger-sized buttons by accident.

  The input size is **swapped into** the class string, never appended: two
  competing utilities in one class attribute are resolved by their order in the
  compiled stylesheet, which neither this package nor the caller controls, so
  appending would render one size or the other essentially at random and look
  correct in review either way. `INPUT_BASE` is assembled from the same
  fragments and remains byte-identical, since it and `inputClasses` are public
  exports whose exact values are contract. `touch` uses `text-base` by agreement
  with the existing rule that forces 16px on form controls under
  `(pointer: coarse)` — the one that stops iOS zooming the viewport on focus.

- **`Button` takes a `disabledReason`,** rendered as text beside the button and
  never as a `title` tooltip. A tooltip needs a hover, a touchscreen has none,
  and a user facing a dead button with no explanation asks a colleague instead.
  It renders only while the button is actually disabled, so it is safe to pass
  unconditionally — note it wraps the button in that case, which a parent
  `flex gap-*` row will see.

- **`NumericKeypad`,** with its press rules in `keypadInput` as pure functions.
  Values are strings throughout: `'1.'` is a state a user passes through while
  typing and does not survive a float — it would become `1` and erase the
  decimal point the moment it was pressed. The rules are the ones that are easy
  to get wrong and produce a wrong amount rather than an error: one decimal
  point, at most two fraction digits, a leading zero replaced rather than
  appended to, and a bare `.` normalised to `0.`.

- **`TileButton`** — a fixed-height, left-aligned tile for a grid of choices
  (a product catalogue, a payment method). Separate from `Button` because the
  content model differs: a title and subtitle stacked, at a constant height so a
  grid lines up whether or not every tile has a subtitle.

- **`Banner` gains `emphasis` and `sticky`.** `solid` is a saturated
  full-contrast bar for a condition the user must not miss and cannot work
  around — a till that has lost the server and cannot take payment. The subtle
  version of that message is a bug. `sticky` uses `position: sticky`, so the
  banner still occupies layout and pushes the page down rather than covering
  the first row of it.

- **`Card` gains a `padding` scale** (`none`/`sm`/`md`/`lg`) that scales the
  header and footer rows with the body — those rows take no `className`, so a
  `p-6` body above a `px-4 py-3` footer was not something a caller could fix.
  `padded` remains supported as the two-value shorthand.

- **`LoadingSpinner` takes a `label`.** On a full-screen wait there is nothing
  else on the page to infer the operation from. A labelled spinner gains
  `role="status"`; a bare one deliberately does not, since adding it
  unconditionally would have changed the accessibility tree for every existing
  caller.

- **`toast` takes options** — `placement` (`top`/`bottom`), `duration`,
  `sticky`, `dedupe` — plus `toast.configure()` to set them once at startup, the
  same "wire it once" shape as `setShellApiClient`. `dedupe` refreshes a message
  already on screen instead of stacking a second copy, and **restarts its
  timer**: the user asked twice, so the message should persist rather than
  expire on the first one's schedule.

### Changed
- **Toasts are now dismissed by tapping them,** in every app. A toast has no
  other click affordance, and a sticky one has no other exit at all — the
  `notify` card has behaved this way since it existed. This is the one change
  here that is visible without opting in.

- Every other addition above is inert by default: the `sm`/`md` button sizes,
  `INPUT_BASE`, and the default rendering of `Card`, `Banner` and
  `LoadingSpinner` are pinned byte-identical to 4.16.0 by equality assertions in
  `tests/touchPrimitives.test.tsx`, against captured literals.

## [4.16.0] — 2026-08-11

### Added
- **The UI kit is importable without the window manager — `react-os-shell/ui`.**
  Importing a single form control pulled the whole desktop in behind it.
  `forms/Select` reached one function on `shell/Modal` — a bare `Set` of Escape
  interceptors — and that one import dragged `react-router-dom`,
  `@tanstack/react-query`, `axios`, `@headlessui/react` and `@heroicons/react`
  into any bundle containing a dropdown, along with Modal's module-scope
  `localStorage` reads, which ran at import time. An app that wanted a button
  and a text field paid for a desktop it never rendered.

  That seam now lives in `shell/escapeInterceptors`, a leaf module that imports
  nothing; Modal and Select each import it, and neither imports the other.
  `registerModalEscapeInterceptor` is still exported from Modal and from the
  package root, with the same binding, so every existing import path is
  unchanged — and with no Modal mounted the registration is inert and Select
  closes its own listbox on Escape, exactly as it already documented for a
  plain page.

  `react-os-shell/ui` re-exports the peer-light half: every form control, the
  display and layout primitives, the charts, all nine page templates, the
  pageless data primitives, `toast`, and the theming hooks. Nothing it reaches
  imports anything but `react` and `react-dom` — 69 modules, asserted at source
  by `tests/uiEntryIsPeerFree.test.ts` and against the built artifact by
  `scripts/verify-dist.mjs`. The second is the one that matters: tsup builds
  with code splitting, so a peer can enter the kit's graph through a shared
  chunk without any source file changing.

  Measured on the same nine kit imports: 27.9 KB minified through `./ui` versus
  36.4 KB through the root — and, more to the point, the root version still
  *requires* `@headlessui/react`, `@heroicons/react` and `@tanstack/react-query`
  as external imports, while the `./ui` version requires only React. Those peers
  are declared optional, so a consumer that has not installed them gets an
  unresolvable import rather than a missing style.

  **Nothing changes for a consumer on the root entry.** `react-os-shell`
  re-exports the same modules from the same bindings — verified name by name
  against 4.15.0, with no export lost. Four names are added: `useTheme`,
  `resolveTheme`, `applyThemePrefs` and `useIsMobile`, previously internal. A
  ui-only consumer needs them, because dark mode and the accent themes work by
  remapping utility classes under `[data-theme]` and there was otherwise no
  supported way to stamp that attribute.

- **A stylesheet for the kit alone — `react-os-shell/ui.css`.** A consumer
  taking `./ui` had to load the whole sheet — window tints, taskbar variables,
  sticky-note paper, the Documents editor — to get the dark remaps its buttons
  and inputs depend on.

  Rules were allocated by **selector scope, not by the comment above them**. A
  rule belongs to the shell half only if its selector is scoped to DOM the shell
  alone produces (`[data-sticky-id]`, `.glass-input-bg`, `.docs-editor`) or it
  declares a `--window-*` / `--taskbar-*` property. That is why the taskbar
  text-brightening rule went to `ui.css`: its selector is a bare
  `.text-gray-600`, it applies to every button in every app, and it is in fact
  the winning declaration for that class package-wide.

  `ui.css` deliberately does **not** `@import "tailwindcss"` — `styles.css`
  does, first. Every consuming portal already imports Tailwind itself, so their
  cascade is untouched, and it lets an app mid-migration off another component
  library take the theme and utility layers *without* preflight, whose bare
  element selectors would otherwise out-specify that library's
  `:where()`-wrapped reset and restyle it silently.

  One rule is genuinely new: `:root { --menu-opacity: 0.95 }`, the value
  `utils/glass.ts` already fell back to, now declared rather than assumed.

### Changed
- **`react-os-shell/styles.css` is now an umbrella over `ui.css` and
  `shell.css`.** The rules, their order, and the resulting cascade are
  unchanged: all 294 declarations are present, none is declared in both halves,
  and compiling the umbrella produces the same 421 rule blocks as 4.15.0 plus
  the one new `--menu-opacity` line. Because no selector declares the same
  property in both files, no cascade outcome depends on which half is imported
  first — pinned by `tests/cssSplit.test.ts`, since the two halves were
  interleaved in the original and no ordering of two files reproduces the old
  sequence exactly.

  **Consumers need change nothing.** Keep importing `styles.css`; import
  `ui.css` instead only if you are taking `./ui`. Importing both doubles every
  rule.

- CI's dist check now walks the `exports` map instead of four hard-coded
  `test -f` lines, so a newly added subpath can no longer ship unverified.

## [4.15.0] — 2026-08-09

### Fixed
- **A window title too long for its title bar can now be read in full by
  hovering it.** The title bar has always truncated cleanly with CSS and then
  offered no way to see the rest — the text was simply gone, in every window in
  every consuming portal. It became hard to miss with long campaign names
  ("Campaign editor - Panthera Blackout Sale: Blade | Walkin | Tri-spoke |
  Gen-2"), where the part that distinguishes one window from another is the part
  that gets cut.

  All three title bars (compact / `appStyle` / full) now carry a native `title`
  attribute on `[data-window-title]`. The text comes from the same private
  `extractTitleText` the taskbar and exposé already use, so a `ReactNode` title
  contributes its words rather than `[object Object]`, and buttons, inputs,
  `kbd` and `svg` children are left out as they are everywhere else. A title
  that yields no plain text gets no attribute at all, rather than an empty
  tooltip.

  Additive only: no change to layout, truncation, or styling.

## [4.14.0] — 2026-08-09

### Fixed
- **Nested menus open on the first try, at every level.** Past the second
  level, opening a submenu was unreliable — slow to appear, and often not
  appearing at all until the pointer was moved off the row and back on. The
  cause was that the start menu had TWO mechanisms: one that opened a section's
  flyout, and a second, separately written one for a flyout inside that flyout.
  The second armed a 200ms "close the submenu" timer on every leaf row it
  passed under, each one overwriting the handle of the last WITHOUT cancelling
  it. Sweeping across two leaf rows on the way to a group therefore left an
  orphaned timer that nothing could cancel, and it fired a fifth of a second
  later — after the submenu had opened — closing it under the pointer.

  There is now one mechanism, one close timer that every handler cancels before
  doing anything else, and one panel component. The second level and the sixth
  are the same code.

### Added
- **Menus nest as deeply as the nav data does.** `NavItem.children` has always
  been recursive, but only three levels were ever rendered: a 4th-level group
  came out as a plain row that navigated to its own synthetic key and closed
  the menu. `StartMenu` flyouts and the `Sidebar` accordion now both recurse for
  as many levels as are configured.
- **A flyout with no room to its right opens to the left.** Each level costs
  another panel width, so a deep enough branch always ran out of screen — and a
  menu opened from a right-hand taskbar ran out on the very first flyout.

### Changed
- **Clicking a group row opens its submenu instead of navigating.** A group's
  `to` is a synthetic key by convention, with no page behind it, so clicking one
  used to close the menu on a route that goes nowhere. Leaf rows are unchanged.
- **`isReachable` recurses.** A group whose every branch dead-ends in
  permission-hidden items is as inert as an empty one, and is dropped the same
  way — a shape that is easy to build by accident once nesting is unbounded.
- **Flyouts position themselves before the first paint** rather than by
  measuring and re-rendering. A panel repositioned from state moves after paint,
  which slides its rows out from under a pointer that has not moved — and a row
  that moves away from the pointer never gets its `mouseenter`.

## [4.13.0] — 2026-08-08

### Added
- **A nav entry can require ALL of its permissions — `allPerms`.**
  `perms` has always been an any-of test, which is right for most rows and
  quietly wrong for one shape: an entry whose page enforces a NARROWER
  permission than the one that lists it. The supplier portal's Price Sheets row
  is gated on `view_supplierpricesheet`, while the page needs
  `view_supplier_prices`; a price-blind R&D role built the obvious way kept the
  row in the sidebar and was refused on click (SG#00214). Adding the second
  permission to `perms` makes it worse rather than better, because an OR shows
  the row to anyone holding either one.

  `allPerms` is the all-of counterpart, usable on items, sections and nested
  children, and combinable with `perms` on the same entry. It is tested one
  permission at a time — a host only ever supplies `hasAnyPerm`, so asking for
  the whole set in a single call would be an OR and grant the row.

### Changed
- **Every nav visibility test now runs through one `navVisible` helper.**
  The same `!x.perms || hasAnyPerm(x.perms)` line was repeated at nine call
  sites across `Sidebar` and `StartMenu`, which is why a second rule could not
  be added without missing one. Behaviour for existing nav data is unchanged.

## [4.12.0] — 2026-08-08

### Added
- **`Kanban` can draw its columns on an empty board — `showColumnsWhenEmpty`.**
  With no items the board is replaced wholesale by `emptyState`, which is right
  when the cards are the whole story and wrong when the COLUMNS are: a board
  whose columns the user configures (a deal pipeline) went invisible the moment
  it had nothing in it, so the shape just defined in settings could not be seen,
  and there was no drop target to put a first card into. The new prop renders
  the normal layout instead — headers, counts, and each column on its
  `columnEmptyText` placeholder, all still live drop targets.

  Opt-in: the default is unchanged, so every existing caller keeps the
  `emptyState` behaviour and none of them need to pass anything. `emptyState`
  is not also rendered when the prop is on — it is the branch being replaced —
  and with items present the prop changes nothing at all.

## [4.11.1] — 2026-08-05

### Fixed
- **A paste that filled the bulk-import grid left nowhere to paste the next
  batch.** The grid opens with 15 lines, so 16 pasted lines landed as exactly 16
  full rows: an operator holding a second batch on the clipboard had no cell to
  click into, and the only way on was to import what was already there and start
  the grid over. Both paste paths now leave one blank line under the last row
  that has content, so line 17 is waiting after a 16-line paste — and after the
  paste that fills it, line 18.

  Typing has always had this. `ensureRows` adds five rows as the cursor comes
  within two of the bottom, and paste was the one way of filling the grid that
  never grew it. A paste with blank lines still under it changes nothing, so the
  grid does not creep a row longer every time.

  A grid in `fixedRows` mode is untouched — a caller that fixes its row count
  owns it. `BulkImportGrid`'s CSV upload leaves the same spare line, for a file
  long enough to fill the rows it pads to.

## [4.11.0] — 2026-08-04

### Added
- **Windows can register controlled unsaved state with
  `useWindowDirty(dirty)`.** The enclosing window feeds the aggregate state
  into its existing `Modal` close guard, so close and Escape reuse the
  standard discard confirmation, including public manager calls, widget
  toggles, Widget Manager controls, taskbar tabs, and their previews. Multiple
  mounted registrations are isolated: clearing or
  unmounting one cannot clear another dirty registration. Concurrent
  dirty-close requests are presented serially, so bulk widget removal cannot
  lose a confirmation or leave a canceled window locked against a later retry.

  **Both kinds of window the shell owns a `Modal` for are covered — page
  windows AND entity/detail windows.** The entity kind is the one that matters
  most in practice: its registry entry carries an explicit `editing` mode, so
  it is where unsaved edits actually live. In an entity window a confirmed
  discard now closes the window rather than only dropping out of edit mode,
  which would answer a different question than the one the user was asked; an
  entity window with no registration keeps the old exit-edit-mode behaviour
  exactly.

  The hook is a deliberate no-op in the one place the shell has no `Modal` to
  guard — a registry entry with `rendersOwnModal`, where the consumer renders
  its own `Modal` and should pass it `dirty` directly — and outside a
  `WindowManager` entirely.

### Known gaps
- **Nothing guards a window teardown the shell does not own.** Navigating to an
  auth page unmounts every window (a session-expiry redirect to login is the
  realistic trigger), and a browser refresh or tab close is not intercepted
  either. In both cases the window entries survive in storage and reappear
  looking untouched, so the discarded edits are invisible rather than
  announced.

## [4.10.0] — 2026-08-04

### Changed
- **The per-section colour stripe moved off the top edge of the window and now
  sits between the title bar and the content**, where it reads as a divider
  belonging to the window rather than as a highlight sitting on top of it. It is
  drawn in flow, immediately after whichever of the three title bars rendered
  (compact / `appStyle` / full), so it needs no knowledge of the header's
  height and can't drift out of alignment with it.

- **The stripe is now off by default and opt-in**, via a new *Show section
  colour stripe* switch in Customization → Windows (`window_accent_stripe`).
  A coloured band across a window is easy to read as status — something is
  wrong, something needs attention — rather than as "this window belongs to
  Sales", so it is no longer imposed on every user of a consumer that wires
  `windowAccentForRoute`.

  `--window-accent-rgb` is still published on the panel element whenever the
  consumer passes `accentRgb`, switch or no switch, so consumer CSS keyed off
  the section accent keeps working when the stripe is hidden.

## [4.9.0] — 2026-08-04

### Added
- **A nav section can draw a divider under itself.** `NavSection.dividerAfter`,
  the same knob `NavItem` already carried, so a consumer can split one flat
  group into visual bands — pinning an operator-only console above the ERP
  sections and separating it from them, rather than having it read as just
  another one of them.

  Honoured by both nav surfaces: the Start menu's ERP group and the Sidebar's
  section accordions. The line is drawn INSIDE the section's wrapper element,
  not as a sibling, because the Start menu renders `flex-col-reverse` for a
  side or top taskbar — a sibling divider would flip to above the row there,
  while a nested one stays below it in every taskbar position. This is why
  `NavItem.dividerAfter` is nested too.

## [4.8.1] — 2026-08-03

### Fixed
- **The date-range panel opened off the edge of the window when its trigger sat
  near the left.** "In the Customer's account statement: if I chose custom in
  the date range, the view is only the half portion. I can't select properly the
  date that I want." Half the calendar was missing: the From box, the month and
  year buttons and the previous-month arrow, with only the Fr and Sa columns
  left. Nothing brought them back, because the panel was pinned to `right: 0`
  and so always grew leftward, out of a shell window body that is
  `overflow-hidden`. There is nothing to scroll to an overhang there, and
  maximising the window moves the trigger along with the edge it is pinned to,
  which is why the reporter's two workarounds both failed.

  The panel now hangs off whichever edge of the trigger leaves it inside the
  box that clips it: left by default, since a filter bar reads left to right and
  its first control has the full width to open into, and right when there is no
  room that way. That second case is what the old `right: 0` was there for, a
  trigger at the far end of a list toolbar, and it still behaves exactly as it
  did.

  The bound is the nearest ancestor that clips horizontally rather than the
  viewport, because a shell window is the thing doing the cutting and it is
  narrower than the screen. The panel's width is measured rather than assumed:
  the presets column carries a `min-w-[130px]` MINIMUM, so the real width
  follows the longest preset label at the reader's font size.

  This is not the two statement tabs only. Any trigger closer to the clipping
  edge than the panel is wide was affected, which includes the customer and
  supplier production-progress filter bars, where the picker follows a `w-56`
  search box and renders the short "Date Range" placeholder until a range is
  set.

### Added
- **The open date-range panel is a `dialog`.** The trigger has always said
  `aria-haspopup="dialog"`; there was no dialog on the other end of that claim.

## [4.8.0] — 2026-08-01

### Fixed
- **A markdown link in campaign copy lost its label and printed its URL.** Type
  `Read [our terms](https://example.com/terms) first` into any campaign copy box
  and the reader got *our terms* in italics followed by the bare URL in the
  running text. The campaign's legacy `[phrase]` italic — one of the three rules
  it carries so already-published copy keeps rendering — was claiming the label
  of the one piece of markdown syntax every writer already knows, and the URL
  was left stranded outside the run.

  This did not need the toolbar to reach. A merchant typing an ordinary link hit
  it, which is why the guard is on the RULE and not on which buttons a field
  offers: `[` no longer closes when its `]` is met immediately by `(`. A
  `[phrase]` on its own is untouched, so every published line reads exactly as
  it did.

  `applyMark(…, 'link')` writes that same shape, so the writer and the parser
  were disagreeing about a delimiter — the one thing this module exists to
  prevent. `MARKUP_TOOLS` ships the link button with a ⌘K shortcut, so it was
  one prop away from any host that renders inline runs.

- **`react-os-shell/markup` could not be resolved by a CJS resolver.** The
  subpath declared only `types` and `import`, so anything reaching it through
  Node's CJS loader — a `tsx` build script, for one — failed with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`, which reads like a missing file rather than a
  missing condition. It now carries `default` as well, pointing at the same
  file. The root and `./apps` deliberately keep `import` only: they are React
  component entries, and a bundler is the only thing that should be resolving
  them. This module is the portable one, and it is consumed by build scripts.

### Changed
- **`COPY_FIELD_TOOLS` is derived from the grammar instead of listed.** It was a
  hand-written array that agreed with the parse rules by luck; a style with no
  rule can no longer appear in it. The value is unchanged — bold, italic, strike,
  highlight — and `code` is still absent, now because no rule reads a backtick
  rather than because someone remembered to leave it out.
- **`InlineRule.notBeforeDigit` is now `InlineRule.notBefore`,** a set of
  characters that may not follow the close. Two legacy rules need this guard for
  the same reason (`#` against rank markers, `[` against link targets), and a
  boolean per case would have meant a new branch in the tokenizer each time.
  Behaviour for `#` is unchanged and pinned by the tests that already covered it.
  Exported for completeness rather than use: the rule sets this module ships are
  the supported way to parse, and no consumer builds its own.

### Testing
- The guard that should have caught the link collision walked `COPY_FIELD_TOOLS`
  — the four tools already known to be safe — so it could not have found a
  writer/parser disagreement even in principle. It now walks every tool in
  `MARKUP_TOOLS` against every product rule set, asserting that no button's
  output is ever re-read as a mark nobody chose. A tool the grammar leaves
  literal still passes: backticks print as typed, which is visible but honest.
- `__phrase__` is italic here, not CommonMark's strong. Documented in the
  module header and pinned by a test — a recorded divergence, not a defect.

## [4.7.2] — 2026-08-01

### Fixed
- **"Export selected to CSV" reported a row count the file did not contain.** Tick
  8,000 rows, export, and the toast said "Exported 8000 rows." over a file holding
  5,000. The number came from `ids.length`, the selection the request was built
  from, so it was a count of what had been asked for and never of what came back.
  Nothing else in the response was consulted, which left the one case where the two
  differ reading as the case where they agree.

  They differ because the backend caps every list export at `MAX_EXPORT_ROWS`
  (5,000, in `efficient/mixins.py`). A capped export is still a 200 with valid
  `text/csv`, so there was nothing for the user to notice: the file opened, the
  rows were real, and the missing ones were only missing. efficient-backend #1337
  now returns `X-Truncated` and `X-Row-Count` on every export, the latter counting
  the rows actually written. `exportSelected` reads both and, when the export was
  cut short, says how many of the requested rows the file holds instead of
  claiming success. The download is unchanged, including in the truncated case:
  the partial file is still handed over.

  A response carrying neither header falls through to the existing success
  message, so a portal pinned to this version against a backend without #1337
  behaves exactly as before. Note that the headers reach the browser only on a
  same-origin response or one whose `Access-Control-Expose-Headers` lists them,
  and the backend sets no `CORS_EXPOSE_HEADERS` today.

## [4.7.1] — 2026-08-01

### Fixed
- **Shift+click left the last row of the range unticked.** Select a row, Shift+click
  one further down, and every box between them filled in except the one you clicked
  — while the footer counted it as selected. The count was right and the box was
  wrong, so a list of 20 showed 19 ticks, and the row you had just clicked looked
  like the one thing the gesture had missed.

  `useTableNav` called `preventDefault()` on that click. On a checkbox that runs the
  browser's *canceled activation steps*, which restore the pre-click checkedness at
  the END of event dispatch — after the microtask in which React has already
  committed the new selection. The browser's revert therefore landed last, and React
  never wrote the box again, because on every later render the `checked` prop is
  unchanged. `stopPropagation()` alone does the job the cancel was there for (it
  keeps both the checkbox's own toggle and the row-open handler from firing), so the
  cancel is now used only on the row body, where a Shift+click on a cell link would
  otherwise open a new window.

- **The first Shift+click into a list selected nothing at all.** With no anchor
  recorded yet, the handler toggled the row itself and then let the event reach the
  checkbox, whose own `onClick` toggled it straight back off. It is reachable more
  often than "the first click of the session" suggests: the anchor is also dropped
  whenever the row count changes, so a filter, a search or an infinite-scroll page
  put the list back into that state. The row now ticks and becomes the anchor for
  the Shift+click after it.

  One neighbouring behaviour changed with it: a Shift+click on the row *body* with
  no anchor yet used to select the row and open it. It now only selects, which is
  what the same gesture already did once an anchor existed.

## [4.7.0] — 2026-07-30

Numbered 4.7.0 because **4.4.0, 4.5.0 and 4.6.0 were already on npm before any of
them was on `main`** — published from a working tree, no `gitHead`. 4.6.0 has since
landed on `main` (the perf-report work, #94); **4.4.0 and 4.5.0 remain on npm and on
no branch at all.** None of the three has a `./markup` subpath, so a consumer pinned
to 4.4.0 resolves a real package, installs the wrong build and fails on a missing
subpath — which reads as "the shell is broken" rather than "that version never
shipped this code". 4.7.0 is above npm's `latest`, so it can actually publish.

### Fixed
- **A window that was already open but buried did not come forward when you
  asked for it again.** Clicking the button that opens it looked like clicking a
  dead button: nothing moved, and the window you wanted stayed behind the one on
  top of it.

  It affected one whole kind of window — the kind that is mounted once for the
  session and merely retargeted, rather than opened. Windows opened through
  `WindowManager` were fine (`openEntity`/`openPage` reuse an open window and
  raise it), and so was a keyless inline dialog (`Modal` raises a fresh mount).
  The third kind had no path at all: asking again only changed some content, and
  from inside the shell no content change is distinguishable from a re-render.
  So there was nothing to raise on, and nothing did.

  `createWindowTarget()` gives that kind of window a staging channel that the
  shell owns, and `set()` on it brings the window forward — whether it was
  closed, open and buried, or already showing the very thing you asked for.

### Added
- **`createWindowTarget(windowKey)` / `useWindowTarget(channel)`** — the staging
  channel for a window that is mounted for the life of the session and pointed
  at different things, replacing the `set`/`get`/`subscribe` trio each consumer
  used to hand-write. Two behaviours come with it that the hand-written copies
  mostly lacked: staging stamps a sequence number, so asking for the same target
  twice is a real event rather than a no-op; and staging asks the shell to bring
  that window forward.

  The raise is emitted from `set()` and from nowhere else. There is no path from
  rendering to raising, so a background window that refetches, re-renders or
  receives a push cannot jump in front of you — somebody has to ask. `set(null)`
  is a close and never raises; `set(target, { raise: false })` stages without
  asking to be seen.

- **`requestWindowFront(windowKey)`** — the same ask, imperatively, for a caller
  outside a staging channel. Honoured immediately if that window is mounted, and
  the moment it mounts if it is not.

  An ask is a single "show me this", not a standing instruction: it is spent by
  the mount that honours it, so a window cannot come forward a second time on a
  remount nobody asked for. Only one ask is outstanding at a time, so if you
  ask for two windows in a row the one you asked for LAST is the one that ends
  up in front — not whichever of them happens to render first, which is not
  something you can see or control. An ask that has not been honoured yet is
  dropped as soon as you put a different window in front, or when it is
  withdrawn.

- **`unmountModal(modalId)`** — the counterpart of `mountModal`, extracted from
  the unmount effect it was written inline in. No behaviour change; it makes the
  pair symmetric and lets a spec close a window without rendering one.

- **`react-os-shell/markup` — the editorial markup rule, shared.** A new subpath
  holding one grammar for authored copy: `**bold**`, `_italic_`, `~~strike~~`,
  `==highlight==`, the writer a toolbar button calls (`applyMark`), the button
  descriptors (`MARKUP_TOOLS`, `COPY_FIELD_TOOLS`), a tokenizer
  (`tokenizeInline`) and the plain-text reduction every `alt` / `aria-label` /
  structured-data field needs (`stripInline`).

  It exists because two products let a human type formatted copy — the admin
  portal (agent messages, the campaign designer) and the public storefront — and
  until now each had invented its own delimiters. What is shared here is the
  RULE, not the rendering: the web paints with theme-token classes, email must
  inline every style, so each product keeps its own renderer and walks the same
  token list.

  **Its own subpath, not the barrel, on purpose.** The module imports nothing —
  no React, no JSX, no DOM, none of this package's fourteen peers — so the
  storefront can depend on it without inheriting a 3D viewer, a PDF renderer and
  an xlsx parser. `dist/markup/index.js` is a standalone file with zero import
  statements; keep it that way.

  Two delimiter choices worth knowing: italic is `_phrase_` because a single
  asterisk already means the brand accent colour in both products, on hundreds of
  published instances; and `_` never fires inside a word (CommonMark's own rule),
  which is what stops a mail-merge line holding `{{first_name}}` and
  `{{last_name}}` from italicising everything between them. The guard uses plain
  character tests rather than a lookbehind, because a lookbehind is a parse error
  on Safari below 16.4 and this ships to a public site.

  Per-product legacy rules (`STOREFRONT_MARKUP`, `CAMPAIGN_MARKUP`) keep already
  published copy rendering exactly as it does today; they are the one part of the
  grammar designed to be deleted, once stored content has been converted.

### Changed
- A window given a `windowKey` now also has its position, size and stacking order
  remembered under that key across a refresh — that has always been what a
  `windowKey` does, and it now applies to this kind of window too because they
  need a key for the shell to find them by.

- **The UI-only peer dependencies are now declared optional** —
  `@headlessui/react`, `@heroicons/react`, `@tanstack/react-query`, `axios`,
  `react-hook-form`, `react-router-dom`, `tailwindcss`. Same meaning `xlsx`,
  `pdfjs-dist`, `dxf-viewer`, `mammoth` and `online-3d-viewer` already carried:
  not every consumer needs them. The shell's own components still require them —
  a portal that drops one gets a module-not-found at build.

  This is what makes the `/markup` subpath usable. `autoInstallPeers` is on by
  default in pnpm, and a missing NON-optional peer is installed on the consumer's
  behalf: taking a 5 KB text-handling module was landing 61 third-party packages
  (headlessui, heroicons, react-router, react-hook-form, floating-ui, react-aria,
  react-stately and their graphs) in the lockfile of a ten-dependency public
  storefront. Measured after this change: **4 packages — react, react-dom,
  scheduler and the shell itself, all of which the consumer already had.**
  (`peerDependencyRules.ignoreMissing` on the consumer side does NOT fix this —
  it silences the warning and installs them anyway. Measured: 64 → 64.)

  No effect on the three portals, which all declare every one of these as a
  direct dependency.

  All seven are now devDependencies here too — the same pairing the five
  already-optional peers have. npm SKIPS an optional peer, so without it this
  package can no longer typecheck or build itself; CI caught exactly that.
## [4.6.0] — 2026-07-30

> Supersedes 4.4.0 and 4.5.0, both published mid-review. Consumers should pin
> `^4.6.0`.

### Added
- **`describePerfReport(report)` and `perfReportFile(report)`** — a perf report
  rendered as plain text, and as a `File` ready to attach. The attachment is
  complete but nobody opens it first: a bug tracker shows *descriptions*, so a
  performance report whose description is one sentence about a stutter sits in
  the list looking like every other vague complaint while the numbers that
  would rank it stay zipped inside 140 KB. The description now carries the
  machine, the verdict, the median, the worst frame and the slowest gesture.

  In the shell rather than in each consuming portal because it is pure
  formatting of a shell type and was otherwise going to exist three times —
  which is how three copies quietly stop agreeing about what a report says.
  What stays portal-side is what is genuinely portal-shaped: which endpoint to
  post to, and which module list to seed from.

### Added
- **The report names the machine it came off.** A frame rate without a machine
  attached is half a report: "GPU-bound (compositing)" means something very
  different on an Intel UHD 620 driving a 4K panel than on an M3 Max, and the
  reporter is the worst-placed person to answer which. `PerfReport.environment`
  (new module `perfEnvironment.ts`) carries browser and full version, OS and
  version, CPU architecture and core count, device memory, GPU renderer and
  vendor, whether WebGL is available at all, screen and colour depth, viewport,
  heap ceiling, network class, battery state, and the reduced-motion /
  forced-colors / reduce-transparency settings. `describeMachine()` renders the
  digest as the one line a triager actually reads:

  ```
  Chrome 141.0.7390.55 · macOS 15.5.0 (arm) · Apple M3 Max · 12 cores ·
  8GB+ RAM · 3456×2234 @2x · on battery 37% · reduce transparency on
  ```

  The last two only appear when true. Both are live explanations for a low
  frame rate — a laptop in Low Power Mode is capped at 30 fps by the OS, and
  reduce-transparency being *already on* means the usual first suggestion has
  been tried. Listing the off states as well would bury the one that is on.
  Missing WebGL is reported in the GPU's place rather than as a blank, because
  software compositing is itself the answer to a GPU-bound verdict.

  The user agent alone does not settle it — Chromium freezes its UA string, so
  Windows 11 reports itself as Windows 10 and an ARM machine looks like an x86
  one, and no UA string has ever named the GPU. So the GPU comes from a WebGL
  context created and destroyed inside one call **at report time, never during
  measurement** (a live context is exactly the sort of thing that would show up
  in the numbers it is meant to explain), and the OS detail comes from client
  hints resolved once when the HUD mounts. Every field is best-effort and
  degrades to null: Firefox and Safari withhold `deviceMemory`, and a report
  missing one line is a far smaller loss than a report that failed to send.

- **The perf HUD files its own report.** The overlay's JSON and CSV download
  buttons are replaced by one **Report this** button: it freezes the session log,
  asks the one question the log cannot answer — *what were you doing?* — and hands
  both to the host's feedback channel via the new
  `DesktopHostConfig.onSubmitPerfReport`, which receives the message plus the whole
  report pre-serialised as a JSON attachment. The download path was the weak link
  in the chain: the person who can see the jank is rarely the person who can fix
  it, and a file that has to be found, attached and explained mostly never gets
  sent. Hosts that wire nothing still get the same JSON, downloaded, so the shell
  stays usable standalone.

  The log is snapshotted when the composer opens, so the twenty seconds spent
  typing "the second-level menu stutters" don't become twenty samples of typing at
  the end of the very report that sentence is about. A rejected submit keeps the
  composer open with the text intact.

- **The log records the interactions that were actually causing the jank.**
  Opening the start menu, opening a 2nd- or 3rd-level flyout, moving a window and
  resizing a window are now their own axes (`menus`, `submenus`, `menuKey`,
  `moveMs`, `resizeMs`), marked at the source by `StartMenu` and by the window
  drag/resize gesture rather than inferred from pointer noise. Before this, all
  four arrived as an anonymous mouse-move — and a hover-opened flyout, which fires
  no click and no keypress, was filed as **idle**, so the frames people were
  reporting were landing in the one bucket that is supposed to mean "at rest".

  New in the summary: `byActivity` ranks median frame rate per gesture worst-first
  (the direct answer to "which gesture is slow"), and `worstMenus` names the
  slowest flyout the way `worstWindows` already names the slowest screen. Groups
  report from a lower floor (`MIN_EVENT_SAMPLES`) than window groups, because a
  flyout opens inside a single 500 ms interval rather than across twenty of them.

### Fixed
- **`dragMs` counted stationary presses as dragging**, and could therefore report
  more drag time than the interval it sits in — a 500 ms sample claiming 5,004 ms
  of dragging, which is impossible on its face and discredits the columns beside
  it. The counter credited the whole gap since the previous pointer move, so a
  press held still and then nudged charged the entire hold to the move that ended
  it. Gaps longer than a stationary-press threshold are no longer counted.

### Changed
- `FpsGroup` gains `worstMs` and `stalls`, and groups now bucket the full log
  rather than pre-filtering it. A brief interaction barely moves a median, so the
  worst frame in the group is the number that matters; and a sample too blocked to
  report a frame rate is counted rather than dropped, so a group that stalled
  outright reads as the emergency it is instead of vanishing from the summary. The
  median is still taken over measurable samples only — a stall never becomes a
  frame rate the display never showed.
- The Diagnostics copy in Customization now discloses the new axes and that the
  Report button sends the log, rather than describing the removed export buttons.

## [4.3.1] — 2026-07-29

### Fixed
- **⌘Z undid in every open window at once.** 4.3.0 claimed two open windows keep
  two independent stacks; they did not. `UndoProvider` asked `useModalActive()`
  whether it was frontmost, but `WindowManager` mounts it *above* `PageWindow`
  and therefore above the `<Modal>` that provides that context — so the hook
  fell through to a fallback made entirely of module globals, which answers the
  same for every caller and is true whenever any window is active. Each window
  also binds its own `keydown` on `window`, with nothing to tell one window's
  press from another's. One ⌘Z therefore stepped back every open window that had
  history, silently reverting edits behind the one the user was looking at.

  `UndoProvider` now takes a `windowId` and asks a new `useIsActiveWindow(key)`
  hook, which resolves the window's stable key through the same map `Modal` fills
  in when it mounts. `WindowManager` passes `item.id` — the value its `<Modal>`
  already gets as `windowKey`. A provider given no id, or an id no mounted modal
  has claimed, keeps the previous behaviour.

  The feature was inert on 4.3.0 — nothing in the shell or the portals registers
  a slice yet — so no released form could have hit this.

- **A record arriving from the server was recorded as an undoable step**, so the
  first ⌘Z after a window finished loading handed back the empty form. `useUndo()`
  now returns `baseline()`, which marks the loaded values as the starting point.
  Call it in the same effect that assigns them:

  ```tsx
  const { baseline } = useUndo();
  useEffect(() => {
    if (!data) return;
    setSupplier(data.supplier); setItems(data.items);
    baseline();
  }, [data]);
  ```

  It suspends recording for that one commit rather than only clearing after the
  fact, because the assigned values land in the commit the call schedules. Safe
  to call on every arrival, including a refetch into an open window.

- **A slice registered with a derived value could hang the tab.** `useUndoable`
  detects change by identity, so `useUndoable(rows.filter(r => r.on), …)` reads
  as changed on every render — and recording a step re-renders the form, closing
  the loop. Its recording effect now runs on a value change rather than on every
  render, and the provider trips a guard, names the slice and stops recording if
  steps arrive at a rate no user could produce. A dead undo stack with a console
  error can be diagnosed; a frozen tab cannot.

### Added
- `useIsActiveWindow(windowKey)` is exported: "is this window frontmost?", asked
  by stable window key, for anything binding a global shortcut from outside the
  `<Modal>` it belongs to. `useModalActive()` is unchanged and still right for
  anything inside one.

### Testing
- **The React half of undo now has specs** — the half that shipped untested, and
  the reason both bugs above got through. `tests/UndoProvider.test.tsx` covers
  two-window isolation (it fails on 4.3.0), redo scoping, the load-then-undo
  case, the runaway guard, and the in-field and nothing-to-undo contracts with
  real key events.

  This needed a DOM: `renderToStaticMarkup` runs no effects, so a provider whose
  whole job happens in one was invisible to it. `jsdom` is a new devDependency
  and `tests/dom.ts` a small harness over it — a DOM, not a test framework;
  `node:test` and `assert` are still the whole of the runner.

## [4.3.0] — 2026-07-29

### Added
- **Undo and Redo for a whole form: `UndoProvider`, `useUndoable`, `useUndo`,
  `UndoControls`.** A form window gets one undo stack covering everything in it
  — its fields, its line items, a bulk import. ⌘Z steps back the last thing the
  user did, whatever part of the form it happened in, and Redo walks forward
  again. Two open windows keep two independent stacks, so the keys never reach
  into a window the user is not looking at.

  Wrap the form, then register each piece of its state. `apply` is the setter
  the form already uses, so nothing about how state is stored has to change:

  ```tsx
  <UndoProvider>
    <PurchaseOrderForm />
  </UndoProvider>

  // inside the form
  useUndoable(supplier, setSupplier, { label: 'supplier', coalesceKey: 'supplier' });
  useUndoable(items, setItems, { label: 'line items' });

  const { clear } = useUndo();     // call after a successful save
  <UndoControls />                 // optional — the keys work without it
  ```

  A step snapshots **every** registered slice, not just the one that moved, so
  undoing restores a coherent form rather than one slice out of step with the
  rest. One user action that moves several slices at once — a bulk import fills
  the line items and closes the grid — is still one step: the slices' effects
  all run before the recording microtask, so the first captures the snapshot and
  the rest join it. Depth is 100 steps.

  `coalesceKey` folds a run of changes into one step: pass the field name and a
  burst of typing becomes a single Undo rather than one per keystroke. Omit it
  for a change that is already whole, like an import or a deleted row.

  **Every window gets a stack without asking.** `WindowManager` mounts one
  `UndoProvider` per open window, so a form only has to register its state — and
  the stack is torn down with the window, which is right, because history is the
  unsaved edit. It costs nothing until something registers. A read-only form
  nests its own `<UndoProvider canEdit={false}>` to shadow it.

  **`useUndoableState` is `useState` with the value in the stack**, so adopting a
  form is a rename rather than an added line per field — which matters, because
  the forms this is for hold their state in dozens of separate `useState` calls
  and one of them has forty-three:

  ```tsx
  const [supplier, setSupplier] = useState('');                                // out
  const [supplier, setSupplier] = useUndoableState('', { label: 'supplier' }); // in
  ```

  That also makes the choice legible: state left as plain `useState` is state
  deliberately kept out of the history. Keep it there for anything that is not
  the user's input — a search box, fetched data, validation output, an
  initialisation guard. Undoing those puts stale results back on screen, and a
  reverted guard can re-fire the effect it exists to suppress.

  ⌘Z / Ctrl+Z undoes and ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redoes, bound by the
  provider so the keys work in a form that shows no controls at all — **except
  while the caret is in an input, a textarea, a select, or a grid cell**. There
  ⌘Z means "take back what I just typed" and the browser already does that;
  leaving the field ends the run and turns it into one step here, so the next ⌘Z
  outside the field takes the whole edit back. The keys are also left alone when
  there is nothing to step to, rather than being swallowed into a no-op. Both
  appear in `ShortcutHelp` under Modals / Forms.

  **Scope is the unsaved edit.** History lives with the mounted provider and dies
  with it, and `clear()` ends it at a save — past that point "earlier" is on the
  server, and taking it back is not something a form can do.

  **Everyone who may edit the record gets it.** Undo is not a privileged
  feature — the user most helped by one is the one least sure of what they just
  did — so it is gated on edit rights and nothing else. `<UndoProvider canEdit>`
  takes the form's own read-only flag; `perms` checks codes through
  `ShellAuthProvider` when the form would rather not work it out itself. Both
  are combined, so a form that already knows it is read-only stays that way. For
  a reader the controls render nothing at all rather than sitting there dead,
  the keys are not bound, and no history is recorded.

### Fixed
- **`BulkImportGrid` no longer strips spaces and commas out of text columns on
  import.** `handleImport` ran every column but the first through the number
  cleaner, which exists to drop currency symbols and thousands separators from a
  price. Applied to a `kind: 'text'` column it deleted content: a description
  pasted as `Gunmetal 19" Alloy Wheel` was imported as `Gunmetal19"AlloyWheel`,
  silently, on every import that carried one. Cleaning now follows the column's
  declared `kind` — `price` and `qty` only — via the `colKind()` the rest of the
  component already resolves columns with.
## [4.2.2] — 2026-07-29

### Fixed
- **`autoHeight` windows with a `<ModalActions>` footer opened exactly one
  footer-height too short** — last row cut off behind a needless scrollbar,
  identically on every reopen (admin portal's Edit User modal, measured at a
  stable 53px shortfall). The footer element mounts `hidden` and only un-hides
  after `ModalActions` flips `hasActions` from a passive effect — *after* the
  measurement's layout effect read `chrome = panel − body` — so the measured
  chrome was missing the footer, and nothing re-measured: the footer sits
  outside the body, invisible to both the content-root ResizeObserver and the
  body MutationObserver. The measurement now re-runs in the same commit that
  un-hides the footer (footer visibility is an effect dependency), the
  ResizeObserver additionally watches the footer element while unresolved,
  and the freeze takes one final measure before resolving so a footer landing
  in the very last frame can't be missed. The masking subtlety: on
  classic-scrollbar platforms the transient scrollbar re-wrapped the content
  and self-healed the height, which is why the bug only presented on
  overlay-scrollbar macOS.
- A footer that (dis)appears **after** the height has frozen — `ModalActions`
  inside a lazy/slow body, or conditionally rendered `footer`/`actions` — now
  nudges the frozen height by exactly the footer's delta, keeping the body's
  height (and a deliberate user resize) intact instead of silently costing
  the body the footer's height.
- Demo: new "Auto height (actions footer)" repro window in Window Styles,
  fixed-width on purpose so it reproduces in both scrollbar modes.

## [4.2.1] — 2026-07-29

### Fixed
- **The performance overlay had no findable entrance.** 4.2.0 put its only
  switch at the very bottom of Preferences → Customization → Appearance,
  below Theme, Desktop Wallpaper and six transparency sliders — measured at
  646px past the fold in a 684px-tall pane, so it was never on screen when
  the panel opened. A diagnostic exists to be found by someone who is already
  frustrated, which makes "scroll a full screen through settings you did not
  come here for" the wrong and only way in. The desktop right-click menu now
  carries **Show / Hide Performance Stats**, next to Manage Widgets — the
  same surface the overlay itself appears on. The label reflects the current
  state, and the Preferences switch stays where it is for anyone who goes
  looking there.
- This matters most where the shell is embedded: the admin portal hides the
  `customization`, `favorites` and `about` items from that menu, so its users
  could not reach Preferences from the desktop at all. The new item is a
  separate `'perf-stats'` key in `DesktopContextMenuItem`, so a consumer that
  wants it gone can hide it the same way — but nobody has to opt in to get it.

## [4.2.0] — 2026-07-29

### Added
- **A desktop performance HUD that says *where* the UI is slow, not just that
  it is.** New `Preferences → Customization → Diagnostics → Show performance
  stats` overlays frame rate, mean and worst frame time, main-thread blocked
  share and JS heap in the desktop corner beside the version watermark, and
  turns them into a verdict: smooth, GPU-bound, or CPU-bound. The
  discriminator is late frames against an idle main thread — if JavaScript
  were the problem the thread would be busy, so dropped frames plus an idle
  thread put the cost downstream of script, in compositing and paint. That is
  the signature the shell's own frosted glass produces (`glassStyle()` blurs
  at a 40px radius on every menu, modal and popup), and it is invisible in a
  JS profile, so a GPU verdict points straight at `Reduce transparency` — the
  switch that strips `backdrop-filter` everywhere. The toggle sits directly
  under that switch on purpose: one is the usual fix for a sluggish machine,
  the other tells you whether it was the right fix. Motivated by a portal
  reported as laggy on a fanless MacBook Air, whose 8–10 core GPU does the
  same blur work a 40-core M3 Max hides.
- Attribution is exported as pure functions (`classifyPerf`,
  `summariseFrames`) alongside the `PerfStats` component, and specced. Where
  the browser exposes no `longtask` observer — Safari — a low frame rate is
  reported as **unattributed rather than as the GPU**: that case is
  indistinguishable from genuine compositing cost, and a confident wrong
  answer is worse than none when someone is about to change settings on the
  strength of it.
- **A session log, so a slow machine somewhere else can produce evidence
  instead of an adjective.** While the HUD is on, every reading is recorded
  with the context around it: how many windows were open, which one was on
  top, and counts of clicks, keystrokes, scrolls and milliseconds spent
  dragging. Dragging gets its own axis because it is the most
  compositing-heavy thing a user can do in a window shell. The overlay
  exports the log as JSON (with the analysis included, so the recipient gets
  the conclusion without rerunning it) or as flat CSV for a spreadsheet.
  `summarisePerfLog` reports median frame rate split by idle versus
  interacting, bucketed by open-window count, and ranked worst-first by
  window — turning "it feels laggy" into "the Sales Invoice window runs at 18
  fps with six windows open". Medians, not means, so one 400ms stall cannot
  drag the number somewhere no frame ever was; and groups below a
  four-sample floor are withheld rather than reported thinly, since one
  unlucky reading is not a finding. Only readings with a real frame rate
  enter a median — a sample taken while the thread was too blocked to deliver
  frames carries fps 0 and would otherwise report a rate the display never
  showed.
- The log is capped at ~20 minutes, mirrored to `localStorage` on a throttle,
  and flushed on `pagehide`/`visibilitychange` and on unmount — the unsaved
  tail is exactly the part someone was watching when they gave up and closed
  the tab. It records counts and window keys only: no page content and no
  keystroke text. It stays on the device unless the user exports it, and the
  Preferences copy says so.
- The HUD is built not to distort what it measures: the `requestAnimationFrame`
  sampler writes to refs and never sets state, so the panel re-renders twice a
  second rather than per frame, and it is the one surface in the shell that
  deliberately takes no `backdrop-filter` — a perf overlay costing a 40px blur
  would add the very load it exists to attribute. Note that a running rAF loop
  does keep the browser compositing, so readings are meaningful while the UI is
  in use, which is also when the jank worth measuring happens.

## [4.1.5] — 2026-07-29

### Fixed
- **`FilterBar` no longer nests a `<button>` inside a `<button>`.** Both filter
  controls render the pill as a `<button role="combobox">`, and both put the
  clear-X *inside* it as another `<button>` — so every list page with an active
  filter logged `In HTML, <button> cannot be a descendant of <button>. This will
  cause a hydration error.` (seen across the admin portal, e.g. Stock on Hand).
  Invalid nesting is also parser-level: the browser is free to reconstruct the
  tree, which is what makes it a hydration hazard rather than only a console
  line. The clear affordance is now a `<span>` with the same
  `stopPropagation()` click handler, so it looks and behaves exactly as before —
  one click clears the filter without opening or closing the dropdown. It is
  `aria-hidden`, not a `role="button"`: it sits inside the combobox, where a
  nested control would pad the pill's accessible name, and clearing already has
  a proper keyboard path — the leading "All" entry in the listbox. The pill
  itself is untouched, so its tab stop and full combobox key handling
  (arrows/Home/End/Enter/Space/typeahead/Esc) are unchanged.
- **Importing `Modal` (or anything reaching it) no longer throws outside a
  browser.** Two `window.addEventListener` calls ran at module scope, so
  `import` alone crashed with `ReferenceError: window is not defined` under SSR
  or a `node:test` spec — `FilterBar` reaches `Modal` for its Esc interceptor,
  which is how this surfaced. Both are now guarded the same way
  `ensureGestureStyle()` already was; in a browser nothing changes. This is what
  lets the new `tests/FilterBar.test.tsx` render the component at all.

## [4.1.4] — 2026-07-29

### Fixed
- **`isVideoUrl()` now recognises `data:` video URLs, which previewed as a
  broken `<img>`.** The helper decided image-vs-video with a file-extension
  regex, and a `data:` URL has no extension — `data:video/mp4;base64,…` carries
  its kind in the media type, before the comma — so it was judged not-video and
  routed to the `<img>` branch by both `MediaUploadField` and
  `MediaUploadGrid`. The existing escape hatches did not cover it: the
  `accept`-string fallback only fires for a *video-only* picker (both
  components default `accept` to `'image/*'`, and a mixed `'image/*,video/*'`
  picker missed), and the `videoBlobUrl` check only matches a `blob:` URL the
  component minted itself. A `data:` URL's media type is now read directly and
  treated as authoritative, so an `image/*` data URL is correctly *not* a video
  even in a video-only picker. A typeless `data:,…` still falls through to the
  `accept` guess, and extension-shaped, `blob:`, query-string and hash URLs keep
  their existing derivation — all pinned by the new spec. Sibling of the
  `mediaFileName()` fix in 4.1.3; closes #84.

## [4.1.3] — 2026-07-29

### Fixed
- **`mediaFileName()` no longer returns the whole payload of a `data:` URL.**
  The helper derived a display name by slicing at the last `/`. A `data:` URL
  has no path and its only `/` sits inside the media type, so
  `data:image/png;base64,iVBOR…` came back as `png;base64,iVBOR…` — the entire
  encoded image, as the "filename". `MediaUploadField` computes
  `previewName = value ? mediaFileName(value) : ''` unconditionally and passes
  it to `<img alt>` (and `<video aria-label>`), so a data-URL value stamped a
  multi-hundred-kilobyte attribute into the DOM and a screen reader read the
  base64 out loud. `showFilename={false}` did not avoid it — that only
  suppresses the visible caption; the accessible name was set either way.
  `data:` URLs now short-circuit and are named from their media type alone
  (`image.png`, `image.svg`, `image.icon`, `video.mp4`), never from the body.
  Path-shaped, `blob:`, query-string, hash and percent-encoded URLs keep their
  existing derivation, which is pinned by the new spec.

## [4.1.2] — 2026-07-29

### Removed
- **Deleted the dead duplicate `src/hooks/useTableNav.ts`.** It was an older,
  unexported copy of the table-navigation hook that predates the
  `useModalActive()` gate. The live hook lives at `src/data/useTableNav.ts`
  (exported from the kit index; consumed by `EntityList`) and gates its
  document-level shift-click/keydown listeners on the active window so two open
  lists don't both react to a single shift-click — the `hooks/` copy lacked
  that guard. Nothing imported the `hooks/` path, so this removes a footgun (a
  future `import … from '../hooks/useTableNav'` would silently reintroduce the
  multi-list shift-click bug) with no change to the published surface or
  runtime behaviour.

## [4.1.1] — 2026-07-28

### Fixed
- **The start menu's 3rd-level flyout would not open.** Hovering a nested group
  in a section flyout (e.g. Human Resources → Recruitment) highlighted the row
  and showed its `>` chevron, but no sub-menu ever appeared. `<StartMenu>` drew
  the chevron — and installed the handler that opens the flyout — from the raw
  `item.children`, while the flyout itself rendered
  `children.filter(perms)`. Any user who could see the parent row but none of
  its children got an affordance that could never resolve: the parent of a
  nested group carries no `perms` of its own by convention, so it is visible to
  everyone who can see the section, while each child is gated individually.
- Both affordances now come off one permission-filtered list
  (`visibleChildren`), so the arrow appears exactly when there is something
  behind it.
- A group with no visible children is dropped from the menu, the sidebar and
  the search results rather than left as an inert row. Such a parent's `to` is
  a synthetic key that never navigates, so there was nothing to fall back to —
  clicking it went nowhere. Users who can see at least one child are
  unaffected, and partially-permitted users keep the group with only the
  children they may see.

## [4.1.0] — 2026-07-27

### Added
- **`DateRangePicker`** — a from/to calendar filter in one popover trigger,
  with presets, promoted into the kit so every portal shares one control. The
  portals had each grown the same filter as a pair of bare
  `<input type="date">` boxes: two boxes state no relationship between the two
  dates, offer no presets, and open an OS picker that is itself a
  month-at-a-time stepper — reaching a date years back took one click per
  intervening month.
- Calendar navigation drills UP instead of stepping. The header's month and
  year are separate buttons opening a 12-month and a 12-year grid, and the
  arrows step whatever grid is open (a month, a year, or a 12-year page), so a
  far-off date is a few clicks.
- `formatDisplay` injects the consumer's own date formatter, so the picker
  agrees with every other date on screen and the kit stays free of app-level
  date-preference dependencies. Values are the plain `YYYY-MM-DD` the APIs
  filter on; `toISODate` is exported alongside for callers that need to
  serialise a `Date` the same way.
- `clearable={false}` hides the Clear affordances for callers where a range is
  REQUIRED — an accounting report seeded with a period has nothing sensible to
  show for an empty one.

## [4.0.4] — 2026-07-27

### Fixed
- **Picking an option from a dropdown no longer throws the parent window over
  the one you are working in.** In admin's Edit User — a nested window inside
  the user's own window — choosing a User Group buried the form under the user
  window the instant the option was clicked, which reads as a new window
  opening on top of you. `Modal`'s mousedown-to-raise skipped activation only
  when the press landed in a *nested child* panel; a press with no panel at all
  fell through and raised the window. `Select`, `SearchableSelect` and
  `PopupMenu` all portal their popup to `<body>`, and React bubbles portaled
  events through the React tree rather than the DOM tree — so every ancestor
  window saw a press nowhere near its own panel, and the outermost one, firing
  last, won. Raising now requires the press to have landed inside that panel.
  Clicking a window's own body still raises it as before.

## [4.0.3] — 2026-07-26

### Fixed
- **Alt+Shift+N ("New") no longer fires in every open window at once.**
  `useNewHotkey` registered a global keydown listener with no active-window
  guard, so every mounted window that used it responded to a single keypress —
  with two or more list windows open, "New" opened in all of them. It now
  checks `useModalActive()` and only the frontmost window responds, matching
  its sibling `useEditHotkey` (Alt+Shift+E), which already had the guard.

## [4.0.2] — 2026-07-26

### Fixed
- **The pop-up notification card shows the whole message instead of one
  clipped line.** Both the title and the body were `truncate`d, so anything
  past ~40 characters became an ellipsis ("Support replied to your repor…")
  and the notification had to be opened to be read at all. They now wrap, and
  the card grows to fit. Long unbroken tokens (URLs, references) break rather
  than overflow, and the text column caps at `60vh` as a runaway guard so an
  unusually long message can't push the dismiss button off-screen.
- **The card now stays up long enough to read.** Auto-dismiss was a flat 5s,
  which suited a one-line card but not a five-line one. It now scales with the
  length of the text (~200 wpm), floored at the old 5s so short notifications
  are unchanged and capped at 12s so a long one never parks on screen.

## [4.0.1] — 2026-07-26

### Fixed
- **Taskbar preview: the close (×) button is reachable again.** The window
  snapshot inside a preview card is a clone of the live panel, and it kept that
  panel's inline `z-index` — so it painted over the card's own overlays and hid
  the × button (and the title strip) behind it. The snapshot layer is now its
  own stacking context, so nothing inside a cloned window can climb over the
  card chrome.

## [4.0.0] — 2026-07-24

### Removed
- **BREAKING: the built-in mobile shell is gone.** On phone / tablet-portrait
  viewports `<Layout>` used to swap the desktop chrome for a bespoke touch OS
  (home icon grid, app switcher, bottom nav, notification/profile sheets). That
  whole surface has been removed — the shell is desktop-only now.

### Added
- **`Layout` `mobileApp` prop** — wire a link to your dedicated mobile app
  (native deep link, App Store / Play Store page, or a mobile-optimised web
  app) and small-screen visitors get a branded landing screen with a call-to-
  action that opens it. See the new `MobileAppConfig` type (`url`, `ctaLabel`,
  `heading`, `description`). With no `mobileApp` configured the landing screen
  still renders as a plain "works best on desktop" notice, so a consumer that
  hasn't adopted the prop yet degrades gracefully rather than dropping phone
  users into the cramped desktop shell.

### Migration
- Consumers that relied on the mobile shell should pass `mobileApp={{ url: … }}`
  to `<Layout>`. No other API changed; the responsive touch tweaks in `Modal`
  and the data tables are unaffected.

## [3.28.2] — 2026-07-24

### Fixed
- **A restored window whose record is gone stops asking for it.** An entity
  window reopened from the saved session re-reads its record on mount, on focus
  and on a 60s fallback interval. Applied to a record the server says is not
  there, that never ended: TanStack's default three retries (1s/2s/4s) on top
  of the 60s poll meant ~4 requests a minute, forever, for as long as the tab
  stayed open — and the window looked perfectly normal throughout, because it
  renders from the snapshot saved beside it. One such window in production made
  2,848 `404`s from a single browser in 48 hours. A 4xx now stops both the
  retry and the polling: the request is asked once and left alone. `408` and
  `429` still retry, as do 5xx, timeouts and offline blips — those are the
  cases retrying exists for.
- **A window id containing `#` no longer truncates its own request.** The
  detail URL interpolated the saved id raw, so an id holding a document number
  (`RP#60001`) was cut at the fragment before the request left the browser and
  the server saw a path nobody wrote. Ids are now encoded — a no-op for a uuid,
  and a wrong id 404s as itself instead of as something else.

### Changed
- **New `entityFetchPolicy` module** holds the retry/poll decision and the
  detail-URL construction that were inline in `WindowManager`, with specs
  covering permanent vs transient failures and id encoding.

## [3.28.1] — 2026-07-22

### Fixed
- **Layout Mode → Classic puts windows back to their normal size.** Choosing
  **Sidebar** used to also write the user's Behavior → *Default window size*
  preference to *Maximized*. Nothing ever wrote it back, so once sidebar mode
  had been tried even once, classic mode kept opening every window full-screen —
  and a window that had saved a full-screen box reopened at that size even after
  being resized smaller. Sidebar already forces maximized through
  `--layout-mode`, so it no longer touches the preference at all. Choosing
  **Classic** now un-maximizes every open window, restores a stuck *Maximized*
  default back to *Large*, and forgets saved boxes that are really "the whole
  work area" so those windows reopen on the normal size ladder. Boxes the user
  sized or placed by hand — including half-screen snaps and full-width short
  windows — are left alone.

### Changed
- **New `workArea` module** holds the work-area geometry that was inline in
  `Modal` (`computeMaximizedBox`, `boxFillsWorkArea`, `SIDEBAR_STRIP_W`,
  `readAlwaysMaximizedFlag`). `Layout` takes the sidebar strip width from there
  instead of repeating the literal. Internal — no public API change.

## [3.28.0] — 2026-07-22

### Added
- **`ListLoadError`** — the error counterpart to `EmptyState` for data lists.
  Shown when a list's fetch fails (5xx, auth expiry, network) so an outage
  reads as an error with a **Try again** retry, instead of a misleading
  "nothing here" empty state. Visual language mirrors `EmptyState`, tinted for
  error; `onRetry` is optional.
- **`useInfiniteScroll` now returns `isError` and `error`** (from the
  underlying `useInfiniteQuery`) alongside the existing `refetch`, so callers
  can distinguish a failed fetch from an empty result.

### Changed
- **`EntityList` gained optional `isError` and `onRetry` props.** When
  `isError` is set and no rows have loaded, it renders `ListLoadError` (wired to
  `onRetry`) instead of `emptyState`; a mid-scroll next-page failure with rows
  already loaded keeps the list. Both props default to unset, so every existing
  call site is unchanged — pass `isError={isError} onRetry={refetch}` from
  `useInfiniteScroll` to opt a list in.

## [3.27.0] — 2026-07-22

### Changed
- **`Select` is now a custom listbox on desktop** instead of a native
  `<select>`. A native select's OS popup grabs every key event while it is open,
  so page and window hotkeys went dead until it closed (BG#00421 — filter
  dropdowns on list pages were the surface most often hit). The rebuilt control
  renders a trigger button plus a body-portaled option list (same
  portal/positioning reasoning as `SearchableSelect` and `PopupMenu`), so key
  events keep flowing to the app. It ships full keyboard support — ArrowUp/Down,
  Home/End, Enter/Space to select, letter typeahead, and Esc to close **the
  listbox only** (via the shell's `registerModalEscapeInterceptor` seam, so Esc
  never falls through and closes the parent window) — and combobox/listbox/option
  ARIA with `aria-expanded` / `aria-activedescendant`.
- **On mobile (touch) `Select` still renders the native `<select>`** — the OS
  wheel/sheet picker is the better touch affordance and hotkeys are irrelevant
  there. The forwarded `HTMLSelectElement` ref and any spread native attributes
  land on a hidden native `<select>` on desktop too, so the public `SelectProps`
  API is unchanged and every existing call site compiles as-is.
- **`FilterBar`'s short-list (`<=8` option) path** dropped its native `<select>`
  for the same custom listbox (`PlainFilter`), matching the existing
  `SearchableFilter` styling, so list-page filter dropdowns stop starving
  hotkeys.

### Added
- **`NativeSelect`** is exported for callers that need a raw native `<select>`
  (form posts, arbitrary native attributes) on every viewport.

## [3.26.0] — 2026-07-21

### Added
- **`SidebarNavItem` takes an optional `severity`** (`'success' | 'warning' |
  'danger'` — the same status vocabulary `StatusBadge` and `Banner` already
  speak, not a new ok/warn/crit dialect). It renders a small marker dot before
  the label so a filter sidebar can double as an always-visible alarm surface:
  a problem several levels inside a section stays visible on the nav item that
  leads to it. The consuming app rolls the tone up (worst-of its children); the
  item renders a severity, it never computes one. The dot is `aria-hidden` with
  a `title`, and the word ("ok" / "warning" / "critical") rides in an `sr-only`
  span after the label, so the meaning survives a screen reader or a
  colour-blind operator. **Omitting the prop renders byte-identical markup to
  3.24** — asserted in `tests/SidebarNavItem.test.tsx` against the captured
  pre-change output, so no existing call site changes. A severity usually
  arrives from a backend rollup, where the compiler cannot follow it, so an
  **unrecognised token degrades visibly and loudly rather than vanishing**: a
  grey dot with a red edge (deliberately unlike all three tones), the offending
  token named in the `title` and to a screen reader, and one deduplicated
  `console.error` naming the accepted vocabulary. Aliases (`ok` / `warn` /
  `crit`, or the displayed words round-tripped) are deliberately NOT accepted —
  quietly absorbing a second dialect would re-create the problem this vocabulary
  exists to avoid, and would hide the caller's bug instead of surfacing it.
- **`MetricBar`** — a value, a proportional bar and optional `warn` / `crit`
  threshold ticks: the CPU / memory / disk row that status surfaces keep
  re-implementing locally. The contract it enforces so no caller can get it
  wrong: **`null` is not zero**. A missing reading renders as a dashed empty
  track and an em dash, never a zero-width bar (which is a picture of a healthy
  idle box); `NaN`/`Infinity` count as missing too. With no thresholds supplied
  the fill stays grey rather than green, because green is a claim ("measured,
  and under warn") that an unjudged number has no standing to make — the shell
  hardcodes no threshold, not even as a fallback. Ticks are positioned from the
  caller's numbers on the caller's `max` scale, bounds are inclusive (`>=`), and
  the bar clamps at 100 % while the printed number does not. `max` is held to
  the same standard as `value`, because it is the divisor: `0`, a negative,
  `NaN` or `Infinity` is not a scale, so the row prints the value but draws no
  bar and no ticks rather than dividing by zero into a fabricated full bar.
  Sizes `sm` (compact row) and `md` (stat); neither draws a frame.
- **`severityOf(value, warn?, crit?)`**, **`isSeverityTone(value)`** and the
  `SeverityTone` type are exported alongside them, so consumers roll severity up
  with the same function the components judge with, and can validate a rollup at
  the fetch boundary — where a bad token can still be reported against its
  payload — instead of discovering it as a wrong pixel. A non-finite bound now
  counts as absent rather than as a threshold nothing exceeds (`value >= NaN` is
  false, so `warn={NaN}` used to return a `success` invented out of a missing
  threshold).
- **`npm test`** — `tests/*.test.tsx` run by node's built-in test runner
  (`scripts/test.mjs` bundles them with esbuild and renders through
  `react-dom/server`). No test framework is installed; `esbuild` and
  `@types/node`, which the runner and the specs genuinely import, are declared
  as devDependencies rather than borrowed from `tsup`'s transitive tree. Wired
  into CI between typecheck and build.
- **`npm run typecheck` now also covers `tests/`** via `tsconfig.test.json`. The
  main config is the build config (`rootDir: "./src"`, `include: ["src/**/*"]`),
  so the specs sat outside it and were only ever transpiled by esbuild, which
  strips types without checking them — a type error in a spec was invisible to
  CI.
- **`MetricBar`'s track carries `role="meter"` only when it is actually a
  meter** — a reading, on a scale. `aria-valuenow` is a REQUIRED attribute of
  `role="meter"` (axe-core `aria-required-attr`, serious): unlike `progressbar`,
  `meter` has no indeterminate state, so a meter without it is not an "unknown"
  reading, it is a malformed widget whose announcement is undefined. With no
  reading, or no usable `max`, the track is therefore decorative
  (`aria-hidden`) and the em dash plus "no data" carry the fact in text.
  `aria-valuenow` also stays inside the declared range, since the bar clamps and
  the printed number does not; `aria-valuetext` carries the unclamped reading
  and takes precedence in the announcement.

## [3.25.0] — 2026-07-20

### Added
- **Taskbar peek now raises the window, not just brightens it.** Hovering a
  thumbnail lifts its window above the others while they fall back a layer and
  dim, so a window buried at the bottom of the stack becomes readable without
  clicking. The raise is a single author-`!important` z-index rule keyed on the
  same `body.rosh-peeking` + `data-peek-focus` markers as the dim — it never
  writes a panel's inline styles, never calls `activateModal`, and stops
  applying the moment the marker drops, so a hover can neither reorder your
  windows nor strand one on top. It lands at `249`: above every window in the
  activation ladder, below the taskbar at `250`, so a peeked window never
  covers the thumbnail you are hovering.
- **Windows pinned on top are exempt from the raise** (new `data-pinned-top`
  marker), keeping their `999` lane rather than being demoted — the same reason
  Windows leaves topmost windows out of Aero Peek. `data-utility` is *not* the
  test: it only means a window *may* be pinned, and every bundled app sets it.
- **Off-screen windows are surfaced and recoverable.** A window that is partly
  outside the work area gets an amber dot on its taskbar tab, and its hover
  thumbnail grows an "Off screen" pill whose arrow points at where the window
  actually is. Clicking the thumbnail slides it fully back into view (keeping
  its size and roughly its position) and focuses it. Deliberately not a
  floating arrow on the desktop: neither Windows nor macOS annotates a lost
  window, and the thumbnail already shows its content.

### Fixed
- **A window can no longer be dragged out of reach.** Drags were clamped only
  at the top edge, so a window grabbed near the right end of its title bar
  could be shoved off the left or bottom and never grabbed again. Position is
  now clamped — on drag commit, on restore from a saved box, and on browser
  resize — so the full title bar stays inside the work area and at least 80px
  of the window stays grabbable. Parking a window mostly off the side still
  works, as it does on macOS.
- **Shrinking the browser no longer strands windows outside the viewport.** The
  resize handler previously refitted only *maximized* windows; windowed ones
  kept their old geometry and could end up entirely outside the new work area.
  They are now nudged back to reachable, and a box saved on a larger screen is
  sanitised before the window reopens.

## [3.24.1] — 2026-07-20

### Fixed
- **`confirm()` / `confirmDestructive()` / `prompt()` now consume `Escape`.**
  These dialogs float above the window layer but aren't shell windows, so
  pressing `Escape` over one used to reach the frontmost window's close handler
  and close the **window beneath** the dialog instead of the dialog. The dialog
  provider now registers a modal escape-interceptor while any dialog is open,
  dismissing the top-most dialog (cancel) and leaving the underlying window
  open. No effect when a dialog is shown with no window beneath it.

## [3.24.0] — 2026-07-20

### Added
- **Per-section window accent stripe** (SG#00372). `Modal` takes an optional
  `accentRgb` prop (an `R G B` triple, e.g. `'91 141 190'`); when present the
  panel publishes it as the `--window-accent-rgb` CSS custom property and
  draws a thin (3 px) accent stripe across the top of the title bar, so
  overlapping windows from different app sections are distinguishable at a
  glance. `WindowManagerProvider` takes a matching optional
  `windowAccentForRoute(route)` callback and resolves the accent per open
  window from its route — the consumer owns the route→section→colour map.
  The header itself stays theme-neutral: the stripe never touches
  `--window-header-rgb`, so all six built-in themes and the user's custom
  header/footer colour render exactly as before. Widgets (no title bar) and
  mobile fullscreen windows skip the stripe; omitting the prop keeps today's
  rendering everywhere.

## [3.23.0] — 2026-07-18

### Changed
- **Clicking a control in an inactive window now only brings the window
  forward** (SG#00391). Buttons, links, inputs, selects and textareas in a
  background window used to receive the click that was meant to raise the
  window — a link in a background tile would navigate, a button would fire.
  The first primary-button click on an inactive window's interactive element
  is now swallowed and raise-only; a second click (with the window active)
  operates the control as before. Title-bar chrome is exempt — close,
  minimize, maximize, pin and the icon menu on a background window still work
  in one click. The active window, widgets, pinned-on-top utility panels,
  plain chrome clicks (title bar / body background, which already raised) and
  text selection over background content are all unchanged.

## [3.22.2] — 2026-07-18

### Changed
- **Settings › Customization: the "Title Color" picker is now labelled
  "Header & Footer Color"** (SG#00396). The pref (`custom_title_color`) drives
  both the window header and the footer colours, but under the old label users
  couldn't find "a header and footer colour option" that already existed. Label
  change only — the pref key, applied CSS variables and Custom-theme gating are
  untouched.

## [3.22.1] — 2026-07-16

### Fixed
- **Browser: address-bar search and the MDN bookmark no longer go blank**
  (BG#00374). `duckduckgo.com` — the app's own search provider — and
  `developer.mozilla.org` — a shipped default bookmark — both refuse iframe
  embedding (`x-frame-options: SAMEORIGIN` + `frame-ancestors 'self' …` and
  `x-frame-options: DENY` respectively) but were missing from `BLOCKED_HOSTS`.
  Searching from the address bar therefore fell through to a raw iframe and
  rendered an unexplained blank pane, reading as "the address bar does
  nothing". Both are now blocklisted, so the existing "can't be embedded"
  panel with **Open in a new tab** appears instead — which actually completes
  the search. Google was already handled correctly; no engine can be iframed,
  so honest degradation is the fix.
- **Browser: a dotted search query is no longer mistaken for a hostname**
  (BG#00374). `node.js`, `vue.js`, `web.config` and `array.map` navigated to
  `https://node.js` (a DNS failure) instead of searching, because any dotted
  token matched the host pattern. A bare token is now treated as a host only
  when its last label is a real TLD; anything else searches. Real hosts
  (`example.com`, `sub.example.co.uk`, `example.com/path`) are unaffected, and
  a host on a TLD outside the list still works when typed with a scheme
  (`https://foo.zuerich`).

### Changed
- **Browser: the default `MDN` bookmark is now `DevDocs`** (`devdocs.io`,
  verified embeddable) — same API reference content, minus the guaranteed
  blank pane. Only affects users with no saved bookmarks; existing bookmark
  bars are untouched (and a persisted MDN entry now shows the friendly panel).
  The embedding-help text no longer claims MDN "works fine in here", which
  was false.

## [3.22.0] — 2026-07-13

### Added
- **"Keep all" duplicate resolution in `BulkImportGrid`** (BG#00365): the
  duplicate-review step now offers Keep first / Keep last / **Keep all** /
  Skip all per duplicate group, so the same key can survive as multiple
  lines (e.g. one part number arriving from two purchase orders at two
  prices on a purchase-invoice import). Default stays Keep first, so
  existing imports behave exactly as before. Kept duplicates flow through
  `mergeBulkItems` as separate appended lines.

## [3.21.1] — 2026-07-13

### Fixed
- **`SearchableSelect` dropdown now closes on Tab** (BG#00359): pressing Tab to
  move focus to the next field dismisses the body-portaled results instead of
  leaving them lingering over the neighbouring field. Handled in the trigger
  `onKeyDown` without `preventDefault`, so Tab (and Shift+Tab) still advance
  focus as usual; a pending free-text entry is committed on the way out, matching
  the existing outside-click behaviour.

## [3.21.0] — 2026-07-12

### Added
- **Eight more date format choices** (16 total) in `DATE_FORMAT_OPTIONS` /
  `DateFormatKey` / `formatDate`: `MM/DD/YY`, `YYYY/MM/DD`, `YYYY.MM.DD`,
  `MM-DD-YYYY`, `DD MMM YYYY`, `MMM DD, YYYY`, `DD MMMM YYYY` and
  `MMMM DD, YYYY` — follow-up to SG#00326's "offer as many formats as
  possible". Unknown keys still fall back to `DD/MM/YYYY`.

## [3.20.0] — 2026-07-12

### Added
- **Three new date format choices** in `DATE_FORMAT_OPTIONS` / `DateFormatKey`
  (SG#00326): `DD/MM/YY` (24/04/26), `DD/MMM/YYYY` (24/Apr/2026) and
  `DD/MMM/YY` (24/Apr/26). `formatDate` renders the new keys; consumers that
  pin an older shell fall back to `DD/MM/YYYY` for them.

## [3.19.1] — 2026-07-09

### Fixed
- **A lone multi-instance window no longer keeps a stale `N` suffix on its
  taskbar tab.** Opening a `multiInstance` page a second time baked a
  `${label} 2` ordinal straight into the window's stored label. While both
  copies were open they grouped into one tab showing the label + a blue count
  badge, so the ordinal stayed hidden — but closing the *first* copy left the
  second one ungrouped, and its tab fell back to the raw stored label, reading
  e.g. "Designs 2" as plain text with no badge (a count of one). Windows are
  identified by `id`, never by label, so the spawn now always stores the plain
  registry label. The instance count surfaces only where it is derived live —
  the taskbar group's blue badge — so a single window reads "Designs" and two
  read "Designs" + a blue **2**.

## [3.19.0] — 2026-07-09

### Added
- **Taskbar thumbnail peek** — hovering a window thumbnail in a taskbar tab's
  hover popover now fades every *other* open window down to 40% opacity while
  the hovered thumbnail's window stays fully opaque, so it's obvious which
  window a preview belongs to before you click. Sliding between thumbnails
  cross-fades the spotlight; the desktop restores to full the moment the
  pointer leaves the popover. Driven by a single `body.rosh-peeking` class plus
  a `data-peek-focus` marker on the target panel (CSS injected once, mirroring
  `ensureGestureStyle`) — it never touches a window's inline styles and cleans
  up on unmount, so a window can never be stranded dimmed.
- **Exposé tile close button** — hovering a window tile in Exposé /
  Mission-Control mode now reveals a round ✕ button pinned to the tile's
  top-right corner; clicking it closes that window (honouring the unsaved-
  changes confirm) without leaving Exposé, so you can tidy up several windows
  in one pass. The button lives inside the tile's hover-capture layer and
  counter-scales to a real ~30 px target regardless of how small the tile is.

## [3.18.0] — 2026-07-08

### Added
- **"Reduce transparency" preference** (Preferences → Customization →
  Transparency). Turning it on drops the frosted-glass `backdrop-filter` blur —
  the GPU-expensive effect that makes window drags and menu opens stutter on
  older machines — and makes windows, menus, popups and the taskbar solid.
  While it's on, the individual Transparency sliders are disabled (they no
  longer have any effect). Driven by a single `rosh-reduce-transparency` root
  class: a global stylesheet rule strips every `backdrop-filter` and forces the
  window/menu/taskbar opacity variables opaque, and `glassStyle()` returns a
  solid, blur-free surface — so every current and future glass surface is
  covered without per-component changes. Persists per-user through the existing
  `ShellPrefsProvider` adapter (new `reduce_transparency` pref key).

## [3.17.1] — 2026-07-08

### Fixed
- **Window dragging no longer re-lays-out the window's contents every frame.**
  The drag gesture moved the panel by mutating `left`/`top` per pointer move,
  which invalidates layout for the whole window subtree — a window full of
  table rows re-flowed at pointer rate, which is what made drags stutter on
  older machines. The gesture now moves the panel with a compositor-only
  `transform: translate()` (against the `will-change: transform` layer the
  gesture style already promotes) and commits `left`/`top` once on drop —
  including the snap-drop and restore-from-snap paths, which commit inline in
  the same style pass so the panel never flashes back to its gesture origin.
  As a side effect this also fixes a latent glitch where a React re-render
  landing mid-drag snapped the window back to its gesture-start position for
  a frame. Resize is unchanged (size changes genuinely require layout).

## [3.17.0] — 2026-07-08

### Added
- **List sorting is now remembered like columns are.** `useSort` accepts an
  optional third `tableId` argument (the same id the list passes to
  `<EntityList>`/`<ResizableTable>`). When given, the user's sort choice is
  persisted per-user through the `ShellPrefsProvider` adapter
  (`prefs.sort_{tableId}`) and restored on the next visit; localStorage
  mirrors the value so the first render already uses the last-known sort.
  Restore precedence: per-user pref → admin-saved default → the page's
  hardcoded default. Without `tableId`, behaviour is unchanged.
- **"Save as default for all users" now includes sorting.** The column
  picker's admin save sends the current `sort` alongside `visible_columns`
  to `/auth/default-columns/{tableId}/`, and `useSort` applies that default
  for users who haven't chosen their own sort. Requires a backend that
  accepts/returns a `sort` field on the default-columns endpoint (EFFICIENT
  backend ≥ 23.7.0); older backends ignore the extra key harmlessly.

## [3.16.3] — 2026-07-08

### Fixed
- **`react-os-shell/apps` no longer drags pdfjs (~511 kB) into host startup
  bundles.** The apps index re-exported `setPdfPreview` directly from the
  Preview implementation, so any host importing the apps entry statically
  pulled the whole viewer chunk — including its static `pdfjs-dist` import —
  even though the Preview component itself is lazy. The consumer-facing
  setters now live in tiny standalone modules (`setPdfPreview`,
  `setSpreadsheetPreview`, `setBrowserStartUrl`, `setFilesDemoTree` /
  `openFilesInTrashMode`), and the app implementations (Preview, Spreadsheets,
  Browser, Files) are reachable only through their `React.lazy` dynamic
  imports. `PdfActionButton` and `openPreviewFile` in the main entry were
  rewired the same way, so the root `react-os-shell` import sheds the viewer
  chunk too. No API change — everything is still exported from the same
  entry points.

### Fixed
- **Create/draft entity windows no longer fire a doomed detail GET.** A window
  opened for an unsaved record (`openEntity` mints a placeholder id like
  `new-1783415283039`) was still running the registry detail query —
  `GET {endpoint}new-…/` — which always 404s since nothing is persisted yet,
  spamming server error telemetry. `RestoredRegistryModal` now skips the fetch
  for `new-…` draft ids, mirroring the existing skip for duplicate windows. The
  create form is unchanged: it was already driven by the window snapshot, not
  the fetch result.

## [3.16.1] — 2026-07-07

### Fixed
- **Detail dialogs no longer open behind the window that spawned them.** An
  inline `<Modal>` opened from a list (e.g. an entity detail popup) has no
  `windowKey`, so it was being slotted back into a stale saved z-order keyed by
  `copyText` — dropping it *behind* the currently active window, which looked
  like nothing had opened. Keyless modals are now raised to the front on open,
  matching what `WindowManager.activateAfterMount` already does for
  `windowKey`-managed windows. Refresh-time z-order restore for real app
  windows is unaffected.

## [3.16.0] — 2026-07-06

### Added
- **New `Large` menu density.** The menu Density setting (System Preferences →
  Customization → Menu) now offers a third option alongside Tight and Normal.
  Large gives roomier menus: 8px vertical padding on Start-menu rows and a
  `0.6rem` item gap in context menus, dropdowns, and the notification popup.

### Changed
- **Slightly reduced the Normal menu density.** Normal now sits a touch tighter
  than before (medium menu size: Start-menu row padding 8px → 6px, context-menu
  item gap ~0.5rem → ~0.4rem), leaving clearer separation between Normal and the
  new Large tier. Tight is unchanged.
- **Small taskbar height is now 42px** (was 40px). Medium (56px) and large
  (72px) are unchanged.
- **The Start menu sits closer to the taskbar, scaled by taskbar size.** The gap
  between the Start menu and the taskbar edge is now 2/4/6px for the small /
  medium / large taskbar (previously a flat 8px).
- **More visible window-thumbnail close button.** The close button on window
  thumbnails (Exposé / taskbar previews) is slightly larger with a stronger
  backdrop so it reads over any snapshot.

## [3.15.0] — 2026-07-06

### Added
- **`EntityList` right-click bulk menu.** Right-clicking a row opens a context
  menu that acts on the tick-box selection (selecting the row first if it
  wasn't already). Two new opt-in props:
  - `exportEndpoint` (+ optional `exportFilename`) — adds a built-in **Export
    selected to CSV** that downloads just the ticked rows from the list's
    `<base>/export_csv/` endpoint (`?ids=…`), honouring the visible/ordered
    columns. Uses the consumer-registered `apiClient` (`setShellApiClient`).
  - `contextActions(items) => EntityListContextAction[]` — page-supplied domain
    actions (e.g. invoice Post / Cancel), each with `label`, `onClick`,
    optional `danger` / `disabled` / `divider`.
  A **Clear selection** item is always offered once a menu exists. Lists that
  pass neither prop have no context menu — fully backward-compatible.

## [3.14.2] — 2026-07-05

### Fixed
- **Windows keep their frosted glass while another window is being dragged.**
  3.14.0 stopped a *press/hold* from flattening other windows, but during an
  actual drag/resize the shell still dropped `backdrop-blur` on the static
  windows (3.14.x kept only the grabbed window frosted) — so starting to move a
  window flickered the wallpaper-through-glass look off all the others. The
  per-frame re-sample that suppression guarded against comes from the *moving*
  window (its backdrop shifts every frame); a static window behind it doesn't
  re-sample, so its blur is essentially free to keep. Backdrop-blur is now left
  on for **every** window during a gesture — only the compositor-layer promotion
  (`will-change: transform`) remains — so no window loses its frosted glass mid-drag.

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
