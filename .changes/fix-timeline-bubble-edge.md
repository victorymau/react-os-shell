---
bump: patch
title: Timeline popovers stay inside their window
---

- **A timeline popover on the first day's mark is placed like any other.** The
  first mark sits at x = 0, which is also the value the track holds while no
  popover is open, so the effect that places the popover never ran for it. The
  popover kept the stylesheet's position and its `translateX(-50%)` hung half
  of it off the left edge — a Sales Order window showed "Order Placed" cut to
  "der Placed". The placement now also re-runs when a different mark opens.
- **A popover also keeps to the shell window that owns the timeline** (UI-11),
  measured with `popupBounds`, 8 px from each edge, on top of the existing
  clamp to the track. Its arrow still aims at the mark.
- **Marks and `×N` folds no longer set a native `title`.** The popover already
  shows the label and the date on hover and on focus, and the browser drew its
  own tooltip with the same text beside it — a copy the page cannot place.
  Screen readers keep the full `aria-label`.
