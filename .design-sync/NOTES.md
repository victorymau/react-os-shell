# react-os-shell — design-sync notes

Repo-specific gotchas for future syncs.

## Build / CSS
- This is a **Tailwind v4** library. The shipped `dist/styles.css` is Tailwind *source* (`@import "tailwindcss"` + `@source "./**/*.js"`), NOT compiled CSS. It styles nothing on its own — the consumer's Tailwind build generates the utilities.
- Therefore the design-sync `cfg.cssEntry` points at a **compiled** stylesheet `dist/_compiled.css`, produced by running the Tailwind v4 CLI over `dist/styles.css` (which `@source`-scans the compiled `dist/*.js` for the utility classes the components use). This yields all utilities + `@theme` tokens + `themes.css` as static CSS.
- `cfg.buildCmd` runs `npm run build` then the Tailwind CLI compile. **The Tailwind CLI is not a repo dep** — it's installed into `.ds-sync` alongside the converter deps. When re-staging `.ds-sync` on a fresh clone, install it too:
  `(cd .ds-sync && npm i esbuild ts-morph @types/react @tailwindcss/cli@4.2.4)`

## Providers / context
- The demo (`examples/demo/src/App.tsx`) wraps the app in: BrowserRouter → QueryClientProvider → Layout/WindowManagerProvider → ConfirmProvider, ShellAuthProvider, ShellPrefsProvider, ShellEntityFetcherProvider, StatusBadgeProvider, DesktopHostProvider — plus imperative setup (`setShellWindowRegistry`, `setShellApiClient`, …).
- Full-desktop components (Desktop, StartMenu, WindowManager, Layout, Modal) need this chain + side-effect setup that a static preview can't easily reproduce → expect floor cards for those.
- Standalone primitives (StatusBadge, Breadcrumbs, TopNav, Kanban, EditableGrid, SearchableSelect, Markdown, HelpCenter, SidebarLayout, ListFooter, PopupMenu*) render with little/no provider — these are the authored-preview targets.

## Composition sources
- `examples/demo/src/*Demo.tsx` are gold usage examples (BadgesDemo, KanbanDemo, TableDemo, ListDemo, TopNavDemo, BreadcrumbsDemo, FormControlsDemo, SidebarDemo, GridDemo, HelpCenterDemo, ShortcutsDemo, PreferencesDemo). Port these for authored previews.
- Bundled apps (Browser, Calculator, Spreadsheet, etc.) live under the `./apps` subpath, not the main entry; many pull heavy peer deps (online-3d-viewer, pdfjs-dist, xlsx, dxf-viewer) and live data — likely floor cards.

## Preview authoring conventions (calibrated on StatusBadge / PopupMenu / Markdown)
- Each `.design-sync/previews/<Name>.tsx` exports **zero-arg PascalCase React component functions** — each export = one graded card cell. Import from `'react-os-shell'`. No marker line (owned files).
- Mount is `createElement(Export)` with no props, so a story is a self-contained component returning JSX. Wrap padding in a `<div className="p-5">`/`p-6`.
- **Per-component providers go INSIDE the preview** (not global cfg.provider). E.g. StatusBadge wraps its stories in `<StatusBadgeProvider groups={...}>`.
- Tailwind utilities work (compiled into _ds_bundle.css). Use the same utility classes the repo's demos use.
- **Markdown supported syntax**: ATX headings `##`–`####` (NOT `#`), `**bold**`, `*italic*` (NOT `_italic_`), `` `code` ``, `[links](url)`, `-`/`1.` lists, `>` blockquotes, tables. Using unsupported syntax renders the raw markup literally.
- Render/capture for a single component: `node .ds-sync/lib/preview-rebuild.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle --components <Name>` then `node .ds-sync/package-capture.mjs --out ./ds-bundle --components <Name>`. **Must set `DS_CHROMIUM_PATH` to system Chrome** (`/c/Program Files/Google/Chrome/Application/chrome.exe`) — no chromium is cached.

