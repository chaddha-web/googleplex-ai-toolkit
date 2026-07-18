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
  /** Personalized tokens minted to this member at signup (tokenomics). */
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
  /** Refresh-row id of this device's session (sent as X-Current-Session). */
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

/** Check whether an account exists for an email (no OTP sent). */
export async function checkEmailExists(email: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${AUTH_BASE}/auth/exists?email=${encodeURIComponent(email)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.exists;
  } catch {
    return false;
  }
}

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
  if (!loadRefresh()) return null;
  restoreInFlight = (async () => {
    try {
      // Go through the shared single-flight so a concurrent authedFetch
      // can't rotate the same token underneath us (which would trip the
      // server's reuse detection and kill the session).
      const access = await refreshOnce();
      if (!access) return null;
      const me = await fetchMe();
      emit(me);
      return me;
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
  consentConsultation: true;
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

/** Upload a profile image (data URL) → media bucket. Returns the new URL. */
export async function uploadAvatar(dataUrl: string): Promise<string> {
  const res = await authedFetch(`${AUTH_BASE}/auth/profile/avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not upload image.");
  return data.avatarUrl as string;
}

export type AdminUserRow = {
  id: string;
  email: string;
  code11: string;
  firstName: string;
  lastName: string;
  role: Role;
  avatarUrl: string | null;
  age: number | null;
  country: string | null;
  gender: string | null;
  profileCompleted: boolean;
  walletStatus: WalletStatus;
  initialDepositCreditedUsd: number;
  tokensMinted: number;
  notificationsOptIn: boolean;
  suspendedAt: number | null;
  createdAt: number;
};

export async function listAllUsers(): Promise<{ total: number; users: AdminUserRow[] }> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/users`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load users.");
  return { total: data.total, users: data.users };
}

/** Main admin (founder) only — suspend a member (blocks sign-in, kills sessions). */
export async function suspendUser(id: string): Promise<void> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/users/${id}/suspend`, {
    method: "POST"
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(d.error || "Could not suspend.");
  }
}

/** Admin — lift a member's suspension so they can sign in again. */
export async function unsuspendUser(id: string): Promise<void> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/users/${id}/unsuspend`, {
    method: "POST"
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Could not unsuspend.");
  }
}

export async function verifyWalletPassword(password: string): Promise<boolean> {
  const res = await authedFetch(`${AUTH_BASE}/auth/wallet-password/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  return res.ok;
}

// ── Admin settings ───────────────────────────────────────────────────────

export type SecretField = { set: boolean; masked: string };
export type AdminSettings = {
  settings: Record<string, string | SecretField>;
  isFounder: boolean;
  perms: Capability[];
};

export async function getAdminSettings(): Promise<AdminSettings> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/settings`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load settings.");
  return {
    settings: data.settings,
    isFounder: !!data.isFounder,
    perms: Array.isArray(data.perms) ? data.perms : []
  };
}

// ── Admin action audit log ────────────────────────────────────────────────

export type AdminAuditEvent = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_id: string | null;
  target_label: string | null;
  detail: string | null;
  created_at: number;
};

/** Founder / settings-capable admins — the who-did-what-when trail. */
export async function adminAudit(limit = 200): Promise<AdminAuditEvent[]> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/audit?limit=${limit}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load the audit log.");
  return Array.isArray(data.events) ? data.events : [];
}

// ── Admin permission manager (founder only) ───────────────────────────────

/** The granular admin capabilities the main admin can grant to sub-admins. */
export const ADMIN_CAPABILITIES = [
  { key: "withdrawals", label: "Approve withdrawals", desc: "Review queue — approve, reject, broadcast." },
  { key: "suspend", label: "Suspend members", desc: "Block member sign-in and kill sessions." },
  { key: "flush", label: "Treasury flush", desc: "Sweep member deposits to treasury (moves funds)." },
  { key: "settings", label: "Settings & secrets", desc: "AI/wallet keys, withdrawal limits, audit log." },
  { key: "comms", label: "Send campaigns", desc: "Send email campaigns to members." },
  { key: "moderation", label: "Moderate the Circle", desc: "Create/close questions; moderate comments." }
] as const;
export type Capability = (typeof ADMIN_CAPABILITIES)[number]["key"];

export type AdminAccount = {
  id: string;
  email: string;
  code11: string;
  firstName: string;
  lastName: string;
  isFounder: boolean;
  permissions: Capability[];
  suspendedAt: number | null;
  createdAt: number;
};

/** Founder only — list every admin and their granted capabilities. */
export async function listAdmins(): Promise<AdminAccount[]> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/admins`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load admins.");
  return Array.isArray(data.admins) ? data.admins : [];
}

/** Founder only — set a sub-admin's capabilities. */
export async function setAdminPermissions(id: string, permissions: Capability[]): Promise<void> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/users/${id}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions })
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Could not save permissions.");
}

/** Founder only — demote a sub-admin back to a regular member. */
export async function demoteAdmin(id: string): Promise<void> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/users/${id}/demote`, { method: "POST" });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Could not demote.");
}

