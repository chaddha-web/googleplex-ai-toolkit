"use client";

import { useEffect } from "react";
import { tryRestore } from "@/lib/auth-client";

/**
 * URL-hash JWT handoff receiver.
 *
 * Landing :3010 redirects authenticated users to apps/web :3000 with
 * `#h=<refreshToken>` appended. Because localStorage is origin-scoped
 * (port included), the refresh token doesn't cross automatically — we
 * receive it via the hash, persist it under apps/web's localStorage key,
 * then immediately strip the hash so it never appears in browser
 * history or analytics.
 */
const REFRESH_KEY = "gplex.refresh";

export function HashReceiver() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#")) return;
    const params = new URLSearchParams(hash.slice(1));
    const refresh = params.get("h");
    if (!refresh) return;

    try {
      localStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      /* private mode / quota — auth-context will just stay anonymous */
    }
    // Strip hash without adding a history entry.
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", cleanUrl);
    // Re-fire tryRestore so AuthProvider picks up the just-persisted token.
    void tryRestore();
  }, []);

  return null;
}
