"use client";

/**
 * AdminShell — the unified admin chrome: a persistent grouped sidebar (filtered
 * by the admin's capabilities), a breadcrumb top bar, a ⌘K command palette, and
 * a responsive mobile drawer. Every admin page renders inside it.
 *
 * Phase 0: pages opt in explicitly (<AdminShell title="…">…</AdminShell>). Once
 * every page is migrated (Phase 1) this moves into app/app/admin/layout.tsx and
 * pages just render their content.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useAuth } from "@/components/auth-context";
import { cn } from "@/lib/cn";
import {
  AdminAccessProvider,
  useAdminAccess,
  can,
  type AdminAccess
} from "@/components/admin/access";
import { listAllUsers, type AdminUserRow } from "@/lib/auth-client";
import type { Capability, User } from "@/lib/auth-client";
import { TelegramPrompt } from "@/components/admin/telegram-prompt";

// ── Icons (inline, currentColor, stroke) ─────────────────────────────────────

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.75 12 3l9 7.75M5.5 9.5V21h13V9.5M10 21v-6h4v6" />,
  users: (
    <>
      <path d="M12 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
      <path d="M5.5 20c0-3.3 2.9-5 6.5-5s6.5 1.7 6.5 5" />
    </>
  ),
  activity: <path d="M3 12h4l2.5 7 5-14 2.5 7h4" />,
  download: <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />,
  rotate: <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" />,
  mail: <path d="M4 6h16v12H4zM4 7l8 6 8-6" />,
  inbox: (
    <path d="M4 13.5h4l1.5 2.5h5l1.5-2.5h4M5.5 5.5h13l1.5 8v3.5A1.5 1.5 0 0 1 18.5 18.5h-13A1.5 1.5 0 0 1 4 17v-3.5z" />
  ),
  message: (
    <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 15H9l-4.5 4z" />
  ),
  globe: (
    <>
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18" />
    </>
  ),
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />,
  settings: (
    <>
      <path d="M4 7h3M11 7h9M4 12h9M17 12h3M4 17h2M10 17h10" />
      <path d="M9 7a2 2 0 1 0 0-.01M15 12a2 2 0 1 0 0-.01M8 17a2 2 0 1 0 0-.01" />
    </>
  ),
  shield: <path d="M12 3l7 2.5v6c0 4.5-3 6.8-7 8.5-4-1.7-7-4-7-8.5v-6z" />,
  bank: (
    <>
      <path d="M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10" />
      <path d="M12 3l8 4.5H4z" />
    </>
  ),
  flask: (
    <>
      <path d="M10 3h4M10.5 3v6.2L5.2 18a1.6 1.6 0 0 0 1.4 2.4h10.8A1.6 1.6 0 0 0 18.8 18l-5.3-8.8V3" />
      <path d="M8 15h8" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8.3 8.3a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0L3.8 11.9a1 1 0 0 1-.3-.7Z" />
      <path d="M7.8 8.3a.6.6 0 1 0 0-.01" />
    </>
  ),
  play: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
      <path d="M10.5 9.2l4.3 2.8-4.3 2.8z" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.9-.7-1.5-.7-2.3 0-.8.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5Z" />
      <path d="M7.5 12a.7.7 0 1 0 0-.01M10 8.2a.7.7 0 1 0 0-.01M14.5 8.2a.7.7 0 1 0 0-.01" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.5 1.8 6.2.3.4 0 1-.5 1H4.7c-.5 0-.8-.6-.5-1C4.8 14.5 6 13 6 9Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  logout: <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" />
};

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-[18px] w-[18px] shrink-0", className)}
      aria-hidden="true"
    >
      {ICONS[name] ?? null}
    </svg>
  );
}

// ── Navigation model ─────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: string;
  cap?: Capability;
  founder?: boolean;
  external?: boolean;
};
type NavGroup = { label?: string; items: NavItem[] };

// Clean URLs — the panel is served on admin.ggakingclub.com and middleware maps
// these to the physical /app/admin/** routes. The members table (physical
// /app/admin index) is exposed as /members.
const NAV: NavGroup[] = [
  { items: [{ label: "Overview", href: "/overview", icon: "home" }] },
  {
    label: "People",
    items: [
      { label: "Members", href: "/members", icon: "users" },
      { label: "Sessions", href: "/sessions", icon: "activity" }
    ]
  },
  {
    label: "Money",
    items: [
      { label: "Sales", href: "/sales", icon: "tag" },
      { label: "Withdrawals", href: "/withdrawals", icon: "download", cap: "withdrawals" },
      { label: "Treasury", href: "/treasury", icon: "bank" },
      { label: "Token reclaims", href: "/reclaims", icon: "rotate" }
    ]
  },
  {
    label: "Comms",
    items: [
      { label: "Email campaigns", href: "/campaigns", icon: "mail" },
      { label: "Inbox", href: "/inbox", icon: "inbox" }
    ]
  },
  {
    label: "Community",
    items: [
      { label: "Circle", href: "/circle", icon: "message" },
      { label: "Live globe", href: "/globe", icon: "globe" },
      { label: "Orientation", href: "/orientation", icon: "play", cap: "settings" },
      { label: "Theme", href: "/theme", icon: "palette", cap: "settings" }
    ]
  },
  {
    label: "System",
    items: [
      { label: "Audit log", href: "/audit", icon: "file", cap: "settings" },
      { label: "Logs", href: "/logs", icon: "activity" },
      { label: "System health", href: "/system", icon: "activity" },
      { label: "Demo accounts", href: "/demo", icon: "flask", founder: true },
      { label: "Settings", href: "/settings", icon: "settings", cap: "settings" },
      { label: "Admin access", href: "/permissions", icon: "shield", founder: true },
      // Every admin manages their own alerts — no capability gate.
      { label: "Alerts", href: "/alerts", icon: "bell" }
    ]
  }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/members") return pathname === "/members";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Breadcrumb title derived from the active nav item (used when a page doesn't
 *  pass its own title, i.e. when the shell runs as the /app/admin layout). */
