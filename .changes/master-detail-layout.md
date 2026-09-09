---
bump: minor
title: Add a responsive list and detail layout
---

- **`MasterDetailLayout` keeps list and detail usable in narrow containers.**
  It composes the existing resizable `SidebarLayout`, showing both panes when
  space allows and the selected pane with a Back button when it does not.
  Both panes stay mounted, preserving list filters, scroll and detail drafts.
  Focus follows compact navigation and returns to the last focused list item.
  Selection and loading remain application-owned.

- **Sidebar dividers can be resized with the keyboard.** The separator exposes
  its current width and bounds. Arrow keys resize, Home/End select a bound, and
  Enter resets to the default. `activePane` adds a full-width single-pane mode,
  which hides the divider and cancels an in-progress drag. Width restoration
  also tolerates unavailable browser storage.
