---
bump: minor
title: The assembler asks the registry before it hands out a number
---

- **A number the registry has already spent is no longer handed out again.**
  `4.93.0` was published to npm by hand on 2026-09-04 at 04:41, from the
  `4.92.0` tree; nine commits merged afterwards and the assembler stamped the
  same `4.93.0` onto them, because `package.json` was the only thing it asked.
  Two different artifacts then carried one number: the published one has no
  `brand.css`, no anchored-popup fix, no `ScatterChart` axis, and its `exports`
  map has no `./brand.css` entry at all — which is why
  `unpkg.com/react-os-shell/dist/brand.css` answers 404.

  The floor for the next version is now whichever is higher, `package.json` or
  the registry's latest, so an out-of-band publish moves the floor instead of
  colliding with it. It only ever raises: a registry *behind* this file is the
  normal state between assembling a release and cutting it, and every
  unpublished release commit looks exactly like that. An unreachable registry
  falls back to `package.json` rather than stopping the one job that writes to
  `main` — a release that cannot be numbered is worse than one numbered from
  slightly less information.

  This entry's own number is the first one the guard produces: everything the
  changelog files under `4.93.0` reaches npm here, under a number the registry
  has not spent.
