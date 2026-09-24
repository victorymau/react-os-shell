---
bump: minor
title: Popups close when an overlay opens; one z-index scale
---

- **An open popup closes when an overlay opens over it.** In a mould edit
  window with the design `SearchableSelect` open, ⌘K raised the search palette
  and its blurred backdrop — and the option list stayed open, painted crisp
  ABOVE the palette. Popups are layered above the overlay layer on purpose (a
  list opened inside a `Dialog` must not draw behind it), and nothing ⌘K does
  is an outside press, a pick or one of the list's own keys, so nothing closed
  it.

  Overlays now announce themselves as they open, and every portalled popup
  closes: `Select`, `SearchableSelect`, `TagInput`, `DatePicker`,
  `DateRangePicker`, the `ServerStatusIndicator` card, and `PopupMenu` (through
  its `onClose`). `GlobalSearch`, `Dialog`, `Drawer` and `ShortcutHelp` all
  announce. A popup opened from inside an overlay is unaffected — it cannot be
  open when the overlay opens. Free text typed into a `SearchableSelect` or
  `TagInput` with `allowFreeText` is committed on the way out, as an outside
  press already commits it.

  New exports for a consumer's own surfaces: `dismissPopups()` for an overlay
  to call as it opens, and `OVERLAY_OPEN_EVENT`, dispatched on `window`, for a
  popup to close on.

- **`GlobalSearch` sits on the overlay layer and is portalled to `<body>`.** It
  was `z-[200]`, rendered in place: beneath the window stack once a dozen
  windows were open, beneath every pinned window (999) and beneath every
  `Dialog`. It now covers all three.

- **One z-index scale, `Z_LAYERS`.** `window` 50 (+ `windowStep` 10 per window
  above it), `menu` 400, `pinnedWindow` 999, `overlay` 9999, `popup` 10000 —
  the numbers the components already used, now read from one map by `Modal`,
  `PopupMenu`, `Dialog`, `Drawer`, `ShortcutHelp`, `GlobalSearch` and the
  popups above. Only the palette changed layer. The layers are applied as
  inline `zIndex`; a `PopupMenu` given a `z-…` class keeps its own layer.

- **`SearchableSelect` closes when focus leaves it**, not only on an outside
  press or Tab — focus moved by a script, or into another window's field. Focus
  moving into its own portalled list does not count, and neither does the
  browser window losing focus. Its Escape also goes through the shell's
  interceptor seam now, like `Select`'s, so Escape closes the list and not the
  window or dialog around it.
