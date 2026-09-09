---
bump: minor
title: A minimized inline window carries its own way back
---

- **A minimized inline `<Modal>` now shows a restore tab.** Minimizing hides a
  window without unmounting it, which is how it keeps what was typed into it —
  but only a window the taskbar lists had anything left to click. An inline
  window (a list's create form, a review dialog) appears in no taskbar, so the
  ─ control was a one-way door: the panel went to `display: none` with the
  half-typed form inside it, and a reload was the only way out. Found on the
  admin portal's New Contract window.

  A hand-minimized window with no taskbar tab now draws one of its own at the
  bottom-centre of the work area, above the taskbar: the window's title, a
  restore control, and a close that still runs the dirty guard. Restoring puts
  the same mount back on screen with its state intact.

- A window the taskbar already lists grows no second tab, and "show desktop"
  still hides windows without turning each one into a tab — only a hand
  minimize does that, because those windows come back together and a
  hand-minimized one does not.

- `ShellStrings.window` gains `restore` (default `'Restore'`) for the new
  control. Overrides are merged over the defaults, so an existing partial
  strings object keeps working untouched.
