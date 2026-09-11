---
bump: minor
title: Timelines share one track: clustered labels, compressed idle gaps, motion and keyboard access
---

- **`TimelineTrack` is the new export, and both timelines are drawn on it.**
  The mould milestone card and the production-progress scrubber were the same
  picture rendered twice — two bars, two dot vocabularies, two ideas about where
  a label goes — and they had started to drift apart. `TimelineTrack` owns the
  time axis, the rail and its fill, the date ruler, the dots and their glyphs,
  label placement, clustering, the pending list, the optional scrubber thumb,
  the motion and the keyboard contract. `MilestoneTimeline` and
  `ProductionTimeline` are now thin wrappers that know what their dots MEAN and
  nothing about how a bar is drawn, so the two cards look and move identically
  by construction rather than by review.

  Take it directly when a domain needs a dated sequence on a bar and neither
  card is the right wrapper: `items` (dated marks), `markers`, `pending`
  (undated), `axis` (`linear` | `compressed`), `labels` (`lanes` | `active`),
  `thumb`, `phases`, `edgeCaptions`, `currentKey`, `motion`, `ariaLabel`. The
  props of `MilestoneTimeline`, `ProductionTimeline` and `useProductionTimeline`
  are unchanged, and so are the stage maths (`STAGES`, `calcOverall`,
  `calcReportOverall`) and the interpolated snapshot.

- **A run of same-kind revisions folds into one `×N` pill.** Three or more
  consecutive dots of one kind are one step reported several times, so they
  collapse to `DFM ×4` however much room the axis has — four labels saying
  almost the same word is noise even when they fit. Two collapse only when their
  labels would not clear each other, because `DFM ×2` tells a reader strictly
  less than two labels do, and a milestone that settles something never folds at
  all. The member dots stay on the rail at their real coordinates with a faint
  span line joining them, so the pill never lies about when anything happened.

  The pill is a `<button aria-expanded>` opening a popover that lists each
  member with its date: a click pins it, hover previews it, Escape closes it.
  Every member is in its own dot's accessible name as well, so nothing is
  reachable by hover alone.

  That is what lets the lanes drop from four to two. Four lanes resolved the
  overlap at the cost of ~112 px of card height and an eye zig-zagging across
  four rows to read one week of history, which was the "crammed" complaint
  itself. On mould 001F/1813 the card now reads `Project Initiated · DFM ×4 ·
  DFM Confirmed · Mould Complete`.

- **The axis compresses idle stretches instead of letting one own the bar.** On
  `(ms - startMs) / span` the seven dated milestones of a mould whose last
  update was ten months ago all sat in the first 16% of the track. Each stretch
  between two dated milestones now gets at least 48 px, so two dates a week
  apart are still two dates, and at most 30% of the track, so no idle stretch
  can own the bar; a stretch the ceiling cut carries a break glyph saying how
  many days it hides, while one merely widened to the minimum is not marked,
  because it already reads as short. Every coordinate on the card — dots,
  labels, the fill, today, the phase brackets, the thumb — comes off that one
  mapping, so none of them can end up on a different axis.

- **A date ruler under the rail.** Month ticks always; week ticks where they
  would stand at least 14 px apart; a month is labelled only where it clears
  72 px from the last label, so the same code serves a 73-day order and a
  337-day mould. Nothing is drawn inside a compressed stretch — that is the one
  part of the bar which does not keep time — except the span it swallowed, and
  today, which is the landmark a reader needs most in exactly that stretch.

- **Undated milestones are a list, not a position.** A milestone with no
  parseable date used to be given one (the midpoint between its neighbours, or
  the day after the last of them) and drawn as a dot at that coordinate, sitting
  inside the fill as though it were progress. It is now listed beside the track
  under "Not yet reached", the first one prefixed `Next ·`, two rows then a real
  `+N more` button — the old `title` was invisible on touch, which is the device
  most likely to be reading it.

- **Motion, with a reduced-motion answer.** The fill draws in 420 ms, the dots
  enter on a stagger that lands the last of them by 520 ms, labels settle by
  580 ms, and the current mark pulses three times and stops. It is all
  `rosh-tl-*` classes in `ui.css` next to the chart family's, behind ONE
  `prefers-reduced-motion` block, so no component writes an animation and none
  of them can forget the rule. The entrance is gated on the identity of the mark
  set rather than on a render, so hovering does not replay it. A scrubber click
  eases to its new position over 200 ms and steps straight there under reduced
  motion.

- **Keyboard and screen-reader access.** The marks are an `<ol>` in axis order
  with exactly one `aria-current="step"`, and the rail, fill, ruler, today tick,
  break glyphs, leader hairlines, phase brackets and drawn labels are all
  `aria-hidden` because they restate it. The list is ONE tab stop with a roving
  `tabindex`: arrows traverse, Home/End jump, Enter/Space activates, and every
  dot is a real `<button>` so its tooltip is reachable without a pointer.
  Tooltips and popovers are hoverable, persistent and dismissed by Escape
  through the shell's interceptor seam, which is what makes Escape work inside a
  window rather than closing the window (WCAG 1.4.13).

- **Contrast and dark-theme fixes.** The fill moves from `bg-blue-300` on
  `bg-gray-200` (1.46:1, under the 3:1 non-text minimum) to `bg-blue-500`
  (3.19:1) — which also gives it the dark and custom-accent remaps the old class
  never had, so the bar now follows the accent the user picked. Dates move from
  9 px `text-gray-400` (2.43:1) to 10 px `text-gray-500` (4.63:1). The dot halo
  was a `border-white` ring with no dark remap, a white halo on a `#181825`
  card; it is now the card's own ground. The five kind colours are new `--tl-*`
  tokens with light and dark values and an `--on-kind` ink, because a shipment
  being emerald is an identity rather than an accent.

- **Under a 320 px track the axis is abandoned, not squeezed.** One row per
  mark, the connector carrying the fill, the idle stretch stated in words, and
  the pending list underneath. The switch is decided by the CARD's own width —
  the cards live inside resizable shell windows, where the viewport says nothing
  about how wide they are.

- `compressTimeAxis`, `packLabelLanes` (now taking a lane count) and
  `clusterMarks` are pure, live in `timelineGeometry.ts`, and each keeps its own
  spec. A browser lane (`npm run test:browser`) asserts in a real browser what
  jsdom cannot measure: that no two label boxes intersect, that none escapes its
  card, that the entrance has settled by 700 ms, and that reduced motion skips
  it entirely.
