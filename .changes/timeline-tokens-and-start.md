---
bump: minor
title: Timeline colours come from ROS tokens, and the axis draws its own start
---

- **Every timeline colour resolves to a token the kit already owns.** `--tl-dfm`,
  `--tl-shipment`, `--tl-testing`, `--tl-completion`, `--tl-inspection`,
  `--tl-on-kind`, `--tl-focus` and `--tl-soft` held nine hard-coded hues across
  the two themes — an identity encoding in which a shipment was violet, a DFM
  revision amber and an inspection orange. They are references now:
  `--status-active-*` for the accent kinds, `--status-success-*` for a
  completion, `--status-on-solid` / `--surface-sunken` for the ink on a filled
  mark. An inspection is a routine QC report, and the orange made it read as a
  fault.

  What tells the kinds apart is the SHAPE it always was — a diamond is goods
  moving, a flag opened the programme, a flask is a test or an inspection, a
  check finished something — and shape survives a greyscale print and a
  colour-blind reader, which a hue never did. `tests/timelineTokens.test.ts`
  fails the build on a literal, on a token in a red / orange / amber / danger
  family by name, on a warm hue by measurement, and on a pairing that drops
  under 3:1 on the card in either theme.

- **`TimelineTrack` draws the start of its own axis.** A production window opens
  on the day production started, not on the day the first report was filed, and
  nothing used to be drawn there: a report two days into a 237-day window sat on
  the rail's left end and read as the beginning of the programme. There is now a
  hollow ring on the rail at `startMs`, a real ruler tick under it, and a
  `Start · 20/01/2026` caption in the lane above it — and the ruler labels month
  boundaries strictly inside the window instead of pinning the preceding month
  to a coordinate that is not its date.

  The ring is decoration: `aria-hidden`, no pointer, absent from the ordered
  list a screen reader walks, and never one of a scrubber's stops. Where a dated
  mark lands on the start day — every mould card, whose window opens ON its
  first milestone — the ring opens out and encircles it rather than sitting
  under it, and the lane packer puts that mark's label in the second lane. Time
  stays linear: nothing moves off the date it has.

- **`ProductionTimeline` takes `edgeCaptions`,** passed to the track, for a
  caller who knows something the kit does not ("Start · PO issued", a
  contractual delivery date). Omitted, the track writes the window's own left
  edge. `TimelineTrackProps.edgeCaptions` keeps its name and its type; what
  changed is where it is drawn — over the coordinate it names, rather than
  flanking a bar whose left edge it could only point at.
