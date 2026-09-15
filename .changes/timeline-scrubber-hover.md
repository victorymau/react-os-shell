---
bump: minor
title: Every mark on the production scrubber takes its own pointer
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
