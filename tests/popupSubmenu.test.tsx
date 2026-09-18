import { test } from 'node:test';
import assert from 'node:assert/strict';
// Must come before the component import — see the note in tests/dom.ts.
import { render, act } from './dom';
import { PopupMenu, PopupMenuItem, PopupMenuLabel, PopupMenuDivider, PopupSubmenu } from '../src/shell/PopupMenu';

/**
 * `PopupSubmenu` — a row in a `PopupMenu` that opens a nested menu.
 *
 * The first consumer is the admin portal's Media right-click menu: "Set as
 * cover image", then "Move to" holding the grouped list of targets. Until this
 * existed the only submenu in the shell was the Start menu's, so the placement
 * and open/close rules here are that menu's (`menuPath.ts`), not new ones.
 *
 * jsdom does no layout, so geometry is supplied per selector, the same way
 * `dateRangePickerPlacement.test.tsx` does it: the component's job is to
 * DECIDE where the panel goes, and the decision is asserted on the inline
 * style that reaches the browser.
 */

interface Box { selector: string; left: number; top: number; width: number; height: number }
let BOXES: Box[] = [];
const boxOf = (el: HTMLElement) => BOXES.find(b => el.matches(b.selector));

window.HTMLElement.prototype.getBoundingClientRect = function stubRect(this: HTMLElement) {
  const b = boxOf(this) ?? { left: 0, top: 0, width: 0, height: 0 };
  return {
    x: b.left, y: b.top, left: b.left, top: b.top, width: b.width, height: b.height,
    right: b.left + b.width, bottom: b.top + b.height, toJSON: () => ({}),
  } as DOMRect;
};
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
  configurable: true, get(this: HTMLElement) { return boxOf(this)?.width ?? 0; },
});
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
  configurable: true, get(this: HTMLElement) { return boxOf(this)?.height ?? 0; },
});

function viewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

const ROOT = '[data-popup-menu-tree]:not([data-popup-submenu-panel])';
const ROW = '[data-popup-submenu-row]';
const PANEL = '[data-popup-submenu-panel]';

/** The Media menu this was built for. */
function mount(opts: { onClose?: () => void; onMove?: (to: string) => void; onCover?: () => void } = {}) {
  const view = render(
    <PopupMenu portal onClose={opts.onClose ?? (() => {})} style={{ left: 100, top: 50 }}>
      <PopupMenuItem onClick={opts.onCover}>Set as cover image</PopupMenuItem>
      <PopupSubmenu label="Move to">
        <PopupMenuLabel>Gallery</PopupMenuLabel>
        <PopupMenuItem onClick={() => opts.onMove?.('hero')}>Hero</PopupMenuItem>
        <PopupMenuItem onClick={() => opts.onMove?.('detail')}>Detail</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuLabel>Other</PopupMenuLabel>
        <PopupMenuItem onClick={() => opts.onMove?.('archive')}>Archive</PopupMenuItem>
      </PopupSubmenu>
    </PopupMenu>,
  );
  const row = () => document.querySelector<HTMLButtonElement>(ROW)!;
  const panel = () => document.querySelector<HTMLElement>(PANEL);
  const item = (label: string) =>
    [...(panel()?.querySelectorAll('button') ?? [])].find(b => b.textContent === label) as HTMLButtonElement;
  const key = (el: Element, k: string) => {
    act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
  };
  const click = (el: HTMLElement, detail = 1) => {
    act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail })); });
  };
  return { ...view, row, panel, item, key, click };
}

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

function reset() {
  viewport(1280, 800);
  BOXES = [
    { selector: ROOT, left: 100, top: 50, width: 200, height: 80 },
    { selector: ROW, left: 104, top: 90, width: 192, height: 30 },
    { selector: PANEL, left: 0, top: 0, width: 180, height: 150 },
  ];
}

