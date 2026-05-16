# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.1] — 2026-05-16

### Fixed
- **Chunk-graph: drop dead axios runtime import from `src/api/client.ts`.** The internal `apiClient` Proxy never actually called axios — only the `AxiosInstance` type was needed — but the file's `import axios, { AxiosInstance } from 'axios'` plus its dead `export { axios }` re-export forced tsup to emit a bare `import 'axios'` side-effect import in the chunk that hosts `apiClient`. In consumer bundles that re-inlined axios (despite the peer-dep + `external: ['axios']` rule added in 0.3.0), this gave the bundler two chunks each referencing axios with different module-init ordering requirements — surfacing as `axios.create is not a function` when one chunk's live-binding to the other's `axios` was undefined at eval time. After this fix the chunk graph has exactly one runtime axios importer (`src/api/mailClient.ts`); the apiClient chunk no longer mentions axios at all, so consumer dedup behaves as intended.

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
