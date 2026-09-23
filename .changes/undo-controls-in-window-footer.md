---
bump: minor
title: Undo/Redo is shown by the window footer, not mounted by each form
---
- **The window footer shows Undo/Redo itself.** A form used to have to mount
  `<ModalActions position="left"><UndoControls /></ModalActions>` to get the
  buttons, and the ones that forgot — a detail window with a bulk import, say —
  had a working ⌘Z and nothing on screen. Now the `Modal` reads the stack
  `WindowManager` mounts above it and renders the pair leftmost in the footer
  as soon as the form registers state (`useUndoable` / `useUndoableState`) and
  the window is editing — a draft, a duplicate, Edit mode on a detail — or the
  form has said `useUndoCanEdit(true)` (a detail that edits in place behind a
  status or permission the shell cannot see decides for itself; a view that
  merely holds state gets nothing). It joins a footer that is there for other reasons and
  never conjures one — a window with no footer bar keeps having none, a window
  with nothing to take back shows no dead pair, a dialog a form opens gets
  none in its own footer, and the mobile chrome, which hides the footer, gets
  nothing mounted into it. A provider nested inside a window portals its own
  pair through `ModalActions` on the same footer terms — it joins a footer
  that is there for other reasons, never creates one or holds it open, and
  shows nothing on the mobile chrome — but its own `canEdit` takes the place
  of the editing check: the form that nested it has already said whether the
  record may be edited, so pass `canEdit={isEditing}` (or the lock) rather than
  leaving it at the default. A form that still mounts its own
  `UndoControls` keeps it where it put it — an inline pair in a plain overlay
  stays inline — and the shell mounts nothing for that stack, so it shows one
  pair, not two (`UndoControlsProps.auto` marks the shell's; a
  `data-undo-controls` attribute on the row says which is which).
- **A nested `<UndoProvider canEdit={false}>` now makes the window read-only.**
  A form's own `useUndoableState` calls run in the same component as the nested
  provider and so register with the OUTER stack; a nested `canEdit={false}` that
  only shadowed the children left that stack live — ⌘Z stepping a locked
  record, and no way to say otherwise. The nested provider now forwards its
  read-only claim to the stack above it, and **`useUndoCanEdit(canEdit)`** says
  the same thing without a provider at all. `useUndo()` also reports
  `hasState`.
