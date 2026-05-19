/**
 * Client for the central GoogolPlex auth backend (services/auth).
 *
 * - Access token lives in memory only (XSS surface stays tiny — short TTL, no
 *   localStorage exposure).
 * - Refresh token lives in a localStorage entry. Not perfect, but the trade-off
 *   for a fully-static landing deployed on Vercel where we can't set httpOnly
 *   cookies from a third-party origin. When we move to a same-origin proxy on
 *   Lightsail we'll switch to httpOnly cookies.
 * - On 401 from any protected call, we transparently attempt one refresh +
 *   retry. If refresh fails too, we surface the original 401 and the caller
 *   redirects to /login.
 *
 * All calls go through fetchWithRetry so transient network failures don't kill
 * a sign-in. Idempotency keys piggy-back on the existing helper.
 */

import { fetchWithRetry, newIdempotencyKey } from "@/lib/fetch-retry";

export const AUTH_BASE = (
  process.env.NEXT_PUBLIC_AUTH_BASE || "http://localhost:4200"
).replace(/\/$/, "");

export const WEB_URL = (
  process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000"
).replace(/\/$/, "");

/**
 * Build a URL that hands the current refresh token to apps/web via a
 * `#h=<token>` hash. apps/web's HashReceiver picks it up, persists into
 * its own localStorage, then strips the hash so it never lingers.
 */
export function webHandoffUrl(path: string = "/"): string {
  const refresh = loadRefresh();
  const base = `${WEB_URL}${path.startsWith("/") ? path : "/" + path}`;
  if (!refresh) return base;
  return `${base}#h=${encodeURIComponent(refresh)}`;
}

export type Role = "user" | "admin";
export type WalletStatus =
  | "pending_password"
  | "pending_initial_deposit"
  | "active"
  | "locked";

export type User = {
  id: string;
  email: string;
  code11: string;
  firstName: string;
  lastName: string;
  role: Role;
  /** Profile fields collected on first signup. Null until /auth/profile is POSTed. */
  age?: number | null;
  country?: string | null;
  gender?: string | null;
  consentedTermsAt?: number | null;
  consentedPrivacyAt?: number | null;
  notificationsOptIn?: boolean;
  /** Timestamp the onboarding form was completed. Null = redirect to /app/setup/profile. */
  profileCompletedAt?: number | null;
  /** Onboarding gate. If undefined (older backend), treat as 'active'. */
  walletStatus?: WalletStatus;
  /** Cumulative USD credited toward the $1 activation threshold. */
  initialDepositCreditedUsd?: number;
  createdAt?: number;
};

const WALLET_SKIP_KEY = "gplex.skip_wallet_setup_seen";

/** Returns the URL the user should be on given their onboarding state, or null when fully onboarded. */
export function nextOnboardingPath(user: User | null): string | null {
  if (!user) return null;
  // 1. Profile data first — needed before anything else.
  if (!user.profileCompletedAt) return "/app/setup/profile";
  // 2. Wallet choice — only force the user through it once. If they tap
  //    "I'll do it later" we set the skip flag, and from then on they can
  //    use the dashboard freely; the wallet-not-active banner nudges them.
  const skipped =
    typeof window !== "undefined" && localStorage.getItem(WALLET_SKIP_KEY) === "1";
  if (user.walletStatus === "pending_password" && !skipped) {
    return "/app/setup/wallet";
  }
  // 3. Once the password is set, the user can browse normally. The
  //    deposit page is opt-in (banner click), not forced.
  return null;
}

type Tokens = {
  accessToken: string;
  /** ms epoch when the access token expires (server-issued ttl + now). */
  accessExpiresAt: number;
  refreshToken: string;
};

const REFRESH_KEY = "gplex.refresh";

// ────────────────────────────────────────────────────────────────────────────
// In-memory access token + listeners for cross-component refresh
// ────────────────────────────────────────────────────────────────────────────

let memTokens: Tokens | null = null;
type Listener = (user: User | null) => void;
const listeners = new Set<Listener>();

function emit(user: User | null) {
  for (const l of listeners) l(user);
}

