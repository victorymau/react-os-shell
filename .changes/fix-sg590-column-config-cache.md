---
bump: minor
title: List screens stop re-fetching the whole user profile on every mount
---

- **A list screen no longer re-fetches the whole user profile every time it
  mounts.** `useColumnConfig` restored the user's saved columns from a raw
  `GET /auth/me/` fired outside react-query, keyed only on `[tableId]`, so it
  ran again on every mount — and the axios instance the consumers register has
  no cache adapter and no in-flight dedupe, so each one was a real round trip.
  `/auth/me/` is not a cheap payload: it returns `preferences` verbatim and had
  reached roughly 1.5 MB on the EFFICIENT production tenant. Because the shell
  is a windowing UI, three open list windows meant three copies of it, and on
  the admin portal a screen that renders the column-aware CSV export button
  calls the hook a second time for the same table.

  The hook now reads `prefs.columns_{tableId}` from the `<ShellPrefsProvider>`
  adapter, which is backed by the one cached profile query the consumer already
  keeps. No request of its own.

  **What that is worth depends on the consumer's own profile query, not on
  this package.** The hook's per-mount fetches are gone, so the profile round
  trips fall by the number of times it mounts — not to one per session.
  Whatever the consumer's cached profile query does on its own still happens:
  the admin portal's runs on an interval and on window focus, so there the win
  is the per-mount fetches removed from on top of that schedule. A consumer
  whose profile query does not refetch keeps the whole difference.

- **A failed column save is silent where the admin portal used to toast it.**
  The save used to be a `useMutation`, so a rejected `PATCH /auth/me/` reached
  the portal's global `MutationCache({ onError })` and raised an error toast.
  It now goes through the `<ShellPrefsProvider>` adapter's `save`, and that
  adapter handles its own failures — the admin portal's swallows them — so a
  save that fails leaves the new columns on screen and in localStorage with
  nothing said. Quieter is arguably the better behaviour for a column width,
  but it is a change, and the adapter is now the only place that can still see
  the failure: a consumer that wants the toast back raises it there.

- **The two hooks a list page calls share one defaults probe.**
  `useColumnConfig` wanted `visible_columns` off
  `GET /auth/default-columns/{tableId}/` and `useSort` wanted `sort` off the
  same row, and each fired its own GET. Both now go through
  `useDefaultColumnConfig`, one react-query key per `(tableId, viewport)` — so
  a screen makes one request no matter how many tables or hooks ask, and
  re-opening a window inside the 5-minute `staleTime` makes none. Its refetch
  options are set explicitly rather than inherited, because a consumer's global
  `defaultOptions` can poll.

  `useColumnConfig` also picks up the `isShellApiClientConfigured()` gate
  `useSort` already had, so a consumer with no backend wired fires no doomed
  request.

  **Neither hook requires a `<QueryClientProvider>`, and `useColumnConfig` no
  longer does.** `useSort` never needed one — its `tableId`-less form is pure
  in-memory state that reaches nothing — and moving the probe into react-query
  must not change that, because `useQuery` resolves its client *before* it
  reads `enabled`, so gating the request does not spare the caller that makes
  none. `useDefaultColumnConfig` therefore takes the client from
  `QueryClientContext` where a provider is mounted and falls back to one this
  package owns where none is; both forms of `useSort` keep working in a tree
  that has never mounted a provider. `useColumnConfig` comes out ahead of where
  it started, having needed a provider for its `useMutation` until now. The one
  cost: a tree that mounts a provider around only part of itself gets two
  caches, and so two probes rather than one. Consumers that want the sharing
  mount it at the root, as all three portals do.

  **Not behaviour-preserving, in two ways.** A `<ShellPrefsProvider>` is now
  required for column config to persist server-side — without one the hook
  falls back to localStorage only; all three portals that render `<EntityList>`
  already mount it. And prefs and admin defaults now resolve independently
  where they used to arrive together in one `Promise.all`, so an admin default
  can apply for a beat before the user's own config replaces it. `useSort` has
  always behaved that way; the two hooks now agree.

