---
bump: minor
title: Undo/Redo is shown by the window footer, not mounted by each form
---
- **The window footer shows Undo/Redo itself.** A form used to have to mount
  `<ModalActions position="left"><UndoControls /></ModalActions>` to get the
  buttons, and the ones that forgot — a detail window with a bulk import, say —
  had a working ⌘Z and nothing on screen. Now the `Modal` reads the stack
  `WindowManager` mounts above it and renders the pair in the left slot as
  soon as the form registers state (`useUndoable` / `useUndoableState`) and the
  user may edit; a window with nothing to take back shows no dead pair, and a
  dialog a form opens gets none in its own footer. A provider nested inside a
  window portals its own pair through `ModalActions` the same way. A form still
  carrying its own `UndoControls` shows one pair, not two — the hand mount stands
  down while the shell's pair is showing (`UndoControlsProps.auto` marks the
  shell's; a `data-undo-controls` attribute on the row says which is which).
- **`useUndoCanEdit(canEdit)`** — a form's own word on whether the record may be
  edited right now, made to the stack it actually registers with. Nesting
  `<UndoProvider canEdit={false}>` in a form's JSX covers the children only;
  the form's own `useUndoableState` calls, made above that provider in the
  tree, kept registering with the outer stack, which stayed enabled — so the
  nested pair never moved while ⌘Z on a locked form still did. `useUndo()` now
  also reports `hasState`.
