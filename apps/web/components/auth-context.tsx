"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  signOut as clientSignOut,
  subscribeAuth,
  tryRestore,
  fetchMe,
  type User
} from "@/lib/auth-client";

export type AuthState = {
  status: "loading" | "anonymous" | "authenticated";
  user: User | null;
  signOut: () => Promise<void>;
  /** Re-fetch /auth/me and update context (e.g. after wallet activation). */
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthState>({
  status: "loading",
  user: null,
  signOut: async () => {},
  refreshUser: async () => null
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await tryRestore();
      if (cancelled) return;
      if (restored) {
        setUser(restored);
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("anonymous");
      }
    })();
    const unsub = subscribeAuth((u) => {
      setUser(u);
      setStatus(u ? "authenticated" : "anonymous");
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const doSignOut = useCallback(async () => {
    await clientSignOut();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await fetchMe();
    if (u) {
      setUser(u);
      setStatus("authenticated");
    }
    return u;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, signOut: doSignOut, refreshUser }),
    [status, user, doSignOut, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
