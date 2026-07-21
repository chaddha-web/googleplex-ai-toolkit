"use client";

import { useEffect } from "react";
import { tryRestore } from "@/lib/auth-client";

/**
 * URL-hash JWT handoff receiver (landing side).
 *
 * When you open the admin panel on admin.ggakingclub.com from an already
 * signed-in session, the link carries the refresh token in a `#h=<token>`
 * hash (adminHandoffUrl). localStorage is origin-scoped, so the token doesn't
 * cross automatically — we receive it here, persist it under this origin's
 * localStorage key, strip the hash so it never lingers in history, and re-run
 * tryRestore so the AuthProvider picks up the session without a second login.
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
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", cleanUrl);
    void tryRestore();
  }, []);

  return null;
}
