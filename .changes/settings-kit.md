---
bump: minor
title: Snippet, RadioGroup, Kbd, and descriptions on a Select option
---

- **`Snippet` — a value the user copies rather than reads.** An endpoint, a
  tenant id, a shell command: monospace, truncated with the whole value on its
  `title` (`multiline` wraps instead), and a copy button that flips to a check
  for two seconds and says "Copied" through an `aria-live` region.

  The kit already shipped `CopyButton`, which is the affordance ALONE — so every
  settings panel that wanted one hand-rolled the half around it, and no two came
  out the same height. `value` is what reaches the clipboard and `children` is
  what is shown, so a masked key displays masked and copies whole. `symbol`
  prints a leading glyph that is never copied and has **no default**: a URL has
  no `$` in front of it, and a component that drew one would make every caller
  opt out. A refused clipboard toasts rather than looking like it worked.

  Not a read-only `Input`. A value that can only be copied is not a control, and
  rendering one as a field takes a tab stop and invites an edit that will not
  take.

- **`RadioGroup` — the group chrome `Radio` alone leaves to the caller.** A
  `role="radiogroup"` named by its own label (`aria-labelledby`, because a
  `<label for>` cannot name a div), the `hint` / `error` / `required` wiring
  borrowed from `FormField` rather than copied out of it, an `orientation` that
  wraps rather than compresses, and `value: null` as a real "nothing chosen yet"
  instead of a silently pre-selected first option.

  The options stay real native radios sharing one `name`. That is what gives the
  group its arrow keys, its skipping of disabled options and its single tab stop
  — all of it from the user agent. A hand-rolled roving-tabindex loop would have
  to suppress the browser's own handling to avoid stepping twice, and would then
  own every one of those behaviours forever.

- **A `Select` option carries an optional `description`** — a second, muted line
  in the OPEN list, for a label that is a term the user has to already know
  ("Net 30", "FOB"). The closed trigger stays one line on purpose: a two-line
  trigger would change the height of every field in the row the moment one
  option grew an explanation. `NativeSelect` — and so `Select` on touch —
  ignores it, because an `<option>` holds text and nothing else. An option
  without one renders exactly the markup it always did.

- **`Kbd` — the badge the shortcut constants are shown in.** `CMD_ENTER` and its
  siblings have been exported for years with no box to put them in, so each
  consumer wrote its own: the admin portal has 109 hand-written `<kbd>` elements
  across 80 files, in two sizes. This is the one shape — a real `<kbd>`, two
  rungs, and a `className` layered on rather than replacing it so a portal can
  still tint the badge with its accent. It renders the string it is handed;
  which symbol a platform uses is what the constants already decide.
