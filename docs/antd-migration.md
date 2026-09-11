# Migrating from Ant Design to the react-os-shell UI kit

Written for the EFFICIENT dealer portal, but the mapping is general.

Import everything from `react-os-shell/ui` — the shell-free entry. It reaches
only `react` and `react-dom`, so none of the window manager comes with it.

```ts
import { Button, Text, Stack, DataTable } from 'react-os-shell/ui';
import 'react-os-shell/ui.css';
```

## Read this first: there is no `theme.useToken()`

antd hands you a token object and you spend it in `style={{ color: token.colorTextSecondary }}`.
**This kit has no equivalent, deliberately.**

Dark mode here works by remapping utility **class names** — `ui.css` contains
rules like:

```css
[data-theme="dark"] .text-gray-500 { color: #a6adc8 !important; }
```

An inline style is invisible to that. A `useShellTokens()` hook returning
`'#6b7280'` would be correct in light mode and **permanently wrong in dark**, at
every call site, with nothing to catch it — you would be shipping a dark-mode
bug generator with an upstream blessing on it.

So the migration for a `token.X` read is a **class**, from this table:

| antd token | class | notes |
|---|---|---|
| `colorText` | `text-gray-900` | or `<Text>` |
| `colorTextSecondary` | `text-gray-500` | or `<Text tone="secondary">` |
| `colorTextTertiary` | `text-gray-400` | or `<Text tone="tertiary">` |
| `colorTextQuaternary` | `text-gray-300` | |
| `colorTextDisabled` | `text-gray-300` | |
| `colorTextPlaceholder` | `placeholder:text-gray-400` | |
| `colorLink` | `text-blue-600` | or `<Text tone="link">` |
| `colorBgContainer` | `bg-white` | |
| `colorBgLayout` | `bg-gray-50` | |
| `colorBgElevated` | `bg-white shadow-sm` | |
| `colorFillTertiary` | `bg-gray-100` | |
| `colorFillQuaternary` | `bg-gray-50` | |
| `colorBorder` | `border-gray-300` | |
| `colorBorderSecondary` / `split` | `border-gray-200` | |
| `colorPrimary` | `bg-blue-600` / `text-blue-600` | follows the active accent |
| `colorPrimaryBg` | `bg-blue-50` | |
| `colorSuccess` | `text-green-600` | |
| `colorError` | `text-red-600` | |
| `colorWarning` | `text-amber-600` | |
| `colorInfo` | `text-blue-600` | |
| `borderRadius` | `rounded-lg` | `borderRadiusSM` → `rounded-md` |

Only these hues are in the dark allow-list: **gray, slate, blue, red, green,
emerald, amber, yellow, sky, indigo**, at steps 50–900. A class outside that set
renders in light mode and does not respond to `data-theme`.

**Sizes are the exception.** An inline `style={{ width: 213 }}` is correct and
expected — arbitrary Tailwind values (`w-[213px]`) produce no style in the
compiled stylesheet, so px sizing goes through `style`. Color never does.

## Component mapping

### Direct replacements

| antd | kit | API delta |
|---|---|---|
| `Button` | `Button` | `type="primary"` → `variant="primary"`; `type="text"` → `variant="ghost"`; `danger` → `variant="danger"`; `icon` → `leftIcon`; drop `size="large"` |
| `Typography.Text` | `Text` | `type="secondary"` → `tone="secondary"` |
| `Typography.Title` | `Title` | `level` is the same 1–5 |
| `Typography.Paragraph` | `Paragraph` | |
| `Card` | `Card` | `bodyStyle`/`styles.body` → `padding` |
| `Alert` | `Banner` | `message`+`description` → children; `type` → `tone`; `closable`+`onClose` → `onDismiss` |
| `message.*` | `toast.*` | `toast.success(s)` 1:1. `App.useApp()` → plain import |
| `Modal` | `Dialog` | `footer={null}` → omit `footer`; `width` → `size` |
| `Popconfirm` | `confirm()` / `confirmDestructive()` | declarative wrapper → `await confirm({…})` in the handler. **Restructures the call site** |
| `Spin` | `LoadingSpinner` | name differs; `indicator` drops |
| `Empty` | `EmptyState` | `description` → `title` + `description` |
| `Tag` | `ColoredBadge` / `StatusBadge` | `StatusBadge` if it means a status; `ColoredBadge` if it is a label |
| `Badge count` | `CountBadge` | `offset` drops — it pins itself |
| `Descriptions` | `DescriptionList` | `items` array; `column={{xs,sm,lg}}` → `columns={{base,sm,lg}}` |
| `Skeleton` | `Skeleton` | `paragraph={{rows}}` → `lines` |
| `Result` | `Result` | same `status`/`title`/`subTitle`/`extra` |
| `Statistic` | `Statistic` | same, `precision` included |
| `Divider` | `Divider` | `type="vertical"` → `orientation="vertical"` |
| `Segmented` | `Segmented` | `options` array |
| `Radio.Group` + `optionType="button"` | `Segmented` **with `name`** | see below |
| `Switch` | `Switch` | `valuePropName="checked"` no longer needed |
| `InputNumber` | `InputNumber` | reports `number \| null` |
| `Upload` (`beforeUpload → false`) | `FilePicker` | it never uploads; the form submits the `File[]` |
| `Space` | `Inline` / `Stack` | `direction="vertical"` → `Stack` |
| `Row`/`Col` | `Grid` | `<Row gutter={16}><Col span={12}>` → `<Grid cols={2} gap={4}>` |
| `Dropdown` | `PopupMenu` | `menu={{items}}` → children |
| `Tabs` | `Tabs` | `items` array |
| `Breadcrumb` | `Breadcrumbs` | |
| `Avatar` | `Avatar` | `size={30}` → `size="sm" \| "md"` |
| `DatePicker.RangePicker` | `DateRangePicker` | **`Dayjs` → ISO `'YYYY-MM-DD'` strings.** Removes the dayjs dependency |
| `Drawer` | `Drawer` | `placement` → `side`; `width` → `size` |
| `Table` | `DataTable` | see below |

