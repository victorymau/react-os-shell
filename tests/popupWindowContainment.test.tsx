/**
 * A menu belongs to the window its trigger sits in (UI-11).
 *
 * The Observability console's Tenant filter is the case that named the rule:
 * the window was ~1150px wide with its right edge well inside a 1900px screen,
 * so every measurement the placement made against the VIEWPORT said there was
 * plenty of room — and the option list opened 200px past the window's edge,
 * onto the desktop wallpaper. Nothing was clipped and nothing was hidden; the
 * menu simply stopped belonging to anything.
 *
 * Portalling to <body> is what lets a menu escape an `overflow-hidden` window
 * body, and that escape is about CLIPPING, not about ownership. This spec pins
 * the difference.
 *
 * jsdom lays nothing out, so the geometry is stubbed per selector and what is
 * asserted is the DECISION that reaches the DOM: the inline placement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, act } from './dom';
import TagInput from '../src/forms/TagInput';
import { popupBounds } from '../src/forms/dropdownPosition';
import { Z_LAYERS } from '../src/shell/zLayers';

interface Rect { selector: string; left: number; width: number; top?: number; height?: number }

let RECTS: Rect[] = [];

window.HTMLElement.prototype.getBoundingClientRect = function stubRect(this: HTMLElement) {
  const hit = RECTS.find((r) => this.matches(r.selector));
  const left = hit ? hit.left : 0;
  const width = hit ? hit.width : 0;
  const top = hit?.top ?? 0;
  const height = hit?.height ?? 0;
  return {
    x: left, y: top, left, right: left + width, width,
    top, bottom: top + height, height, toJSON: () => ({}),
  } as DOMRect;
};

/** `VIEWPORT_MARGIN` in `dropdownPosition.ts`. */
const EDGE = 8;

const OPTIONS = ['Public schema', 'inovit_au', 'inovit_uk', 'inovit_us', 'regis']
  .map((value) => ({ value, label: value }));

/** Open a TagInput inside a shell window and read the menu's placement back. */
function openMenu(opts: {
  windowLeft: number; windowWidth: number; triggerLeft: number; triggerWidth: number;
}) {
  RECTS = [
    { selector: '[data-modal-panel]', left: opts.windowLeft, width: opts.windowWidth, top: 0, height: 600 },
    { selector: '.relative', left: opts.triggerLeft, width: opts.triggerWidth, top: 40, height: 36 },
  ];
  const { container, unmount } = render(
    <div data-modal-panel style={{ overflow: 'hidden' }}>
      <TagInput value={[]} options={OPTIONS} onChange={() => {}} placeholder="All tenants" />
    </div>,
  );
  const field = container.querySelector('input[role="combobox"]') as HTMLInputElement;
  act(() => { field.focus(); });
  // The popup layer is an inline z-index (`Z_LAYERS.popup`), not a class.
  const menu = document.querySelector(`[style*="z-index: ${Z_LAYERS.popup}"]`) as HTMLElement;
  assert.ok(menu, 'menu opens');
  return {
    left: menu.style.left, right: menu.style.right, maxWidth: menu.style.maxWidth, unmount,
  };
}

test('a menu whose window ends before the viewport does stays in the window', () => {
  // The Observability case. Measured against the viewport there is 500px of
  // room to the right of the trigger; measured against the window there is 172.
  const windowRight = 700;
  const triggerRight = 680;
  const { left, right, unmount } = openMenu({
    windowLeft: 100, windowWidth: windowRight - 100, triggerLeft: 520, triggerWidth: 160,
  });
  assert.equal(left, '', 'not left-aligned, which is what ran it off the window');
  assert.equal(
    right, `${window.innerWidth - triggerRight}px`,
    'hung off the trigger\'s right edge instead, so the menu ends inside the window',
  );
  unmount();
});

test('a menu with room inside its window opens from the trigger', () => {
  const { left, right, unmount } = openMenu({
    windowLeft: 100, windowWidth: 880, triggerLeft: 140, triggerWidth: 200,
  });
  assert.equal(left, '140px');
  assert.equal(right, '');
  unmount();
});

test('a window narrower than the menu caps the menu rather than overhanging', () => {
  const { maxWidth, unmount } = openMenu({
    windowLeft: 100, windowWidth: 320, triggerLeft: 120, triggerWidth: 180,
  });
  const cap = Number.parseInt(maxWidth, 10);
  assert.ok(cap <= 320 - 2 * EDGE, `menu capped to the window (${maxWidth})`);
  unmount();
});

test('popupBounds falls back to the viewport outside a window', () => {
  RECTS = [];
  const { container, unmount } = render(<div><span className="probe" /></div>);
  const probe = container.querySelector('.probe') as HTMLElement;
  assert.deepEqual(popupBounds(probe), {
    left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight,
  });
  unmount();
});

test('popupBounds intersects the window with the viewport', () => {
  // A window dragged half off the left edge of the screen: the popup may use
  // the visible half, not the part that is off screen.
  RECTS = [{ selector: '[data-modal-panel]', left: -200, width: 600, top: -50, height: 400 }];
  const { container, unmount } = render(
    <div data-modal-panel><span className="probe" /></div>,
  );
  const probe = container.querySelector('.probe') as HTMLElement;
  assert.deepEqual(popupBounds(probe), { left: 0, right: 400, top: 0, bottom: 350 });
  unmount();
});

test('a window the browser has not laid out yet is not treated as zero-sized', () => {
  // Every rect is zero before first layout, and in jsdom forever. Reading that
  // as a 0x0 window would pin every menu to a single point.
  RECTS = [{ selector: '[data-modal-panel]', left: 0, width: 0 }];
  const { container, unmount } = render(
    <div data-modal-panel><span className="probe" /></div>,
  );
  const probe = container.querySelector('.probe') as HTMLElement;
  assert.equal(popupBounds(probe).right, window.innerWidth);
  unmount();
});
