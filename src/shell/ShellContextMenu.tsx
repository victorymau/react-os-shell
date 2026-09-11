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
 *     exactly as it does today.
 *   - Text inputs, textareas and contenteditable keep the browser's own menu.
 *     Its spellcheck suggestions and "Add to dictionary" are not ours to
 *     rebuild, and a Paste of our own would need a clipboard permission
 *     prompt.
 *   - Shift+right-click anywhere reaches the browser's real menu, so "Inspect"
 *     is still one gesture away for developers.
 *
 * Mounted by `Layout`, so a consumer gets it without wiring anything. It is
 * exported too, for a screen that renders outside the shell layout.
 */

const ICONS = {
  copy: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m0 0H5.625',
  open: 'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
  image: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z',
  back: 'M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18',
  forward: 'M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3',
  reload: 'M16.023 9.348h4.992V4.356m-4.993 4.992l3.181-3.183a8.25 8.25 0 00-13.803 3.7M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7',
  link: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
} as const;

/** Clipboard write that still works without the async API (file:// pages, an
 *  older WebView): fall back to a throwaway textarea and execCommand. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function copy(text: string, label: string) {
  void copyText(text).then(ok => {
    if (ok) toast.success(`${label} copied`);
    else toast.error(`Could not copy the ${label.toLowerCase()}`);
  });
}

function openInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export interface ShellContextMenuProps {
  /** Turn the shell menu off entirely — every right-click falls through to
   *  the browser. For a consumer that is mid-migration. */
  disabled?: boolean;
}

export default function ShellContextMenu({ disabled }: ShellContextMenuProps = {}) {
  const [menu, setMenu] = useState<{ x: number; y: number; target: ShellContextTarget } | null>(null);

  useEffect(() => {
    if (disabled) return;
    const onContextMenu = (e: MouseEvent) => {
      // A surface with its own menu has already called preventDefault().
      if (e.defaultPrevented) return;
      // Developer escape hatch — the browser's real menu, with Inspect on it.
      if (e.shiftKey) return;
      if (keepsNativeMenu(e.target)) return;

      e.preventDefault();
      let selection = '';
      try { selection = window.getSelection()?.toString() ?? ''; } catch { /* ignore */ }
      setMenu({ x: e.clientX, y: e.clientY, target: describeContextTarget(e.target, selection) });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => { document.removeEventListener('contextmenu', onContextMenu); };
  }, [disabled]);

  // A window that scrolls or resizes under an open menu leaves it anchored to
  // nothing; close rather than follow.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('blur', close); };
  }, [menu]);

  if (!menu) return null;

  const { selectionText, linkUrl, imageUrl } = menu.target;
  const close = () => setMenu(null);
  const run = (fn: () => void) => () => { fn(); close(); };

  const sections: ReactNode[][] = [];

  if (selectionText) {
    sections.push([
      <PopupMenuItem key="copy" onClick={run(() => copy(selectionText, 'Text'))}>
        <MenuIcon d={ICONS.copy} />Copy
      </PopupMenuItem>,
    ]);
  }

  if (linkUrl) {
    sections.push([
      <PopupMenuItem key="open-link" onClick={run(() => openInNewTab(linkUrl))}>
        <MenuIcon d={ICONS.open} />Open link in new tab
      </PopupMenuItem>,
      <PopupMenuItem key="copy-link" onClick={run(() => copy(linkUrl, 'Link address'))}>
        <MenuIcon d={ICONS.link} />Copy link address
      </PopupMenuItem>,
    ]);
  }

  if (imageUrl) {
    sections.push([
      <PopupMenuItem key="open-image" onClick={run(() => openInNewTab(imageUrl))}>
        <MenuIcon d={ICONS.image} />Open image in new tab
      </PopupMenuItem>,
      <PopupMenuItem key="copy-image" onClick={run(() => copy(imageUrl, 'Image address'))}>
        <MenuIcon d={ICONS.copy} />Copy image address
      </PopupMenuItem>,
    ]);
  }

  // The default section is always drawn, so the menu is never empty and the
  // same four page actions sit in the same place whatever was clicked.
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
    <PopupMenuItem key="copy-page" onClick={run(() => copy(window.location.href, 'Page address'))}>
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
