import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { authClient, type AuthClient, type AuthState } from "./auth-client";

/**
 * The reader's sign-in, for the screens: its state (restoring, signed out,
 * signed in as whom) and the client's actions. One provider at the root;
 * the state follows the client, which follows Firebase across tabs.
 */

interface AuthContextValue {
  state: AuthState;
  client: AuthClient;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, client = authClient }: { children: ReactNode; client?: AuthClient }) {
  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);
  const value = useMemo(() => ({ state, client }), [state, client]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
