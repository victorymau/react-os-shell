---
bump: patch
title: Stale-chunk reload ignores non-chunk import failures
---

- **Opening a DXF no longer reloads the whole page.** `installStaleChunkReload`
  reloaded on every `vite:preloadError`, but Vite dispatches that event for any
  rejected dynamic import it wraps — including the DXF preview's
  `import('three')` probe, whose bare specifier never resolves in a browser. A
  portal that installs the handler reloaded on every blueprint preview, then
  let one through inside the 30-second cooldown, then reloaded again. The
  handler now acts only when the payload is a missing chunk
  (`isStaleChunkError`) and leaves every other failure to the caller's catch.

- **The DXF preview gets its white background without `import('three')`.** It
  clones dxf-viewer's own default `clearColor`, which is a `THREE.Color` from
  the copy of three that dxf-viewer already bundles. The probe had always
  failed in built apps, so the canvas was drawn on dxf-viewer's black default.
