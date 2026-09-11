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

- **The axis CUTS an idle stretch instead of letting one own the bar.** On
  `(ms - startMs) / span` the seven dated milestones of a mould whose last
  update was ten months ago all sat in the first 16% of the track. A stretch
  holding more than 30% of the window's TIME now loses its proportion entirely:
  it becomes a fixed 48 px notch with a break glyph saying how many days it
  hides, and everything left shares the rest of the track in proportion, at one
  honest density. A stretch under the threshold is never touched, so a fortnight
  still looks like twice a week; every stretch that keeps time gets at least
  48 px, because two dates a week apart drawn 1.8 px apart are one date. Every
  coordinate on the card — dots, labels, the fill, today, the phase brackets,
  the thumb — comes off that one mapping, so none of them can end up on a
  different axis.

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

- **Both cards wear one piece of chrome.** A `TimelineCard` header — a small
  icon, a 13 px sentence-case heading, the record it is about, then the facts in
  a 12 px muted line separated by `·` — and, where a card needs one, a footer
  under a hairline rule. The production bar's title row used to be 12 px tracked
  CAPITALS with a 20 px play circle in front of it and the milestone card's was
  13 px sentence case, which a reader with both open reads as two features
  rather than one. Play is now a pill in the header's right slot whose glyph
  follows its state (▶ paused, ❚❚ playing, `aria-pressed` either way), the
  status line and the legend moved into the footer, and the legend is chips
  drawn with the TRACK's own glyphs — a ring, a diamond, a flask — so a chip can
  never describe a shape the rail stopped drawing. The start/end captions
  flanking the bar are gone: the date ruler says the same thing in the same
  place as every other date on the card, and the window's ends survive in the
  track's accessible name.

- **The production thumb only ever rests on a report.** Dragging it snaps to the
  nearest report as the pointer moves (120 ms, the fill and the date chip
  travelling with it), the arrow keys step one report at a time with
  `aria-valuetext` reading "PP#10143 · 13/05/2026", and Play walks the reports at
  600 ms a stop. A day between two reports holds no snapshot anybody filed, so a
  thumb resting there was showing an estimate dressed as a fact — the
  "Estimated … between …" line is gone with it. `useProductionTimeline`'s
  interpolation and continuous sweep stay exported and working for a caller that
  drives the hook itself; nothing the kit renders asks for one.

- **A dot can be opened, not only selected.** `onOpenReport` / `onOpenMarker` on
  `ProductionTimeline` (and `onOpen` on a track item, a marker or a `Milestone`)
  make the label above the thumb a real button and give the popover an "Open"
  footer. Without a handler the label stays text, because a dead link is worse
  than none. On a milestone the two acts are different ones — `onClick` selects
  the dot on the bar, `onOpen` opens the drawing behind it — and a card that
  declares only the first keeps its Open button, because the footer falls back
  to it.

- **Hovering a `×N` pill magnifies its stretch.** The axis opens around the run
  until every pair of members is at least 28 px apart — far enough for each to
  carry its own label and date — and the rest of the bar pays for it in
  proportion, over 240 ms, closing again on the way out or on Escape. The pill
  itself does not move while it is open: a control that slides out from under
  the pointer that opened it closes itself. `zoomRange` offers the same thing to
  a consumer as an action rather than as a hover, and the clustering is decided
  on the unzoomed axis so a cluster can never dissolve because it was opened.

- **The hover popover shows the document, not a second line of text.** An item,
  a marker, a milestone or a production report may carry a `preview` — a
  drawing's revision and feedback, a report's stage row, a goods issue's pieces
  — and the kit renders it under the mark's own label and date, at most 280 px
  wide, hoverable, focusable and Escape-dismissible. The label and the date line
  are the popover's own, printed above whatever the consumer supplies, which the
  d.ts now says in as many words so a portal does not send them twice.
  `ProductionTimeline.renderReportPreview` builds one for the reports that carry
  none, for a caller whose list arrives straight off an API and would otherwise
  have to copy it to attach one field; a report's own `preview` wins. A hovered or focused dot now also grows by half rather
  than by a third, with its label going accent and semibold, because at 10 px a
  1.35 dot is a dot that moved rather than one that answered.

- **Colour and shape follow the approved prototype.** A shipment is violet
  rather than emerald, so it cannot be mistaken for a completion at a glance; an
  inspection is an orange disc with a flask rather than an amber diamond,
  because a diamond already means goods moving and the production bar draws
  both. The rail is 6 px, not 8 — at 8 it competes with the dots standing on it.
  A milestone carries an optional `glyph`, defaulting by kind, and a `default`
  milestone that names one borrows its colour: "DFM Confirmed" is a `default`
  milestone in the spec and an amber signed drawing on the card. The first dated
  milestone wears a flag.

- **Today is drawn when today IS the right edge.** A portal with no
  production-ready date passes today as the end of the window, and a strict
  "inside the window" test dropped the tag and the dashed rule from every card
  that had not finished yet — which is all of them. Past the edge by more than a
  day it goes away again: a bar that ended in July has no today on it.

- **The entrance replays on every mount.** The reveal is gated on the identity
  of the mark set against RE-renders, and on nothing else: a card animates every
  time its window is opened, not once per session.
