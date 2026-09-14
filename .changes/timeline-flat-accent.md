---
bump: minor
title: The timeline is the theme accent, and it is flat
---

- **Both timelines are one colour now, and it is the theme's own.** `TimelineTrack` —
  and through it `MilestoneTimeline` and `ProductionTimeline` — used to mix three
  blues that were each nearly right and none of them the accent: the `blue-500`
  utilities on the rail fill and the accent marks, `--status-active-solid`
  (`#1d4ed8`) behind every kind token, and `text-blue-600` on the thumb and the
  cluster pills. No accent theme remaps the status tier, so a portal with a custom
  accent got a bar in stock blue beside buttons in its own colour.

  Every one of them reads `--tl-accent` now, which is
  `var(--accent-600, var(--color-blue-600, #2563eb))` — the 600 step the primary
  `Button` wears, the step a link wears, the step an active tab underlines with.
  The middle link of that chain is Tailwind v4's own variable rather than a hex,
  so with no custom accent a mark and a primary `Button` are literally the same
  computed value: v4 states its palette in OKLCH and `blue-600` renders
  `rgb(21 93 252)`, not the `#2563eb` that v3 spelled. There is no dark step,
  because `.bg-blue-600` has none either.

  A completion loses its green with the rest. The CHECK GLYPH is what says it
  finished, and a shape survives a greyscale print and a colour-blind reader in a
  way a second hue never did — the same argument that retired the five bespoke kind
  hues.

- **A mark takes its colour from the token, not from a utility class, and that is
  a bug fix.** `.rosh-tl-node` declares `background: none` and `border: 0`, and
  `ui.css` is UNLAYERED while Tailwind's utilities live in `@layer utilities` — an
  unlayered declaration beats a layered one whatever the specificity. So the base
  rule won: the "you are here" mark rendered as a TRANSPARENT disc and a default
  dot as a BLACK ring, in every consumer, from the day the bar shipped. It only
  looked right under a custom accent, where `themes.css` remaps the same classes
  with `!important`. An inline `var(--tl-*)` — the route the kind marks already
  took — outranks all of it whatever a consumer's layer order.

- **Flat.** The rail fill's white gloss gradient is gone, and so are the three drop
  shadows: the reveal chip's, the bubble and popover's two-layer one, and the
  scrubber thumb's. Each keeps the border or the flat ring that was underneath it.
  What remains are `0 0 0 Npx` RINGS — a halo in the card's own ground, a focus
  ring, the accent wash — which is a flat colour at a radius rather than a shadow.
  Nothing else in the kit wears a gradient fill and `StatusBadge` wears no shadow
  at all, which is the consistency this was missing.

- **`--tl-accent` is new and the other `--tl-*` tokens alias it**, so a consumer
  retuning one kind still has a name to reach for. `--tl-on-kind` is
  `var(--on-accent, #ffffff)` and `--tl-soft` mixes the accent down to 16% rather
  than naming a status wash. `[data-custom-accent]` also remaps
  `hover:text-blue-600` and `hover:border-blue-600` now: a control whose resting
  state followed the user's accent used to snap back to literal blue under the
  pointer.

  Behaviour is unchanged — playback, glide, `onProgress`, clustering, compressed
  cuts, previews, the start anchor and the reduced-motion path all render exactly
  as before — and no prop was added, removed or retyped.
