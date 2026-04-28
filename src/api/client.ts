/**
 * INTERNAL stub — bridges legacy `apiClient.get/patch('/auth/me/', ...)` calls
 * inside the shell to the new <ShellPrefsProvider> contract. This keeps the
 * package's copied source compiling without rewriting every call site at
 * once; consumer-supplied prefs flow through `<ShellPrefsProvider>`.
 *
 * Outside calls (anything not hitting `/auth/me/`) need the consumer to mount
 * <ShellEntityFetcherProvider> and wire `entityFetcher` on <WindowManager>.
 *
 * Long-term this file is removed when each call site migrates to
 * `useShellPrefs()` directly.
 */
import axios, { AxiosInstance } from 'axios';

let _apiClient: AxiosInstance | null = null;

/** Consumer registers their own axios instance — typically the same one
 *  they use elsewhere. The package only delegates HTTP to this. */
export function setShellApiClient(instance: AxiosInstance) {
  _apiClient = instance;
}

const apiClient: AxiosInstance = new Proxy({} as AxiosInstance, {
  get(_t, prop) {
    if (!_apiClient) {
      throw new Error(
        `react-os-shell: apiClient.${String(prop)}() called before setShellApiClient(). ` +
        `Wire your axios instance once at app startup.`
      );
    }
    return (_apiClient as any)[prop];
  },
});

export default apiClient;
// Re-export the axios type for legacy code that imports it.
export type { AxiosInstance };
// Provide a cheap axios stub for files that import it.
export { axios };
