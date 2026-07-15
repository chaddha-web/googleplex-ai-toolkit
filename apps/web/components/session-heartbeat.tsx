"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { sessionHeartbeat } from "@/lib/auth-client";

/**
 * Authenticated presence beacon — tells the backend this member is actively
 * using the app right now (powers the admin "online now" view + durable
 * last-active). Pings on mount, every 25s while the tab is visible, and again
 * whenever the tab regains focus. Silent when signed out or hidden.
 */
export function SessionHeartbeat() {
  const { status } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "authenticated") return;

    let stopped = false;
    const ping = () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      sessionHeartbeat(pathname || "/");
    };

    ping(); // immediate
    const id = window.setInterval(ping, 25_000);
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, pathname]);

  return null;
}
