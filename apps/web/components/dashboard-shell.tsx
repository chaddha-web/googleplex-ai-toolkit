"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-context";

const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3010";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/wallet", label: "Wallet" },
  { href: "/community", label: "Community" },
  { href: "/studio", label: "Studio" },
  { href: "/settings", label: "Settings" }
];

/**
 * Outer shell used by every page in apps/web.
 *
 * Layout: fixed-width sidebar on md+, full-width topbar otherwise.
 * Design language is pulled from apps/landing (dark, liquid-glass, font-serif
 * italics for emphasis).
 *
 * Auth: if the user isn't signed in after the auth context resolves, we
 * redirect to landing's /login (single source of truth for sign-in).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") {
      // Send the user to landing's login. Landing knows how to hand the
      // session back via #h=<refresh> after a successful verify.
      window.location.href = `${LANDING_URL}/login`;
    }
  }, [status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/40 text-sm">
        Loading your workspace…
      </div>
    );
  }
  if (status === "anonymous") return null;

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar pathname={pathname} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          firstName={user?.firstName ?? ""}
          email={user?.email ?? ""}
          onSignOut={async () => {
            await signOut();
            router.refresh();
          }}
        />
        <main className="flex-1 px-6 md:px-10 py-10">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/5 bg-black/40 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-2 px-6 py-6 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="GoogolPlex" className="h-7 w-auto object-contain" />
        <span className="text-lg font-medium tracking-tight">GoogolPlex</span>
      </Link>
      <nav className="px-3 mt-2 flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-xl px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-white text-black font-medium"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <p className="px-6 pb-6 text-white/30 text-[10px] tracking-widest uppercase">
        v0.1 · dashboard
      </p>
    </aside>
  );
}

function TopBar({
  firstName,
  email,
  onSignOut
}: {
  firstName: string;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-6 md:px-10 py-4 border-b border-white/5 bg-black/60 backdrop-blur">
      {/* Mobile: also show inline nav */}
      <MobileNav />
      <div className="ml-auto flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-white text-sm leading-tight">
            {firstName || "friend"}
          </p>
          <p className="text-white/40 text-xs leading-tight">{email}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="text-white/50 hover:text-white text-xs transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden flex items-center gap-2 overflow-x-auto">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-xs rounded-full px-3 py-1.5 whitespace-nowrap transition-colors ${
              active
                ? "bg-white text-black"
                : "text-white/60 ring-1 ring-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
