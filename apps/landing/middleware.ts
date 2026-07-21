import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_HOST = "admin.ggakingclub.com";

// Clean top-level URLs served on the admin subdomain. The physical pages live at
// /app/admin/** (under the shared /app auth Gate); these are rewritten onto that
// path so the browser URL stays clean (admin.ggakingclub.com/sessions, etc.).
// The index page (/app/admin, the members table) is exposed as /members.
const ADMIN_SEGMENTS = new Set([
  "overview", "members", "sessions", "withdrawals", "treasury", "reclaims",
  "campaigns", "inbox", "circle", "globe", "audit", "logs", "system",
  "settings", "permissions"
]);

/** Map a clean admin path (/sessions, /members) to its physical route. */
function toPhysical(pathname: string): string {
  if (pathname === "/members") return "/app/admin";
  return "/app/admin" + pathname; // /sessions -> /app/admin/sessions
}

/** Map a physical path (/app/admin, /app/admin/sessions) to its clean URL. */
function toClean(pathname: string): string {
  if (pathname === "/app/admin") return "/members";
  return pathname.slice("/app/admin".length); // /app/admin/sessions -> /sessions
}

/**
 * The operator panel is served ONLY on admin.ggakingclub.com, with clean URLs.
 * The pages physically live at /app/admin/** in this same landing app (so they
 * keep the /app auth Gate + admin role check). This middleware maps between the
 * clean public URL and the physical route, and keeps the panel off the
 * marketing domain.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const isAdminHost = host === ADMIN_HOST || host.startsWith("admin.");
  const { pathname } = req.nextUrl;

  if (isAdminHost) {
    // Never expose the physical /app/admin prefix — redirect it to the clean URL.
    if (pathname === "/app/admin" || pathname.startsWith("/app/admin/")) {
      const url = req.nextUrl.clone();
      url.pathname = toClean(pathname);
      return NextResponse.redirect(url);
    }
    // The member area (/app dashboard) is NOT served on the admin subdomain —
    // only the panel + the auth flow. Bounce it to the panel. /app/setup/* is
    // allowed through so an admin can still complete profile/wallet setup here.
    if (pathname === "/app" || (pathname.startsWith("/app/") && !pathname.startsWith("/app/setup"))) {
      const url = req.nextUrl.clone();
      url.pathname = "/overview";
      return NextResponse.redirect(url);
    }
    // Bare subdomain root opens the overview.
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/overview";
      return NextResponse.redirect(url);
    }
    // Clean admin path -> serve the physical page, URL stays clean.
    const seg = pathname.split("/")[1] ?? "";
    if (ADMIN_SEGMENTS.has(seg)) {
      const url = req.nextUrl.clone();
      url.pathname = toPhysical(pathname);
      return NextResponse.rewrite(url);
    }
    // /login, /app/setup/*, assets, etc. pass through so auth flows work.
    return NextResponse.next();
  }

  // Marketing / member hosts: the panel is not served here. Bounce any admin
  // path to the clean equivalent on the admin subdomain.
  if (pathname === "/app/admin" || pathname.startsWith("/app/admin/")) {
    const url = req.nextUrl.clone();
    url.hostname = ADMIN_HOST;
    url.port = "";
    url.protocol = "https:";
    url.pathname = toClean(pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on page routes only (skip _next internals + files with an extension).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"]
};
