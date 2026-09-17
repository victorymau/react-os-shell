---
bump: patch
title: Top-level nav rows honour perms in the Start menu and sidebar
---

- **A top-level nav row is hidden from a user who lacks its permissions.**
  `navSections` takes plain `NavItem`s beside the sections, such as a portal's
  Dashboard. The desktop Start menu (bottom, top and side taskbars) and the
  sidebar drew those rows without reading their `perms` or `allPerms`, so a
  gated row showed to everyone and its page refused on click. Only the mobile
  sheet checked them. They now go through `navVisible`, and a top-level group
  whose children are all hidden is dropped, the same as a group inside a
  section.

  The divider between the top-level rows and the sections is now drawn from
  the filtered list too. Before, a menu whose only top-level row was hidden
  still drew a rule with nothing above it.

- **The sidebar filters the rows of a section that sets no `perms` of its
  own.** It told a real section from a virtual one by checking
  `'perms' in section`. For a section with no `perms` key that check is
  false, so none of its rows were filtered. The customer portal's Help &
  Feedback section sets no `perms`, so its gated Messages row was listed for
  every user who had switched to the sidebar layout. The Start menu was not
  affected.

  A host that dropped gated top-level rows itself before passing
  `navSections` in can stop doing so.
