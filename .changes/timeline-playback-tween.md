---
bump: minor
title: the production timeline's Play travels between reports instead of jumping
---

- **Play on `ProductionTimeline` glides the thumb from one report to the next.**
  It used to step: a 600 ms timer moved the slider onto the next stop and a
  120 ms CSS transition carried the disc there, which reads as a thumb that
  teleports and a date chip that changes its mind, never as travel. Now the
  thumb crosses the rail continuously, the chip counts the days under it, and
  the fill follows; it rests 700 ms on each report it reaches, and the status
  line below the bar changes on arrival rather than while it is on its way.

  The pacing is the part worth knowing about. A playback tweened in TIME looks
  right on a linear axis and stalls on a compressed one — an idle stretch cut
  down to a 48 px notch holds most of the window's days, so a time-paced thumb
  would spend most of its journey inside a notch it crosses in 48 px. So the
  tween is in PIXELS: 350 ms per 100 px of rail, clamped to 450–1400 ms, eased
  in and out, and the date is read back through the axis's own inverse mapping.
  A notch therefore costs 48 px of travel like any other 48 px, and the chip
  skips exactly the days the notch is not showing.

  Pause freezes the thumb where it is — mid-glide, on no report — and playing
  again continues that same stretch from that pixel. Taking hold of the thumb
  (a drag, a click on the rail, an arrow key) ends the playback rather than
  fighting it for the disc. Under `prefers-reduced-motion` the walk is the
  stepwise one it has always been: the thumb still visits every report and the
  snapshot still changes, and only the travel between them goes.

- **`TimelineTrack` takes an optional `playback`.** `{ playing, onArrive,
  onProgress?, onStop?, speed? }` — the caller owns the button and the flag, the
  track owns the movement, because the distance between two stops is a distance
  in pixels of its axis and no consumer has been told how wide the track is.
  `onArrive` is deliberately not `onActivate`: activating a mark is what a click
  means, and both portals navigate on it, so a playback that activated each stop
  in turn would walk the user through a window per report. Existing consumers
  need no change — a track with no `playback` behaves exactly as before.

- **Playback keeps time by the wall clock, not by the frame rate.** The rest at
  each report is waited out on a timer and the travel is measured against the
  high-resolution timestamp each animation frame carries, so 700 ms is 700 ms
  whatever the compositor is doing.
  This is a fix, and the bug it fixes is worth stating: the timing used to be
  made of animation frames — a rest was seven of them and a leg was thirty — so
  a surface that handed out one frame a second stretched the whole schedule by
  the same factor, without bound. On an embedded, idle customer-portal pane the
  thumb sat on its first report for eight seconds before setting off, and an
  earlier run froze for forty. A page that has been idle now walks its backlog
  forward at **one report per frame** rather than announcing four at once: the
  point of announcing a stop is that somebody can read it.

- **`TimelineTrack`'s playback takes an optional `onProgress`, and
  `ProductionTimeline` forwards it as `onScrubProgress`.**
  `({ fromKey, toKey, t, ms } | null) => void`, called on every frame of a glide
  and with `null` the moment the thumb is not between two stops — on arrival, on
  a pause, on a cancel, at the end of a run, and on the release of a drag.

  It exists because the timeline is not the only thing on the card that should
  move. The quantities in the table under the bar belong to the report the thumb
  is on, so a table that waits for the arrival jumps by a whole report's worth of
  them at the end of a journey the reader watched. The kit does not draw that
  table, so it hands out the position instead: `t` is the **eased** fraction, the
  same number that places the disc, so figures interpolated on it move with the
  disc rather than against it. A drag reports the same shape with the pointer's
  LINEAR fraction between its two neighbouring stops — the disc is magnetic and
  snaps to the nearest one as it goes, so the hand is the only continuous thing
  there is to report. Under `prefers-reduced-motion` a playback has no travel,
  and the only value it ever passes is `null`. Both props are optional and
  undefined by default: a consumer that only reads the snapshot needs no change.
