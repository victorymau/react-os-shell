# List and detail layouts

Use `MasterDetailLayout` for an inbox, record browser, or other screen where a
list selects adjacent detail. It is exported from both `react-os-shell` and
`react-os-shell/ui` and composes `SidebarLayout`.

```tsx
<MasterDetailLayout
  list={<RecordList selectedId={selectedId} onSelect={setSelectedId} />}
  selected={selectedId !== null}
  onBack={() => setSelectedId(null)}
  listLabel="Records"
  detailLabel="Record details"
  backLabel="Back to records"
  defaultWidth={300}
  storageKey="records.listWidth"
>
  {selectedId ? <RecordDetails id={selectedId} /> : <p>Select a record.</p>}
</MasterDetailLayout>
```

Give the component a parent with a defined height. In a desktop window, use
`flushBody` so its panes reach the window edges. The list pane scrolls its own
overflow; detail content owns its scroll region. Lists that use a fixed search
header can supply a flex column with a scrolling list below it.

At container widths below `compactBreakpoint` (default `720` pixels), an
unselected screen displays only the list. Selecting a record displays only its
detail and a **Back to list** button. This follows the window's available width,
including when it is resized inside a wide desktop. At larger widths both
panes are visible. `selected` and `onBack` are controlled by the application;
the layout does not change routes, load data, or clear selection by itself.

Both panes remain mounted through selection and width changes, so local filter
inputs, detail drafts and list scroll position survive. Hidden panes are removed
from layout, keyboard navigation and the accessibility tree. When opening detail
in compact mode, focus moves to Back; returning restores the last focused list
control. If that control no longer exists, focus falls back to the labelled list
region. The layout does not consume Escape, leaving nested dialogs and editors
in control of their own keyboard handling. Hidden zero-width containers retain
their last usable layout until they become measurable again.

`listLabel`, `detailLabel`, `backLabel` and `resizeLabel` accept localized text.
The list renders as a labelled region: provide the appropriate selection and
keyboard semantics in the list itself (native buttons or links work well).

`defaultWidth`, `minWidth`, `maxWidth`, and `storageKey` follow `SidebarLayout`.
In two-pane mode, drag the divider or focus it and use Left/Right (16 pixels,
32 with Shift). Home selects the minimum, End the maximum, and Enter or a
double-click resets to the default. A right-hand `SidebarLayout` reverses the
arrow direction to match the divider's movement. Width persistence is optional
and tolerates browsers where storage is unavailable.

For lower-level composition, `SidebarLayout activePane` accepts `both` (the
default), `sidebar`, or `content`. A single pane fills the width, the other stays
mounted but hidden, and the divider is hidden. Selection and focus handling are
provided by `MasterDetailLayout`; `SidebarLayout` alone does not move focus.