test('the row says it opens a menu, and says whether it is open', () => {
  reset();
  const m = mount();
  try {
    assert.equal(m.row().getAttribute('role'), 'menuitem');
    assert.equal(m.row().getAttribute('aria-haspopup'), 'menu');
    assert.equal(m.row().getAttribute('aria-expanded'), 'false');
    assert.equal(m.panel(), null);

    m.click(m.row());
    const panel = m.panel()!;
    assert.ok(panel, 'a mouse click opens it');
    assert.equal(panel.getAttribute('role'), 'menu');
    assert.equal(m.row().getAttribute('aria-expanded'), 'true');
    assert.equal(m.row().getAttribute('aria-controls'), panel.id);
    // Labels and dividers, like any PopupMenu.
    assert.match(panel.textContent ?? '', /Gallery.*Hero.*Detail.*Other.*Archive/);
    assert.ok(panel.querySelector('.border-t'), 'the divider rendered');
    assert.notEqual(document.activeElement, m.item('Hero'), 'a mouse open does not move focus');
  } finally { m.unmount(); }
});

test('hovering the row opens it after a short rest, not on the way past', async () => {
  reset();
  const m = mount();
  try {
    act(() => { m.row().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    assert.equal(m.panel(), null, 'not open the instant the pointer arrives');
    await wait(160);
    assert.ok(m.panel(), 'open after the rest');

    // Onto a plain row: closes after the grace period, not at once.
    act(() => {
      m.row().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.querySelector(`${ROOT} button`) }));
    });
    assert.ok(m.panel(), 'still open inside the grace period');
    await wait(260);
    assert.equal(m.panel(), null, 'closed once the pointer stayed away');
  } finally { m.unmount(); }
});

test('ArrowRight opens it with focus inside; the arrows walk it; ArrowLeft goes back', () => {
  reset();
  const m = mount();
  try {
    act(() => { m.row().focus(); });
    m.key(m.row(), 'ArrowRight');
    assert.ok(m.panel());
    assert.equal(document.activeElement, m.item('Hero'), 'focus moved to the first item');

    m.key(document.activeElement!, 'ArrowDown');
    assert.equal(document.activeElement, m.item('Detail'));
    m.key(document.activeElement!, 'ArrowDown');
    assert.equal(document.activeElement, m.item('Archive'), 'labels and dividers are skipped');
    m.key(document.activeElement!, 'ArrowDown');
    assert.equal(document.activeElement, m.item('Hero'), 'wraps');
    m.key(document.activeElement!, 'End');
    assert.equal(document.activeElement, m.item('Archive'));

    m.key(document.activeElement!, 'ArrowLeft');
    assert.equal(m.panel(), null, 'ArrowLeft closed it');
    assert.equal(document.activeElement, m.row(), 'and focus is back on the row');
  } finally { m.unmount(); }
});

test('Enter on the row opens it with focus inside', () => {
  reset();
  const m = mount();
  try {
    // A keyboard-made click carries detail 0.
    m.click(m.row(), 0);
    assert.ok(m.panel());
    assert.equal(document.activeElement, m.item('Hero'));
  } finally { m.unmount(); }
});

test('Escape closes the submenu only, not the menu under it', () => {
  reset();
  let closed = 0;
  const m = mount({ onClose: () => { closed += 1; } });
  try {
    act(() => { m.row().focus(); });
    m.key(m.row(), 'ArrowRight');
    m.key(document.activeElement!, 'Escape');
    assert.equal(m.panel(), null, 'the submenu closed');
    assert.equal(closed, 0, 'the root menu was not asked to close');
    assert.equal(document.activeElement, m.row());

    m.key(m.row(), 'Escape');
    assert.equal(closed, 1, 'a second Escape closes the menu as before');
  } finally { m.unmount(); }
});