export async function setAdminSetting(key: string, value: string): Promise<void> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save setting.");
}

const WALLET_BASE = (
  process.env.NEXT_PUBLIC_WALLET_BASE || "http://localhost:4201"
).replace(/\/$/, "");

// ── Admin: accounting / ledger / system transactions ──────────────────────

export type Accounting = {
  holdingsUsd: number;
  depositsUsd: number;
  withdrawnUsd: number;
  pendingUsd: number;
  byChain: Record<string, number>;
  counts: {
    members: number;
    deposits: number;
    withdrawals: number;
    pendingWithdrawals: number;
    sweeps: number;
    ledgerEntries: number;
  };
};

/** Platform-wide money totals for the treasury dashboard. */
export async function adminAccounting(): Promise<Accounting> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/accounting`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load accounting.");
  return data as Accounting;
}

export type LedgerEntry = {
  id: string;
  userId: string;
  chain: string | null;
  symbol: string;
  amount: number;
  usd: number;
  kind: string;
  txHash: string | null;
  refId: string | null;
  createdAt: number | null;
};

/** Every credit/debit against member balances (deposits, withdrawals, refunds…). */
export async function adminLedger(
  opts: { limit?: number; kind?: string; userId?: string } = {}
): Promise<LedgerEntry[]> {
  const q = new URLSearchParams();
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.kind) q.set("kind", opts.kind);
  if (opts.userId) q.set("userId", opts.userId);
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/ledger?${q.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load the ledger.");
  return Array.isArray(data.entries) ? data.entries : [];
}

export type SystemTx = {
  id: string;
  type: "deposit" | "withdrawal" | "sweep";
  direction: "in" | "out" | "sweep";
  userId: string;
  chain: string;
  symbol: string;
  amount: number;
  usd: number;
  txHash: string | null;
  dest?: string | null;
  status: string;
  at: number | null;
};

/** Unified on-chain feed: deposits, broadcast withdrawals, treasury sweeps. */
export async function adminTransactions(limit = 100): Promise<SystemTx[]> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/transactions?limit=${limit}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load transactions.");
  return Array.isArray(data.transactions) ? data.transactions : [];
}

export type WithdrawLimits = {
  maxPerTxUsd: number | null;
  dailyUsd: number | null;
  reviewThresholdUsd: number | null;
};

/** A member's override limits + the effective values (override → global fallback). */
export async function getUserWithdrawLimits(
  id: string
): Promise<{ override: WithdrawLimits; effective: WithdrawLimits }> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/users/${id}/withdraw-limits`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load limits.");
  return data as { override: WithdrawLimits; effective: WithdrawLimits };
}

/** Set a member's override. Null / blank fields fall back to the global limit. */
export async function setUserWithdrawLimits(id: string, body: WithdrawLimits): Promise<void> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/users/${id}/withdraw-limits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save limits.");
}

/** Best-effort liveness ping of the auth + wallet services (public /health). */
export async function systemHealth(): Promise<{ auth: boolean; wallet: boolean }> {
  const ping = async (url: string) => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      return r.ok;
    } catch {
      return false;
    }
  };
  const [auth, wallet] = await Promise.all([ping(`${AUTH_BASE}/health`), ping(`${WALLET_BASE}/health`)]);
  return { auth, wallet };
}

