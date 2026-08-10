/**
 * Who a window-scoped shell CustomEvent is meant for.
 *
 * `modal-save` (Cmd+S) and `modal-duplicate` (Alt+Shift+D) are dispatched on
 * `document` by whichever `<Modal>` is frontmost. `document` reaches every
 * mounted window, so without a match the receiving hook in EVERY open form
 * answered a single keypress: two forms open meant one Cmd+S wrote both, and
 * depending on each form's mode that was a PATCH of a background record or a
 * brand new CREATE.
 *
 * Kept as a pure function, apart from the hooks, because this package's test
 * harness renders to static markup and cannot press a key — so the rule that
 * actually decides whether a foreign window writes is only testable if it is
 * not tangled up in an effect.
 */
export function isEventForModal(
  detail: unknown,
  modalId: string | null | undefined,
): boolean {
  const from = (detail as { modalId?: unknown } | null | undefined)?.modalId;
  // No id on the wire: an older Modal dispatched it. Answer it, exactly as
  // before — a consumer newer than its shell keeps a working Cmd+S rather than
  // silently losing the shortcut altogether.
  if (typeof from !== 'string' || from === '') return true;
  // No id on the receiver: rendered outside any Modal, so there is no window to
  // be foreign to. Same reasoning — degrade to the old behaviour, do not go
  // silent.
  if (!modalId) return true;
  return from === modalId;
}
