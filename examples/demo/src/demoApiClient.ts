/**
 * Mock axios-style client, registered via `setShellApiClient` in App.tsx.
 *
 * Configuring a client switches ON the shell features that gate on
 * `isShellApiClientConfigured()`:
 *   - entity windows fetch `GET {endpoint}{id}/` — served here from the
 *     in-memory directory (searchDemo.ts), so ⌘K results open real windows
 *   - the window-menu "Add to Desktop" item and fav stars read/patch
 *     `/auth/me/` preferences — bridged here to the demo's localStorage
 *     prefs adapter so shortcuts land on the desktop live
 *
 * Anything unrecognized resolves `{ data: null }` (all shell callers are
 * null-safe), so enabling the client can't strand a query in loading state.
 */
import type { ShellPrefsAdapter } from 'react-os-shell';
import { DIRECTORY_PEOPLE, DIRECTORY_PROJECTS } from './searchDemo';

// The prefs adapter is a React hook value — App re-binds it every render so
// the client always writes through the live one.
let prefsAdapter: ShellPrefsAdapter | null = null;
export function bindDemoApiPrefs(adapter: ShellPrefsAdapter) {
  prefsAdapter = adapter;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const res = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config: {} });

export const demoApiClient = {
  async get(url: string) {
    await delay(120); // a hint of latency so loading states are visible
    if (url === '/auth/me/') return res({ preferences: { ...(prefsAdapter?.prefs ?? {}) } });
    const person = url.match(/^\/people\/([^/]+)\/$/);
    if (person) return res(DIRECTORY_PEOPLE.find(p => String(p.id) === person[1]) ?? null);
    const project = url.match(/^\/projects\/([^/]+)\/$/);
    if (project) return res(DIRECTORY_PROJECTS.find(p => String(p.id) === project[1]) ?? null);
    return res(null);
  },
  async patch(url: string, body?: any) {
    if (url === '/auth/me/' && body?.preferences) prefsAdapter?.save(body.preferences);
    return res(body ?? null);
  },
  async post() { return res(null); },
  async put() { return res(null); },
  async delete() { return res(null); },
} as any;
