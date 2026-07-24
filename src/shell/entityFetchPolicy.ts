/**
 * Retry / poll policy for a restored entity window's detail fetch.
 *
 * A window restored from the saved session (`RestoredRegistryModal` in
 * `WindowManager`) re-reads its entity on mount, on window focus, and on a 60s
 * fallback interval. That is right for a record that still exists — but it was
 * applied just as eagerly to one that does not. TanStack's default `retry: 3`
 * (1s/2s/4s backoff) on top of the 60s interval kept a permanently-404ing
 * window asking forever, ~4 requests a minute, for as long as the tab stayed
 * open. The window itself looks fine the whole time: it renders from the
 * `entitySnapshot` saved alongside it, so nothing surfaces to the user and
 * nothing ever stops.
 *
 * Production hit exactly that. One saved receipt window whose `entityId` was a
 * document number rather than a uuid produced 2,848 404s on
 * `GET /api/receipts/RP/` from a single browser in 48 hours — continuous,
 * overnight, resuming on every page load because the window list is restored
 * from localStorage.
 *
 * The rule: a 4xx is the server saying *this request is wrong*. Repeating it
 * verbatim cannot change the answer, so stop — do not retry it, and do not
 * keep polling it. Anything else (a 5xx, a timeout, an offline blip) is the
 * server or the network having a bad moment, and is still worth another go.
 */

/** 4xx codes that are nonetheless worth retrying: the server is asking us to
 *  wait, not telling us the request is malformed. */
const RETRYABLE_CLIENT_STATUSES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
]);

/** Attempts after the first, for errors that are actually worth repeating.
 *  Matches TanStack's own default so transient failures behave as before. */
export const ENTITY_FETCH_MAX_RETRIES = 3;

/** The fallback poll cadence for a live entity window. WebSocket pushes are
 *  the primary update path; this only covers the socket being unavailable. */
export const ENTITY_REFETCH_INTERVAL_MS = 60_000;

/**
 * Whether `error` is a client error that repeating cannot fix (4xx, except the
 * explicitly retryable ones).
 *
 * An error with no numeric `response.status` — a network failure, a DNS blip,
 * an aborted request, anything thrown before a reply arrived — is deliberately
 * NOT permanent: those are exactly the cases retrying exists for.
 */
export function isPermanentClientError(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null | undefined)?.response?.status;
  if (typeof status !== 'number') return false;
  return status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status);
}

/** `retry` for the entity detail query — never repeats a permanent 4xx. */
export function shouldRetryEntityFetch(failureCount: number, error: unknown): boolean {
  return !isPermanentClientError(error) && failureCount < ENTITY_FETCH_MAX_RETRIES;
}

/** `refetchInterval` for the entity detail query — stops polling a window
 *  whose entity the server has told us is not there. */
export function entityRefetchInterval(error: unknown): number | false {
  return isPermanentClientError(error) ? false : ENTITY_REFETCH_INTERVAL_MS;
}

/**
 * Build the detail URL for an entity window.
 *
 * The id is encoded because it is not always the uuid the registry assumes: it
 * comes from saved session state and can be anything a past build (or a future
 * one) put there. An id carrying a `#` — a document number like `RP#60001`,
 * say — otherwise truncates the URL at the fragment before it is ever sent,
 * turning a wrong-but-legible request into a silently different one. Encoding
 * is a no-op for a uuid and keeps a bad id honest: it 404s as itself.
 */
export function entityDetailUrl(endpoint: string, entityId: string): string {
  return `${endpoint}${encodeURIComponent(entityId)}/`;
}
