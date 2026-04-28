/**
 * Shell-side entity fetcher — used by <WindowManager> when the user opens an
 * entity window. The shell knows the endpoint string (from the registry
 * entry) and the entity ID; the consumer translates that into an HTTP call
 * (or a mock, or whatever).
 *
 * Without a provider, the shell will throw if any code path tries to fetch
 * an entity — this is by design: a host that registers entity windows MUST
 * also wire the fetcher, or the open-entity flow has nothing to call.
 */
import { createContext, useContext, type ReactNode } from 'react';

export type EntityFetcher = (endpoint: string, id: string) => Promise<any>;

const EntityFetcherContext = createContext<EntityFetcher | null>(null);

export function ShellEntityFetcherProvider({
  value,
  children,
}: { value: EntityFetcher; children: ReactNode }) {
  return <EntityFetcherContext.Provider value={value}>{children}</EntityFetcherContext.Provider>;
}

/** Returns the consumer-supplied entity fetcher, or a stub that throws
 *  on call. Components that fetch entities call this hook eagerly so any
 *  misconfiguration surfaces synchronously rather than at click-time. */
export function useShellEntityFetcher(): EntityFetcher {
  const ctx = useContext(EntityFetcherContext);
  return ctx ?? ((endpoint: string) => {
    throw new Error(
      `react-os-shell: cannot fetch ${endpoint} — no <ShellEntityFetcherProvider> mounted. ` +
      `If your app registers entity windows, supply an entityFetcher.`
    );
  });
}
