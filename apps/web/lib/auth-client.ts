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

export const WALLET_BASE = (
  process.env.NEXT_PUBLIC_WALLET_BASE || "http://localhost:4201"
).replace(/\/$/, "");

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
  /** True once the user has paid the $18 fee to unlock the AI Studio. */
  studioUnlocked?: boolean;
  /** Personalized tokens minted (0 until the member builds in the Studio). */
  tokensMinted?: number;
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
  /** Refresh-row id of the current session — tagged on every API call as
   *  X-Current-Session so the sessions endpoint knows which row is "us". */
  sessionId: string | null;
};

const REFRESH_KEY = "gplex.refresh";
const SESSION_ID_KEY = "gplex.session.id";

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

// ────────────────────────────────────────────────────────────────────────────
// Studio access — $18 one-time fee, paid in any priced coin
// ────────────────────────────────────────────────────────────────────────────

export type StudioQuoteOption = {
  asset: string;
  usd: number;
  price: number;
  amount: number;
};

export async function studioQuote(): Promise<{
  feeUsd: number;
  options: StudioQuoteOption[];
}> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/studio/quote`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load Studio pricing.");
  return data;
}

/**
 * Mark the member's business as built in the Studio → mints their 10B
 * personalized tokens (once). Requires the Studio to be unlocked.
 */
export async function buildStudioBusiness(): Promise<{
  tokensMinted: number;
  alreadyMinted?: boolean;
}> {
  const res = await authedFetch(`${AUTH_BASE}/auth/studio/build`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not complete the build.");
  const me = await fetchMe();
  if (me) emit(me);
  return { tokensMinted: data.tokensMinted, alreadyMinted: data.alreadyMinted };
}

/** Charge the $18 Studio fee in `asset`, then refresh the session. */
export async function unlockStudio(asset: string): Promise<User | null> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/studio/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not unlock Studio.");
  const me = await fetchMe();
  if (me) emit(me);
  return me;
}

// ────────────────────────────────────────────────────────────────────────────
// Sessions — the user's own (admin uses the landing app's surface)
// ────────────────────────────────────────────────────────────────────────────

export type MySessionRow = {
  id: string;
  family_id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: number;
  expires_at: number;
  current?: boolean;
};

async function authedJsonWeb<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await authedFetch(input, init);
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

export const mySessions = {
  list: () =>
    authedJsonWeb<{ sessions: MySessionRow[] }>(`${AUTH_BASE}/auth/sessions`).then((r) => r.sessions),
  revoke: (id: string) =>
    authedJsonWeb<{ ok: true }>(`${AUTH_BASE}/auth/sessions/${id}/revoke`, { method: "POST" }),
  revokeOthers: () =>
    authedJsonWeb<{ ok: true; killed: number }>(`${AUTH_BASE}/auth/sessions/revoke-others`, {
      method: "POST"
    })
};

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
  persistSessionId(null);
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
  const sid = currentSessionId();
  if (sid) headers.set("X-Current-Session", sid);
  const res = await fetch(input, { ...init, headers });

  if (res.status !== 401) return res;

  // Try a single refresh + retry on 401.
  const refreshed = await refreshOnce();
  if (!refreshed) return res;
  const headers2 = new Headers(init.headers);
  headers2.set("Authorization", `Bearer ${refreshed}`);
  const sid2 = currentSessionId();
  if (sid2) headers2.set("X-Current-Session", sid2);
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
  sessionId?: string | null;
}) {
  // Carry forward an existing sessionId if the server didn't include one
  // (older clients during a rolling deploy might not). Refresh rotation
  // does always include the new id, so within a session it stays fresh.
  const sid = data.sessionId ?? memTokens?.sessionId ?? loadSessionId();
  memTokens = {
    accessToken: data.accessToken,
    accessExpiresAt: Date.now() + data.accessTokenExpiresIn * 1000,
    refreshToken: data.refreshToken,
    sessionId: sid ?? null
  };
  persistRefresh(data.refreshToken);
  if (sid) persistSessionId(sid);
}

function persistSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(SESSION_ID_KEY, id);
  else localStorage.removeItem(SESSION_ID_KEY);
}
function loadSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_ID_KEY);
}

/** The current device's session id (refresh-row id). UI uses this for the
 *  "this device" badge and to pass via X-Current-Session header. */
export function currentSessionId(): string | null {
  return memTokens?.sessionId ?? loadSessionId();
}
