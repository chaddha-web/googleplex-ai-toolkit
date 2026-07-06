# Withdrawal Guardrails — design

**Date:** 2026-07-06
**Status:** Draft for approval

## Problem

Withdrawals already enforce a per-transaction USD cap (`MAX_WITHDRAW_PER_TX_USD`,
default $1,000) and a rolling 24h daily cap (`MAX_WITHDRAW_DAILY_USD`, default
$5,000), plus rate-limiting and password+OTP. But:

- Limits are hardcoded env constants — no admin control, no per-user tiers.
- The admin approve/reject endpoints are `501` stubs — there is no
  "large withdrawal → human approval" path. A compromised account can still
  drain up to the daily cap with no human in the loop.
- No cooldown after signup or a wallet-password change — the classic
  account-takeover window.

## Decisions (from brainstorming)

- **Approval hold** for large withdrawals (queue → admin approves before broadcast).
- **Cooldowns** after signup AND after a wallet-password change.
- **Configurable limits** in admin settings, **with a per-user override**.
- Scope: **withdrawals only**. Swaps are internal ledger book-entries; the real
  fund exit (withdrawal) is what's gated.

## Current flow (verified)

1. `POST /wallet/withdrawals` — validates caps, creates a row `status=pending_otp`,
   emails a branded OTP. **No debit yet.**
2. `POST /wallet/withdrawals/:id/confirm` — verifies wallet password + OTP, then
   does an **atomic ledger debit**, then signs + broadcasts from the treasury.

The hold slots in at step 2 **after** the debit (funds reserved) and **before**
broadcast.

## 1. Configurable limits (admin + per-user)

Global limits move from env → auth `settings` table (same store as AI keys):

- `wd.max_per_tx_usd` (default 1000)
- `wd.daily_usd` (default 5000)
- `wd.review_threshold_usd` (default 500) — at/above this, hold for approval
- `wd.signup_cooldown_hours` (default 24)
- `wd.pwchange_cooldown_hours` (default 24)

Edited in **Admin → Settings → "Withdrawal limits"** (a new Section on the
existing settings page). Wallet reads them via a new internal endpoint
`GET /internal/settings/withdrawal-limits` (INTERNAL_SERVICE_TOKEN), cached
~60s, falling back to the current env defaults if unset.

**Per-user override** — new table in wallet.db:

```
CREATE TABLE user_withdraw_limits (
  user_id            TEXT PRIMARY KEY,
  max_per_tx_usd     REAL,   -- nullable; null → use global
  daily_usd          REAL,
  review_threshold_usd REAL,
  updated_at         INTEGER
);
```

Effective limit = per-user value if non-null, else global. Admin sets it from
the user's row (see §4).

## 2. Admin-approval hold

At `confirm`, after password+OTP verify and the atomic debit:

- Compute `usdValue` for the withdrawal.
- If `usdValue > per_tx cap` → this was already rejected at request time; N/A here.
- If `usdValue >= review_threshold` → set status **`awaiting_approval`**, record
  the debit, and **return `{ ok: true, awaitingApproval: true }` — do NOT broadcast.**
  Funds are already debited, so they're reserved and can't be double-spent.
- Else → normal path: broadcast, status → `broadcast`/`completed` as today.

New admin endpoints (replace the `501` stubs, `requireRole('admin')`):

- `GET  /wallet/admin/withdrawals?status=awaiting_approval` — the review queue.
- `POST /wallet/admin/withdrawals/:id/approve` — load an `awaiting_approval` row →
  `sendWithdrawal(...)` (sign+broadcast) → status `broadcast`; record tx hash.
- `POST /wallet/admin/withdrawals/:id/reject` — credit the debited amount back to
  the user's ledger (exact refund), status `rejected`, + a `withdrawal_refund`
  ledger entry. Notify the user.

Daily-cap rollup counts `awaiting_approval` as a pending outflow (already
excluded only `failed`/`rejected`).

## 3. Cooldowns (enforced at request time)

Auth exposes the two timestamps the wallet needs via a new internal endpoint:

`GET /internal/user/:id/withdraw-eligibility` (INTERNAL_SERVICE_TOKEN) →
`{ createdAt, walletPasswordChangedAt }`.

- Auth stamps `wallet_password_changed_at` (new column) when a wallet-password
  **change** is confirmed (not the first set — first set is part of onboarding).
- On `POST /wallet/withdrawals`, before creating the row, the wallet fetches the
  timestamps and rejects with `423`/`400` + a clear message if:
  - `now − createdAt < signup_cooldown_hours`, or
  - `walletPasswordChangedAt && now − walletPasswordChangedAt < pwchange_cooldown_hours`.
  Message includes when withdrawals become available ("available in ~Xh").

## 4. Admin UI

- **Settings**: a "Withdrawal limits" Section (per-tx, daily, review threshold,
  cooldown hours) using the existing settings Row/field components.
- **Users table**: a per-user "Limits" action → small modal to set/clear the
  per-user override (writes `user_withdraw_limits` via a new admin endpoint).
- **Withdrawals review queue**: a new admin page (or panel) listing
  `awaiting_approval` withdrawals (member, amount, USD, chain, dest, requested-at)
  with Approve / Reject buttons.

## 5. User-facing (apps/web wallet)

The withdraw modal:
- Shows the per-tx cap and **remaining 24h allowance** (from a lightweight
  `GET /wallet/withdrawals/limits` returning the caller's effective limits + used).
- If in a cooldown, shows "Withdrawals available in ~Xh" and disables submit.
- On a held withdrawal, shows a "Submitted for review — you'll be notified once
  approved" state instead of the success/tx view.

## Data-flow summary

```
request  → cooldown check → cap check → pending_otp (no debit)
confirm  → pw+OTP → atomic debit → (usd ≥ threshold ? awaiting_approval : broadcast)
admin approve → broadcast
admin reject  → refund ledger → rejected
```

## Error handling

- Reject-refund is a single atomic transaction (credit + refund ledger entry +
  status), so a rejected hold always returns funds exactly.
- Internal-endpoint failures (limits / eligibility) fail **closed** for the
  eligibility check (deny withdrawal on error) and fall back to env defaults for
  limits (never removes a cap).
- Broadcast failure on approve leaves status `awaiting_approval` (retryable);
  never marks completed without a tx hash.

## Testing

- Cap math: per-tx reject; daily rollup includes pending/awaiting; threshold → hold.
- Cooldown windows: signup and pw-change, boundary conditions.
- Approve → broadcast path sets tx hash + status.
- Reject → ledger credited back exactly (no rounding drift); status `rejected`.
- Per-user override precedence over global; null falls back.
- Eligibility endpoint fails closed on auth-service error.

## Out of scope

- KYC tiers / identity verification (limits are amount + time based only).
- Withdrawal address allow-listing / new-address holds (possible follow-up).
- Applying holds to swaps (internal book-entries; the withdrawal exit is gated).
