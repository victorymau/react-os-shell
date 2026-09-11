/**
 * The shell's global right-click menu.
 *
 * The rule most likely to regress is the exemption: text inputs, textareas and
 * contenteditable keep the browser's own menu, because its spellcheck
 * suggestions and "Add to dictionary" are not ours to rebuild and a Paste of
 * our own would need a clipboard permission prompt. A refactor that "tidies"
 * the target test would silently swallow spellcheck everywhere, and nothing on
 * screen would say so — hence a spec that dispatches real events and asserts
 * on `defaultPrevented`. Images and media, a touch long-press and a shadow-DOM
 * text field are the same kind of exemption and are pinned the same way.
 *
 * The second rule is the one that lets the fourteen existing `onContextMenu`
 * handlers in this package stay untouched: they all call preventDefault(), so
 * the global listener must stand down on an event that is already spoken for.
 * `PopupMenu` claims right-clicks on itself for the same reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { act, flush, render } from './dom';
import ShellContextMenu, { type ShellContextMenuProps } from '../src/shell/ShellContextMenu';
import WidgetSettingsModal, { DEFAULT_APPEARANCE } from '../src/shell/WidgetSettingsModal';
import { PopupMenu, PopupMenuItem } from '../src/shell/PopupMenu';
import { keepsNativeMenu, describeContextTarget } from '../src/shell/contextMenuTarget';

function rightClick(target: Element, opts: { shift?: boolean; pointerType?: string } = {}) {
  const event = new window.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    shiftKey: opts.shift ?? false,
  });
  // Browsers dispatch `contextmenu` as a PointerEvent; jsdom has none, so the
  // one field the listener reads is set by hand.
  if (opts.pointerType) Object.defineProperty(event, 'pointerType', { value: opts.pointerType });
  act(() => { target.dispatchEvent(event); });
  return event;
}

interface View {
  el: (selector: string) => Element;
  menu: () => Element | null;
}

/** Mount the menu over some markup, run the checks, and ALWAYS tear down — a
 *  failed assertion must not leave a live document listener behind for the
 *  next test to trip over. */
async function withMenu(
  html: string,
  checks: (v: View) => void | Promise<void>,
  props: ShellContextMenuProps = {},
) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  const view = render(<ShellContextMenu {...props} />);
  try {
    await checks({
      el: selector => host.querySelector(selector) as Element,
      menu: () => document.querySelector('[data-shell-context-menu]'),
    });
  } finally {
    await act(async () => { view.unmount(); });
    host.remove();
    window.getSelection()?.removeAllRanges();
  }
}

function menuItem(menu: Element | null, label: string) {
  return Array.from(menu?.querySelectorAll('button') ?? [])
    .find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
}

function make(html: string) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild as Element;
}

test('a text input keeps the browser\'s menu — not prevented, no shell menu', () =>
  withMenu('<input type="text" value="hello" />', v => {
    assert.equal(rightClick(v.el('input')).defaultPrevented, false);
    assert.equal(v.menu(), null);
  }));

test('a textarea keeps the browser\'s menu', () =>
  withMenu('<textarea>notes</textarea>', v => {
    assert.equal(rightClick(v.el('textarea')).defaultPrevented, false);
    assert.equal(v.menu(), null);
  }));

test('a click on a child of a contenteditable keeps the browser\'s menu', () =>
  withMenu('<div contenteditable="true"><span id="inner">draft</span></div>', v => {
    assert.equal(rightClick(v.el('#inner')).defaultPrevented, false);
    assert.equal(v.menu(), null);
  }));

test('contenteditable="false" is not an exemption', () =>
  withMenu('<div contenteditable="false"><span id="inner">read only</span></div>', v => {
    assert.equal(rightClick(v.el('#inner')).defaultPrevented, true);
    assert.ok(v.menu());
  }));

test('a checkbox is not a text field — the shell menu opens', () =>
  withMenu('<input type="checkbox" />', v => {
    assert.equal(rightClick(v.el('input')).defaultPrevented, true);
    assert.ok(v.menu());
  }));

test('an image keeps the browser\'s menu — Save image and Copy image are the browser\'s', () =>
  withMenu('<a href="/gallery"><img id="img" src="/wallpaper.jpg" alt="" /></a>', v => {
    assert.equal(rightClick(v.el('#img')).defaultPrevented, false);
    assert.equal(v.menu(), null);
  }));

test('a text field inside a web component keeps the browser\'s menu', () =>
  withMenu('<div id="host"></div>', v => {
    const root = v.el('#host').attachShadow({ mode: 'open' });
    root.innerHTML = '<input type="text" />';
    // The document listener sees `target` retargeted to the host; the element
    // really clicked is only on the composed path.
    const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, button: 2 });
    act(() => { root.querySelector('input')!.dispatchEvent(event); });
    assert.equal(event.defaultPrevented, false);
    assert.equal(v.menu(), null);
  }));

test('plain page content gets the shell menu', () =>
  withMenu('<p id="p">Some prose.</p>', v => {
    assert.equal(rightClick(v.el('#p')).defaultPrevented, true);
    assert.equal(v.menu()?.getAttribute('data-shell-context-menu'), 'default');
  }));