export type TreasuryWallets = {
  configured: boolean;
  addresses: { eth: string; bsc: string; tron: string; btc: string };
  balances: AssetBalance[];
  /** Per-chain breakdown — which chain/address actually holds each balance. */
  holdings?: { chain: string; symbol: string; amount: number; usd: number }[];
  totalUsd: number;
  fetchedAt?: number;
};

/** Live on-chain balances of the company wallets that pay out withdrawals. */
export async function adminTreasuryWallets(force = false): Promise<TreasuryWallets> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/treasury-wallets${force ? "?force=1" : ""}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load withdrawal wallets.");
  return data as TreasuryWallets;
}

/** Admin: usable (ledger DB) USD totals per user id. */
export async function adminWalletBalances(): Promise<Record<string, number>> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/balances`);
  if (!res.ok) return {};
  return (await res.json().catch(() => ({}))) as Record<string, number>;
}

export type SweepLeg = {
  chain: string;
  symbol: string;
  kind: "gas_fund" | "token_sweep" | "native_sweep";
  amount: number;
  from: string;
  to: string;
  txHash?: string;
  status?: string;
  error?: string;
};
export type SweepPlan = {
  userId: string;
  userIndex: number;
  supported: string[];
  pending: string[];
  legs: SweepLeg[];
  skipped: { chain: string; symbol: string; reason: string }[];
};

export type PendingWithdrawal = {
  id: string;
  userId: string;
  chain: string;
  symbol: string;
  amount: number;
  usd: number;
  destAddress: string;
  requestedAt: number;
  status: string;
  /** 4-eyes: distinct approvals so far, required count, and whether I approved. */
  approvals?: number;
  required?: number;
  mineApproved?: boolean;
};

/** Admin: withdrawals held for approval. */
export async function adminWithdrawalQueue(): Promise<PendingWithdrawal[]> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/withdrawals?status=awaiting_approval`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Could not load the queue.");
  return Array.isArray(d.withdrawals) ? d.withdrawals : [];
}

/** Admin: approve a held withdrawal → broadcast. */
export async function approveWithdrawal(
  id: string
): Promise<{ txHash?: string; pending?: boolean; approvals?: number; required?: number }> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/withdrawals/${id}/approve`, { method: "POST" });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Approve failed.");
  return d;
}

/** Admin: reject a held withdrawal → refund. */
export async function rejectWithdrawal(id: string): Promise<void> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/withdrawals/${id}/reject`, { method: "POST" });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Reject failed.");
}

/** Admin: preview a user's flush-to-treasury plan (broadcasts nothing). */
export async function sweepPreview(userId: string): Promise<SweepPlan> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/sweep/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Could not preview the flush.");
  return d.plan as SweepPlan;
}

/** Admin: execute the flush — broadcasts EVM legs, records the audit. */
export async function sweepExecute(userId: string): Promise<{ ok: boolean; legs: SweepLeg[] }> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/sweep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Flush failed.");
  return d;
}

/** Admin: live on-chain (actual) USD for one user (RPC, on-demand). */
export async function adminUserOnchain(userId: string): Promise<number> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/user/${userId}/onchain`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not read on-chain balance.");
  return Number(data.actualUsd ?? 0);
}

export type AssetBalance = { asset: string; total: number; usd: number | null };
export type MemberWalletDetail = {
  addresses: {
    userIndex: number;
    eth: string;
    bsc: string;
    tron: string | null;
    btc: string | null;
  } | null;
  balances: AssetBalance[];
  usableUsd: number;
};

/** Admin: a member's deposit addresses + full ledger balance breakdown. */
export async function adminUserDetail(userId: string): Promise<MemberWalletDetail> {
  const res = await authedFetch(`${WALLET_BASE}/wallet/admin/user/${userId}/detail`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load member wallet.");
  return {
    addresses: data.addresses ?? null,
    balances: Array.isArray(data.balances) ? data.balances : [],
    usableUsd: Number(data.usableUsd ?? 0)
  };
}

export type ConsentRecord = {
  id: string;
  kind: string;
  consentedAt: number;
  ip: string | null;
  userAgent: string | null;
};

/** Admin: the consent audit trail (what/when/device/IP) for one member. */
export async function adminUserConsents(userId: string): Promise<ConsentRecord[]> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/users/${userId}/consents`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load consent records.");
  return Array.isArray(data.consents) ? data.consents : [];
}