### `Table` → `DataTable`

`DataTable` renders and reports. It never sorts or paginates its own `data` —
against a paginated endpoint that would sort the current page only, which looks
perfect on page one and disagrees with it on page two.

| antd | kit |
|---|---|
| `columns[].dataIndex` / `render` / `align` / `width` / `ellipsis` | same |
| `columns[].sorter: true` | `sortable: true` |
| `columns[].fixed: 'left'` | `fixed: 'left'` — set `minWidth` too, or nothing scrolls |
| `sortOrder: 'ascend' \| 'descend'` | table-level `sort: { field, direction: 'asc' \| 'desc' } \| null` |
| `onChange(pagination, filters, sorter)` | `onSortChange(sort)` and `pagination.onPageChange(page)`, separately |
| `scroll={{ x: 900 }}` | `minWidth={900}` |
| `scroll={{ x: true }}` | omit `minWidth`; wrap in `overflow-x-auto` if the content needs it |
| `pagination={{current, pageSize, total, onChange}}` | `pagination={{page, pageCount, onPageChange}}` — compute `pageCount` yourself |
| `pagination={false}` | omit `pagination` |
| `locale.emptyText` | `emptyText` |
| `rowKey` / `rowClassName` / `onRow` / `loading` / `bordered` / `size` | same |

Sort direction is `'asc'`/`'desc'`, not antd's `'ascend'`/`'descend'` — it uses
the package's own `SortState`, so `DataTable`, `useSort` and `ResizableTable`
all speak one language. If you already round-trip a backend ordering string,
keep that mapping exactly as it is and translate the two direction words at the
`onSortChange` boundary.

Sorting cycles **asc → desc → unsorted**. The third state is deliberate:
without it there is no way back to the server's own default ordering once a
column has been clicked.

Not implemented, because nothing asked for them: `rowSelection`, `expandable`,
`Table.Summary`, column-level `filters`/`onFilter`, `sticky`, `virtual`.

### `Segmented` covers two antd components

They look identical and behave differently, and the difference is `name`:

```tsx
// A view toggle. Nothing submits it.
<Segmented value={view} onChange={setView} options={[…]} />

// Inside a form. Submits, restores on back, announces as a radio group.
<Segmented name="payment" value={method} onChange={setMethod} options={[…]} />
```

Reach for `name` whenever the choice is **data**. A button group in a form that
submits nothing is the failure this collapses into one component to prevent.

### No direct equivalent

| antd | do this instead |
|---|---|
| `ConfigProvider` | delete it — theming is `data-theme` on `<html>` plus the classes above |
| `theme.useToken()` | the token table |
| `Space.Compact` | hand-write `[&>*:not(:first-child)]:-ml-px` locally; it is not worth a component |
| `Image` with preview | keep whatever lightbox you have |
| `Layout`/`Sider`/`Menu` | build the frame from `SidebarLayout`, `SidebarNavItem`, `TopNav` |
| `List` | `Stack` + `map`. A list is markup, not a component |

## Dark mode

Do **not** write dark variants. The kit remaps the light class:
`className="bg-white"` is already correct in both themes.

Set the attribute on `<html>`:

```ts
document.documentElement.setAttribute('data-theme', resolved); // 'light' | 'dark'
```

Resolve `'system'` through `matchMedia('(prefers-color-scheme: dark)')` — and
**subscribe** to it, don't read it once, or the app disagrees with the OS until
the next reload.

## Gotchas

- **Never interpolate a Tailwind class.** `grid-cols-${n}` and `gap-${n}`
  generate no CSS. Every count-driven prop in this kit is a closed union mapped
  to literal strings for exactly this reason.
- **Tailwind does not scan `node_modules`.** Add
  `@source "../node_modules/react-os-shell/dist/**/*.{js,mjs}";` to your CSS or
  every kit class silently disappears from the build.
- **Import one stylesheet, not both.** `ui.css` *or* `styles.css` (the latter
  includes the former plus the window chrome). Both means every rule twice.
- **During coexistence, omit Tailwind's preflight.** Preflight uses bare element
  selectors; antd v6 wraps its reset in `:where()`. Preflight wins and will
  restyle every antd component still on the page. Import
  `tailwindcss/theme.css` + `tailwindcss/utilities.css` while both libraries are
  present, and add preflight back once antd is gone.
