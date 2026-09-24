/**
 * `installStaleChunkReload` — the tab that outlived a deploy reloads, once.
 *
 * The claims pinned here are the ones that make it safe to ship on every
 * portal's startup path: the first missing chunk reloads and swallows Vite's
 * throw; a second one inside the cooldown does NOT reload (it lets the crash
 * through, so a broken deploy or an offline network is a visible failure and
 * not a loop); the cooldown lives in storage so it survives the reload it
 * guards; and a browser that refuses storage still gets the reload.
 */
import './dom';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  installStaleChunkReload,
  isStaleChunkError,
  STALE_CHUNK_RELOAD_KEY,
  VITE_PRELOAD_ERROR_EVENT,
} from '../src/shell/staleChunk';

const CHROME_MESSAGE =
  'Failed to fetch dynamically imported module: https://customer.example/assets/ProposalList-BJSol4DP.js';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

class BrokenStorage {
  getItem(): string | null { throw new Error('SecurityError: storage disabled'); }
  setItem(): void { throw new Error('SecurityError: storage disabled'); }
}

/** Dispatch the event Vite's preload helper dispatches, and hand it back. */
function fire(payload: unknown = new TypeError(CHROME_MESSAGE)) {
  const event = new window.Event(VITE_PRELOAD_ERROR_EVENT, { cancelable: true }) as Event & { payload?: unknown };
  event.payload = payload;
  window.dispatchEvent(event);
  return event;
}

/** The installer reports on the console by design; keep that out of the test output. */
function quiet<T>(fn: () => T): T {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try { return fn(); } finally { console.warn = warn; console.error = error; }
}

test('the first missing chunk reloads and swallows the throw', () => {
  let reloads = 0;
  const storage = new MemoryStorage();
  const uninstall = installStaleChunkReload({ reload: () => { reloads += 1; }, storage, now: () => 1_000 });
  try {
    const event = quiet(() => fire());
    assert.equal(reloads, 1);
    assert.equal(event.defaultPrevented, true, 'Vite must not throw — the page is going away');
    assert.equal(storage.getItem(STALE_CHUNK_RELOAD_KEY), '1000', 'the reload is remembered for the cooldown');
  } finally {
    uninstall();
  }
});

test('a second missing chunk inside the cooldown lets the failure through', () => {
  let reloads = 0;
  let clock = 1_000;
  const storage = new MemoryStorage();
  const uninstall = installStaleChunkReload({
    reload: () => { reloads += 1; }, storage, now: () => clock, cooldownMs: 30_000,
  });
  try {
    quiet(() => fire());
    assert.equal(reloads, 1);

    // The reload happened; the shell restored its windows; the chunk is STILL
    // gone. Not a deploy the page missed — a server that cannot serve it.
    clock = 5_000;
    const again = quiet(() => fire());
    assert.equal(reloads, 1, 'no second reload inside the cooldown');
    assert.equal(again.defaultPrevented, false, 'Vite throws, the boundary shows the crash');

    // A new deploy hours later is a new failure and earns a new reload.
    clock = 1_000 + 30_000;
    quiet(() => fire());
    assert.equal(reloads, 2);
    assert.equal(storage.getItem(STALE_CHUNK_RELOAD_KEY), String(clock));
  } finally {
    uninstall();
  }
});

test('the cooldown is read from storage, so it survives the reload it guards', () => {
  // A fresh install — as after the reload — sees the previous install's stamp.
  let reloads = 0;
  const storage = new MemoryStorage();
  storage.setItem(STALE_CHUNK_RELOAD_KEY, '1000');
  const uninstall = installStaleChunkReload({ reload: () => { reloads += 1; }, storage, now: () => 2_000 });
  try {
    const event = quiet(() => fire());
    assert.equal(reloads, 0);
    assert.equal(event.defaultPrevented, false);
  } finally {
    uninstall();
  }
});

test('a storage that throws still gets the reload — every time, since nothing can remember one', () => {
  let reloads = 0;
  const uninstall = installStaleChunkReload({
    reload: () => { reloads += 1; }, storage: new BrokenStorage(), now: () => 1_000,
  });
  try {
    quiet(() => fire());
    quiet(() => fire());
    assert.equal(reloads, 2);
  } finally {
    uninstall();
  }
});

test('storage: null disables the cooldown outright', () => {
  let reloads = 0;
  const uninstall = installStaleChunkReload({ reload: () => { reloads += 1; }, storage: null });
  try {
    quiet(() => fire());
    quiet(() => fire());
    assert.equal(reloads, 2);
  } finally {
    uninstall();
  }
});

test('a garbage stamp in storage counts as no stamp', () => {
  let reloads = 0;
  const storage = new MemoryStorage();
  storage.setItem(STALE_CHUNK_RELOAD_KEY, 'yesterday');
  const uninstall = installStaleChunkReload({ reload: () => { reloads += 1; }, storage, now: () => 1_000 });
  try {
    quiet(() => fire());
    assert.equal(reloads, 1);
  } finally {
    uninstall();
  }
});

test('a rejected bare-specifier import is not a missing chunk and never reloads', () => {
  // Vite's preload wrapper dispatches the event for ANY rejected dynamic
  // import. The DXF preview's `import('three')` probe rejected this way on
  // every open and the portal reloaded (regis/Wheelwright, 2026-09-24). The
  // messages are the ones Chromium and WebKit gave in that reproduction, plus
  // Firefox's wording for the same failure.
  let reloads = 0;
  const storage = new MemoryStorage();
  const uninstall = installStaleChunkReload({ reload: () => { reloads += 1; }, storage, now: () => 1_000 });
  try {
    for (const message of [
      "Failed to resolve module specifier 'three'",
      "Module name, 'three' does not resolve to a valid URL.",
      'The specifier “three” was a bare specifier, but was not remapped to anything.',
    ]) {
      const event = quiet(() => fire(new TypeError(message)));
      assert.equal(event.defaultPrevented, false, `${message}: Vite must rethrow so the caller's catch runs`);
    }
    assert.equal(reloads, 0);
    assert.equal(storage.getItem(STALE_CHUNK_RELOAD_KEY), null, 'no cooldown is spent on a non-chunk failure');

    quiet(() => fire());
    assert.equal(reloads, 1, 'a genuinely missing chunk still reloads afterwards');
  } finally {
    uninstall();
  }
});

test('uninstalling stops listening', () => {
  let reloads = 0;
  const uninstall = installStaleChunkReload({ reload: () => { reloads += 1; }, storage: null });
  uninstall();
  const event = quiet(() => fire());
  assert.equal(reloads, 0);
  assert.equal(event.defaultPrevented, false);
});

test('isStaleChunkError recognises the three engines and Vite, and nothing else', () => {
  // Chrome, Firefox, Safari — the message each gives a dynamic import whose
  // module the server did not return — and Vite's own line for a CSS chunk.
  for (const message of [
    CHROME_MESSAGE,
    'error loading dynamically imported module: https://x/assets/a-1.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/index-D5OZtliT.css',
  ]) {
    assert.equal(isStaleChunkError(new TypeError(message)), true, message);
    assert.equal(isStaleChunkError(message), true, `${message} (as a string)`);
  }
  assert.equal(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
  assert.equal(isStaleChunkError(new Error('Network Error')), false);
  assert.equal(isStaleChunkError(undefined), false);
  assert.equal(isStaleChunkError({ message: CHROME_MESSAGE }), false, 'a plain object is not an Error');
});
