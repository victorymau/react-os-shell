/**
 * INTERNAL stub — bridges legacy `apiClient.get/patch('/auth/me/', ...)` calls
 * inside the shell to the new <ShellPrefsProvider> contract. This keeps the
 * package's copied source compiling without rewriting every call site at
 * once; consumer-supplied prefs flow through `<ShellPrefsProvider>`.
 *
 * Outside calls (anything not hitting `/auth/me/`) need the consumer to mount
 * <ShellEntityFetcherProvider> and wire `entityFetcher` on <WindowManager>.
 *
 * When `setShellApiClient` has not been called, HTTP methods resolve with an
 * empty payload instead of throwing — so consumers without a backend (the
 * Pages demo, for instance) can still mount the shell. A one-time console
 * warning surfaces the missing wiring without crashing the app.
 *
 * Long-term this file is removed when each call site migrates to
 * `useShellPrefs()` directly.
 */
import type { AxiosInstance } from 'axios';

let _apiClient: AxiosInstance | null = null;

/** Consumer registers their own axios instance — typically the same one
 *  they use elsewhere. The package only delegates HTTP to this. */
export function setShellApiClient(instance: AxiosInstance) {
  _apiClient = instance;
}

/** Whether the consumer has wired an api client. Internal shell queries gate
 *  themselves on this so demos / consumers without a backend don't fire
 *  doomed HTTP requests. */
export function isShellApiClientConfigured(): boolean {
  return _apiClient !== null;
}

// HTTP methods that resolve with empty data when no client is wired. Internal
// callers gate on `isShellApiClientConfigured()` so this branch shouldn't
// fire normally; it remains as a safety net for consumer-supplied apps that
// import the shell's `apiClient` directly without setting one up.
const NOOP_METHODS = new Set([
  'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request',
]);

const apiClient: AxiosInstance = new Proxy({} as AxiosInstance, {
  get(_t, prop) {
    if (_apiClient) return (_apiClient as any)[prop];
    if (typeof prop === 'string' && NOOP_METHODS.has(prop)) {
      return () => Promise.resolve({ data: null, status: 0, statusText: '', headers: {}, config: {} });
    }
    return undefined;
  },
});

export default apiClient;
// Re-export the axios type for legacy code that imports it.
export type { AxiosInstance };
