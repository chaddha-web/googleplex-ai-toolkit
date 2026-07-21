import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * On the admin subdomain (admin.ggakingclub.com), the real operator panel lives
 * at /app/admin (same landing app, same auth session — the /app Gate + admin
 * role check enforce authentication). We only rewrite the root so the bare
 * subdomain lands on the panel; /login and /app/** pass through untouched so the
 * normal auth flow works on this origin.
 *
 * The matcher restricts this middleware to "/" alone, so assets, API, and every
 * other route are never touched (and there's no redirect loop).
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const isAdminHost = host === "admin.ggakingclub.com" || host.startsWith("admin.");
  if (isAdminHost) {
    const url = req.nextUrl.clone();
    url.pathname = "/app/admin/overview";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"]
};
