/**
 * The shell's global right-click menu.
 *
 * The rule most likely to regress is the exemption: text inputs, textareas and
 * contenteditable keep the browser's own menu, because its spellcheck
 * suggestions and "Add to dictionary" are not ours to rebuild and a Paste of
 * our own would need a clipboard permission prompt. A refactor that "tidies"
 * the target test would silently swallow spellcheck everywhere, and nothing on
 * screen would say so — hence a spec that dispatches real events and asserts
 * on `defaultPrevented`.
 *
 * The second rule is the one that lets the fourteen existing `onContextMenu`
 * handlers in this package stay untouched: they all call preventDefault(), so
 * the global listener must stand down on an event that is already spoken for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// First, and before anything that touches `src/` — see `dom.ts`.
import { act, render } from './dom';
import ShellContextMenu from '../src/shell/ShellContextMenu';
import { keepsNativeMenu, describeContextTarget } from '../src/shell/contextMenuTarget';

function rightClick(target: Element, opts: { shift?: boolean } = {}) {
  const event = new window.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    shiftKey: opts.shift ?? false,
  });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function mount(html: string) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  const view = render(<ShellContextMenu />);
  return {
    host,
    el: (selector: string) => host.querySelector(selector) as Element,
    menu: () => document.querySelector('[data-shell-context-menu]'),
    cleanup: async () => { await act(async () => { view.unmount(); }); host.remove(); },
  };
}

test('a text input keeps the browser\'s menu — not prevented, no shell menu', async () => {
  const v = mount('<input type="text" value="hello" />');
  const e = rightClick(v.el('input'));
  assert.equal(e.defaultPrevented, false);
  assert.equal(v.menu(), null);
  await v.cleanup();
});

test('a textarea keeps the browser\'s menu', async () => {
  const v = mount('<textarea>notes</textarea>');
  assert.equal(rightClick(v.el('textarea')).defaultPrevented, false);
  assert.equal(v.menu(), null);
  await v.cleanup();
});

test('a click on a child of a contenteditable keeps the browser\'s menu', async () => {
  const v = mount('<div contenteditable="true"><span id="inner">draft</span></div>');
  assert.equal(rightClick(v.el('#inner')).defaultPrevented, false);
  assert.equal(v.menu(), null);
  await v.cleanup();
});

test('contenteditable="false" is not an exemption', async () => {
  const v = mount('<div contenteditable="false"><span id="inner">read only</span></div>');
  assert.equal(rightClick(v.el('#inner')).defaultPrevented, true);
  assert.ok(v.menu());
  await v.cleanup();
});

test('a checkbox is not a text field — the shell menu opens', async () => {
  const v = mount('<input type="checkbox" />');
  assert.equal(rightClick(v.el('input')).defaultPrevented, true);
  assert.ok(v.menu());
  await v.cleanup();
});

test('plain page content gets the shell menu', async () => {
  const v = mount('<p id="p">Some prose.</p>');
  assert.equal(rightClick(v.el('#p')).defaultPrevented, true);
  assert.equal(v.menu()?.getAttribute('data-shell-context-menu'), 'default');
  await v.cleanup();
});

test('an event another handler already prevented is left alone', async () => {
  const v = mount('<p id="p">Some prose.</p>');
  const target = v.el('#p');
  const own = (e: Event) => e.preventDefault();
  target.addEventListener('contextmenu', own);
  rightClick(target);
  assert.equal(v.menu(), null, 'the surface with its own menu still wins');
  target.removeEventListener('contextmenu', own);
  await v.cleanup();
});

test('shift+right-click falls through to the browser, so Inspect stays reachable', async () => {
  const v = mount('<p id="p">Some prose.</p>');
  assert.equal(rightClick(v.el('#p'), { shift: true }).defaultPrevented, false);
  assert.equal(v.menu(), null);
  await v.cleanup();
});

test('a link opens the link menu', async () => {
  const v = mount('<a href="/orders/7" id="a">Order 7</a>');
  rightClick(v.el('#a'));
  const menu = v.menu();
  assert.equal(menu?.getAttribute('data-shell-context-menu'), 'link');
  assert.ok(menu?.textContent?.includes('Copy link address'));
  await v.cleanup();
});

test('an image opens the image menu', async () => {
  const v = mount('<img id="img" src="/wallpaper.jpg" alt="" />');
  rightClick(v.el('#img'));
  const menu = v.menu();
  assert.equal(menu?.getAttribute('data-shell-context-menu'), 'image');
  assert.ok(menu?.textContent?.includes('Open image in new tab'));
  await v.cleanup();
});

test('the page actions are on every menu', async () => {
  const v = mount('<a href="/orders/7" id="a">Order 7</a>');
  rightClick(v.el('#a'));
  const text = v.menu()?.textContent ?? '';
  for (const label of ['Back', 'Forward', 'Reload', 'Copy page address']) {
    assert.ok(text.includes(label), `missing ${label}`);
  }
  await v.cleanup();
});

test('an opted-out subtree keeps the browser\'s menu', async () => {
  const v = mount('<div data-native-context-menu><span id="inner">PDF viewer</span></div>');
  assert.equal(rightClick(v.el('#inner')).defaultPrevented, false);
  assert.equal(v.menu(), null);
  await v.cleanup();
});

// ── The target description, directly ──

test('keepsNativeMenu covers the editable family and nothing else', () => {
  const make = (html: string) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild as Element;
  };
  assert.equal(keepsNativeMenu(make('<input />')), true, 'a typeless input is a text input');
  assert.equal(keepsNativeMenu(make('<input type="SEARCH" />')), true, 'type is case-insensitive');
  assert.equal(keepsNativeMenu(make('<input type="range" />')), false);
  assert.equal(keepsNativeMenu(make('<div contenteditable>x</div>')), true, 'a bare attribute is true');
  assert.equal(keepsNativeMenu(make('<button>Save</button>')), false);
  assert.equal(keepsNativeMenu(null), false);
});

test('a selection inside a link reports both, and leads with the selection', () => {
  const d = document.createElement('div');
  d.innerHTML = '<a href="https://example.com/a">label</a>';
  const target = describeContextTarget(d.firstElementChild, '  picked text  ', 'http://localhost/');
  assert.equal(target.kind, 'selection');
  assert.equal(target.selectionText, 'picked text', 'the text is trimmed');
  assert.equal(target.linkUrl, 'https://example.com/a');
});

test('a relative href is reported absolute', () => {
  const d = document.createElement('div');
  d.innerHTML = '<a href="/orders/7">Order 7</a>';
  const target = describeContextTarget(d.firstElementChild, '', 'http://localhost/shell/');
  assert.equal(target.linkUrl, 'http://localhost/orders/7');
});
