"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";

const LANDING_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3010";

const SIDEBAR_VIDEO_URL =
  process.env.NEXT_PUBLIC_SIDEBAR_VIDEO_URL ||
  "https://ggakingclub.com/media/final.mp4";

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
const LogoutIcon = (p: IconProps) => (
  <S {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h12" /></S>
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
 * Outer shell for apps/web.
 *
 * Full-height liquid-glass sidebar (logo → nav → ambient loop → account row)
 * over the Celestial-Lion starfield. No top bar — the user block + sign out
 * live at the foot of the sidebar. Mobile: the sidebar is a drawer toggled by a
 * floating glass hamburger.
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

  const onSignOut = async () => {
    await signOut();
    router.refresh();
  };

  return (
    <div
      className="cosmic min-h-screen w-full"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(7,8,20,0.74) 0%, rgba(7,8,20,0.5) 28%, rgba(7,8,20,0.48) 62%, rgba(7,8,20,0.72) 100%), url(${DASH_BG_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundAttachment: "fixed",
        backgroundColor: "#0a0b1a"
      }}
    >
      {/* Full-height sidebar — desktop */}
      <Sidebar
        pathname={pathname}
        firstName={user?.firstName ?? ""}
        email={user?.email ?? ""}
        onSignOut={onSignOut}
        className="hidden md:flex fixed inset-y-3 left-3 w-60 z-40"
      />

      {/* Mobile: floating glass hamburger */}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        className="md:hidden fixed top-4 left-4 z-30 liquid-glass rounded-2xl p-2.5 text-white/80"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile drawer + backdrop */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <Sidebar
            pathname={pathname}
            firstName={user?.firstName ?? ""}
            email={user?.email ?? ""}
            onSignOut={onSignOut}
            onNavigate={() => setMenuOpen(false)}
            showClose
            onClose={() => setMenuOpen(false)}
            className="fixed inset-y-3 left-3 w-60 z-50 flex md:hidden animate-[navIn_0.18s_ease-out]"
          />
        </>
      )}

      {/* Content — shifted right on desktop to clear the sidebar. */}
      <div className="md:pl-[16.25rem]">
        <main className="min-h-screen px-6 md:px-10 pt-20 md:pt-10 pb-10">
          {children}
        </main>
      </div>

      <style jsx global>{`
        @keyframes navIn {
          from {
            transform: translateX(-110%);
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
  firstName,
  email,
  onSignOut,
  className = "",
  onNavigate,
  showClose,
  onClose
}: {
  pathname: string;
  firstName: string;
  email: string;
  onSignOut: () => void;
  className?: string;
  onNavigate?: () => void;
  showClose?: boolean;
  onClose?: () => void;
}) {
  const initial = (firstName || "G").charAt(0).toUpperCase();
  const [acctOpen, setAcctOpen] = useState(false);
  return (
    <aside className={className}>
      <div className="liquid-glass rounded-[28px] p-3 flex flex-col w-full h-full">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="GoogolPlex" className="h-8 w-8 object-contain rounded-full" />
            <span className="font-medium tracking-tight text-[15px]">GoogolPlex</span>
          </Link>
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="ml-auto p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="mt-2 flex flex-col gap-1 overflow-y-auto">
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
        </nav>

        {/* Spacer pushes the loop + account row to the bottom. */}
        <div className="flex-1 min-h-4" />

        {/* Ambient brand loop */}
        <div className="px-1.5">
          <div className="w-full aspect-[5/3] overflow-hidden rounded-2xl ring-1 ring-white/10">
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

        {/* Account row — replaces the old top bar. Click to open a dropdown. */}
        <div className="mt-3 pt-3 border-t border-white/10 relative">
          {acctOpen && (
            <>
              {/* click-outside catcher */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAcctOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute bottom-full left-0 right-0 mb-2 z-50 liquid-glass rounded-2xl p-1.5">
                <Link
                  href="/settings"
                  onClick={() => {
                    setAcctOpen(false);
                    onNavigate?.();
                  }}
                  className="acct-item"
                >
                  <GearIcon /> Settings
                </Link>
                <Link
                  href="/account/security"
                  onClick={() => {
                    setAcctOpen(false);
                    onNavigate?.();
                  }}
                  className="acct-item"
                >
                  <ShieldIcon /> Security
                </Link>
                <div className="my-1 mx-2 h-px bg-white/10" />
                <button
                  type="button"
                  onClick={onSignOut}
                  className="acct-item w-full text-left"
                >
                  <LogoutIcon /> Sign out
                </button>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => setAcctOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={acctOpen}
            className="w-full flex items-center gap-3 px-1.5 py-1.5 rounded-2xl hover:bg-white/5 transition-colors"
          >
            <div
              className="h-9 w-9 rounded-full grid place-items-center text-sm font-semibold shrink-0"
              style={{ background: "linear-gradient(160deg,#8A68FF,#5A3CC8)", color: "#fff" }}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium truncate">{firstName || "friend"}</p>
              <p className="text-white/45 text-xs truncate">{email}</p>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 text-white/50 transition-transform ${acctOpen ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
