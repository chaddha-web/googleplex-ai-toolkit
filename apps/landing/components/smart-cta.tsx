"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  tryRestore,
  nextOnboardingPath,
  webHandoffUrl,
  type User
} from "@/lib/auth-client";

/**
 * Public "Get Started" button. On mount, silently checks whether a valid
 * JWT / refresh token exists. If so, the link becomes "Continue →" and
 * points at the right /app/* destination (setup step or dashboard /
 * admin). Otherwise it stays as "Get Started" → /signup.
 *
 * Used in the landing hero nav and anywhere else we want a session-aware
 * CTA.
 */
export function SmartCta({
  className = "",
  signedOutLabel = "Get Started",
  signedOutHref = "/signup"
}: {
  className?: string;
  signedOutLabel?: string;
  signedOutHref?: string;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await tryRestore();
      if (cancelled) return;
      setUser(u);
      setResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // While we resolve (first paint), show the signed-out CTA so the page
  // never flashes a wrong state. Real users barely notice the relabel.
  if (!resolved || !user) {
    return (
      <Link href={signedOutHref} className={className}>
        {signedOutLabel}
      </Link>
    );
  }

  const onboarding = nextOnboardingPath(user);
  // Setup steps still live on landing; the fully-onboarded dashboard is on
  // apps/web. Hand off with the refresh token in the URL hash so the user
  // doesn't have to re-authenticate when crossing ports.
  if (onboarding) {
    return (
      <Link href={onboarding} className={className}>
        Continue →
      </Link>
    );
  }
  if (user.role === "admin") {
    return (
      <Link href="/app/admin" className={className}>
        Open admin →
      </Link>
    );
  }
  return (
    <a href={webHandoffUrl("/")} className={className}>
      Open dashboard →
    </a>
  );
}
