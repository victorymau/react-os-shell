---
bump: minor
title: Every EntityList row has a right-click menu with Open, Copy and Select all
---

- **Every `EntityList` now has a row menu, whether or not the page feeds it.**
  Until now a list drew a right-click menu only when it passed
  `exportEndpoint` or `contextActions`, and a bare list fell through to the
  browser's menu — or, since 4.103.0, to the shell-wide one, which knows
  nothing about rows. The row menu now always opens, and leads with what a row
  is for:

  - **Open** — the row right-clicked, through `onRowClick`.
  - **Copy** — the text selected under the pointer, when there is some (the
    same item the shell-wide menu offers; a row menu claims the event, so it
    carries it too).
  - **Copy `<first column>`** — "Copy PO #", "Copy Name": the first visible
    column of every ticked row, one per line. The column is read off the row
    when the menu opens, so it follows the user's own column order.
  - **Copy rows** — the ticked rows as a table of the visible columns, in
    their on-screen order, with a header row. Written as tab-separated text
    *and* HTML, so it pastes into a spreadsheet as cells. The cells are read
    from what is on screen — a status badge copies as its label, a formatted
    amount as formatted — rather than from the raw record.
  - **Export selected to CSV** — unchanged, still only with `exportEndpoint`.
  - The page's `contextActions`, now set off by a divider of their own.
  - **Select all** ("Select all 25 loaded" when more rows exist than have
    loaded), **Clear selection**, and **Refresh** when `onRetry` is wired —
    `onRetry` is the list's refetch, so the menu reuses it rather than asking
    for a second callback.

  The browser's own menu stays where the shell-wide menu keeps it: a text
  field or an image inside a row, a `data-native-context-menu` subtree, and
  Shift+right-click anywhere.

  **Consumer impact.** A list that passed neither prop used to show no row
  menu; it now shows this one, and every existing menu gains the new items
  around its own. A page whose `contextActions` already offered an "Open" or a
  "Copy number" item now shows both — drop the page's copy.

- **`copyToClipboard(label, text, html?)` is exported** — the copy path both
  menus use (`navigator.clipboard`, falling back to `execCommand('copy')`,
  with HTML beside the text when given) followed by a `"<label> copied"`
  toast, or an error toast when the browser refuses. For a consumer's own menu
  item that copies something. The failure toast no longer lower-cases the
  label into its sentence ("Could not copy the link address" is now "Could not
  copy to the clipboard"), which a column heading like "PO #" did not survive.
