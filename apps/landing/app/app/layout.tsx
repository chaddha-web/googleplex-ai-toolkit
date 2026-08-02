"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { nextOnboardingPath } from "@/lib/auth-client";
import { checkOrientation } from "@/lib/orientation-gate";
import { DashboardBackground } from "@/components/dashboard-background";

const ORIENTATION_PATH = "/app/setup/orientation";

/**
 * Layout for everything under /app. Wraps in AuthProvider, gates on auth,
 * and routes onboarding-incomplete users to the right /app/setup/* step.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated" || !user) return;

    // Admins run the platform — they are never held behind the member
    // onboarding, and the admin panel lives under /app too. Gating them would
    // lock the operator out of the box.
    if (user.role === "admin") return;

    // Profile first — everything else assumes we know who they are.
    if (!user.profileCompletedAt) {
      if (pathname !== "/app/setup/profile") router.replace("/app/setup/profile");
      return;
    }

    // The orientation page manages its own exit, so never bounce off it.
    if (pathname === ORIENTATION_PATH) return;

    // Orientation comes BEFORE the $1: we want members to understand what the
    // deposit is for before they're asked to send it. Async and non-blocking —
    // the page renders and we only redirect if it's genuinely due.
    let cancelled = false;
    void checkOrientation().then((due) => {
      if (cancelled) return;
      if (due) {
        router.replace(ORIENTATION_PATH);
        return;
      }

      // Then the $1, which is mandatory. `nextOnboardingPath` returns the
      // wallet-password or deposit step until the wallet is active.
      const required = nextOnboardingPath(user);
      if (required && pathname !== required) {
        router.replace(required);
        return;
      }
      // Fully set up but sitting on a setup page — send them home.
      if (!required && pathname.startsWith("/app/setup")) {
        router.replace("/app");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status, user, pathname, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white/50 text-sm">
        Loading your account…
      </div>
    );
  }
  if (status === "anonymous") return null;
  return (
    <>
      {/* Admin panel keeps its own chrome — the theme is for the member area. */}
      {!pathname.startsWith("/app/admin") && <DashboardBackground />}
      {children}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
