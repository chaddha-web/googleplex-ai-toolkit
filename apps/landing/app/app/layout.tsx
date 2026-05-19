"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { nextOnboardingPath } from "@/lib/auth-client";

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
    if (status === "authenticated" && user) {
      const required = nextOnboardingPath(user);
      // If they need to be at a setup step and aren't, bounce them there.
      if (required && pathname !== required) {
        router.replace(required);
        return;
      }
      // If they're fully active but visiting /app/setup/*, bounce to /app.
      if (!required && pathname.startsWith("/app/setup")) {
        router.replace("/app");
      }
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
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
