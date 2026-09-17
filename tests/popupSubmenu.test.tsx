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
