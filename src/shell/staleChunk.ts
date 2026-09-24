/**
 * Stale-chunk recovery — reload once when a lazy chunk the running page asks
 * for is no longer on the server.
 *
 * A Vite build names every lazy chunk by its content hash, and a deploy
 * replaces the whole `assets/` directory. A tab opened before the deploy still
 * runs the old entry, and the first lazy window it opens asks for a chunk the
 * server no longer has. The SPA fallback answers with `index.html`, the browser
 * refuses that as a module, and the import rejects with "Failed to fetch
 * dynamically imported module". Nothing inside the page can satisfy that
 * import — only a fresh document, which names the new chunks, can — so an
 * error boundary's "try again" remounts into the same failure, and the only
 * recovery that works is a reload.
 *
 * Vite dispatches `vite:preloadError` on `window` for exactly this failure
 * (cancelable; `preventDefault()` swallows the throw). `installStaleChunkReload`
 * listens for it and reloads the page — once per cooldown, remembered in
 * `sessionStorage`, so a chunk that is STILL missing after the reload (a
 * broken deploy, an offline network) surfaces as the crash it is rather than
 * as a reload loop that eats the user's open windows.
 *
 * Kit-safe: imports nothing. Call it once, before the app mounts.
 */

/** sessionStorage key holding the epoch-ms of the last reload this made. */
export const STALE_CHUNK_RELOAD_KEY = 'react-os-shell:stale-chunk-reload-at';

/**
 * How soon after a reload a second missing chunk is allowed to crash instead
 * of reloading again. A reload plus the shell restoring its windows takes a
 * few seconds; anything under this is the same failure, not a new deploy.
 */
export const STALE_CHUNK_RELOAD_COOLDOWN_MS = 30_000;

/** The event name Vite's preload helper dispatches. */
export const VITE_PRELOAD_ERROR_EVENT = 'vite:preloadError';

export interface StaleChunkReloadOptions {
  /** Defaults to {@link STALE_CHUNK_RELOAD_COOLDOWN_MS}. */
  cooldownMs?: number;
  /** Replaced in tests; the default is `window.location.reload()`. */
  reload?: () => void;
  /**
   * Where the last-reload timestamp is kept. Defaults to `sessionStorage`
   * (guarded — a browser that throws on access, such as a private window
   * with storage disabled, degrades to "always reload"). `null` disables the
   * cooldown outright.
   */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Clock, for tests. */
  now?: () => number;
}

/**
 * The messages the three engines produce for a dynamic `import()` whose
 * module the server did not return, plus Vite's own line for a CSS chunk it
 * could not preload. Used by the shell's crash fallback to offer "Reload
 * page" instead of a remount that cannot succeed.
 */
const STALE_CHUNK_MESSAGE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

/** True when `error` is a lazy chunk the server no longer serves. */
export function isStaleChunkError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return STALE_CHUNK_MESSAGE.test(message);
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    const s = window.sessionStorage;
    // Touch it: some browsers expose the object and throw on first use.
    s.getItem(STALE_CHUNK_RELOAD_KEY);
    return s;
  } catch {
    return null;
  }
}

function readLastReload(storage: Pick<Storage, 'getItem' | 'setItem'> | null): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STALE_CHUNK_RELOAD_KEY);
    const at = raw === null ? NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeLastReload(storage: Pick<Storage, 'getItem' | 'setItem'> | null, at: number): void {
  if (!storage) return;
  try {
    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(at));
  } catch {
    /* storage full or disabled — the reload still happens, just without the cooldown */
  }
}

/**
 * Reload the page the first time a lazy chunk fails to load, and let the
 * failure through on a repeat within the cooldown.
 *
 * Returns the uninstaller. Server-side (no `window`) it installs nothing.
 */
export function installStaleChunkReload(options: StaleChunkReloadOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {};

  const cooldownMs = options.cooldownMs ?? STALE_CHUNK_RELOAD_COOLDOWN_MS;
  const reload = options.reload ?? (() => window.location.reload());
  const now = options.now ?? Date.now;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  const onPreloadError = (event: Event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    // Vite dispatches this for ANY rejected dynamic import it wraps, not only
    // a missing chunk — an optional peer probed by its bare package name
    // rejects the same way, and its caller already catches that.
    // Reloading on that threw the whole portal away on every DXF preview.
    if (!isStaleChunkError(payload)) return;
    const at = now();
    const last = readLastReload(storage);
    if (last !== null && at - last < cooldownMs) {
      // Reloaded moments ago and the chunk is still gone: this is not a
      // deploy the page missed, it is a server that cannot serve the build.
      // Let Vite throw, so the boundary shows what is wrong.
      console.error(
        '[react-os-shell] a lazy chunk is still missing after a reload; letting the failure through:',
        payload,
      );
      return;
    }
    writeLastReload(storage, at);
    event.preventDefault();
    console.warn(
      '[react-os-shell] a lazy chunk is no longer on the server (new deploy?); reloading onto the current build:',
      payload,
    );
    reload();
  };

  window.addEventListener(VITE_PRELOAD_ERROR_EVENT, onPreloadError);
  return () => window.removeEventListener(VITE_PRELOAD_ERROR_EVENT, onPreloadError);
}
