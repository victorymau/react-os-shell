---
bump: minor
title: One right-click menu everywhere — ShellContextMenu
---

- **One right-click menu everywhere in the shell — `ShellContextMenu`.**
  Right-click was a patchwork: fourteen surfaces in this package drew their own
  menu, and everywhere else the browser's native menu came up, which reads as a
  hole in a desktop OS. `Layout` now mounts `ShellContextMenu`, a single
  `contextmenu` listener on the document that fills the gaps.

  None of the existing handlers were touched, and none needed to be: every one
  of them calls `preventDefault()`, so the global listener sees
  `defaultPrevented` and stands down. The specific menu still wins wherever
  there is one.

  The menu is drawn with the same `PopupMenu` as every other menu in the shell,
  and its items follow what was clicked — Copy for a selection, Open / Copy
  link address for a link, Open / Copy image address for an image — over a
  Back / Forward / Reload / Copy page address section that is always present.

  Two deliberate exemptions:
  - **Text inputs, textareas and contenteditable keep the browser's own menu.**
    Its spellcheck suggestions and "Add to dictionary" cannot be rebuilt by a
    web page, and a Paste item of our own would need a clipboard permission
    prompt. Non-text inputs — a checkbox, a range, a colour swatch — have none
    of that to lose and get the shell menu.
  - **Shift+right-click anywhere reaches the browser's real menu**, so
    "Inspect" is still one gesture away.

  A consumer can opt a subtree out with `data-native-context-menu` (an embedded
  viewer, a third-party widget), or turn the menu off entirely with
  `<ShellContextMenu disabled />`. `keepsNativeMenu` and
  `describeContextTarget` are exported for a consumer that wants the same
  decisions in its own handler.

- **The widget settings dialog no longer leaks the browser's native menu.** Its
  wrapper stopped `contextmenu` from propagating — so the widget underneath
  would not open its own menu — but never prevented the default, which left the
  browser menu showing. It was the one `onContextMenu` in the package that did
  not call `preventDefault()`. It does now.