export async function promoteAdmin(code11: string): Promise<string> {
  const res = await authedFetch(`${AUTH_BASE}/auth/admin/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code11 })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not promote member.");
  return data.email as string;
}

// ────────────────────────────────────────────────────────────────────────────
// Email marketing (admin-only) + inbox helpers
// ────────────────────────────────────────────────────────────────────────────

export type EmailAudience = {
  tiers?: Array<"new" | "activated" | "built">;
  requireOptIn?: boolean;
  from?: number | null;
  to?: number | null;
  countries?: string[];
};

export type CampaignRow = {
  id: string;
  subject: string;
  status: "draft" | "sending" | "sent" | "failed";
  created_at: number;
  sent_at: number | null;
  recipient_count: number | null;
  sent_count: number;
  fail_count: number;
};

export type CampaignDetail = CampaignRow & {
  body_md: string;
  audience: EmailAudience;
  error: string | null;
};

export type InboxRow = {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  received_at: number;
  read_at: number | null;
  archived_at: number | null;
};

export type InboxMessage = InboxRow & {
  body_text: string | null;
  body_html: string | null;
};

export type SentRow = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  kind: string | null;
  status: "sent" | "failed" | "dev";
  sent_at: number;
};

export type SentMessage = SentRow & {
  body_text: string | null;
  body_html: string | null;
  resend_id: string | null;
  error: string | null;
};

async function authedJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await authedFetch(input, init);
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

export const email = {
  listCampaigns: () =>
    authedJson<{ campaigns: CampaignRow[] }>(`${AUTH_BASE}/auth/admin/campaigns`).then((r) => r.campaigns),
  getCampaign: (id: string) =>
    authedJson<{ campaign: CampaignDetail; sends: Array<{ email: string; status: string; error: string | null; sent_at: number | null }> }>(
      `${AUTH_BASE}/auth/admin/campaigns/${id}`
    ),
  createCampaign: (body: { subject: string; body_md: string; audience: EmailAudience }) =>
    authedJson<{ id: string }>(`${AUTH_BASE}/auth/admin/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
  updateCampaign: (id: string, body: { subject?: string; body_md?: string; audience?: EmailAudience }) =>
    authedJson<{ ok: true }>(`${AUTH_BASE}/auth/admin/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
  deleteCampaign: (id: string) =>
    authedJson<{ ok: true }>(`${AUTH_BASE}/auth/admin/campaigns/${id}`, { method: "DELETE" }),
  preview: (body_md: string, subject = "") =>
    authedJson<{ html: string; text: string; subject: string }>(
      `${AUTH_BASE}/auth/admin/email/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_md, subject })
      }
    ),
  audienceCount: (audience: EmailAudience) =>
    authedJson<{ total: number; effective: number }>(`${AUTH_BASE}/auth/admin/email/audience-count`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(audience)
    }),
  sendTest: (id: string, to?: string) =>
    authedJson<{ ok: true; resend_id: string }>(`${AUTH_BASE}/auth/admin/campaigns/${id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to || "" })
    }),
  sendCampaign: (id: string) =>
    authedJson<{ ok: true; status: string; recipient_count: number }>(
      `${AUTH_BASE}/auth/admin/campaigns/${id}/send`,
      { method: "POST" }
    ),
  // Inbox
  listInbox: () => authedJson<{ messages: InboxRow[] }>(`${AUTH_BASE}/auth/admin/inbox`).then((r) => r.messages),
  getInbox: (id: string) =>
    authedJson<{ message: InboxMessage }>(`${AUTH_BASE}/auth/admin/inbox/${id}`).then((r) => r.message),
  archiveInbox: (id: string) =>
    authedJson<{ ok: true }>(`${AUTH_BASE}/auth/admin/inbox/${id}/archive`, { method: "POST" }),
  // Sent
  listSent: () => authedJson<{ messages: SentRow[] }>(`${AUTH_BASE}/auth/admin/sent`).then((r) => r.messages),
  getSent: (id: string) =>
    authedJson<{ message: SentMessage }>(`${AUTH_BASE}/auth/admin/sent/${id}`).then((r) => r.message)
};

// ────────────────────────────────────────────────────────────────────────────
// Sessions — admin (all) and user (own)
// ────────────────────────────────────────────────────────────────────────────

export type SessionRow = {
  id: string;
  user_id: string;
  family_id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
  last_used_at: number | null;
  current?: boolean;
};
export type AdminSessionRow = SessionRow & {
  email: string;
  first_name: string;
  last_name: string;
  code11: string;
  role: "user" | "admin";
  online?: boolean;
};

/** A member actively using the platform right now (live heartbeat). */
export type OnlineMember = {
  userId: string;
  email: string;
  code11: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  section: string;
  country: string;
  region: string;
  lastSeen: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Token reclaims — admin audit of liquidity exits
// ────────────────────────────────────────────────────────────────────────────

export type TokenReclaimRow = {
  id: string;
  user_id: string;
  reference_no: string;
  email: string | null;
  tokens: number;
  usd_released: number;
  created_at: number;
};

export const tokenReclaims = {
  list: () =>
    authedJson<{
      reclaims: TokenReclaimRow[];
      totals: { tokens: number; usd: number; n: number };
    }>(`${AUTH_BASE}/auth/admin/token-reclaims`)
};

export const sessions = {
  // User's own
  listMine: () =>
    authedJson<{ sessions: SessionRow[] }>(`${AUTH_BASE}/auth/sessions`).then((r) => r.sessions),
  revokeMine: (id: string) =>
    authedJson<{ ok: true }>(`${AUTH_BASE}/auth/sessions/${id}/revoke`, { method: "POST" }),
  revokeOthers: () =>
    authedJson<{ ok: true; killed: number }>(`${AUTH_BASE}/auth/sessions/revoke-others`, { method: "POST" }),
  // Admin
  listAll: (scope: "active" | "recent" = "active", q = "", userId = "") =>
    authedJson<{ sessions: AdminSessionRow[]; scope: string; onlineCount: number }>(
      `${AUTH_BASE}/auth/admin/sessions?scope=${scope}` +
        (q ? "&q=" + encodeURIComponent(q) : "") +
        (userId ? "&userId=" + encodeURIComponent(userId) : "")
    ).then((r) => r.sessions),
  // Admin — members actively using the platform right now (live heartbeat).
  online: () =>
    authedJson<{ members: OnlineMember[]; count: number }>(`${AUTH_BASE}/auth/admin/online`),
  adminRevoke: (id: string) =>
    authedJson<{ ok: true }>(`${AUTH_BASE}/auth/admin/sessions/${id}/revoke`, { method: "POST" })
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

// Single-flight guard for /auth/refresh. Refresh rotation revokes the
// presented token, and the server burns the whole family if a *revoked*
// token is presented again (theft detection). So two concurrent refreshes
// with the same token = one rotates, the other looks like reuse → the
// family is torched and the user is logged out everywhere. A normal page
// fires several protected requests at once, so this WILL happen without a
// guard. Sharing one in-flight promise means the token rotates exactly
// once and every concurrent caller gets the same fresh access token.
let refreshInFlight: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
  // NB: the in-flight check and assignment must be synchronous (no await
  // between them) so concurrent callers coalesce onto one request.
  if (refreshInFlight) return refreshInFlight;
  const refresh = loadRefresh();
  if (!refresh) return Promise.resolve(null);
  refreshInFlight = (async () => {
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
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function acceptTokens(data: {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  sessionId?: string | null;
}) {
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
export function currentSessionId(): string | null {
  return memTokens?.sessionId ?? loadSessionId();
}
