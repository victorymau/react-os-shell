---
bump: patch
title: useShellPrefs().save never rejects, so a reporting adapter cannot flood the console
---

- **`useShellPrefs().save` no longer rejects.** 4.118.2 made the shell record a
  window-list write as saved only once it settles, so that a write the backend
  refused is retried rather than recorded as landed. That asks the consumer's
  adapter for something it was not previously giving: a failed save reported as
  a rejection rather than swallowed.

  An adapter that does report it broke every other caller. Nearly all of them
  fire and forget — `save({ desktop_bg: bg })` inside an onChange, result
  discarded — so each failed PATCH raised an unhandled rejection, roughly ten
  times over inside the shell alone (`Customization`, `Layout`, `Notepad`,
  `WorldClock`, the todo store, the sort hook) and again at every call site in
  a consumer. Asking each of those to remember a `.catch` is the wrong place to
  put it.

  So the two readers are split. `useShellPrefs()` — what components use, and
  the only one the package exports — hands back a `save` that settles whether
  or not the write landed. `SessionWindowRestore` reads the adapter directly
  and still sees the rejection, which is what keeps its retry working. Existing
  consumer code is unchanged and needs no `.catch` added; `await save(…)` still
  works, it just tells you the write was attempted rather than that it landed.