## Floor-card components (left unauthored by design)
- The 7 context providers (ConfirmProvider, DesktopHostProvider, ShellAuthProvider, ShellEntityFetcherProvider, ShellPrefsProvider, StatusBadgeProvider, WindowManagerProvider) are non-visual — they keep their `.d.ts`/`.prompt.md` (which document the wrapping API) but have no authored card.
- Full-desktop runtime components (Desktop, StartMenu, Layout) need the window-registry runtime + imperative `setShell*` setup a static card can't reproduce → floor cards.

## Authoring findings folded from wave learnings (batches A/B/C)
- **React Query floor cards — DocFavStar, ResizableTable, EntityList.** These call `useQueryClient`/`useMutation` internally. `@tanstack/react-query` is *inlined* into `_ds_bundle.js`, and the package does NOT re-export `QueryClient`/`QueryClientProvider`, so a preview-bundled provider is a separate module instance with a separate context → "No QueryClient set" → blank. **Cannot be fixed from a preview.** Real fix is a package change: export a `ShellQueryProvider`/`QueryClientProvider` from `react-os-shell/index` that shares the bundled react-query. Until then these 3 stay floor cards. EntityList wraps ResizableTable so it shares the fate.
- **Arbitrary Tailwind classes are NOT in the compiled CSS.** `_ds_bundle.css` (compiled from `dist/styles.css` `@source`-scanning `dist/*.js`) contains ONLY the utility classes the library itself uses. Height utilities present are `h-full`/`h-screen` only — `h-[440px]` etc. silently collapse. Flex-fill components (root `flex-1 flex flex-col`/`h-full`: Kanban, SidebarLayout, EntityList, ResizableTable) need the preview wrapper to give real height via inline `style={{ height: N }}`. **This also bounds what a design built with the DS can style** — see conventions.md.
- **`useShellPrefs()` has a no-op fallback** → Customization/BehaviorPanel/SystemPreferences render but read blank/default without a provider. Wrap in `ShellPrefsProvider value={{ prefs, save }}` with static prefs for realistic selected states.
- **SystemPreferences needs a real `sections` prop** (`SystemPreferencesSection[]`); blank without it.
- **ShortcutHelp mounts closed**, opens on the `toggle-shortcut-help` document event — dispatch it in a mount `useEffect` for a static open preview.
- **DevIndicator** is gated on `isDevEnv()` (localhost/127.0.0.1) — TRUE on the capture server, so the DEV badge renders. Would be `null` (floor card) if served from a non-localhost host.
- **WindowTitle / ModalActions** render only inside a live Modal (hidden span / footer portal) → floor cards.
- **StatusBadge** needs `StatusBadgeProvider groups={…}` even when used as a small adornment inside another control — wrap the provider inside the export.

## Known render warns (triaged, not new)
- `[RENDER_BLANK]`/`[RENDER_THIN]` on any of the floor-card components (the 7 providers, Desktop, StartMenu, Layout, GlobalSearch, NotificationBell, DocFavStar, ResizableTable, EntityList, WindowTitle, ModalActions) is expected — they are deliberate floor cards.
- **`[RENDER_THIN] Modal` (height 0px) is BENIGN** — Modal portals to `document.body`, so the per-cell height measures 0, but the actual `.html` renders the full window (title bar + form + footer, confirmed by screenshot). `cardMode: single` is set. Do not "fix".
- **`[RENDER_ERRORS] WindowErrorBoundary` (Failed to load widget data, HTTP 500) is BENIGN** — the preview deliberately throws inside the boundary to render the crash card; the pageerror is that caught throw, root is non-empty.
- **NotificationBell** uses React Query internally (same root cause as DocFavStar/ResizableTable) → floor card.

## cardMode overrides applied (presentation-only)
- `single`: Modal, PopupMenu, PopupMenuItem, PopupMenuLabel, PopupMenuDivider, ShortcutHelp (fixed/portal overlays that overflow a grid cell).
- `column`: BehaviorPanel, Customization, TopNav (wider than a grid cell — one story per row).

