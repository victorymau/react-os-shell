import { useEffect, useState, type ReactNode } from 'react';
import { PopupMenu, PopupMenuItem, PopupMenuDivider, MenuIcon } from './PopupMenu';
import toast from './toast';
import {
  describeContextTarget,
  keepsNativeMenu,
  type ShellContextTarget,
} from './contextMenuTarget';

/**
 * One context menu for the whole shell.
 *
 * Right-click used to be a patchwork: fourteen surfaces in this package drew
 * their own menu, and everywhere else the browser's native menu appeared,
 * which reads as a hole in a desktop OS. This component closes the hole with a
 * single `contextmenu` listener on the document, and does it without touching
 * any of those handlers:
 *
 *   - Every existing handler calls `preventDefault()`, so by the time the
 *     event bubbles to the document it is already spoken for. The listener
 *     checks `defaultPrevented` and stands down — the specific menu wins,
 *     exactly as it does today. `PopupMenu` claims right-clicks on itself the
 *     same way, so a menu never opens on top of another one.
 *   - Whatever the browser's own menu does better keeps it (`keepsNativeMenu`):
 *     text fields, for spellcheck and "Add to dictionary"; images, canvases and
 *     media, for Save / Copy image and the playback controls.
 *   - A touch long-press keeps it too. It fires `contextmenu`, and taking it
 *     would cancel the browser's touch text selection.
 *   - Shift+right-click anywhere reaches the browser's real menu, so "Inspect"
 *     is still one gesture away for developers.
 *
 * Mounted by `Layout` (`contextMenu={false}` turns it off), so a consumer gets
 * it without wiring anything. It is exported too, for a screen that renders
 * outside the shell layout.
 */

const ICONS = {
  copy: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m0 0H5.625',
  open: 'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
  back: 'M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18',
  forward: 'M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3',
  reload: 'M16.023 9.348h4.992V4.356m-4.993 4.992l3.181-3.183a8.25 8.25 0 00-13.803 3.7M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7',
  link: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
} as const;

/** The selection a right-click can offer to copy. `html` rides along with the
 *  text so a copied table pastes into a spreadsheet as a table, the way the
 *  browser's own Copy does. */
interface Selected {
  text: string;
  html: string;
}

/**
 * What is selected — but only when the right-click landed on it. A browser
 * offers Copy for the selection under the pointer, not for one left behind in
 * another window, so neither do we.
 */
function selectionAt(target: EventTarget | null): Selected | null {
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
async function writeClipboard(text: string, html?: string): Promise<boolean> {
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

function copy(label: string, text: string, html?: string) {
  void writeClipboard(text, html).then(ok => {
    if (ok) toast.success(`${label} copied`);
    else toast.error(`Could not copy the ${label.toLowerCase()}`);
  });
}

function openInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export interface ShellContextMenuProps {
  /** Turn this instance off — every right-click falls through to the browser.
   *  Under `Layout`, pass `contextMenu={false}` to `Layout` instead: it mounts
   *  its own instance. */
  disabled?: boolean;
}

interface OpenMenu {
  x: number;
  y: number;
  target: ShellContextTarget;
  selected: Selected | null;
}

export default function ShellContextMenu({ disabled }: ShellContextMenuProps = {}) {
  const [menu, setMenu] = useState<OpenMenu | null>(null);

  useEffect(() => {
    if (disabled) return;
    const onContextMenu = (e: MouseEvent) => {
      // A surface with its own menu has already called preventDefault().
      if (e.defaultPrevented) return;
      // Developer escape hatch — the browser's real menu, with Inspect on it.
      if (e.shiftKey) return;
      // Browsers dispatch `contextmenu` as a PointerEvent. A touch long-press
      // is how text gets selected by touch; taking it would cancel that.
      if ((e as PointerEvent).pointerType === 'touch') return;
      // The element actually clicked. A document listener sees `e.target`
      // retargeted to the host when the click lands inside a shadow root.
      const target = (typeof e.composedPath === 'function' ? e.composedPath()[0] : undefined) ?? e.target;
      if (keepsNativeMenu(target)) return;

      e.preventDefault();
      const selected = selectionAt(target);
      setMenu({
        x: e.clientX,
        y: e.clientY,
        target: describeContextTarget(target, selected?.text),
        selected,
      });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => { document.removeEventListener('contextmenu', onContextMenu); };
  }, [disabled]);

  // A window that scrolls or resizes under an open menu leaves it anchored to
  // nothing; close rather than follow. Scroll is captured, so a scroll inside
  // a window's own scroll area counts, not only the page's.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  if (!menu) return null;

  const { linkUrl } = menu.target;
  const { selected } = menu;
  const close = () => setMenu(null);
  const run = (fn: () => void) => () => { fn(); close(); };

  const sections: ReactNode[][] = [];

  if (selected) {
    sections.push([
      <PopupMenuItem key="copy" onClick={run(() => copy('Text', selected.text, selected.html))}>
        <MenuIcon d={ICONS.copy} />Copy
      </PopupMenuItem>,
    ]);
  }

  if (linkUrl) {
    sections.push([
      <PopupMenuItem key="open-link" onClick={run(() => openInNewTab(linkUrl))}>
        <MenuIcon d={ICONS.open} />Open link in new tab
      </PopupMenuItem>,
      <PopupMenuItem key="copy-link" onClick={run(() => copy('Link address', linkUrl))}>
        <MenuIcon d={ICONS.link} />Copy link address
      </PopupMenuItem>,
    ]);
  }

  // The default section is always drawn, so the menu is never empty and the
  // same four page actions sit in the same place whatever was clicked. Reload
  // and Back leave the page, which a dirty window (`useWindowDirty`) holds with
  // the browser's own "Leave site?" prompt.
  sections.push([
    <PopupMenuItem key="back" onClick={run(() => window.history.back())}>
      <MenuIcon d={ICONS.back} />Back
    </PopupMenuItem>,
    <PopupMenuItem key="forward" onClick={run(() => window.history.forward())}>
      <MenuIcon d={ICONS.forward} />Forward
    </PopupMenuItem>,
    <PopupMenuItem key="reload" onClick={run(() => window.location.reload())}>
      <MenuIcon d={ICONS.reload} />Reload
    </PopupMenuItem>,
    <PopupMenuItem key="copy-page" onClick={run(() => copy('Page address', window.location.href))}>
      <MenuIcon d={ICONS.link} />Copy page address
    </PopupMenuItem>,
  ]);

  return (
    <PopupMenu
      portal
      minWidth={200}
      style={{ left: menu.x, top: menu.y }}
      onClose={close}
      className="shell-context-menu"
    >
      <div data-shell-context-menu={menu.target.kind}>
        {sections.map((items, i) => (
          <div key={i}>
            {i > 0 && <PopupMenuDivider />}
            {items}
          </div>
        ))}
      </div>
    </PopupMenu>
  );
}
