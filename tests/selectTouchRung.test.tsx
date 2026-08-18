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

/**
 * ── touchSize ───────────────────────────────────────────────────────────────
 *
 * The default above is the fix; this is the seam out of it. It exists because
 * Select is the only control in the kit that picks its own touch rung, so a
 * phone form that stacks one against an `Input` or a `SearchableSelect` steps
 * 56px against roughly 30px. `touchSize` lines that row back up without the
 * caller having to drop to `NativeSelect` and lose the desktop listbox (and
 * with it BG#00421's hotkeys).
 */

/** Render either branch and hand back the visible control's element. */
function renderSelect(matches: boolean, props: Record<string, unknown>) {
  const restore = setViewport(matches);
  try {
    const { container, unmount } = render(
      <Select value="a" onChange={() => {}} options={OPTIONS} {...props} />,
    );
    const el = container.querySelector('select:not([aria-hidden]), [role="combobox"]');
    const result = {
      cls: el?.getAttribute('class') ?? '',
      // Every attribute on every element, so a leaked prop cannot hide on the
      // hidden shadow select rather than the visible control.
      attrs: [...container.querySelectorAll('*')].flatMap(n => [...n.attributes].map(a => a.name)),
    };
    unmount();
    return result;
  } finally {
    restore();
  }
}

test('touchSize overrides the touch rung without touching the branch', () => {
  const { cls } = renderSelect(true, { size: 'lg', touchSize: 'md' });
  assert.match(cls, /px-3 py-1\.5 text-sm/, 'touchSize=md did not reach the touch branch');
  assert.doesNotMatch(cls, /h-14/, 'touchSize=md still rendered the 56px rung');
});

test('touchSize defaults to touch, so the fix is what you get for free', () => {
  const { cls } = renderSelect(true, { size: 'lg' });
  assert.match(cls, /h-14/, 'the default stopped being the touch rung');
});

test('touchSize is inert on desktop — it sizes one branch, not both', () => {
  const { cls } = renderSelect(false, { size: 'lg', touchSize: 'sm' });
  assert.match(cls, /px-3\.5 py-2 text-base/, 'touchSize leaked into the desktop rung');
});

test('touchSize never reaches the DOM as an attribute', () => {
  // It is Select's prop, not a native one, and both leaf components spread
  // their `rest` onto a real <select> — NativeSelect onto the visible one, the
  // listbox onto the hidden shadow. A missed destructure renders it as an
  // unknown attribute (and React warns).
  for (const matches of [true, false]) {
    const { attrs } = renderSelect(matches, { size: 'lg', touchSize: 'md' });
    assert.ok(
      !attrs.some(a => a.toLowerCase() === 'touchsize'),
      `touchSize leaked onto the DOM (isMobile=${matches})`,
    );
  }
});

test('NativeSelect drops touchSize too — it is reachable directly', () => {
  // Not redundant with the case above, and the first draft of this file made
  // exactly that mistake: `Select` strips `touchSize` before it spreads, so a
  // test that goes through `Select` cannot see whether the leaf strips it. It
  // passed with NativeSelect's own destructure deleted.
  //
  // NativeSelect is exported and shares `SelectProps`, so a caller can hand it
  // `touchSize` with the type checker's blessing. That is the path that leaks.
  const restore = setViewport(true);
  try {
    const { container, unmount } = render(
      <NativeSelect value="a" onChange={() => {}} options={OPTIONS} size="md" touchSize="lg" />,
    );
    const el = container.querySelector('select');
    assert.ok(el, 'no select rendered');
    const attrs = [...el.attributes].map(a => a.name.toLowerCase());
    assert.ok(!attrs.includes('touchsize'), `touchSize leaked onto the DOM: ${attrs.join(' ')}`);
    // And it is still literal about `size` — dropping the prop must not have
    // been done by letting it win.
    assert.match(el.getAttribute('class') ?? '', /px-3 py-1\.5 text-sm/, 'NativeSelect stopped obeying size');
    unmount();
  } finally {
    restore();
  }
});
