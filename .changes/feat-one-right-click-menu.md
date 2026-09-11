---
bump: minor
title: One right-click menu everywhere — ShellContextMenu
---

- **One right-click menu everywhere in the shell — `ShellContextMenu`.**
  Right-click was a patchwork: fourteen surfaces in this package drew their own
  menu, and everywhere else the browser's native menu came up, which reads as a
  hole in a desktop OS. `Layout` now mounts `ShellContextMenu`, a single
  `contextmenu` listener on the document that fills the gaps.

  The existing handlers stand as they are: every one of them calls
  `preventDefault()`, so the global listener sees `defaultPrevented` and stands
  down, and the specific menu still wins wherever there is one. (The one
  handler that did not is fixed below.)

  The menu is drawn with the same `PopupMenu` as every other menu in the shell,
  and its items follow what was clicked — Copy for the selection under the
  pointer (with its formatting, so a copied table pastes into a spreadsheet as
  cells), Open / Copy link address for a link — over a Back / Forward / Reload /
  Copy page address section that is always present.

  Deliberate exemptions — these keep the browser's own menu:
  - **Text inputs, textareas and contenteditable.** Their spellcheck
    suggestions and "Add to dictionary" cannot be rebuilt by a web page, and a
    Paste item of our own would need a clipboard permission prompt. Non-text
    inputs — a checkbox, a range, a color swatch — have none of that to lose
    and get the shell menu.
  - **Images, canvases, video and audio.** Save image as, Copy image and the
    playback controls are the browser's.
  - **A long-press on a touch screen.** It fires `contextmenu` too, and taking
    it would cancel the browser's touch text selection.
  - **Shift+right-click anywhere**, so "Inspect" is still one gesture away.

  A consumer can opt a subtree out with `data-native-context-menu` (an embedded
  viewer, a third-party widget), or turn the menu off entirely with
  `<Layout contextMenu={false}>`. `keepsNativeMenu` and `describeContextTarget`
  are exported for a consumer that wants the same decisions in its own handler.

- **A right-click inside an open menu opens nothing more.** `PopupMenu` now
  claims `contextmenu` on itself — a text field inside a menu still keeps the
  browser's — so no menu, the shell-wide one included, ever opens on top of
  another.

- **A window with unsaved changes now asks before the page unloads.**
  `useWindowDirty` guarded closing its window, but a reload, Back out of the
  app or closing the tab discarded every window at once without a word — and
  the new menu puts Reload one row under Forward. While any registration is
  dirty, the browser now asks first (`beforeunload`).

- **The widget settings dialog no longer leaks the browser's native menu.** Its
  wrapper stopped `contextmenu` from propagating — so the widget underneath
  would not open its own menu — but never prevented the default, which left the
  browser menu showing. It does now, except on a text field placed in the
  dialog, which keeps the browser's menu as it does everywhere else.
