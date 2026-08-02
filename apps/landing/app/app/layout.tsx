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

    const required = nextOnboardingPath(user);
    // If they need to be at a setup step and aren't, bounce them there.
    if (required && pathname !== required) {
      router.replace(required);
      return;
    }
    // The orientation page manages its own exit, so never bounce off it.
    if (pathname === ORIENTATION_PATH) return;

    // If they're fully active but visiting /app/setup/*, bounce to /app.
    if (!required && pathname.startsWith("/app/setup")) {
      router.replace("/app");
      return;
    }

    // Activated members owe the orientation before the rest of /app. Async and
    // non-blocking: the page renders, and we redirect only if it's actually due.
    if (!required && user.walletStatus === "active") {
      let cancelled = false;
      void checkOrientation().then((due) => {
        if (!cancelled && due) router.replace(ORIENTATION_PATH);
      });
      return () => {
        cancelled = true;
      };
    }
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
