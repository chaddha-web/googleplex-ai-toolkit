"use client";

import { useEffect } from "react";
import { AUTH_BASE } from "@/lib/auth-client";

/**
 * Anonymous "viewing now" heartbeat for public pages. Feeds the admin globe's
 * viewers layer. Skips the authed /app area (those users are the "online"
 * layer) — the path is checked live at ping time via window.location so we
 * avoid usePathname() in the root layout (which breaks the production build's
 * not-found/page-data collection). Uses a sessionStorage id — no cookie, no
 * cross-session tracking.
 */
function getVid(): string {
  const KEY = "gp_vid";
  let v = sessionStorage.getItem(KEY);
  if (!v) {
    v = crypto.randomUUID();
    sessionStorage.setItem(KEY, v);
  }
  return v;
}

function onPublicPage(): boolean {
  return !window.location.pathname.startsWith("/app");
}

export function PresenceBeacon() {
  useEffect(() => {
    const url = `${AUTH_BASE}/auth/presence/ping`;
    const id = getVid();

    const ping = () => {
      if (document.visibilityState !== "visible" || !onPublicPage()) return;
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vid: id }),
        keepalive: true
      }).catch(() => {});
    };

    ping();
    const t = setInterval(ping, 25_000);

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        if (!onPublicPage()) return;
        navigator.sendBeacon?.(
          url,
          new Blob([JSON.stringify({ vid: id })], { type: "application/json" })
        );
      } else {
        ping();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
