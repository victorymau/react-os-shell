---
bump: minor
title: Windows open wide enough for their content
---

- **A window now opens wide enough that its content doesn't scroll sideways —
  when the screen has room.** Windows used to open at a fixed width (their
  `size` step, or the registry's `dimensions`) whatever they held, so a wide
  list opened with a horizontal scrollbar on a screen with plenty of space to
  spare, and people widened it by hand on every open.

  For the first few seconds after it opens, a window whose body scrolls
  sideways now grows until the scrollbar is gone, capped at the work area less
  the usual 40px open-time margin, and moves in from the screen edge if it has
  to. It grows only, and stops watching the moment the user moves, resizes or
  maximizes the window — after that it is an ordinary fixed-size window. A box
  restored from an earlier session fits the same way.

  Only a scroller that can actually use the width counts: before committing,
  the shell probes the wider width for one layout pass and re-measures. A
  fixed-width strip, or content sized from its container, never earns a wider
  window.

  On by default for every window except widgets, `appStyle` windows and
  mobile. Opt out per window with `autoWidth: false` on the registry entry, or
  `autoWidth={false}` on `<Modal>`, to keep the ladder / `dimensions` width
  exactly.
