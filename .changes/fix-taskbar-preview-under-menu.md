---
bump: patch
title: A taskbar tab's right-click menu opens above the hover thumbnails
---

- **A taskbar tab's right-click menu no longer opens underneath the hover
  thumbnails.** Right-clicking leaves the pointer on the tab, so the hover
  popover stayed up, and it rode the z-9999 lane meant for dialogs and the
  startup / logout animations — above the menu at z-400. On a grouped tab the
  group menu therefore drew behind the row of thumbnails, and reaching for it
  moved the pointer over the popover, which kept it alive. Two changes, each
  insufficient alone: the popover (and its pending open) is dismissed the
  moment a context menu is asked for, and it now sits at z-300 — above the
  taskbar, below every menu — so no menu, from any tab, can open under it
  again.
