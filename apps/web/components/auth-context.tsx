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
  type User
} from "@/lib/auth-client";

export type AuthState = {
  status: "loading" | "anonymous" | "authenticated";
  user: User | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  status: "loading",
  user: null,
  signOut: async () => {}
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

  const value = useMemo<AuthState>(
    () => ({ status, user, signOut: doSignOut }),
    [status, user, doSignOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