test('with two levels open, Escape closes one level at a time, deepest first', () => {
  reset();
  let closed = 0;
  const view = render(
    <PopupMenu portal onClose={() => { closed += 1; }}>
      <PopupSubmenu label="Outer">
        <PopupMenuItem>Sibling</PopupMenuItem>
        <PopupSubmenu label="Inner"><PopupMenuItem>Deep</PopupMenuItem></PopupSubmenu>
      </PopupSubmenu>
    </PopupMenu>,
  );
  const key = (el: Element, k: string) => {
    act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
  };
  const panels = () => document.querySelectorAll(PANEL).length;
  try {
    const outer = document.querySelector<HTMLButtonElement>(ROW)!;
    key(outer, 'ArrowRight');
    const inner = document.querySelector<HTMLElement>(PANEL)!.querySelector<HTMLButtonElement>(ROW)!;
    key(inner, 'ArrowRight');
    assert.equal(panels(), 2, 'both levels open');
    assert.equal(document.activeElement?.textContent, 'Deep');

    key(document.activeElement!, 'Escape');
    assert.equal(panels(), 1, 'only the inner level closed');
    assert.equal(document.activeElement, inner, 'focus is back on the row that opened it');

    key(inner, 'Escape');
    assert.equal(panels(), 0, 'then the outer level');
    assert.equal(document.activeElement, outer);
    assert.equal(closed, 0, 'the root menu is still open');
  } finally { view.unmount(); }
});

