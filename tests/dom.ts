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
import { afterEach } from 'node:test';
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
for (const name of ['Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'Node', 'Element', 'HTMLElement', 'DOMRect'] as const) {
  define(name, (win as unknown as Record<string, unknown>)[name]);
}
// Not implemented by jsdom, and called by anything that measures itself.
win.HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};
(win as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {} unobserve() {} disconnect() {}
};
define('ResizeObserver', (win as unknown as Record<string, unknown>).ResizeObserver);

// Canvas 2D types jsdom does not implement. Nothing here draws — pdfjs-dist
// (a static import of the Preview app) reads them while it EVALUATES, so
// without these a spec that so much as imports Preview dies on
// "DOMMatrix is not defined" before its first assertion. Constructors, not
// implementations: a spec that needs real rasterising needs a real browser.
for (const name of ['DOMMatrix', 'Path2D', 'ImageData'] as const) {
  if ((win as unknown as Record<string, unknown>)[name] === undefined) {
    const Stub = class {};
    Object.defineProperty(Stub, 'name', { value: name });
    (win as unknown as Record<string, unknown>)[name] = Stub;
  }
  define(name, (win as unknown as Record<string, unknown>)[name]);
}

// Tells React that `act` is available, so it does not warn about updates
// outside of it.
define('IS_REACT_ACT_ENVIRONMENT', true);

// Loaded now, not at the top: react-dom reads the globals above once, as it
// evaluates, to decide whether it is in a browser.
const { createRoot: reactCreateRoot } = await import('react-dom/client');

/**
 * Every root handed out here, so one left mounted cannot outlive its test.
 *
 * It matters more than tidiness. A React root keeps the event loop alive, so a
 * spec whose assertion throws BEFORE its own `unmount()` does not merely fail —
 * the file stops exiting, node waits out the whole per-file timeout, and then
 * reports "the file timed out" with the actual assertion nowhere in the output.
 * Eighty seconds, and the one fact you needed is gone.
 *
 * Measured on `drawer.test.tsx`: an assertion made to fail with the unmount
 * skipped took 82s and printed no failure; the same assertion with the unmount
 * guaranteed took 1.4ms and named itself.
 */
const liveRoots = new Set<{ unmount: () => void }>();

export const createRoot: typeof reactCreateRoot = (container, options) => {
  const root = reactCreateRoot(container, options);
  liveRoots.add(root);
  const unmount = root.unmount.bind(root);
  root.unmount = () => { liveRoots.delete(root); unmount(); };
  return root;
};

// Registered at module scope, which is per SPEC FILE: the runner bundles this
// module into each one and gives each its own process.
afterEach(() => {
  if (liveRoots.size === 0) return;
  for (const root of [...liveRoots]) {
    // A root whose container is already gone throws on unmount; the point is
    // that nothing survives the test, not that every teardown is graceful.
    try { act(() => { root.unmount(); }); } catch { /* already torn down */ }
  }
  liveRoots.clear();
});

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
 * Drive the tree until `condition()` holds, or fail saying what was there.
 *
 * `flush()` advances by exactly ONE microtask, so `await flush()` twice is a
 * guess about how many hops the thing being waited on takes. The guess held
 * locally and on Node 22 and lost on Node 24: `entityWindowLoading` asserted a
 * react-query error state that had not reached the DOM yet and read the
 * still-loading text instead. Nothing ever promised the number two — and no
 * count of microtasks reaches work deferred by a timer, which the shell's own
 * open path does (`activateAfterMount`).
 *
 * So wait for the STATE, not for a fixed number of turns. Each attempt drains
 * the microtask queue AND one timer turn inside `act`, so effects, react-query
 * notifications and deferred shell work are all committed before the condition
 * is read. Waiting costs nothing when the state is already there: the common
 * case returns on the first attempt.
 *
 * A condition that never holds fails here, naming itself, rather than as a
 * mismatched assertion further down whose message describes a symptom.
 */
export async function waitFor(
  condition: () => boolean,
  message: string | (() => string),
  { timeout = 5000 }: { timeout?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
    if (condition()) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `waitFor timed out after ${timeout}ms: ${typeof message === 'function' ? message() : message}`,
      );
    }
  }
}

/** `waitFor` over the rendered text, reporting what WAS rendered on failure. */
export async function waitForText(pattern: RegExp, opts?: { timeout?: number }): Promise<void> {
  await waitFor(
    () => pattern.test(document.body.textContent ?? ''),
    () => `nothing matching ${pattern} was rendered. Body text: ${JSON.stringify(document.body.textContent ?? '')}`,
    opts,
  );
}

/** `waitFor` over a selector, handing back the element it settled on. */
export async function waitForElement<E extends Element = Element>(
  selector: string,
  opts?: { timeout?: number },
): Promise<E> {
  await waitFor(
    () => document.querySelector(selector) !== null,
    () => `no element matched \`${selector}\`. Body text: ${JSON.stringify(document.body.textContent ?? '')}`,
    opts,
  );
  return document.querySelector<E>(selector)!;
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
