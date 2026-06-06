/**
 * Dev-environment detection + browser chrome.
 *
 * A deployed bundle is byte-identical across hosts (CI builds once and promotes
 * the same image between environments), so build-time signals like
 * `import.meta.env.MODE` can't tell a developer's machine from a deployed site —
 * only the runtime hostname can. `isDevEnv()` is therefore gated on
 * `localhost`/`127.0.0.1`, and everything dev-only (the <DevIndicator/> tray
 * badge, the `[DEV]` tab-title prefix) keys off it so it never leaks onto a
 * deployed host.
 */

/** Tooltip/banner copy for the dev indicator. */
export const DEV_BANNER_TEXT =
  'LOCAL DEV ENVIRONMENT — running against your local backend; not connected to the live system';

/**
 * True only when served from a developer's own machine.
 *
 * Gated on `localhost`/`127.0.0.1` only (not `*.local` mDNS names), so a
 * teammate reaching a dev server over the LAN doesn't get the dev chrome.
 */
export function isDevEnv(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * Apply local-dev browser chrome: prefix the tab title with `[DEV]` and,
 * optionally, swap the favicon. No-op outside localhost. Idempotent — safe to
 * call at startup and again whenever a route overwrites `document.title`.
 *
 * Call before React mounts (e.g. in `main.tsx`) so the title is correct on the
 * first paint. Pass `faviconHref` only if the host actually ships that asset.
 */
export function applyDevTitle(opts?: { faviconHref?: string }): void {
  if (!isDevEnv()) return;

  if (!document.title.startsWith('[DEV]')) {
    document.title = `[DEV] ${document.title}`;
  }

  if (opts?.faviconHref) {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = opts.faviconHref;
  }
}
