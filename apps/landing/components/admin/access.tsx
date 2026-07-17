"use client";

/**
 * Admin access context — fetches the current admin's founder flag + granular
 * capabilities once (via /auth/admin/settings) and shares them across the whole
 * admin shell. The <Can> gate and the sidebar read from here so RBAC is applied
 * consistently everywhere, not just on the permissions page.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import { getAdminSettings, type Capability } from "@/lib/auth-client";

export type AdminAccess = {
  /** false until the first settings fetch resolves. */
  ready: boolean;
  isFounder: boolean;
  perms: Capability[];
};

const Ctx = createContext<AdminAccess>({ ready: false, isFounder: false, perms: [] });

export function AdminAccessProvider({
  override,
  children
}: {
  /** Injected access (dev preview / tests) — when set, skips the network fetch. */
  override?: AdminAccess;
  children: ReactNode;
}) {
  const [state, setState] = useState<AdminAccess>(
    override ?? { ready: false, isFounder: false, perms: [] }
  );

  useEffect(() => {
    if (override) return;
    let alive = true;
    getAdminSettings()
      .then((s) => {
        if (alive) setState({ ready: true, isFounder: s.isFounder, perms: s.perms });
      })
      .catch(() => {
        if (alive) setState({ ready: true, isFounder: false, perms: [] });
      });
    return () => {
      alive = false;
    };
  }, [override]);

  return <Ctx.Provider value={override ?? state}>{children}</Ctx.Provider>;
}

export function useAdminAccess(): AdminAccess {
  return useContext(Ctx);
}

/** Pure predicate — does this access grant the given capability? Founder → all. */
export function can(access: AdminAccess, cap?: Capability, founderOnly?: boolean): boolean {
  if (founderOnly) return access.isFounder;
  if (!cap) return true;
  return access.isFounder || access.perms.includes(cap);
}

/**
 * Gate a subtree behind a capability (or founder-only). Renders `fallback`
 * (default: nothing) when the current admin lacks it. Renders nothing until
 * access is ready, so we never flash gated UI.
 */
export function Can({
  capability,
  founder,
  fallback = null,
  children
}: {
  capability?: Capability;
  founder?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const access = useAdminAccess();
  if (!access.ready) return null;
  return can(access, capability, founder) ? <>{children}</> : <>{fallback}</>;
}
