/**
 * INTERNAL stub — bridges legacy `useAuth()` calls inside the shell to the
 * new <ShellAuthProvider> contract.
 *
 * The shell only ever uses `hasAnyPerm` for nav-item visibility plus `user`
 * + `logout` for the profile menu. Consumers pass these in via
 * <ShellAuthProvider value={{...}}> at the App root.
 *
 * Long-term this file is removed when call sites migrate to `useShellAuth()`
 * + Layout's `user` / `onLogout` props directly.
 */
import { useShellAuth } from '../shell/ShellAuth';

interface ShellUser {
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

let _authBridge: { user?: ShellUser; logout?: () => void } = {};

/** Consumer registers user-identity + logout handler once at app startup. */
export function setShellAuthBridge(bridge: { user?: ShellUser; logout?: () => void }) {
  _authBridge = bridge;
}

export function useAuth() {
  const { hasAnyPerm } = useShellAuth();
  return {
    user: _authBridge.user,
    logout: _authBridge.logout ?? (() => {}),
    hasAnyPerm,
  };
}
