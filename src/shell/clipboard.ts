import toast from './toast';

/**
 * Clipboard writes for the shell's menus.
 *
 * Lifted out of `ShellContextMenu` when `EntityList`'s row menu grew Copy items
 * of its own: two menus that copy should share the one fallback path, not each
 * keep a copy of it to drift apart.
 */

/** The selection a right-click can offer to copy. `html` rides along with the
 *  text so a copied table pastes into a spreadsheet as a table, the way the
 *  browser's own Copy does. */
export interface SelectedText {
  text: string;
  html: string;
}

/**
 * What is selected — but only when the right-click landed on it. A browser
 * offers Copy for the selection under the pointer, not for one left behind in
 * another window, so neither do we.
 */
export function selectionAt(target: EventTarget | null): SelectedText | null {
  let sel: Selection | null = null;
  try { sel = window.getSelection(); } catch { return null; }
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  // Asked of each Range rather than of the Selection: `Range.intersectsNode`
  // answers the same question consistently everywhere, where jsdom's
  // `Selection.containsNode` answers it backwards.
  const node = target as Node | null;
  if (node && typeof node.nodeType === 'number') {
    let underPointer = false;
    for (let i = 0; i < sel.rangeCount && !underPointer; i++) {
      underPointer = sel.getRangeAt(i).intersectsNode(node);
    }
    if (!underPointer) return null;
  }
  const text = sel.toString();
  if (!text.trim()) return null;
  const box = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
  return { text, html: box.innerHTML };
}

/**
 * Write to the clipboard, with HTML beside the text when there is some.
 *
 * `navigator.clipboard` first. Without it (file:// pages, an older WebView),
 * `execCommand('copy')` on a throwaway selection, with a one-shot `copy`
 * listener that supplies both flavours itself.
 */
export async function writeClipboard(text: string, html?: string): Promise<boolean> {
  try {
    if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
      return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/plain', text);
    if (html) e.clipboardData?.setData('text/html', html);
    e.preventDefault();
  };
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.addEventListener('copy', onCopy);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.removeEventListener('copy', onCopy);
    ta.remove();
  }
}

/**
 * Copy, then say so: `"<label> copied"`, or an error toast when the browser
 * refused. `label` names what was copied ("Text", "Link address", "3 rows",
 * a column heading) and is shown as written — the failure message leaves it
 * out, so a heading like "PO #" is never lower-cased into a sentence.
 */
export async function copyToClipboard(label: string, text: string, html?: string): Promise<boolean> {
  const ok = await writeClipboard(text, html);
  if (ok) toast.success(`${label} copied`);
  else toast.error('Could not copy to the clipboard');
  return ok;
}
