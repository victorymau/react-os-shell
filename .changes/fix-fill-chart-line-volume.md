---
bump: minor
title: ContainerFillChart takes whole-line volumes
---

- **`ContainerFillChart` takes `getInstructionVolume` / `getActualVolume`.**
  Each returns one line's total m³ on its side and replaces the chart's own
  `getVolume(item) × quantity`. That product is right for goods that ship one
  piece to a carton and badly wrong for goods that don't: an accessory's
  catalogue volume is its carton's, so a receipt with 2,000 hub rings in four
  cartons charted 140 m³ instead of 0.28 m³, and one 40ft container read as
  ten. With the accessors the consumer does the carton math and the header's
  piece counts stay piece counts.

  `getVolume` is now optional, since a consumer passing both accessors has no
  use for it. Without either accessor nothing changes. Whether the loaded
  layer is drawn still follows the actual quantities, not the volume.
