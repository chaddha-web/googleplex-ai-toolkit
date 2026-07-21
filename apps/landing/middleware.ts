import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_HOST = "admin.ggakingclub.com";

/**
 * The real operator panel lives in this landing app at /app/admin, but it must
 * only be reachable via admin.ggakingclub.com — never the marketing domain.
 *
 * - On the admin subdomain: the bare root opens the panel (/app/admin/overview);
 *   /login and /app/** pass through so the normal auth flow works on this origin.
 * - On any other host: /app/admin/** is redirected onto the admin subdomain
 *   (path + query preserved), so ggakingclub.com/app/admin/* can't serve it.
 *
 * Authentication itself is enforced by the /app Gate + the admin role check;
 * this middleware only controls WHICH host the panel is served on.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const isAdminHost = host === ADMIN_HOST || host.startsWith("admin.");
  const { pathname } = req.nextUrl;

  if (isAdminHost) {
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/app/admin/overview";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Non-admin host: bounce any admin path to the admin subdomain.
  if (pathname === "/app/admin" || pathname.startsWith("/app/admin/")) {
    const url = req.nextUrl.clone();
    url.hostname = ADMIN_HOST;
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/app/admin", "/app/admin/:path*"]
};
