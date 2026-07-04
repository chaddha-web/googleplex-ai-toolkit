"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";

const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3010";

// Ambient sidebar video — served from the nginx media server (not bundled).
const SIDEBAR_VIDEO_URL =
  process.env.NEXT_PUBLIC_SIDEBAR_VIDEO_URL ||
  "https://ggakingclub.com/media/final.mp4";

// Celestial-lion cosmos behind the dashboard content. Served from the media
// server (drop the file at /media/celestial-lion.jpg). A light veil keeps the
// light-theme cards + dark text readable; tune the veil alpha to taste.
const DASH_BG_URL =
  process.env.NEXT_PUBLIC_DASH_BG_URL ||
  "https://ggakingclub.com/media/celestial-lion.jpg";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/wallet", label: "Wallet" },
  { href: "/community", label: "Community" },
  { href: "/studio", label: "Studio" },
  { href: "/account/security", label: "Security" },
  { href: "/settings", label: "Settings" }
];

/**
 * Outer shell used by every page in apps/web.
 *
 * Layout: fixed-width sidebar on md+. On mobile the same sidebar becomes a
 * slide-in drawer toggled by a hamburger in the top bar, dismissed by tapping
 * the backdrop or any nav item.
 *
 * Auth: if the user isn't signed in after the auth context resolves, we
 * redirect to landing's /login (single source of truth for sign-in).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer whenever the route changes (a nav item was tapped).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open so the page behind doesn't move.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (status === "anonymous") {
      // Send the user to landing's login. Landing knows how to hand the
      // session back via #h=<refresh> after a successful verify.
      window.location.href = `${LANDING_URL}/login`;
      return;
    }
    // Hard rule: admins have NO presence on the user dashboard. Any admin
    // who lands here is bounced to the admin surface on landing. This runs
    // on every page transition so they can't deep-link past it either.
    if (status === "authenticated" && user?.role === "admin") {
      window.location.href = `${LANDING_URL}/app/admin`;
    }
  }, [status, user?.role]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/40 text-sm">
        Loading your workspace…
      </div>
    );
  }
  if (status === "anonymous") return null;
  // While the bouncer is flushing the admin offsite, render nothing so
  // they never see a flash of the user dashboard frame.
  if (user?.role === "admin") return null;

  return (
    <div className="flex min-h-screen w-full">
      {/* Full-height sidebar on the left — the white panel runs the whole
          length of the page. */}
      <Sidebar pathname={pathname} className="hidden md:flex" />

      {/* Mobile drawer + backdrop */}
      {menuOpen && (
        <>
          {/* Backdrop — tap anywhere off the menu to dismiss. */}
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <Sidebar
            pathname={pathname}
            className="fixed inset-y-0 left-0 z-40 flex md:hidden animate-[slideIn_0.18s_ease-out]"
            onNavigate={() => setMenuOpen(false)}
          />
        </>
      )}

      {/* Content column — the top bar sits here, to the RIGHT of the sidebar. */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          firstName={user?.firstName ?? ""}
          email={user?.email ?? ""}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((v) => !v)}
          onSignOut={async () => {
            await signOut();
            router.refresh();
          }}
        />
        <main
          className="flex-1 px-6 md:px-10 py-10"
          style={{
            // Cosmic art fixed behind the content, under a light veil so the
            // white cards + dark ink text stay legible. Slightly lighter at the
            // top where the "Welcome" heading sits.
            backgroundImage: `linear-gradient(180deg, rgba(250,247,242,0.86) 0%, rgba(250,247,242,0.74) 40%, rgba(250,247,242,0.70) 100%), url(${DASH_BG_URL})`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            backgroundAttachment: "fixed"
          }}
        >
          {children}
        </main>
      </div>

      {/* Drawer slide-in keyframe (scoped, no global CSS needed). */}
      <style jsx global>{`
        @keyframes slideIn {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

function Sidebar({
  pathname,
  className = "",
  onNavigate
}: {
  pathname: string;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <aside
      // On desktop the sidebar pins to the viewport (sticky, one screen tall)
      // instead of stretching to the full scrollable page height — it stays
      // the same height no matter how long the page content is. self-start
      // stops the flex row from stretching it.
      className={`dashboard-sidebar w-60 shrink-0 flex-col bg-black/90 md:bg-black/40 md:sticky md:top-0 md:h-screen md:self-start ${className}`}
    >
      <nav className="px-3.5 pt-5">
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
                  onClick={onNavigate}
                  className={`nav-item ${active ? "nav-item-active" : ""}`}
                >
                  <span className="nav-dot" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Spacer pushes the video + footer to the bottom of the sidebar. */}
      <div className="flex-1" />

      {/* Ambient looping video — anchored to the bottom of the sidebar, shown
          in full at the sidebar's width (4:5, no crop). */}
      <div className="px-3.5 pb-3">
        <div className="sidebar-video-wrap w-full aspect-[4/5] overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={SIDEBAR_VIDEO_URL}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <p className="px-5 pb-6 text-[10px] tracking-[0.22em] uppercase nav-foot">
        v1.02 · dashboard
      </p>
    </aside>
  );
}

function TopBar({
  firstName,
  email,
  menuOpen,
  onToggleMenu,
  onSignOut
}: {
  firstName: string;
  email: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-6 md:px-10 py-4 border-b border-white/5 bg-black/60 backdrop-blur">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only. Toggles the drawer. */}
        <button
          type="button"
          onClick={onToggleMenu}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          className="md:hidden -ml-1 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>

        {/* Brand stays inside the dashboard — links to the dashboard home,
            NOT the public landing site. */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="GoogolPlex" className="h-9 w-auto object-contain" />
          <span className="text-xl font-medium tracking-tight hidden sm:inline">GoogolPlex</span>
        </Link>
      </div>
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