test('an event another handler already prevented is left alone', () =>
  withMenu('<p id="p">Some prose.</p>', v => {
    const target = v.el('#p');
    const own = (e: Event) => e.preventDefault();
    target.addEventListener('contextmenu', own);
    try {
      rightClick(target);
      assert.equal(v.menu(), null, 'the surface with its own menu still wins');
    } finally {
      target.removeEventListener('contextmenu', own);
    }
  }));

test('shift+right-click falls through to the browser, so Inspect stays reachable', () =>
  withMenu('<p id="p">Some prose.</p>', v => {
    assert.equal(rightClick(v.el('#p'), { shift: true }).defaultPrevented, false);
    assert.equal(v.menu(), null);
  }));

test('a touch long-press keeps the browser\'s touch selection; a mouse still gets the shell menu', () =>
  withMenu('<p id="p">Some prose.</p>', v => {
    assert.equal(rightClick(v.el('#p'), { pointerType: 'touch' }).defaultPrevented, false);
    assert.equal(v.menu(), null);
    assert.equal(rightClick(v.el('#p'), { pointerType: 'mouse' }).defaultPrevented, true);
    assert.ok(v.menu());
  }));

test('disabled hands every right-click back to the browser', () =>
  withMenu('<p id="p">Some prose.</p>', v => {
    assert.equal(rightClick(v.el('#p')).defaultPrevented, false);
    assert.equal(v.menu(), null);
  }, { disabled: true }));

test('a link opens the link menu', () =>
  withMenu('<a href="/orders/7" id="a">Order 7</a>', v => {
    rightClick(v.el('#a'));
    const menu = v.menu();
    assert.equal(menu?.getAttribute('data-shell-context-menu'), 'link');
    assert.ok(menuItem(menu, 'Copy link address'));
    assert.equal(menuItem(menu, 'Copy'), undefined, 'nothing is selected, so there is no Copy');
  }));

test('the page actions are on every menu', () =>
  withMenu('<a href="/orders/7" id="a">Order 7</a>', v => {
    rightClick(v.el('#a'));
    for (const label of ['Back', 'Forward', 'Reload', 'Copy page address']) {
      assert.ok(menuItem(v.menu(), label), `missing ${label}`);
    }
  }));

test('an opted-out subtree keeps the browser\'s menu', () =>
  withMenu('<div data-native-context-menu><span id="inner">PDF viewer</span></div>', v => {
    assert.equal(rightClick(v.el('#inner')).defaultPrevented, false);
    assert.equal(v.menu(), null);
  }));

test('Copy is offered for the selection under the pointer, and only there', () =>
  withMenu('<p id="p">Quarterly <b>totals</b></p><a id="a" href="/orders/7">Order 7</a>', v => {
    const range = document.createRange();
    range.selectNodeContents(v.el('#p'));
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    rightClick(v.el('#p b'));
    assert.equal(v.menu()?.getAttribute('data-shell-context-menu'), 'selection');
    assert.ok(menuItem(v.menu(), 'Copy'));

    rightClick(v.el('#a'));
    assert.equal(v.menu()?.getAttribute('data-shell-context-menu'), 'link',
      'a selection somewhere else is not what this right-click was about');
    assert.equal(menuItem(v.menu(), 'Copy'), undefined);
  }));

test('Copy writes the selection\'s HTML beside its text, untrimmed', async () => {
  const written: Array<Record<string, Blob>> = [];
  const g = globalThis as unknown as { ClipboardItem?: unknown };
  const hadClipboardItem = 'ClipboardItem' in g;
  const previousClipboardItem = g.ClipboardItem;
  g.ClipboardItem = class { constructor(public items: Record<string, Blob>) {} };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { write: async (items: Array<{ items: Record<string, Blob> }>) => { written.push(items[0].items); } },
  });
  try {
    await withMenu('<table id="t"><tr><td>A1</td><td>B1</td></tr></table>', async v => {
      const range = document.createRange();
      range.selectNodeContents(v.el('#t'));
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);

      rightClick(v.el('#t td'));
      const copyItem = menuItem(v.menu(), 'Copy');
      assert.ok(copyItem, 'Copy is offered');
      act(() => { copyItem.click(); });
      await flush();

      assert.equal(written.length, 1, 'one clipboard write');
      assert.match(await written[0]['text/html'].text(), /<td>A1<\/td><td>B1<\/td>/,
        'the table travels as a table, so it pastes into a spreadsheet as cells');
      assert.equal(await written[0]['text/plain'].text(), window.getSelection()!.toString());
    });
  } finally {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    if (hadClipboardItem) g.ClipboardItem = previousClipboardItem;
    else delete g.ClipboardItem;
  }
});

