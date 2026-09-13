---
bump: patch
title: A window whose dialog holds unsaved edits asks before closing
---

- **A window whose DIALOG holds unsaved edits now asks before it closes.** A
  dialog opened inside a window — a create form, a detail popup — carries no
  `windowKey`, so it is not a taskbar window and nothing on the taskbar could
  see its state. Closing the window simply unmounted it: the dialog's own guard
  never ran and half-typed work went without a word. Survivable while closing
  meant one deliberate click on one window's ✕; "Close all" makes it N windows
  at once, so a nested dialog now reports its dirty state to the enclosing
  window and that window's guard asks — on its ✕, on Escape, and on Close all
  alike.

  The report is scoped to while the dialog is open: close the dialog and the
  window is clean again. That scoping is what separates this from BG#00500,
  where a `dirty="auto"` latch poisoned a window for the rest of its life — a
  report made here cannot outlive the dialog that made it.
