/**
 * Browser start-URL staging — the tiny consumer-facing surface of the Browser
 * app. Lives apart from Browser.tsx so importing `setBrowserStartUrl` (from
 * `react-os-shell/apps`) never drags the Browser implementation into a host's
 * startup bundle. The Browser window component stays behind its React.lazy
 * dynamic import and drains the stage on mount via the @internal peek/claim
 * helpers below.
 */

/** @internal Staged URL awaiting the next Browser window mount. */
export interface PendingStartUrl {
  token: number;
  url: string;
}

let pendingStartUrl: PendingStartUrl | null = null;
let nextStartToken = 0;

/** Stage a URL for the next Browser window mount — pair with
 *  `openPage('/browser')`. Used by "open this link in the Browser" flows
 *  (e.g. links inside an email body). */
export function setBrowserStartUrl(url: string): void {
  pendingStartUrl = { token: ++nextStartToken, url };
}

/** @internal Render-phase peek — see Browser.tsx for the drain protocol. */
export function peekBrowserStartUrl(): PendingStartUrl | null {
  return pendingStartUrl;
}

/** @internal Commit-phase claim. The identity check keeps a URL staged
 *  *after* the claimant's render-phase peek available for the window it
 *  belongs to. */
export function claimBrowserStartUrl(stage: PendingStartUrl): void {
  if (pendingStartUrl === stage) pendingStartUrl = null;
}