test('the menu closes when anything scrolls or the window resizes under it', () =>
  withMenu('<div id="scroller"><p id="p">Some prose.</p></div>', v => {
    rightClick(v.el('#p'));
    assert.ok(v.menu());
    // `scroll` does not bubble — only a captured listener sees one inside a
    // window's own scroll area.
    act(() => { v.el('#scroller').dispatchEvent(new window.Event('scroll')); });
    assert.equal(v.menu(), null, 'a scroll inside any container closes it');

    rightClick(v.el('#p'));
    act(() => { window.dispatchEvent(new window.Event('resize')); });
    assert.equal(v.menu(), null, 'a resize closes it');
  }));

test('a right-click inside the open menu opens nothing more', () =>
  withMenu('<a id="a" href="/orders/7">Order 7</a>', v => {
    rightClick(v.el('#a'));
    const item = menuItem(v.menu(), 'Copy link address')!;
    assert.equal(rightClick(item).defaultPrevented, true, 'no browser menu over ours');
    assert.equal(document.querySelectorAll('[data-shell-context-menu]').length, 1);
    assert.equal(v.menu()?.getAttribute('data-shell-context-menu'), 'link', 'the open menu is left as it was');
  }));

test('any PopupMenu claims right-clicks on itself, so the shell menu never stacks on it', async () => {
  const view = render(
    <>
      <ShellContextMenu />
      <PopupMenu><PopupMenuItem>Rename</PopupMenuItem></PopupMenu>
    </>,
  );
  try {
    const item = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Rename')!;
    assert.equal(rightClick(item).defaultPrevented, true);
    assert.equal(document.querySelector('[data-shell-context-menu]'), null);
  } finally {
    await act(async () => { view.unmount(); });
  }
});

test('the widget settings dialog leaks no browser menu, but a text field in it keeps its own', async () => {
  const view = render(
    <>
      <ShellContextMenu />
      <WidgetSettingsModal
        open
        onClose={() => {}}
        title="Clock settings"
        appearance={DEFAULT_APPEARANCE}
        onAppearanceChange={() => {}}
        onSave={() => {}}
      >
        <input type="text" aria-label="Label" />
      </WidgetSettingsModal>
    </>,
  );
  try {
    await flush();
    const field = document.querySelector('input[aria-label="Label"]');
    assert.ok(field, 'the dialog rendered its children');
    assert.equal(rightClick(field).defaultPrevented, false, 'spellcheck and Paste stay on the text field');
    const slider = document.querySelector('input[type="range"]');
    assert.ok(slider);
    assert.equal(rightClick(slider).defaultPrevented, true, 'the rest of the dialog shows no browser menu');
    assert.equal(document.querySelector('[data-shell-context-menu]'), null,
      'and the widget underneath is not reached either');
  } finally {
    await act(async () => { view.unmount(); });
  }
});

// ── The target description, directly ──

test('keepsNativeMenu covers the editable family and the media family, nothing else', () => {
  assert.equal(keepsNativeMenu(make('<input />')), true, 'a typeless input is a text input');
  assert.equal(keepsNativeMenu(make('<input type="SEARCH" />')), true, 'type is case-insensitive');
  assert.equal(keepsNativeMenu(make('<input type="currency" />')), true,
    'a type the browser does not know renders — and counts — as a text box');
  assert.equal(keepsNativeMenu(make('<input type="range" />')), false);
  assert.equal(keepsNativeMenu(make('<div contenteditable>x</div>')), true, 'a bare attribute is true');
  assert.equal(keepsNativeMenu(make('<img src="/a.png" alt="" />')), true);
  assert.equal(keepsNativeMenu(make('<canvas></canvas>')), true);
  assert.equal(keepsNativeMenu(make('<video></video>')), true);
  assert.equal(keepsNativeMenu(make('<button>Save</button>')), false);
  assert.equal(keepsNativeMenu(null), false);
});

test('a selection inside a link reports both, and leads with the selection', () => {
  const target = describeContextTarget(make('<a href="https://example.com/a">label</a>'), '  picked text  ', 'http://localhost/');
  assert.equal(target.kind, 'selection');
  assert.equal(target.selectionText, 'picked text', 'the text is trimmed');
  assert.equal(target.linkUrl, 'https://example.com/a');
});

test('a relative href is reported absolute', () => {
  const target = describeContextTarget(make('<a href="/orders/7">Order 7</a>'), '', 'http://localhost/shell/');
  assert.equal(target.linkUrl, 'http://localhost/orders/7');
});

test('a relative href resolves against the page\'s <base>, as its own links do', () => {
  const base = document.createElement('base');
  base.href = 'http://example.test/app/';
  document.head.appendChild(base);
  try {
    assert.equal(describeContextTarget(make('<a href="orders/7">x</a>')).linkUrl, 'http://example.test/app/orders/7');
  } finally {
    base.remove();
  }
});

test('a pseudo-link is not offered as a link', () => {
  for (const href of ['#', 'javascript:void(0)']) {
    const target = describeContextTarget(make(`<a href="${href}">x</a>`), '', 'http://localhost/');
    assert.equal(target.linkUrl, undefined, href);
    assert.equal(target.kind, 'default', href);
  }
  assert.equal(
    describeContextTarget(make('<a href="mailto:ops@example.com">x</a>'), '', 'http://localhost/').linkUrl,
    'mailto:ops@example.com',
  );
});
