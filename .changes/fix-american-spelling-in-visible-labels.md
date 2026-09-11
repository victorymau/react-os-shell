---
bump: patch
title: Visible labels spell color the American way
---

- **Visible labels use the American spelling of `color`.** Three strings on
  screen change: the markup toolbar's `◆` button is titled "Highlight in the
  brand color", Customization settings reads "Show section color stripe", and
  the help text under that checkbox now says "color" too. The README, the docs
  and the demo follow suit.

  Nothing but wording moves. The `colour` identifier the chart components pass
  around is not a word anyone reads, so it is untouched — as are every prop,
  the stored preference key `window_accent_stripe`, and all component names.
  Consumers standardizing their own interface on American English were meeting
  these as the last British spellings on the screen.

  **One of the three is exported data.** The toolbar title lives in
  `MARKUP_TOOLS` (`react-os-shell/markup`), and it is also the button's
  `aria-label` — so a consumer test that finds the button by the old wording,
  `'Highlight in the brand colour'`, stops matching. Read the title from
  `MARKUP_TOOLS` rather than repeating it, and the next change to the wording
  cannot break it either.
