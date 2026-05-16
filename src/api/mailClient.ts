// Mail bridge client.
//
// Axios is imported dynamically (via `import('axios')`) so the shell's static
// module graph never references it. Consumers (e.g. admin-portal) bundle
// their own axios for their own API client — when both the shell and the
// host statically reference axios, rolldown puts it in a shared chunk and
// occasionally orders that chunk after the consumer's `client.ts` chunk,
// surfacing as `Cannot read properties of undefined (reading 'create')`
// during module evaluation (see 0.3.0 → 0.3.1 prod incident). Keeping the
// runtime import here lazy avoids that entire chunk-graph by design.
//
// `getMailClient()` keeps its synchronous signature by returning a Proxy
// that resolves axios on first method call; existing callers that already
// `await client.get(...)` keep working unchanged because the proxied method
// returns the same Promise shape.

import type { AxiosInstance } from 'axios';

const DEFAULT_BASE_URL = 'http://localhost:3001';
let _client: AxiosInstance | null = null;
let _baseUrl: string = DEFAULT_BASE_URL;
let _axiosPromise: Promise<typeof import('axios').default> | null = null;

function loadAxios(): Promise<typeof import('axios').default> {
  if (!_axiosPromise) _axiosPromise = import('axios').then((m) => m.default);
  return _axiosPromise;
}

export async function setShellMailServer(input: string | AxiosInstance): Promise<void> {
  if (typeof input === 'string') {
    _baseUrl = input;
    const axios = await loadAxios();
    _client = axios.create({ baseURL: input, withCredentials: true, timeout: 60_000 });
  } else {
    _client = input;
  }
}

export function getMailClient(): AxiosInstance {
  if (_client) return _client;

  // Lazy proxy: resolves axios + creates the instance on first method call.
  // Methods that return promises (the entire AxiosInstance surface) keep
  // their normal signature — callers `await client.get(...)` exactly as
  // before. Non-method property access returns undefined.
  const proxy = new Proxy({} as AxiosInstance, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined;
      return (...args: unknown[]) =>
        loadAxios().then((axios) => {
          if (!_client) {
            _client = axios.create({ baseURL: _baseUrl, withCredentials: true, timeout: 60_000 });
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fn = (_client as any)[prop];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return typeof fn === 'function' ? fn.apply(_client, args) : fn;
        });
    },
  });
  return proxy;
}

export function getMailServerBaseUrl(): string {
  return _baseUrl;
}
