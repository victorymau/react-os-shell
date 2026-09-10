---
bump: patch
title: The desktop version watermark takes its own clicks
---

- **The desktop version watermark takes its own clicks.** It is the only way
  into the What's New window and it was losing most of them. The button
  declared no stacking level while every desktop icon declares `zIndex: 1`, so
  the Trash — whose default position is measured up from the taskbar, out of
  the same corner — painted over the digits and swallowed the click. A desktop
  icon's handler calls `stopPropagation()` and only changes the selection, so
  the click did visibly nothing.

  Measured in Chromium at 1851x1301, over the 630 pixels the label occupies:
  **120 were live on a small taskbar, 528 on a medium one and 294 on a large
  one**; a click on the centre of the digits opened the window on a medium
  taskbar only. All three are now 1334 of 1334 — the button declares
  `zIndex: 2`, above the icon layer and below the PerfStats HUD's `z-[240]`,
  the taskbar's `z-[250]` and every window.

  The label also sits clear of the taskbar at every size. Its offset was a flat
  64px, which is right for a medium taskbar and 8px short of a large one; the
  taskbar is `position: fixed`, so those pixels were neither readable nor
  clickable and are the 336 the large-taskbar figure above lost. The offset now
  comes from the taskbar's real height. Measured from the bottom of the window,
  the digits sat 66px up at every taskbar size before; they now sit **66px up
  on a medium taskbar — the same pixel — 52px up on a small one and 82px up on
  a large one**, which is the whole of the correction. The 12px inset from the
  right edge is unchanged.

  Padding makes the clickable box 58x23 rather than the 42x15 the glyphs
  occupy, without moving the glyphs. It takes 301 of the Trash tile's 6,400
  pixels — the bottom-left corner of its padding — and none of the pixels its
  "Trash" label occupies.

- **"Show version on desktop" no longer shows a ticked box over a desktop with
  no version on it.** The watermark renders on an explicit `true`, matching the
  documented opt-in default, while both settings checkboxes read the preference
  as `?? true`. Anyone who had never touched the toggle saw it ticked and had
  no watermark — and so no route into What's New at all. The checkboxes now
  read `?? false`, like the opt-in preference next to them. Nobody's desktop
  changes; the box now says what is actually on screen.

- The real-browser lane (`npm run test:browser`) lets a check state the window
  it is describing: `export const viewport = { width, height }` beside the
  `describe` string, defaulting to the 1280x720 the runner always used. A
  layout assertion at whatever size the runner happened to pick is an
  assertion about the runner; the watermark guard runs at the 1851x1301 the
  report came from. Checks may also re-navigate through `ctx.open(search)`,
  which is how one entry gets mounted once per taskbar size.
