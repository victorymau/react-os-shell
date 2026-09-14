---
bump: minor
title: Five gaps the admin-portal rebuild hit — sidebar slots, banner action, Select title, Snippet field wiring, kit checkboxes in the selection column
---

- **`SidebarNavItem` takes an `icon`, a `trailing` slot, and a `ReactNode`
  `label`.** An admin sidebar repeats the Start menu's section glyphs, so the
  same destination looks like the same destination in both; `icon` is that
  16 px glyph at the leading edge. It is decorative in the accessibility tree —
  the label already names the item — and deliberately a step quieter than the
  words it introduces: `gray-400` against the label's `gray-700`, `blue-600`
  against the active row's `blue-700`.

  `trailing` is the right edge, after the count, for what a count cannot say —
  a plan chip, an "this leaves the shell" mark, a sync state. `shrink-0`, so
  the label is what gives way when the sidebar narrows.

  Order on a crowded row is icon, severity dot, label, count, trailing. The dot
  stays against the label wherever else it could have gone: a marker stranded
  to the left of the icon reads as the icon's status rather than the section's,
  which is the one thing the alarm surface must never do.

  `label` widens to `ReactNode` for a name that needs its own markup — a trading
  name set against its legal suffix, the part of a name a filter matched. Only a
  plain string still gets the truncation `title`: there is no text to read out
  of a node without walking it, and `title="[object Object]"` is worse than no
  tooltip at all.

  Two classes moved on the label span, and they are the only markup change to an
  item that uses none of the new props. `min-w-0` is a fix — a flex item defaults
  to `min-width: auto` and refuses to shrink below its content, so `truncate`
  never fired and a long bucket name pushed the count off the row instead of
  ellipsing. `mr-auto` was already there whenever a severity was, for the reason
  the component documents at length; two more optional children made "whenever"
  mean "always", and with exactly two children it is what `justify-between` was
  doing anyway. `SidebarNavItemProps` is now exported.

- **`Banner` takes an `action`.** A notice that names a condition and leaves the
  remedy three menus away is the usual shape of a banner nobody acts on:
  "Payment failed" with the billing screen somewhere else. The control renders
  at the right edge, after the text and before the dismiss × — so a screen
  reader reaches the problem before the remedy, and "Update card" is never past
  "close this". Vertically centred against the whole box rather than hanging
  from the first line like the icon and the title, and `shrink-0`, so a message
  that wraps to three lines neither drags the button down nor squeezes it.

- **`Select` forwards `title` to the trigger the user can actually hover.** The
  desktop listbox renders a visible button plus an `sr-only` `<select>` that
  carries the forwarded ref and any spread native attributes. `title` was riding
  that spread onto the hidden one, where it is a tooltip on a 1 px clipped box
  no pointer can reach and a fallback accessible name on an element marked
  `aria-hidden`. It now sits on the button, beside the `aria-label`,
  `aria-labelledby` and `aria-describedby` that were already pulled out for the
  same reason. `name`, `required` and the ref stay on the native control, which
  is what it is there for.

- **`Snippet` accepts `id` and `aria-describedby`.** `FormField` renders its
  hint with a generated id and clones its single element child with an
  `aria-describedby` pointing at it — and a child that does not accept the prop
  drops it, so the `<p>` renders, the row looks wired, and the hint is announced
  to nobody. Both land on the COPY BUTTON, which is the only focusable thing in
  a Snippet and a labelable element, so `FormField htmlFor` produces a real
  `<label for>` association rather than a decoration. With `hideCopyButton`
  there is nothing focusable left and they fall back to the box, because an id
  that resolves to no element is not wiring either.

- **The selection column in `EntityList` and `DataTable` renders the kit's own
  `Checkbox`.** Both were hand-rolled `<input type="checkbox">` carrying
  `text-blue-600` where every other box in the kit carries `accent-blue-600` —
  so the one control a bulk action runs through was the one control that did not
  follow the user's accent, and had no focus ring.

  The header was the real defect. `EntityList` set `checked={allSelected}` and
  nothing else, so a page with three of forty rows ticked showed an EMPTY
  select-all. That reads as "nothing here is selected", and the click that
  follows it — meaning "select everything" — does select everything, which is
  exactly what it already looked like. It is now `checked` when every row is
  selected, `indeterminate` when some are, and unchecked otherwise.
  `DataTable`'s header had the third state already, through a bare ref callback
  that wrote the DOM property once; `Checkbox` also rewrites it after every
  render that assigns `checked`, which a browser clears the property on.

  Both boxes in `EntityList` also gained an accessible name, from the same
  `useShellStrings` catalog `DataTable`'s column already reads
  (`table.selectAll` / `table.selectRow`): they had none, which on the one
  control a bulk action runs through is the wrong place to leave one, and a
  literal would not have followed a mounted catalog.

  Selection callbacks, row behaviour and both column widths are unchanged —
  `EntityList`'s boxes keep their 14 px, which has to be an inline style because
  Tailwind emits `.h-3\.5` before `.h-4` and a class cannot win that cascade
  however it is ordered in the attribute.
