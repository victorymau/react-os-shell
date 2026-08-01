/**
 * A real DOM for the specs that need one.
 *
 * Most specs here render with `react-dom/server` and assert on the markup,
 * which is enough for a component whose bug is in what it draws. It is not
 * enough for a component whose bug is in what it *does*: `renderToStaticMarkup`
 * never runs an effect, so a hook that binds a listener, subscribes to a store,
 * or writes state after mount is invisible to it. That is exactly how the
 * window-scoping bug in `UndoProvider` shipped — 332 lines of React with no
 * spec that could have executed them.
 *
 * So: jsdom, one devDependency, pure JS, no native build, installs in a couple
 * of seconds on both CI Node versions. The runner's "no test FRAMEWORK" rule
 * still holds — this is a DOM, not a framework. `node:test` still runs the
 * specs and `assert` still makes the claims.
 *
 * Held at 26 deliberately. Later majors raise their Node floor past this
 * package's own `engines` (`>=20`), and the handful of DOM this file asks for
 * has not changed in years — no reason to make `npm test` the thing that
 * decides which Node a contributor may use.
 *
 * ## Import this first
 *
 * The globals have to exist before `react-dom` is evaluated, because react-dom
 * decides once, at module scope, whether it is in a browser. Two rules follow:
 *
 *   1. In a spec, `import './dom'` (or anything from it) must come before the
 *      import of the component under test. esbuild preserves that order for
 *      bundled modules, and `src/shell/Modal.tsx` touches `window` and
 *      `localStorage` while it evaluates.
 *   2. `createRoot`/`act` are re-exported from *here*, loaded through a dynamic
 *      import after the globals land. A plain `import 'react-dom/client'` in a
 *      spec would be hoisted above this file by the bundler and come up in
 *      server mode.
 *
 * Node's test runner gives each spec file its own process, so these globals
 * never leak between specs.
 */
import { JSDOM } from 'jsdom';

const jsdom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const { window: win } = jsdom;

// `navigator` is a getter-only global from Node 21 on, so it needs defining
// rather than assigning; the rest are plain properties.
function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

define('window', win);
define('document', win.document);
define('navigator', win.navigator);
define('location', win.location);
define('localStorage', win.localStorage);
define('sessionStorage', win.sessionStorage);
define('getComputedStyle', win.getComputedStyle.bind(win));
define('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
define('cancelAnimationFrame', (id: number) => clearTimeout(id));
// jsdom has no media queries. Set it on the window too, not just the global:
// most callers here reach for it as `window.matchMedia` (`useIsMobile`,
// `useColumnConfig`, `useSort`, `useTheme`), and a bare global leaves those
// throwing on mount.
const matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
});
define('matchMedia', matchMedia);
(win as unknown as { matchMedia: unknown }).matchMedia = matchMedia;
// Constructors the shell reaches for by bare name.
for (const name of ['Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'Node', 'Element', 'HTMLElement', 'DOMRect'] as const) {
  define(name, (win as unknown as Record<string, unknown>)[name]);
}
// Not implemented by jsdom, and called by anything that measures itself.
win.HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};
(win as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {} unobserve() {} disconnect() {}
};
define('ResizeObserver', (win as unknown as Record<string, unknown>).ResizeObserver);

// Tells React that `act` is available, so it does not warn about updates
// outside of it.
define('IS_REACT_ACT_ENVIRONMENT', true);

// Loaded now, not at the top: react-dom reads the globals above once, as it
// evaluates, to decide whether it is in a browser.
export const { createRoot } = await import('react-dom/client');

// `React.act` from 18.3 on; the react-dom/test-utils copy is where it lived
// before that, and warns about itself on newer versions. The package supports
// react >=18, so take whichever this install has.
const React = await import('react');
export const act: (cb: () => void | Promise<void>) => Promise<void> & void =
  (React as unknown as { act?: typeof act }).act
  ?? ((await import('react-dom/test-utils')) as unknown as { act: typeof act }).act;

/**
 * Mount `ui` into a detached container and return handles for driving it.
 *
 * `unmount` matters more than usual in these specs: `UndoProvider` and `Modal`
 * both register into module-level state, so a spec that leaves a tree mounted
 * changes what the next one sees.
 */
export function render(ui: React.ReactElement) {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  return {
    container,
    rerender: (next: React.ReactElement) => act(() => { root.render(next); }),
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}

/** Let queued microtasks and effects settle — `record()` defers by a microtask. */
export async function flush() {
  await act(async () => { await Promise.resolve(); });
}

/**
 * Press a key on `window`, the way a user would.
 *
 * `target` defaults to `document.body`; pass an element to reproduce the
 * in-field case, where `matchUndoHotkey` deliberately declines to act.
 */
export function pressKey(
  key: string,
  opts: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean; target?: Element } = {},
) {
  const target = opts.target ?? win.document.body;
  const event = new win.KeyboardEvent('keydown', {
    key,
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
    altKey: opts.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
  act(() => { target.dispatchEvent(event); });
  return event;
}