## UI primitives + page templates (v3.4.0 — feat/ui-primitives-templates)
- Added ~20 provider-free primitives (`Button, Input, Textarea, Select, Checkbox, Radio, FormField, Label`; `Card`/`StatCard`, `Avatar`/`AvatarGroup`, `Banner`, `Tabs`, `Accordion`, `Tooltip`; `Pagination`; SVG charts `Sparkline`/`BarChart`/`DonutChart`) plus 9 admin-style page templates (`DashboardTemplate, DataTablePage, FormLayoutPage, CheckoutTemplate, EmailTemplate, ChatTemplate, GalleryTemplate, AuthScreen, ErrorPage`). All are authored previews (none are floor cards — they take no provider/react-query).
- **Delivery decision — page templates are MAIN-BARREL exports** (not a `/templates` subpath). Reason: the converter appears to enumerate the main barrel for card slots, and a template's Tailwind classes only land in `_compiled.css` if the component is bundled (the `@source "./**/*.js"` scan). Exporting from the barrel guarantees both. Tree-shaking (`tsup treeshake:true`) means consumers who don't import them pay nothing. Could move to a `react-os-shell/templates` subpath later IF the external converter is confirmed to scan subpaths — verify by reading `.ds-sync/lib/preview-rebuild.mjs` (absent in this checkout).
- **Templates avoid the React-Query floor-card trap** by using static `<table>`/list markup instead of `ResizableTable`/`EntityList`. If you later add the `ShellQueryProvider` (see "Action required" below), templates can switch to the real data components.
- Charts are dependency-free inline SVG/CSS (no charting peer dep) → color via `currentColor`/inline style, so they sidestep the compiled-CSS/arbitrary-value constraint entirely.
- `config.json` overrides: every template is `cardMode: single` with a large `viewport` (pages overflow a grid cell, same rationale as Modal); `AuthScreen`/`ErrorPage` set `primaryStory` (Login / NotFound).
- **`.ds-sync/` converter is NOT present in this checkout**, so previews were not rendered/captured here — verified instead via `npm run typecheck` + `npm run build` (all 29 new exports present in `dist/index.d.ts`) and the demo. Re-run `cfg.buildCmd` + the capture flow at sync time.

## Output dir note (this run)
- This session built into `./ds-bundle-out` instead of the conventional `./ds-bundle` because a stale shell handle locked the (empty) `ds-bundle` dir on Windows (EBUSY rmdir). The `--out` path is a CLI arg, so this is harmless; a future re-sync can use `./ds-bundle` once the lock is gone. The locked empty `ds-bundle/` dir can be deleted after closing stray terminals.

## Action required (would unlock 4 more authored cards on next sync)
- Export a `QueryClientProvider` (or a ready-made `ShellQueryProvider` that creates its own `QueryClient`) from `react-os-shell`'s public barrel (`src/index.ts`), re-exported from the SAME bundled `@tanstack/react-query`. That single export would let previews wrap **ResizableTable, EntityList, DocFavStar, NotificationBell** and move all four off the floor card. (This is a package API change → version bump + changelog per CLAUDE.md release checklist.)

## Re-sync risks
- `dist/_compiled.css` is a generated artifact (gitignored) — re-sync MUST re-run `cfg.buildCmd` (build + Tailwind compile) or previews ship unstyled.
- Tailwind CLI version is pinned to 4.2.4 to match the repo's `tailwindcss` peer; bumping the repo's Tailwind may require bumping the CLI install line above. The Tailwind CLI must be (re)installed into `.ds-sync` on a fresh clone (it is NOT in the documented converter-dep install line).
- The compiled CSS only contains utilities the library uses at build time — if the library adds components using new utility classes, re-run `cfg.buildCmd` so they're regenerated.
- Upload was NOT performed this run (DesignSync authorization unavailable in this environment). The verified build sits in `ds-bundle-out/`. No `projectId` is pinned yet — the first upload (after `/design-login`) will create the project and record the pin. At that point, make the FINAL build a driver run so the README-with-header is what ships and the receipt/upload-plan are generated.
- Grades + verification state are carried by the uploaded `_ds_sync.json`; since nothing was uploaded, the next sync re-verifies from scratch unless this `ds-bundle-out` is reused. The authored `.design-sync/previews/` and `.cache/review/*.grade.json` ARE on disk, so a same-machine re-run carries grades forward (all 26 carried forward on the final capture).
