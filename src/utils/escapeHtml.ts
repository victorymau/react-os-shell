/** Escape a string for safe injection as HTML text.
 *
 * The shell has two places that must put a plain string inside a
 * `contentEditable` node. React cannot own the children of a `contentEditable`
 * element without fighting the caret, so both set `innerHTML` instead — which
 * means an unescaped value is executed as markup rather than shown as text.
 *
 * Escaping round-trips exactly: the browser decodes the entities back when the
 * value is read with `textContent`, so a caller that writes `a < b` reads
 * `a < b` again.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] || c));
}
