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
import axios, { AxiosInstance } from 'axios';

let _apiClient: AxiosInstance | null = null;
let _warnedMissing = false;

/** Consumer registers their own axios instance — typically the same one
 *  they use elsewhere. The package only delegates HTTP to this. */
export function setShellApiClient(instance: AxiosInstance) {
  _apiClient = instance;
}

// HTTP methods that should no-op (resolve with empty data) when no client is
// wired, so the shell's internal `useQuery` calls don't throw uncaught errors.
const NOOP_METHODS = new Set([
  'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request',
]);

function warnOnce(prop: string) {
  if (_warnedMissing) return;
  _warnedMissing = true;
  console.warn(
    `react-os-shell: apiClient.${prop}() called before setShellApiClient(). ` +
    `Wire your axios instance once at app startup, or ignore this warning if ` +
    `your demo intentionally has no backend — internal HTTP calls will resolve ` +
    `with empty data.`
  );
}

const apiClient: AxiosInstance = new Proxy({} as AxiosInstance, {
  get(_t, prop) {
    if (_apiClient) return (_apiClient as any)[prop];
    if (typeof prop === 'string' && NOOP_METHODS.has(prop)) {
      warnOnce(prop);
      return () => Promise.resolve({ data: null, status: 0, statusText: '', headers: {}, config: {} });
    }
    return undefined;
  },
});

export default apiClient;
// Re-export the axios type for legacy code that imports it.
export type { AxiosInstance };
// Provide a cheap axios stub for files that import it.
export { axios };
