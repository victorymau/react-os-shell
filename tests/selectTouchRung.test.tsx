/**
 * Select's touch branch must not hand a finger a desktop-sized target.
 *
 * The component has always chosen its RENDERING off `useIsMobile` — native
 * `<select>` for the OS picker on touch, custom listbox on desktop — but it
 * used to pass the caller's desktop rung through to that native element. A
 * caller asking for `lg`, which is the ordinary thing to ask for, got a 39px
 * control under a finger; `touchPrimitives.test.tsx` holds every Button touch
 * rung at or above the 44px WCAG 2.5.5 floor, and this sat below it.
 *
 * ── Why this renders on the client ──────────────────────────────────────────
 *
 * `renderToStaticMarkup` cannot reach the touch branch at all. `useIsMobile` is
 * a `useSyncExternalStore`, and its `getServerSnapshot` returns `false`
 * unconditionally — so a server render always takes the desktop path no matter
 * what `matchMedia` is stubbed to say. The first draft of this file did exactly
 * that and "passed" the desktop markup off as the mobile one.
 *
 * ── The sr-only select ──────────────────────────────────────────────────────
 *
 * The DESKTOP listbox also contains a `<select aria-hidden="true" class="sr-only">`
 * shadowing it for form posts, so "is there a `<select>`" does not distinguish
 * the branches. Every query here asks for the VISIBLE one.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { render } from './dom';

import Select, { NativeSelect } from '../src/forms/Select';

/**
 * Point `useIsMobile`'s query at a fixed answer. Both the global and `window`
 * are set because `tests/dom.ts` installs it in both places and the hook reads
 * `window.matchMedia`.
 */
function setViewport(matches: boolean) {
  const stub = (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
  const scope = globalThis as unknown as { matchMedia: unknown; window?: { matchMedia: unknown } };
  const previous = scope.matchMedia;
  scope.matchMedia = stub;
  if (scope.window) scope.window.matchMedia = stub;
  return () => {
    scope.matchMedia = previous;
    if (scope.window) scope.window.matchMedia = previous;
  };
}

const OPTIONS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];

/** The control a person actually sees and touches — never the sr-only shadow. */
function visibleControl(matches: boolean, size?: 'sm' | 'md' | 'lg' | 'touch') {
  const restore = setViewport(matches);
  try {
    const { container, unmount } = render(
      <Select value="a" onChange={() => {}} options={OPTIONS} size={size} />,
    );
    const el = container.querySelector('select:not([aria-hidden]), [role="combobox"]');
    const result = { tag: el?.tagName.toLowerCase(), cls: el?.getAttribute('class') ?? '' };
    unmount();
    return result;
  } finally {
    restore();
  }
}

test('Select on touch takes the touch rung whatever desktop rung was asked for', () => {
  // `h-14` is the touch rung — 56px, the value `inputDesktopLadder.test.tsx`
  // pins `INPUT_SIZES.touch` to. Every desktop rung must land on it here.
  for (const size of ['sm', 'md', 'lg', undefined] as const) {
    const { tag, cls } = visibleControl(true, size);
    assert.equal(tag, 'select', `expected the native picker for size=${size}`);
    assert.match(cls, /h-14/, `size=${size} kept a desktop rung on a touch target`);
  }
});

test('Select on touch never renders a control below the 44px floor', () => {
  // The defect this file exists for: `lg` is `py-2 text-base`, which measures
  // 39px, and nothing in the old code stopped it reaching a finger. A rung with
  // a padding-derived height is by definition not one of the touch rungs.
  const { cls } = visibleControl(true, 'lg');
  assert.doesNotMatch(cls, /(?:^|\s)py-\d/, 'a padding-derived height reached the touch branch');
});

test('Select on desktop is unchanged — the listbox, at the rung asked for', () => {
  const { tag, cls } = visibleControl(false, 'lg');
  assert.equal(tag, 'button', 'desktop must keep the custom listbox trigger');
  assert.match(cls, /px-3\.5 py-2 text-base/, 'desktop lost its own lg rung');
  assert.doesNotMatch(cls, /h-14/, 'desktop grew a touch rung');
});

test('NativeSelect stays literal — it is the opt-out, so it obeys the caller', () => {
  // Sizing the raw control yourself on every viewport is the whole point of it
  // being exported; if it silently upgraded too there would be no escape hatch.
  const restore = setViewport(true);
  try {
    const { container, unmount } = render(
      <NativeSelect value="a" onChange={() => {}} options={OPTIONS} size="sm" />,
    );
    const cls = container.querySelector('select')?.getAttribute('class') ?? '';
    assert.doesNotMatch(cls, /h-14/, 'NativeSelect overrode the size it was given');
    unmount();
  } finally {
    restore();
  }
});
