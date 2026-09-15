---
bump: minor
title: Every mark takes its own pointer, and none is drawn under another
---

- **A mark on a scrubber can be hovered, focused and clicked again — it could not
  before, on any track with a `thumb`.** `ThumbLayer` draws a 24 px
  `.rosh-tl-hit` strip over the rail so a 6 px line can be pressed by a hand. It
  is rendered AFTER the list of dots and neither declared a `z-index`, so the
  strip won the paint order and took every pointer event aimed at a mark. The
  hover popover, the drawn caption, `onClick`, `onActivate` and the bubble's
  "Open" were all wired and all unreachable, on every `ProductionTimeline` since
  the scrubber shipped. `MilestoneTimeline` was never affected — it has no thumb,
  which is why the mould card's popover worked and the production one never did.

  The fix is one declaration, and it is on the MARKS rather than on the strip:
  `.rosh-tl-nodes .rosh-tl-node { z-index: 4 }` lifts them over the strip and
  leaves them under the thumb (5) and the popover (6). So the strip keeps every
  pixel no dot is standing on — a press on the bare rail still starts a drag, and
  because the gesture holds pointer capture, a drag crossing a mark is not handed
  away to it — a press on a dot activates that dot and starts no drag, and the tab
  order is untouched, because it is the DOM's and nothing moved in the DOM.

  No jsdom spec could have caught this and none did: jsdom has no layout and no
  hit testing, so a spec that dispatches `mouseover` at a button passes however
  the stage is stacked. The claim is asserted in the browser lane
  (`tests/browser/timelineScrubberHits`), with a real pointer and one
  `document.elementFromPoint`.

- **No two marks are drawn on top of each other any more.** "Marks that are too
  close overlap each other" (Henry, 2026-09-15, translated, looking at a
  customer's order with two shipments a few days apart). A mark is 14–16 px
  across, a day on a ten-week window is ten: the second shipment was printed over
  the first, where it could not be hovered, read or counted — and so was every
  same-day milestone on every mould card, three of them on 001F/1813 alone.

  A run of marks whose centres are closer than one mark's width now folds into
  ONE mark carrying `×N` — its kind's own shape and glyph where the run shares a
  kind (a shipment diamond with a truck and a `×2`), a neutral `×N` pill where it
  does not, and either way an accessible name that lists every member with its
  date. It is a different collision from the `DFM ×N` LABEL pill, which asks
  whether two labels clear each other and folds only iterations of one kind;
  `clusterOverlaps` asks whether the two DOTS clear each other, where the kinds
  have stopped mattering. Both are unchanged in what they already did.

  A pointer opens a fold: the axis magnifies around the run — the same
  magnification a `×N` pill asks for — and each member is a mark of its own again,
  with its own popover and its own Open. A run that is all one DATE cannot be
  opened, because no magnification separates a coordinate from itself, so its
  popover lists every member with its date and with the preview that member would
  have shown alone. Keyboard focus never opens a fold (the button would unmount
  under the focus it was given); it gets that list, and Enter opens the run and
  moves the focus to its first member.

  Folding is a DRAWING decision and nothing else: the scrubber's stops,
  `onActivate`, `aria-valuemax`, playback and the fill are all still computed from
  every mark, so a report inside a fold is still a rung the thumb rests on and
  still activates when it is picked.

- **A shipment looks like a shipment.** `KIND_STYLES.shipment` had no glyph, and
  once every kind was painted in the one accent the diamond was an accent lozenge
  among accent discs with nothing to tell them apart — on a scrubber it is not
  captioned either, unless the pointer is resting on it. It now carries a `truck`
  glyph, white on the accent like the inspection's flask, on the rail and in the
  legend chip alike. `TimelineGlyph` gains `'truck'`, and a `TimelineMarker` may
  name its own `glyph` where its kind's is not specific enough — a container
  leaving the factory and a courier bag of samples are both shipments.

- **`ProductionTimeline` takes `reportLabel` and `resetLabel`.** The card printed
  `report.progress_number` in six places — the caption over the thumb, the popover
  header, each dot's accessible name and `title`, the slider's `aria-valuetext`
  and the "Showing …" line — and a portal had no way to say otherwise. A
  production-progress report is an internal document with an identity of its own,
  and a customer's order window should not be printing it.

  `reportLabel: (report) => string` defaults to `report.progress_number`, so the
  admin window is unchanged to the character; `resetLabel` replaces the whole of
  the `Back to …` button, which is the one place the identity is not a mark on the
  bar. Nothing else about the card moved.
