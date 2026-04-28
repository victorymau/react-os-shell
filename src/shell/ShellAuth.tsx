/**
 * Shell-side auth surface — JUST permission checking. The shell never
 * authenticates anyone or holds tokens; it only asks "is the current user
 * allowed to see this nav item?".
 *
 * Consumer wraps the app:
 *
 *   <ShellAuthProvider value={{ hasAnyPerm: (perms) => myAuth.has(...perms) }}>
 *     <Layout ... />
 *   </ShellAuthProvider>
 *
 * When no provider is mounted, every permission check returns true — useful
 * for demos and consumers that don't gate their UI.
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface ShellAuth {
  /** Returns true if the current user has any of the listed permission codes. */
  hasAnyPerm: (perms: string[]) => boolean;
}

const DEFAULT: ShellAuth = { hasAnyPerm: () => true };

const ShellAuthContext = createContext<ShellAuth>(DEFAULT);

export function ShellAuthProvider({ value, children }: { value: ShellAuth; children: ReactNode }) {
  return <ShellAuthContext.Provider value={value}>{children}</ShellAuthContext.Provider>;
}

export function useShellAuth(): ShellAuth {
  return useContext(ShellAuthContext);
}
