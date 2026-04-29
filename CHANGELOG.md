# Changelog

All notable changes to this project will be documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
