---
bump: patch
title: Visible labels use the American spelling of "color"
---

- **Visible labels use the American spelling of `color`.** Three strings on
  screen change: the markup toolbar's `◆` button is titled "Highlight in the
  brand color", Customization settings reads "Show section color stripe", and
  the help text under that checkbox now says "color" too.

  Text only, no behavior change. The `colour` identifier the chart components
  pass around is not a word anyone reads, so it is untouched — as are every
  prop, the stored preference key `window_accent_stripe`, and all component
  names. Consumers standardizing their own interface on American English were
  meeting these as the last British spellings on the screen.
