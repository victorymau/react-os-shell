---
bump: minor
title: ProductionTimeline joins the kit
---

- **`ProductionTimeline` + `useProductionTimeline`** — the scrubbable
  production timeline the admin portal's Production Progress window has
  carried locally: a bar from production start to estimated completion, one
  dot per supplier progress report, shipment / inspection markers, drag or
  play to see the interpolated per-part stage quantities on any day. Promoted
  so the customer portal's order window can render the same bar over
  order-level snapshots instead of keeping a second copy. Ships with the
  stage maths (`STAGES`, `calcOverall`, `calcReportOverall`,
  `POST_PRODUCTION_STATUSES`) and its types; the legend now names inspection
  markers as well as shipments.
- **`timelineDates`** (`DAY_MS`, `toDayMs`, `fmtSliderDate`) — one copy of
  the date helpers `MilestoneTimeline` had privately, now shared with the
  scrubber and exported. `toDayMs` drops a date outside 2000–2100 (a typo'd
  "0202-12-20") rather than letting it become the axis' left edge and squash
  every real dot; `MilestoneTimeline` inherits that guard, so such a
  milestone now renders as "not reached" instead of stretching the bar.
