"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { nextOnboardingPath } from "@/lib/auth-client";
import { checkOrientation } from "@/lib/onboarding-gate";

const LANDING_URL = (process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3010").replace(/\/$/, "");

/**
 * Holds the dashboard shut until the member has finished onboarding:
 * orientation, then the wallet password, then the mandatory $1.
 *
 * The setup pages live on the landing app, so this is a cross-subdomain
 * redirect rather than a router push. The session cookie is scoped to
 * *.ggakingclub.com, so they arrive already signed in.
 *
 * Admins are exempt — they run the platform and never paid the $1.
 *
 * Renders a holding screen while redirecting, so the dashboard never flashes
 * up behind it with real balances on show.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (user.role === "admin") return;

    let cancelled = false;

    // Orientation comes first — before the money, so members understand what
    // the $1 is for before being asked for it.
    void checkOrientation().then((due) => {
      if (cancelled) return;
      if (due) {
        setRedirecting(true);
        window.location.href = `${LANDING_URL}/app/setup/orientation`;
        return;
      }
      const next = nextOnboardingPath(user);
      if (next) {
        setRedirecting(true);
        window.location.href = `${LANDING_URL}${next}`;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [status, user]);

  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white/50 text-sm font-sans">
        <span className="flex items-center gap-2.5">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
          Finishing your setup…
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
