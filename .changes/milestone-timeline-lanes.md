---
bump: minor
title: MilestoneTimeline packs labels into lanes and keeps undated milestones off the track
---

- **`MilestoneTimeline` no longer draws undated milestones at fabricated
  dates.** A milestone with no parseable date used to be given one — the
  midpoint between its dated neighbours, or the day after the last of them —
  and then drawn as an outline dot at that coordinate. On a mould whose sample
  had not shipped, the bar showed a dot on a date nobody had recorded, sitting
  in the fill as though it were progress.

  Such a milestone is now **pending**: no dot, no date, no part in the range,
  the fill, the lead-time summary or a phase bracket. It is listed beside the
  bar instead, in the block at the right edge — the one place on the card that
  is not a date coordinate. Three lines, then `+N more` carrying the rest in a
  `title`. The last dated milestone keeps its inline label on the right when
  nothing is pending, as before, and joins the lanes when something is.

  `endDate` still pins the right edge, and with nothing dated at all the axis
  keeps its empty 30-day window with every milestone listed as pending.

- **Labels are packed into up to four lanes by measured width; a label that
  still does not fit reveals on hover.** Lane assignment was `i % 2` — above
  the bar for an even index, below for an odd one — which never looked at how
  wide a label is or how close two dates are. Eight milestones over 337 days
  with four DFM revisions inside a fortnight, two of them on the same day, drew
  six labels and their dates on top of each other, and every check stayed
  green.

  Labels are now measured after mount and packed greedily left to right into
  four lanes, two above the bar and two below, tried nearest-the-bar first: a
  label takes the first lane whose last occupant ends at least 6 px before it
  starts. Two milestones on the same day therefore always land in different
  lanes, and a sparse timeline still draws a single row because only the lanes
  actually used are rendered. The track is watched with a `ResizeObserver`, so
  the same milestones repack when the window is resized.

  A label that fits nowhere is collapsed and reveals as one floating chip above
  the track on hover or keyboard focus. The dot carries its label and date in
  `aria-label` and `title` either way, so the reveal is never the only route to
  the fact.

  `packLabelLanes(items, trackWidthPx, startMs, spanMs, gapPx?)` is exported
  from the module — pure, and specified on its own so the geometry is asserted
  by extents rather than by eye. Props are unchanged.