export function subscribeAuth(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persistRefresh(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

function loadRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function requestOtp(opts: {
  email: string;
  mode: "signup" | "login";
  firstName?: string;
  lastName?: string;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; replayed?: boolean }> {
  const res = await fetchWithRetry(
    `${AUTH_BASE}/auth/otp/request`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": opts.idempotencyKey || newIdempotencyKey()
      },
      body: JSON.stringify({
        email: opts.email,
        mode: opts.mode,
        firstName: opts.firstName,
        lastName: opts.lastName
      })
    },
    { retries: 3, baseDelayMs: 500 }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not send the code.");
  return data;
}

export async function verifyOtp(opts: {
  email: string;
  code: string;
}): Promise<User> {
  const res = await fetchWithRetry(
    `${AUTH_BASE}/auth/otp/verify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: opts.email, code: opts.code })
    },
    { retries: 2, baseDelayMs: 400 }
  );
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Could not verify the code.");
    (err as Error & { attemptsLeft?: number }).attemptsLeft = data.attemptsLeft;
    throw err;
  }
  acceptTokens(data);
  emit(data.user);
  return data.user as User;
}

// Single-flight guard for tryRestore. React 18 StrictMode double-mounts
// every effect in dev, which would otherwise fire two parallel refresh
// calls — the first rotates the token, the second 401s on the now-revoked
// token and wipes the session. Sharing one in-flight promise eliminates
// the race in dev and in any future caller that fires concurrently.
let restoreInFlight: Promise<User | null> | null = null;

/** Try to silently restore a session from the stored refresh token. */
export async function tryRestore(): Promise<User | null> {
  // If we already have a live access token in memory (e.g. signup just
  // finished + router pushed us into /app), skip the refresh entirely and
  // just hydrate /auth/me. Saves one rotation and dodges the dev race.
  if (memTokens && memTokens.accessExpiresAt > Date.now() + 5_000) {
    const me = await fetchMe();
    if (me) emit(me);
    return me;
  }
  if (restoreInFlight) return restoreInFlight;
  const refresh = loadRefresh();
  if (!refresh) return null;
  restoreInFlight = (async () => {
    try {
      const res = await fetch(`${AUTH_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh })
      });
      if (!res.ok) {
        persistRefresh(null);
        return null;
      }
      const data = await res.json();
      acceptTokens(data);
      const me = await fetchMe();
      emit(me);
      return me;
    } catch {
      persistRefresh(null);
      return null;
    } finally {
      restoreInFlight = null;
    }
  })();
  return restoreInFlight;
}

export async function fetchMe(): Promise<User | null> {
  const res = await authedFetch(`${AUTH_BASE}/auth/me`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.user as User;
}

// ────────────────────────────────────────────────────────────────────────────
// Wallet-password endpoints — drive the onboarding state machine
// ────────────────────────────────────────────────────────────────────────────

export async function setWalletPassword(password: string): Promise<User> {
  const res = await authedFetch(`${AUTH_BASE}/auth/wallet-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not set wallet password.");
  if (data.user) emit(data.user);
  return data.user as User;
}

export type ProfilePayload = {
  age: number;
  country: string;
  gender?: string | null;
  consentTerms: true;
  consentPrivacy: true;
  notificationsOptIn?: boolean;
};

export async function submitProfile(payload: ProfilePayload): Promise<User> {
  const res = await authedFetch(`${AUTH_BASE}/auth/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save profile.");
  const me = await fetchMe();
  if (me) emit(me);
  return (me ?? data.user) as User;
}

export type AdminUserRow = {
  id: string;
  email: string;
  code11: string;
  firstName: string;
  lastName: string;
  role: Role;
  age: number | null;
  country: string | null;
  gender: string | null;
  profileCompleted: boolean;
  walletStatus: WalletStatus;
  initialDepositCreditedUsd: number;
  notificationsOptIn: boolean;
  createdAt: number;
};

export async function listAllUsers(): Promise<{ total: number; users: AdminUserRow[] }> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/users`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load users.");
  return { total: data.total, users: data.users };
}

export async function verifyWalletPassword(password: string): Promise<boolean> {
  const res = await authedFetch(`${AUTH_BASE}/auth/wallet-password/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  return res.ok;
}

export async function signOut(): Promise<void> {
  const refresh = loadRefresh();
  if (refresh) {
    try {
      await fetch(`${AUTH_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh })
      });
    } catch {
      /* best-effort */
    }
  }
  memTokens = null;
  persistRefresh(null);
  emit(null);
}

// ────────────────────────────────────────────────────────────────────────────
// authedFetch — Bearer + transparent refresh on 401
// ────────────────────────────────────────────────────────────────────────────

export async function authedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const access = await ensureAccess();
  const headers = new Headers(init.headers);
  if (access) headers.set("Authorization", `Bearer ${access}`);
  const res = await fetch(input, { ...init, headers });

  if (res.status !== 401) return res;

  // Try a single refresh + retry on 401.
  const refreshed = await refreshOnce();
  if (!refreshed) return res;
  const headers2 = new Headers(init.headers);
  headers2.set("Authorization", `Bearer ${refreshed}`);
  return fetch(input, { ...init, headers: headers2 });
}

async function ensureAccess(): Promise<string | null> {
  if (memTokens && memTokens.accessExpiresAt > Date.now() + 5_000) {
    return memTokens.accessToken;
  }
  return refreshOnce();
}

async function refreshOnce(): Promise<string | null> {
  const refresh = loadRefresh();
  if (!refresh) return null;
  try {
    const res = await fetch(`${AUTH_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh })
    });
    if (!res.ok) {
      persistRefresh(null);
      memTokens = null;
      return null;
    }
    const data = await res.json();
    acceptTokens(data);
    return data.accessToken;
  } catch {
    return null;
  }
}

function acceptTokens(data: {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}) {
  memTokens = {
    accessToken: data.accessToken,
    accessExpiresAt: Date.now() + data.accessTokenExpiresIn * 1000,
    refreshToken: data.refreshToken
  };
  persistRefresh(data.refreshToken);
}
