import { PostHogProvider } from "./providers";
import { Toaster } from "@googolplex/ui/components/toaster";
import "./globals.css";
import * as Sentry from "@sentry/nextjs";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-context";
import { HashReceiver } from "@/components/hash-receiver";
import { DashboardShell } from "@/components/dashboard-shell";

/**
 * Root layout for apps/web — the product dashboard.
 *
 * - Forces the dark, font-serif design language shared with apps/landing
 *   (see globals.css copied from landing).
 * - AuthProvider gates to a valid session; HashReceiver handles the
 *   `#h=<refreshToken>` handoff from landing :3010 after signup/login so
 *   no second login is needed when crossing ports.
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
          <HashReceiver />
          <AuthProvider>
            <DashboardShell>{children}</DashboardShell>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
