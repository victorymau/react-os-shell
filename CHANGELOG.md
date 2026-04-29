# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.47] — 2026-04-30

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
