/**
 * The shared `GET /auth/default-columns/{tableId}/` probe.
 *
 * `useColumnConfig` and `useSort` both want the admin-saved defaults for a
 * table — the first for `visible_columns`, the second for `sort` — and both
 * used to fire their own raw axios GET on mount. A list page calls both, so
 * every list screen asked the same URL twice, and the consumer axios instances
 * carry no cache adapter and no in-flight dedupe, so both were real round
 * trips (SG#00590).
 *
 * Routing it through react-query under one key collapses that: the two hooks
 * on a screen share a single request, a second table with the same `tableId`
 * shares it too, and re-opening a window inside `staleTime` serves from cache.
 *
 * The query key is namespaced under `react-os-shell` so it cannot collide with
 * a consumer's own keys — including the persistence allow-lists some of them
 * key off `queryKey[0]`; these defaults are cheap to refetch and have no
 * business surviving in IndexedDB.
 *
 * The refetch options are set explicitly rather than inherited: consumers set
 * aggressive global `defaultOptions` (the admin portal polls every 60s and
 * refetches on window focus), and this endpoint changes only when an admin
 * edits a table's defaults. Inheriting would have turned a once-per-mount
 * fetch into a poll — worse than the bug being fixed.
 *
 * Using react-query here must NOT make a `<QueryClientProvider>` a condition
 * of calling `useSort`, which never needed one: `useQuery` resolves its client
 * before it reads `enabled`, so an `enabled` flag does not spare the
 * `tableId`-less caller. See `useResolvedQueryClient` below.
 */
import { useContext, useMemo } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import apiClient, { isShellApiClientConfigured } from '../api/client';
import type { SortState } from './types';

/**
 * The client this probe runs on when the consumer has mounted none.
 *
 * `useSort` is a public hook that was pure React plus one raw axios GET, and
 * its `tableId`-less form reached no network at all. Routing the probe through
 * react-query would have made a provider mandatory for every caller of it,
 * including that one — a hard new requirement on a hook people already call,
 * failing at render with `No QueryClient set` rather than degrading.
 *
 * React forbids calling `useQuery` conditionally, so the client is what varies
 * instead: `useQuery(options, client)` takes an explicit one, and
 * `QueryClientContext` is part of react-query's public API, so the hook can
 * see for itself whether a provider is above it. With one, nothing changes and
 * the probe lives in the consumer's cache alongside everything else. Without
 * one, it lands in a client this module owns — created on first use, never
 * `mount()`ed (that only wires the focus/online refetching this query switches
 * off anyway), and shared by every hook in the process, so `useColumnConfig`
 * and `useSort` still collapse to a single request.
 *
 * A tree that mounts a provider around only part of itself gets two caches and
 * so two requests, which is what the raw GETs did everywhere. Consumers that
 * want the sharing mount the provider at the root, as all three portals do.
 */
let ownedClient: QueryClient | undefined;

function useResolvedQueryClient(): QueryClient {
  const provided = useContext(QueryClientContext);
  if (provided) return provided;
  if (!ownedClient) ownedClient = new QueryClient();
  return ownedClient;
}

/**
 * Drop the owned client. Internal — not re-exported from `src/index.ts`, so it
 * is not part of the package's API: it appears in neither `dist/index.js` nor
 * `dist/index.d.ts` (only, as every line of source does, inside the sourcemap).
 *
 * It exists for the specs. A react-query entry left in cache holds a
 * five-minute garbage-collection timer, and node's test runner will not exit
 * while one is pending — a spec that renders without a provider would sit there
 * for five minutes after its last assertion. A spec that mounts its own
 * `<QueryClientProvider>` calls `client.clear()` for the same reason; this is
 * the same call for the client no spec has a handle on.
 */
export function __resetOwnedQueryClient(): void {
  ownedClient?.clear();
  ownedClient = undefined;
}

export type ColumnViewport = 'desktop' | 'mobile';

/** Shape of `GET /auth/default-columns/{tableId}/`. Every field is optional:
 *  the endpoint answers a miss with `{visible_columns: [], sort: null}`, and
 *  the shell's unwired `apiClient` proxy resolves `data: null`. */
export interface DefaultColumnConfig {
  visible_columns?: string[] | null;
  sort?: SortState | null;
}

/** Same media query `useIsMobile` uses, so the column/sort defaults split on
 *  the same breakpoint as the rest of the UI's mobile affordances. Read once
 *  per mount (see `useDefaultColumnConfig`) — a user who resizes past the
 *  breakpoint mid-session picks the other row up on the next window. */
export function readColumnViewport(): ColumnViewport {
  return typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
    ? 'mobile'
    : 'desktop';
}

export function defaultColumnConfigQueryKey(tableId: string, viewport: ColumnViewport) {
  return ['react-os-shell', 'default-columns', tableId, viewport] as const;
}

/**
 * Admin-saved defaults for `tableId`, or `undefined` while unknown.
 *
 * `undefined` covers all three of "still in flight", "the request failed" and
 * "no api client is wired" — every caller treats those the same way, by
 * leaving whatever it already had alone.
 */
export function useDefaultColumnConfig(tableId?: string): {
  defaultConfig: DefaultColumnConfig | undefined;
  viewport: ColumnViewport;
} {
  // Once at mount, matching the pre-react-query behaviour: the viewport was
  // read inside a `[tableId]` effect, so it never changed under a live table.
  const viewport = useMemo(readColumnViewport, []);
  const queryClient = useResolvedQueryClient();

  const { data } = useQuery<DefaultColumnConfig | null>({
    queryKey: defaultColumnConfigQueryKey(tableId ?? '', viewport),
    queryFn: () =>
      apiClient
        .get(`/auth/default-columns/${tableId}/`, { params: { viewport } })
        .then((r) => (r?.data ?? null) as DefaultColumnConfig | null),
    // The raw callers gated on this so a consumer without a backend (the Pages
    // demo) fires no doomed HTTP. `useColumnConfig` never did; it does now.
    enabled: !!tableId && isShellApiClientConfigured(),
    // The raw callers made exactly one attempt and swallowed the failure.
    retry: false,
    staleTime: 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }, queryClient);

  return { defaultConfig: data ?? undefined, viewport };
}
