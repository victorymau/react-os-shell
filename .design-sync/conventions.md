# Building with react-os-shell

`react-os-shell` is a desktop-style UI kit (windows, taskbar, start menu, panels, data views) for React 18+. Components are **pre-styled** — compose them; don't restyle them.

## Setup & providers

Most primitives render standalone — including the full UI-primitive set: **Button, Input, Textarea, Select, Checkbox, Radio, FormField, Label** (form controls), **Card / StatCard, Avatar / AvatarGroup, Banner, Tabs, Accordion, Tooltip** (display & layout), **Pagination**, and the **Sparkline / BarChart / DonutChart** charts — plus StatusBadge, Breadcrumbs, TopNav, Kanban, EditableGrid, SidebarLayout, SearchableSelect, Markdown, PopupMenu, HelpCenter, Modal. None of the primitives need a provider. Some components read React context — wrap only what you use:

- **`StatusBadgeProvider groups={{...}}`** — required by `StatusBadge`. Maps status strings → one of 9 semantic groups (`success | active | queued | info | pending | warning | danger | draft | neutral`).
- **`ShellPrefsProvider value={{ prefs, save }}`** — feeds `Customization`, `BehaviorPanel`, `SystemPreferences`. Without it they render defaults only.
- **`WindowManagerProvider`** — window/minimize management for `Modal` and the desktop shell. Needs a React Router ancestor (`<BrowserRouter>`).
- **`QueryClientProvider` (from `@tanstack/react-query`, host-app dependency)** — REQUIRED for the data components that fetch/persist: `ResizableTable`, `EntityList`, `DocFavStar`, `NotificationBell`. They call `useQuery`/`useMutation` internally and throw "No QueryClient set" without it.

Other providers: `ConfirmProvider` (enables the `confirm`/`prompt` helpers), `ShellAuthProvider`, `ShellEntityFetcherProvider`, `DesktopHostProvider`.

**Theming:** light by default. Activate dark or an accent theme by setting `data-theme="dark"` (also `pink | green | grey | blue`) on the document element — see `_ds/react-os-shell/styles.css`.

## Styling idiom — Tailwind v4 utility classes

The kit is built with **Tailwind v4 utility classes**, and the shipped stylesheet is the **compiled** set the library uses. For your own layout glue, draw from THIS vocabulary (all present in the bundle):

- Layout/spacing: `flex` `grid` `gap-*` `p-* px-* py-*` `m-* mx-*` `items-center` `justify-between` `space-y-*`
- Surfaces: `rounded-md`/`-lg` `border` `shadow` `shadow-sm` `backdrop-blur`
- Type: `text-sm` `text-xs` `text-base` `font-medium` `font-semibold`
- Palette (each in 50–900): `gray` `slate` `blue` `red` `green` `emerald` `amber` `yellow` `sky` `indigo` — e.g. `bg-blue-600` `text-gray-700` `border-gray-200`

**Hard constraint:** designs receive only this compiled stylesheet, so utilities the library never uses are NOT available — in particular **arbitrary values** (`h-[440px]`, `bg-[#abc]`) and unused color scales (e.g. `bg-amber-600`) produce NO style. For custom one-off sizing/colors use an **inline `style={{…}}`** instead. For full-height fill, components rooted in `flex-1`/`h-full` need a real height on their wrapper — give it `style={{ height: N }}`.

The glass menus/panels read DS tokens `--window-*`, `--menu-*`, `--taskbar-*` (defined in the stylesheet); don't redefine them.

## Form controls

`Button` (`variant`: `primary | secondary | ghost | danger`), `Input`, `Textarea`, `Select` (native, short lists — `SearchableSelect` is the searchable/free-text one), `Checkbox`, `Radio`, and the `FormField` wrapper (label + control + `hint`/`error`). Controlled the kit way: `value` + `onChange(value)` (`onChange(checked)` for checkbox/radio); `Input`/`Textarea` forward native props so `react-hook-form` `register()` spreads onto them. `primary` buttons and the check/radio fills follow the active accent automatically.

## Page templates

Full-screen starters for common app pages, each a zero-prop component composed from the primitives above — import and adapt them, or read them as composition references:

- `DashboardTemplate` — stat cards + charts + recent-activity table.
- `DataTablePage` — toolbar + data table + `Pagination`.
- `FormLayoutPage` — grouped `Card`s of `FormField`s (settings form).
- `CheckoutTemplate` — checkout form + order summary.
- `EmailTemplate` / `ChatTemplate` — master-detail via `SidebarLayout` (fill height: give the wrapper `style={{ height: N }}`).
- `GalleryTemplate` — media grid with `Tabs` filter.
- `AuthScreen` (`mode`: `login | register | forgot`) and `ErrorPage` (`code`: `403 | 404 | 500`).

These use static table/list markup (not the React-Query data components) so they render without any provider.

## Where the truth is

- `_ds/react-os-shell/styles.css` and its `@import` closure — the real, complete style source. Read it before styling.
- Per component: `<Name>.d.ts` (the exact props contract) and `<Name>.prompt.md` (usage). Always check props against the `.d.ts` — it is authoritative.

## Idiomatic example

```tsx
import { StatusBadge, StatusBadgeProvider, TopNav } from 'react-os-shell';

const GROUPS = { paid: 'success', overdue: 'danger', draft: 'draft' } as const;

function InvoiceHeader() {
  return (
    <StatusBadgeProvider groups={GROUPS}>
      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
        <span className="text-sm font-semibold text-gray-900">Invoice INV-1043</span>
        <StatusBadge status="overdue" />
      </div>
    </StatusBadgeProvider>
  );
}
```
