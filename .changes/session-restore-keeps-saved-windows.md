---
bump: patch
title: A reload no longer wipes the saved window list when prefs arrive after mount
---

- **A reload no longer wipes the saved window list when the consumer's prefs
  arrive after mount.** `SessionWindowRestore` reads `prefs.session_windows`
  once, at mount, and then wrote the open windows back on every change —
  including the empty desktop it had just mounted onto. A consumer whose prefs
  come from a server can mount the shell before its copy is in hand (the admin
  portal reads them from `/auth/me/` through React Query). The restore then
  read an empty set, opened nothing, and 800 ms later wrote
  `session_windows: []` over the set it never saw. That load came up with an
  empty desktop and taskbar, and the next one had nothing to restore either.

  It now writes only when the open windows differ from the saved set: the set
  the restore read, then the set last written. A load that could not read the
  prefs still misses its replay (the documented trade-off: no windows opening
  mid-session), but the saved set is kept for the next load. The same rule
  drops two needless writes: a replay no longer writes the same refs straight
  back, and an adapter that hands the shell a new `save` on every render no
  longer re-arms a write of an unchanged set each time. Refs are compared field
  by field, so a backend that returns them with their keys reordered (Postgres
  `jsonb` sorts them) is not a change.

  Moving or resizing a window still writes nothing to prefs, as before:
  geometry is not session state. Each window's box belongs to `Modal`, kept in
  browser localStorage (`erp_window_positions`).