test('choosing an item inside closes the whole menu', () => {
  reset();
  let closed = 0;
  const moved: string[] = [];
  const m = mount({ onClose: () => { closed += 1; }, onMove: to => moved.push(to) });
  try {
    m.click(m.row());
    // The outside-click guard runs on pointerdown: the portalled panel is not
    // inside the root in the DOM, and must not count as outside.
    act(() => { m.item('Detail').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    assert.equal(closed, 0, 'pressing inside the submenu is not a click outside');

    m.click(m.item('Detail'));
    assert.deepEqual(moved, ['detail']);
    assert.equal(closed, 1, "the root menu's onClose ran");
    assert.equal(m.panel(), null);
  } finally { m.unmount(); }
});

test('a root item keeps its old contract — the caller decides whether it closes', () => {
  reset();
  let closed = 0;
  let covered = 0;
  const m = mount({ onClose: () => { closed += 1; }, onCover: () => { covered += 1; } });
  try {
    const cover = [...document.querySelectorAll<HTMLButtonElement>(`${ROOT} button`)].find(b => b.textContent === 'Set as cover image')!;
    m.click(cover);
    assert.equal(covered, 1);
    assert.equal(closed, 0);
  } finally { m.unmount(); }
});

test('opens to the right of the menu when it fits', () => {
  reset();
  const m = mount();
  try {
    m.click(m.row());
    assert.equal(m.panel()!.style.left, `${300 + 4}px`);
    assert.equal(m.panel()!.dataset.flipped, 'false');
    assert.equal(m.panel()!.style.top, '90px', 'top-aligned with the row');
  } finally { m.unmount(); }
});

test('flips to the left when there is no room on the right', () => {
  reset();
  BOXES[0] = { selector: ROOT, left: 1000, top: 50, width: 200, height: 80 };
  BOXES[1] = { selector: ROW, left: 1004, top: 90, width: 192, height: 30 };
  const m = mount();
  try {
    m.click(m.row());
    // 1200 + 4 + 180 = 1384 > 1280 - 8, so it goes left: 1000 - 4 - 180.
    assert.equal(m.panel()!.style.left, `${1000 - 4 - 180}px`);
    assert.equal(m.panel()!.dataset.flipped, 'true');
  } finally { m.unmount(); }
});

test('uses the panel\'s real width when deciding to flip', () => {
  reset();
  // 1000 + 4 + 180 fits in 1280; 1000 + 4 + 300 does not.
  BOXES[0] = { selector: ROOT, left: 800, top: 50, width: 200, height: 80 };
  BOXES[1] = { selector: ROW, left: 804, top: 90, width: 192, height: 30 };
  BOXES[2] = { selector: PANEL, left: 0, top: 0, width: 300, height: 150 };
  const m = mount();
  try {
    m.click(m.row());
    assert.equal(m.panel()!.style.left, `${800 - 4 - 300}px`);
  } finally { m.unmount(); }
});

test('moves up when it would run off the bottom', () => {
  reset();
  BOXES[1] = { selector: ROW, left: 104, top: 700, width: 192, height: 30 };
  BOXES[2] = { selector: PANEL, left: 0, top: 0, width: 180, height: 300 };
  const m = mount();
  try {
    m.click(m.row());
    // 700 + 300 > 800 - 8, so the bottom sits on the 8px gutter.
    assert.equal(m.panel()!.style.top, `${800 - 8 - 300}px`);
  } finally { m.unmount(); }
});

test('the submenu is layered above the menu it came from', () => {
  reset();
  const m = mount();
  try {
    m.click(m.row());
    assert.ok(Number(m.panel()!.style.zIndex) > 400, `z-index ${m.panel()!.style.zIndex}`);
    assert.equal(m.panel()!.parentElement, document.body, 'portalled out of any clipping window');
  } finally { m.unmount(); }
});

test('two submenus in one menu: opening one closes the other', () => {
  reset();
  BOXES = [{ selector: ROOT, left: 100, top: 50, width: 200, height: 80 }];
  const view = render(
    <PopupMenu portal onClose={() => {}}>
      <PopupSubmenu label="First"><PopupMenuItem>One</PopupMenuItem></PopupSubmenu>
      <PopupSubmenu label="Second"><PopupMenuItem>Two</PopupMenuItem></PopupSubmenu>
    </PopupMenu>,
  );
  try {
    const rows = [...document.querySelectorAll<HTMLButtonElement>(ROW)];
    act(() => { rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    assert.equal(document.querySelectorAll(PANEL).length, 1);
    act(() => { rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    const panels = document.querySelectorAll(PANEL);
    assert.equal(panels.length, 1);
    assert.equal(panels[0].textContent?.includes('Two'), true);
    assert.equal(rows[0].getAttribute('aria-expanded'), 'false');
  } finally { view.unmount(); }
});

test('a disabled submenu row does not open', () => {
  reset();
  const view = render(
    <PopupMenu portal onClose={() => {}}>
      <PopupSubmenu label="Move to" disabled><PopupMenuItem>Hero</PopupMenuItem></PopupSubmenu>
    </PopupMenu>,
  );
  try {
    const row = document.querySelector<HTMLButtonElement>(ROW)!;
    assert.equal(row.disabled, true);
    act(() => { row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    assert.equal(document.querySelector(PANEL), null);
  } finally { view.unmount(); }
});

test('a disabled row inside a submenu: skipped by the keys, and a click does nothing', () => {
  reset();
  let closed = 0;
  const chosen: string[] = [];
  const view = render(
    <PopupMenu portal onClose={() => { closed += 1; }}>
      <PopupSubmenu label="Move to">
        <PopupMenuLabel>Gallery</PopupMenuLabel>
        <PopupMenuItem disabled onClick={() => chosen.push('current')}>Current slot</PopupMenuItem>
        <PopupMenuItem onClick={() => chosen.push('hero')}>Hero</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuItem disabled onClick={() => chosen.push('full')}>Full slot</PopupMenuItem>
        <PopupMenuItem onClick={() => chosen.push('archive')}>Archive</PopupMenuItem>
      </PopupSubmenu>
    </PopupMenu>,
  );
  try {
    const row = document.querySelector<HTMLButtonElement>(ROW)!;
    const key = (el: Element, k: string) => {
      act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
    };
    const button = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>(`${PANEL} button`)].find(b => b.textContent === label)!;

    act(() => { row.focus(); });
    key(row, 'ArrowRight');
    assert.equal(document.activeElement, button('Hero'), 'focus lands on the first ENABLED item');
    key(document.activeElement!, 'ArrowDown');
    assert.equal(document.activeElement, button('Archive'), 'the disabled row is skipped');
    key(document.activeElement!, 'ArrowDown');
    assert.equal(document.activeElement, button('Hero'), 'wraps past the disabled first row');
    key(document.activeElement!, 'Home');
    assert.equal(document.activeElement, button('Hero'));

    assert.equal(button('Current slot').disabled, true);
    act(() => { button('Current slot').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    assert.deepEqual(chosen, [], 'no onClick');
    assert.equal(closed, 0, 'and the menu stays open');
    assert.ok(document.querySelector(PANEL), 'the submenu too');
  } finally { view.unmount(); }
});

test('a long submenu scrolls inside its max height', () => {
  reset();
  const view = render(
    <PopupMenu portal onClose={() => {}}>
      <PopupSubmenu label="Move to" maxHeight="min(60vh, 420px)">
        {Array.from({ length: 40 }, (_, i) => <PopupMenuItem key={i}>Target {i}</PopupMenuItem>)}
      </PopupSubmenu>
      <PopupSubmenu label="Numeric" maxHeight={300}>
        <PopupMenuItem>One</PopupMenuItem>
      </PopupSubmenu>
      <PopupSubmenu label="Default">
        <PopupMenuItem>One</PopupMenuItem>
      </PopupSubmenu>
    </PopupMenu>,
  );
  try {
    const rows = [...document.querySelectorAll<HTMLButtonElement>(ROW)];
    const openRow = (i: number) => {
      act(() => { rows[i].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
      return document.querySelector<HTMLElement>(PANEL)!;
    };

    let panel = openRow(0);
    assert.ok(panel.classList.contains('overflow-y-auto'), 'the panel scrolls');
    assert.equal(panel.querySelectorAll('button').length, 40);
    // jsdom's CSS parser drops min()/calc(), so read the attribute React wrote.
    assert.match(panel.getAttribute('style') ?? '', /max-height: min\(min\(60vh, 420px\), calc\(100vh - 16px\)\)/);

    panel = openRow(1);
    assert.match(panel.getAttribute('style') ?? '', /max-height: min\(300px, calc\(100vh - 16px\)\)/);

    panel = openRow(2);
    assert.match(panel.getAttribute('style') ?? '', /max-height: calc\(100vh - 16px\)/, 'capped to the viewport by default');
  } finally { view.unmount(); }
});

test('a panel taller than the screen is pinned to the top gutter, not pushed off it', () => {
  reset();
  BOXES[1] = { selector: ROW, left: 104, top: 400, width: 192, height: 30 };
  BOXES[2] = { selector: PANEL, left: 0, top: 0, width: 180, height: 2000 };
  const m = mount();
  try {
    m.click(m.row());
    assert.equal(m.panel()!.style.top, '8px');
  } finally { m.unmount(); }
});

test('a nested submenu under a flipped one keeps going left', () => {
  reset();
  const INNER_ROW = '[data-popup-submenu-panel] [data-popup-submenu-row]';
  BOXES = [
    { selector: ROOT, left: 1000, top: 50, width: 200, height: 80 },
    // The outer panel flips to 1000 - 4 - 180 = 816; its row sits inside it.
    { selector: INNER_ROW, left: 820, top: 90, width: 172, height: 30 },
    { selector: ROW, left: 1004, top: 90, width: 192, height: 30 },
    { selector: PANEL, left: 816, top: 90, width: 180, height: 100 },
  ];
  const view = render(
    <PopupMenu portal onClose={() => {}}>
      <PopupSubmenu label="Outer">
        <PopupSubmenu label="Inner"><PopupMenuItem>Deep</PopupMenuItem></PopupSubmenu>
      </PopupSubmenu>
    </PopupMenu>,
  );
  try {
    const outer = document.querySelector<HTMLButtonElement>(ROW)!;
    act(() => { outer.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    const outerPanel = document.querySelector<HTMLElement>(PANEL)!;
    assert.equal(outerPanel.dataset.flipped, 'true');

    const inner = outerPanel.querySelector<HTMLButtonElement>(ROW)!;
    act(() => { inner.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    const panels = [...document.querySelectorAll<HTMLElement>(PANEL)];
    assert.equal(panels.length, 2, 'both levels open');
    // The inner panel's owner is the outer panel at 816: room on the right
    // exists (996 + 4 + 180 < 1272) but it keeps heading left, as the Start
    // menu does, so the levels don't fold back over each other.
    assert.equal(panels[1].dataset.flipped, 'true');
    assert.equal(panels[1].style.left, `${816 - 4 - 180}px`);
    assert.ok(Number(panels[1].style.zIndex) > Number(panels[0].style.zIndex), 'layered above its parent');
  } finally { view.unmount(); }
});
