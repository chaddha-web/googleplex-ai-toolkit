"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";

const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3010";

// Ambient loop — served from the nginx media server (not bundled).
const SIDEBAR_VIDEO_URL =
  process.env.NEXT_PUBLIC_SIDEBAR_VIDEO_URL ||
  "https://ggakingclub.com/media/final.mp4";

// Celestial-lion cosmos behind the whole dashboard.
const DASH_BG_URL =
  process.env.NEXT_PUBLIC_DASH_BG_URL ||
  "https://ggakingclub.com/media/celestial-lion.jpg";

// ── Nav icons (compact, currentColor) ───────────────────────────────────────
type IconProps = { className?: string };
const S = (p: IconProps & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={p.className}
    width="18"
    height="18"
  >
    {p.children}
  </svg>
);
const HomeIcon = (p: IconProps) => (
  <S {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></S>
);
const WalletIcon = (p: IconProps) => (
  <S {...p}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1.2" /></S>
);
const UsersIcon = (p: IconProps) => (
  <S {...p}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.5" /><path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" /></S>
);
const StudioIcon = (p: IconProps) => (
  <S {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><path d="M12 8.5 13.4 11 16 12l-2.6 1L12 15.5 10.6 13 8 12l2.6-1z" /></S>
);
const ShieldIcon = (p: IconProps) => (
  <S {...p}><path d="M12 3l7 3v5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6z" /><path d="m9 12 2 2 4-4" /></S>
);
const GearIcon = (p: IconProps) => (
  <S {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></S>
);

const NAV_ITEMS: { href: string; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/wallet", label: "Wallet", Icon: WalletIcon },
  { href: "/community", label: "Community", Icon: UsersIcon },
  { href: "/studio", label: "Studio", Icon: StudioIcon },
  { href: "/account/security", label: "Security", Icon: ShieldIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon }
];

/**
 * Outer shell used by every page in apps/web.
 *
 * The whole dashboard is liquid glass over the Celestial-Lion starfield (the
 * `.cosmic` scope flips the app to its dark-native design). Navigation is a
 * floating glass capsule pinned to the vertical middle of the left; content
 * flows full-bleed behind it. On mobile the capsule becomes a drawer toggled
 * by a glass hamburger.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (status === "anonymous") {
      window.location.href = `${LANDING_URL}/login`;
      return;
    }
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
  if (user?.role === "admin") return null;

  return (
    <div
      className="cosmic min-h-screen w-full"
      style={{
        // Starfield behind the ENTIRE app (fixed). Gentle dark scrim for depth
        // + legibility; the glass UI floats over it.
        backgroundImage: `linear-gradient(180deg, rgba(7,8,20,0.74) 0%, rgba(7,8,20,0.5) 28%, rgba(7,8,20,0.48) 62%, rgba(7,8,20,0.72) 100%), url(${DASH_BG_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundAttachment: "fixed",
        backgroundColor: "#0a0b1a"
      }}
    >
      {/* Floating glass nav — desktop, vertically centered on the left. */}
      <FloatingNav
        pathname={pathname}
        className="hidden md:block fixed left-5 top-1/2 -translate-y-1/2 z-40"
      />

      {/* Mobile drawer + backdrop */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <FloatingNav
            pathname={pathname}
            onNavigate={() => setMenuOpen(false)}
            className="fixed left-4 top-1/2 -translate-y-1/2 z-50 md:hidden animate-[navIn_0.18s_ease-out]"
          />
        </>
      )}

      {/* Content column — shifted right on desktop to clear the floating nav. */}
      <div className="flex flex-col min-h-screen md:pl-[16.5rem]">
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
        <main className="flex-1 px-6 md:px-10 py-10">{children}</main>
      </div>

      <style jsx global>{`
        @keyframes navIn {
          from {
            transform: translate(-110%, -50%);
          }
          to {
            transform: translate(0, -50%);
          }
        }
      `}</style>
    </div>
  );
}

function FloatingNav({
  pathname,
  className = "",
  onNavigate
}: {
  pathname: string;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className={className}>
      <div className="liquid-glass rounded-[30px] p-3 w-56 flex flex-col gap-1">
        {/* Brand */}
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-2.5 py-2 mb-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="GoogolPlex"
            className="h-8 w-8 object-contain rounded-full"
          />
          <span className="font-medium tracking-tight text-[15px]">GoogolPlex</span>
        </Link>

        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`nav-pill ${active ? "nav-pill-active" : ""}`}
            >
              <span className="nav-pill-icon">
                <Icon />
              </span>
              {label}
            </Link>
          );
        })}

        {/* Ambient brand loop — small rounded tile at the capsule foot. */}
        <div className="px-1.5 pt-2">
          <div className="w-full aspect-square overflow-hidden rounded-2xl ring-1 ring-white/10">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={SIDEBAR_VIDEO_URL}
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          </div>
        </div>
        <p className="px-3 pt-1.5 pb-0.5 text-[10px] tracking-[0.22em] uppercase nav-foot">
          v1.02 · dashboard
        </p>
      </div>
    </nav>
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
    <header className="sticky top-0 z-20 flex items-center gap-4 px-6 md:px-10 py-4 border-b border-white/5 bg-black/60 backdrop-blur">
      {/* Hamburger — mobile only. Toggles the floating nav drawer. */}
      <button
        type="button"
        onClick={onToggleMenu}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        className="md:hidden -ml-1 p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
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

      <div className="ml-auto flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-white text-sm leading-tight">{firstName || "friend"}</p>
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
