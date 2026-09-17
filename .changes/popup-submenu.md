---
bump: minor
title: PopupSubmenu — a nested menu inside a PopupMenu
---

- **`PopupSubmenu` — a row in a `PopupMenu` that opens a nested menu.** Until
  now the only submenu in the shell was the Start menu's, so a consumer that
  needed one (the admin portal's Media right-click menu: "Set as cover image",
  then "Move to" with a grouped list of targets) had to flatten the list or
  build its own.

  ```tsx
  <PopupMenu portal style={{ left: x, top: y }} onClose={close}>
    <PopupMenuItem onClick={setCover}>Set as cover image</PopupMenuItem>
    <PopupSubmenu label="Move to">
      <PopupMenuLabel>Gallery</PopupMenuLabel>
      <PopupMenuItem onClick={() => move('hero')}>Hero</PopupMenuItem>
      <PopupMenuDivider />
      …
    </PopupSubmenu>
  </PopupMenu>
  ```

  It opens on hover after a short rest (120ms), and at once on click, Enter,
  Space or ArrowRight — the keyboard ways also move focus to its first item,
  and ArrowUp/ArrowDown/Home/End walk the items. ArrowLeft and Escape close it
  and give focus back to the row; Escape goes through the interceptor seam, so
  inside a shell window it closes the submenu and not the window. The row
  carries `role="menuitem"`, `aria-haspopup="menu"`, `aria-expanded` and
  `aria-controls`; the panel is `role="menu"`.

  Placement is the Start menu's, from the same `menuPath.ts`: to the right of
  the menu, flipped to the left when its measured width does not fit, top-
  aligned with its row and moved up when it would run off the bottom. Open
  submenus are one path for the whole menu with one close timer — the design
  that fixed the Start menu's stale-timer bug — so sibling submenus are
  exclusive and submenus nest to any depth.

  A long submenu scrolls: `maxHeight` (a number of px or any CSS length, e.g.
  `'min(60vh, 420px)'`) caps the panel, and it is never taller than the
  viewport less its 8px gutters even when none is passed. A `disabled`
  `PopupMenuItem` inside a submenu is skipped by the arrow keys, takes no
  click, and leaves the menu open.

  The panel is portalled to `<body>` and layered above the menu it came from.
  A press inside it is not a click outside the menu. Choosing an item inside a
  submenu closes the whole menu through the root `PopupMenu`'s `onClose`; items
  in the root menu keep their contract, where the caller's `onClick` decides.

  `PopupMenuProps`, `PopupMenuItemProps` and `PopupSubmenuProps` are now
  exported as types.
