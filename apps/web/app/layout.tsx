import { PostHogProvider } from "./providers";
import { Toaster } from "@googolplex/ui/components/toaster";
import "./globals.css";
import * as Sentry from "@sentry/nextjs";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-context";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardBackground } from "@/components/dashboard-background";
import { OnboardingGate } from "@/components/onboarding-gate";

/**
 * Root layout for apps/web — the product dashboard.
 *
 * - Forces the dark, font-serif design language shared with apps/landing
 *   (see globals.css copied from landing).
 * - AuthProvider gates to a valid session, restored from the shared httpOnly
 *   refresh cookie (set by the auth service, scoped to *.ggakingclub.com) — no
 *   URL-hash handoff needed when crossing subdomains.
 * - DashboardShell wraps every route in the sidebar + topbar.
 */

export function generateMetadata(): Metadata {
  return {
    title: "GoogolPlex — Dashboard",
    description: "Your workspace.",
    other: { ...Sentry.getTraceData() }
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-black text-white min-h-screen antialiased font-sans selection:bg-white/20 selection:text-white">
        <PostHogProvider>
          <Toaster />
          <AuthProvider>
            <DashboardBackground />
            {/* Nothing in the product renders until onboarding is finished. */}
            <OnboardingGate>
              <DashboardShell>{children}</DashboardShell>
            </OnboardingGate>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