function titleForPath(pathname: string): string {
  for (const g of NAV) {
    for (const i of g.items) {
      if (isActive(pathname, i.href)) return i.label;
    }
  }
  return "Admin";
}

function visibleGroups(access: AdminAccess): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => can(access, i.cap, i.founder))
  })).filter((g) => g.items.length > 0);
}

// ── Sidebar body (shared by desktop rail + mobile drawer) ─────────────────────

function SidebarBody({
  groups,
  pathname,
  onNavigate,
  userLabel,
  roleLabel,
  onSignOut
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
  userLabel: string;
  roleLabel: string;
  onSignOut: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <Link href="/overview" onClick={onNavigate} className="flex items-center gap-2.5 px-2 pb-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="GoogolPlex" className="h-6 w-auto object-contain" />
        <span className="font-semibold tracking-tight">GoogolPlex</span>
        <span className="ml-auto text-[9px] tracking-[0.25em] uppercase text-white/30 border border-white/10 rounded px-1.5 py-0.5">
          Admin
        </span>
      </Link>
      <div className="flex items-center gap-1.5 px-2 mt-2 text-[11px] text-emerald-300/80">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Mainnet
      </div>

      <nav className="flex-1 overflow-y-auto mt-4 -mx-1 px-1">
        {groups.map((g, gi) => (
          <div key={g.label ?? gi} className={gi === 0 ? "" : "mt-4"}>
            {g.label && (
              <p className="px-2 pb-1.5 text-[10px] tracking-[0.2em] uppercase text-white/30">{g.label}</p>
            )}
            {g.items.map((item) => {
              const active = isActive(pathname, item.href);
              const cls = cn(
                "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                active ? "bg-white/[0.08] text-white" : "text-white/55 hover:text-white hover:bg-white/[0.04]",
                item.founder && !active && "text-amber-200/80 hover:text-amber-100"
              );
              const inner = (
                <>
                  {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-white" />}
                  <Icon name={item.icon} className={active ? "opacity-100" : "opacity-70"} />
                  <span className="truncate">{item.label}</span>
                </>
              );
              if (item.external) {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={onNavigate}
                    className={cls}
                  >
                    {inner}
                  </a>
                );
              }
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 mt-3 pt-3 border-t border-white/[0.07] flex items-center gap-2.5 px-2">
        <div className="h-7 w-7 rounded-full bg-white/12 flex items-center justify-center text-[11px] shrink-0">
          {userLabel.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-[13px] truncate">{userLabel}</div>
          <div className={cn("text-[10.5px]", roleLabel === "Founder" ? "text-amber-300/80" : "text-white/40")}>
            {roleLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          title="Sign out"
          className="ml-auto text-white/30 hover:text-white shrink-0"
        >
          <Icon name="logout" />
        </button>
      </div>
    </div>
  );
}

// ── Command palette (⌘K) ──────────────────────────────────────────────────────

function CommandPalette({
  open,
  onClose,
  items
}: {
  open: boolean;
  onClose: () => void;
  items: { label: string; href: string; group?: string }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<AdminUserRow[] | null>(null);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  // Lazily load members the first time the palette opens (for jump-to-member).
  useEffect(() => {
    if (open && members === null) {
      listAllUsers()
        .then((r) => setMembers(r.users))
        .catch(() => setMembers([]));
    }
  }, [open, members]);
  if (!open) return null;
  const query = q.trim().toLowerCase();
  const filtered = items.filter((i) => i.label.toLowerCase().includes(query));
  const memberHits =
    query.length >= 2 && members
      ? members
          .filter((m) =>
            [m.code11, m.email, m.firstName, m.lastName, `${m.firstName} ${m.lastName}`].some((f) =>
              (f ?? "").toLowerCase().includes(query)
            )
          )
          .slice(0, 6)
      : [];
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const gotoMember = (code: string) => go(`/members?q=${encodeURIComponent(code)}`);
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 flex items-start justify-center px-4 pt-[14vh]"
      onClick={onClose}
    >
      <div className="liquid-glass rounded-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (memberHits[0]) gotoMember(memberHits[0].code11);
              else if (filtered[0]) go(filtered[0].href);
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Jump to a section or member…"
          className="w-full bg-transparent px-4 py-3.5 text-sm text-white outline-none border-b border-white/10 placeholder:text-white/30"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.map((i) => (
            <button
              key={i.href}
              type="button"
              onClick={() => go(i.href)}
              className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white flex items-center justify-between"
            >
              <span>{i.label}</span>
              {i.group && <span className="text-white/25 text-[11px]">{i.group}</span>}
            </button>
          ))}
          {memberHits.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-[10px] tracking-[0.2em] uppercase text-white/30">Members</p>
              {memberHits.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => gotoMember(m.code11)}
                  className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white flex items-center justify-between gap-3"
                >
                  <span className="truncate">
                    {m.firstName} {m.lastName} <span className="text-white/40">{m.email}</span>
                  </span>
                  <span className="font-mono text-white/30 text-[11px] shrink-0">{m.code11}</span>
                </button>
              ))}
            </>
          )}
          {filtered.length === 0 && memberHits.length === 0 && (
            <p className="px-4 py-6 text-center text-white/30 text-sm">
              {query.length >= 2 && members === null ? "Loading members…" : "No matches"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function ShellInner({
  title: explicitTitle,
  preview,
  children
}: {
  title?: string;
  preview?: PreviewAs;
  children: ReactNode;
}) {
  const auth = useAuth();
  const isPreview = !!preview;
  const status = auth.status;
  const user: User | null = isPreview
    ? ({ firstName: preview?.name ?? "Preview", lastName: "", email: "preview@local", role: "admin" } as User)
    : auth.user;
  const signOut = isPreview ? async () => {} : auth.signOut;
  const access = useAdminAccess();
  const router = useRouter();
  const pathname = usePathname();
  const title = explicitTitle ?? titleForPath(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Role guard — anyone who isn't an admin is bounced to the member app.
  useEffect(() => {
    if (isPreview) return;
    if (status !== "loading" && (!user || user.role !== "admin")) router.replace("/app");
  }, [isPreview, status, user, router]);

  // ⌘K / Ctrl+K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => visibleGroups(access), [access]);
  const paletteItems = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href, group: g.label }))),
    [groups]
  );

  if (!isPreview && (!user || user.role !== "admin")) return null;

  const userLabel = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : "Admin";
  const roleLabel = access.isFounder ? "Founder" : "Admin";

  return (
    <div className="min-h-screen bg-black text-white font-sans flex">
      <aside className="hidden lg:flex flex-col w-[240px] shrink-0 border-r border-white/[0.06] px-3 py-5 sticky top-0 h-screen">
        <SidebarBody
          groups={groups}
          pathname={pathname}
          userLabel={userLabel}
          roleLabel={roleLabel}
          onSignOut={signOut}
        />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 border-b border-white/[0.06] flex items-center gap-3 px-4 sticky top-0 bg-black/80 backdrop-blur z-30">
          <button
            type="button"
            className="lg:hidden text-white/60 hover:text-white"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Link href="/overview" className="text-white/40 hover:text-white">Admin</Link>
            <span className="text-white/20">/</span>
            <span className="truncate">{title}</span>
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-white/40 hover:text-white/70 hover:border-white/20 text-xs"
          >
            <Icon name="search" className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
            <span className="hidden sm:inline font-mono text-[10px] border border-white/12 rounded px-1 py-px">⌘K</span>
          </button>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 w-full max-w-[1400px] mx-auto">
          <TelegramPrompt />
          {children}
        </main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside
            className="absolute left-0 top-0 h-full w-[260px] bg-black border-r border-white/10 px-3 py-5"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarBody
              groups={groups}
              pathname={pathname}
              userLabel={userLabel}
              roleLabel={roleLabel}
              onSignOut={signOut}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
    </div>
  );
}

export type PreviewAs = { name?: string; founder?: boolean; perms?: Capability[] };

export function AdminShell({
  title,
  previewAs,
  children
}: {
  title?: string;
  /** DEV-ONLY: render with an injected identity, bypassing the auth guard + the
   *  settings fetch. Used by the /app/admin/preview route (404s in production). */
  previewAs?: PreviewAs;
  children: ReactNode;
}) {
  const override = previewAs
    ? { ready: true, isFounder: !!previewAs.founder, perms: previewAs.perms ?? [] }
    : undefined;
  return (
    <AdminAccessProvider override={override}>
      <ShellInner title={title} preview={previewAs}>
        {children}
      </ShellInner>
    </AdminAccessProvider>
  );
}
