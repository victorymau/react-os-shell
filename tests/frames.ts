/**
 * Animation frames the spec hands out one at a time.
 *
 * `tests/dom.ts` maps `requestAnimationFrame` onto `setTimeout(cb, 0)` carrying
 * the real clock, which is right for a component that only wants to be called
 * back and useless for one that TWEENS: the deltas are whatever the event loop
 * took, about a millisecond, so a 450 ms glide would need four hundred turns of
 * the loop and no assertion in between could say where it had got to.
 *
 * Here the spec is the clock. `frame(ms)` advances it by exactly `ms` and runs
 * whatever was waiting for a frame, inside `act` so React commits before the
 * next assertion reads the DOM.
 *
 * Always restore in a `finally`: node's test runner gives each spec FILE one
 * process, so a spec that leaves a fake `requestAnimationFrame` behind has
 * changed what every later spec in the file sees.
 */
import { act } from './dom';

export interface FakeFrames {
  /** Advance the clock and run the frame that was waiting for it. */
  frame: (ms?: number) => void;
  /** `count` frames of `ms` each. */
  run: (count: number, ms?: number) => void;
  /** Frames until `done()` holds, failing by name if it never does. */
  until: (done: () => boolean, what: string, opts?: { budget?: number; ms?: number }) => void;
  /** How many callbacks are waiting — 0 means nothing is animating. */
  readonly armed: number;
  restore: () => void;
}

export function fakeFrames(): FakeFrames {
  const real = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  const waiting = new Map<number, FrameRequestCallback>();
  let clock = 0;
  let handle = 0;

  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    handle += 1;
    waiting.set(handle, callback);
    return handle;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => { waiting.delete(id); }) as typeof cancelAnimationFrame;

  const api: FakeFrames = {
    frame(ms = 16) {
      clock += ms;
      const due = [...waiting.values()];
      waiting.clear();
      for (const callback of due) act(() => { callback(clock); });
    },
    run(count, ms = 16) {
      for (let i = 0; i < count; i++) api.frame(ms);
    },
    until(done, what, { budget = 400, ms = 16 } = {}) {
      for (let i = 0; i <= budget; i++) {
        if (done()) return;
        api.frame(ms);
      }
      throw new Error(`${what} never happened in ${budget} frames of ${ms}ms`);
    },
    get armed() { return waiting.size; },
    restore() {
      globalThis.requestAnimationFrame = real.request;
      globalThis.cancelAnimationFrame = real.cancel;
    },
  };
  return api;
}

/**
 * Make the machine ask for stillness for the length of one spec.
 *
 * The components read `window.matchMedia` rather than the bare global (jsdom
 * implements neither; `tests/dom.ts` stubs both to "no preference"), and they read
 * it as they MOUNT — so this has to be in place before the render, and taken away
 * afterwards.
 */
export function withReducedMotion(): () => void {
  const real = window.matchMedia;
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
  return () => { (window as unknown as { matchMedia: unknown }).matchMedia = real; };
}
