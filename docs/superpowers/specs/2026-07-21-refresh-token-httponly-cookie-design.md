# Design — Refresh token in an httpOnly cookie (cross-subdomain session)

Date: 2026-07-21
Status: SHIPPED (commit d19cd4b, deployed + verified live 2026-07-21)

## Problem

The refresh token — the long-lived secret that keeps a member signed in — is
stored in **localStorage** (`gplex.refresh`). Two consequences:

1. **XSS-readable.** Any successful script injection can read a 7-day refresh
   token straight off disk. The access token is already in-memory only, so the
   refresh token is the remaining persistent-secret exposure.
2. **Not shared across subdomains.** localStorage is per-origin, so a session
   created on `admin.ggakingclub.com` or `app.ggakingclub.com` is invisible to
   `ggakingclub.com`. The marketing header's `SmartCta` therefore shows
   "Get Started" even when the user is logged in on another subdomain.

## Goal

Move the refresh token from localStorage into an **httpOnly, Secure, SameSite=Lax
cookie** scoped to the auth service host, so it is unreadable by JavaScript and
automatically shared with every `*.ggakingclub.com` frontend. Access token
handling is unchanged (in-memory, `Authorization: Bearer`).

## Decisions (locked)

- **Refresh token only** moves to a cookie. Access token stays in JS memory.
- **Force re-login** at cutover — clients stop reading localStorage; the ~14
  existing sessions sign in once more via email OTP. No bridge code.

## Cookie contract

Set by the auth service on login/signup verify and on every refresh rotation:

```
Set-Cookie: gplex_rt=<opaque-refresh-token>;
            HttpOnly; Secure; SameSite=Lax;
            Domain=auth.ggakingclub.com; Path=/auth; Max-Age=604800
```

- **Host-scoped to `auth.ggakingclub.com`.** Cookies attach based on the request
  *destination*, so any frontend origin that calls the auth service with
  `credentials:'include'` sends it — cross-subdomain SSO with no token in the URL.
- **`SameSite=Lax`.** All origins share the registrable domain `ggakingclub.com`,
  i.e. same-site; Lax cookies ride those requests but are blocked cross-site.
  This removes the CSRF surface without CSRF tokens. (A forced cross-site refresh
  leaks nothing: the response is CORS-protected, the new access token unreadable
  to a foreign origin.)
- **`Path=/auth`.** Only sent to `/auth/*` endpoints.
- **`Max-Age`** = `REFRESH_TOKEN_TTL` (currently 7 days). Re-set on each rotation
  (sliding window, matches current behavior).
- Logout clears it: same attributes, `Max-Age=0`, empty value.
- Local/dev (non-HTTPS, non-ggakingclub host): omit `Secure` + `Domain` so the
  cookie still works on `localhost`. Gate on an env flag (e.g. `COOKIE_DOMAIN`
  unset → host-only, no Secure).

## Server changes — `services/auth`

Add a small cookie helper (`setRefreshCookie(reply, token)`, `clearRefreshCookie(reply)`,
`readRefreshCookie(req)`), implemented by writing/parsing the `Set-Cookie`/`Cookie`
headers directly (no new dependency).

- **`routes/otp.ts`** (verify — login + signup success): call `setRefreshCookie`;
  keep returning `accessToken`, `accessTokenExpiresIn`, `sessionId` in JSON. Stop
  relying on the client persisting the refresh token from the body (the field may
  remain in the response transitionally but clients ignore it).
- **`routes/auth.ts`**
  - `/auth/refresh`: read the token via `readRefreshCookie(req)` instead of the
    body. On success rotate, `setRefreshCookie` with the new token, return the new
    access token in JSON. On missing/invalid cookie → 401.
  - `/auth/logout`: read the cookie, revoke that refresh, `clearRefreshCookie`.
- **`server.ts` CORS**: confirm `credentials: true` and that the allowed origin is
  reflected as the specific requesting origin (never `*` with credentials) for all
  `*.ggakingclub.com` frontends. (The regex allow-list already matches; verify the
  credentials flag is set on the auth service, not only wallet.)

No change to wallet↔auth calls: those use the access token / internal token, not
the refresh cookie.

## Client changes — `apps/landing` and `apps/web`

Both apps share the same pattern (each has its own auth client).

- Remove the refresh token from localStorage: delete `persistRefresh` / `loadRefresh`
  writes and the `REFRESH_KEY` storage. On load, proactively delete any stale
  `gplex.refresh` key (one-time cleanup for migrated users).
- All auth fetches (`verifyOtp`, `/auth/refresh`, `/auth/logout`, `tryRestore`,
  `bootstrapFromRefresh`, `refreshOnce`) pass `credentials: 'include'` and send no
  refresh token in the body.
- `refreshOnce` / `tryRestore`: POST `/auth/refresh` with credentials; a 200 means
  the cookie was valid → store the returned access token in memory; 401 → signed
  out.
- **Cross-subdomain handoff cleanup:** `webHandoffUrl` / `adminHandoffUrl` become
  plain redirects to the destination subdomain (no `#h=` token). Delete
  `HashReceiver` and its mount in the root layout, and the hash-parsing restore
  path in the clients. The destination bootstraps via the shared cookie.
- `SmartCta` needs no logic change — once `tryRestore` uses the cookie it resolves
  the real session on every subdomain, including the marketing homepage, and
  renders "Open dashboard →" / "Open admin →" as appropriate.

## Migration

At deploy, clients no longer read localStorage, so existing sessions are dropped:
the in-memory access token expires within 15 min, `refreshOnce` finds no cookie
(none set yet) → 401 → login. Each of the ~14 users signs in once via OTP, which
sets the cookie. Stale `gplex.refresh` localStorage keys are deleted on next load.

## Testing / verification

- `npx tsc --noEmit` + `npx next build` for both `apps/landing` and `apps/web`.
- `curl -i` the deployed auth service to assert `Set-Cookie` attributes
  (`HttpOnly; Secure; SameSite=Lax; Domain=auth.ggakingclub.com; Path=/auth`) on a
  verify + refresh, and `Max-Age=0` on logout. (Full OTP login is verified in the
  browser by the owner.)
- Owner browser check: log in on `admin.ggakingclub.com`; confirm `ggakingclub.com`
  header shows "Open admin →" and `app.ggakingclub.com` loads the dashboard without
  a second login; confirm no `gplex.refresh` in localStorage and `gplex_rt` present
  as httpOnly in devtools; confirm logout clears it.

## Out of scope

- Moving the **access** token to a cookie (kept in-memory Bearer by decision).
- CSRF tokens (SameSite=Lax + same-site architecture covers it).
- Any change to the wallet password / wallet-OTP flow.
- Refresh TTL (unchanged at 7 days).
