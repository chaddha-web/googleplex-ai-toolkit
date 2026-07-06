# Flush-to-Treasury (deposit sweep) — design

**Date:** 2026-07-06
**Status:** Approved (tokens+native · per-user + batch · EVM+Tron+BTC · auto gas-funding)

## Problem

On-chain deposits accumulate at per-user deposit addresses, which are
collection-only. The treasury (withdrawal wallet) pays all withdrawals, so
those deposits must be consolidated into the treasury. We need an admin
"flush" that moves a user's on-chain balances to the treasury **automatically
funding the gas** required to move tokens — **without changing the user's
ledger, balance, or transaction history** (the ledger already credited them at
deposit time and is their entitlement; the coins are merely consolidated).

## Architecture note (why this is sensitive)

The wallet service is watch-only for user addresses: it derives them from
public xpubs. The master private mnemonics live KMS-encrypted on the seeds
volume (`evm/tron/btc.bin`). A flush is the ONE operation that brings a master
key into the live signing path — to derive a user's child private key and sign
a transfer out of their deposit address.

## Key derivation

`hd.ts` gains `deriveUserPrivKey(chain, userIndex): Promise<string>`:
KMS-decrypt the master mnemonic → `masterFromMnemonic` → derive child at
`accountPath(chain)/userIndex` → return raw priv hex. Used only inside the
sweep orchestrator; never persisted, cached long-term, or logged.

## Orchestrator — `services/wallet/src/sweep.ts`

`sweepUser(userId, { broadcast }): Promise<SweepPlan>`

1. Load the user's addresses + `user_index`.
2. Query live on-chain balances via `reconcile` (per chain/asset).
3. Build a **plan** of legs. For each funded asset:
   - **native** (ETH/BNB/TRX/BTC): move `balance − estimatedFee` → treasury.
   - **token** (ERC-20/TRC-20): if the user address lacks native gas for the
     transfer, add a **gas-funding leg** (treasury → user address, the
     estimated transfer fee), then a **token-transfer leg** (user → treasury,
     full token balance).
4. `broadcast:false` → return the plan; **nothing is broadcast** (preview).
5. `broadcast:true` → execute legs in order, waiting for gas-funding
   confirmation before the dependent token transfer. Record every broadcast
   leg in `treasury_sweeps`.

### Automatic gas-funding (core requirement)

Token sweeps are gas-funded automatically: the orchestrator estimates the
transfer fee, sends exactly that (plus a small buffer) as native coin from the
treasury to the user address, waits for it to confirm, then sweeps the token.
The admin never hand-funds gas.

## Per-chain signers (extend existing sign/ modules to accept a priv)

- **EVM** (`sign/evm.ts`): add signer variants that take a caller-supplied priv
  (not just treasury). Gas-fund: `sendEvmNative` from treasury → user.
  Token: `sendEvmErc20` from user priv → treasury. Native sweep: balance − 21000·gasPrice.
- **Tron** (`sign/tron.ts`): TRC-20 needs TRX for energy/bandwidth. Fund TRX
  treasury → user, then `sendTronTrc20` from user priv → treasury; native TRX
  sweep = balance − fee.
- **BTC** (`sign/btc.ts`): native only. Build a tx spending all UTXOs at the
  user address → treasury, minus fee. Sign with the user priv.

## Ledger: UNTOUCHED

No writes to `ledger_balances`, `ledger_entries`, `deposits`, or `withdrawals`
for the swept user. The user's balance and history are unchanged. Sweeps are
recorded ONLY in a new ops-only table:

```
CREATE TABLE treasury_sweeps (
  id TEXT PRIMARY KEY, user_id TEXT, chain TEXT, symbol TEXT,
  amount_raw TEXT, kind TEXT,        -- 'gas_fund' | 'token_sweep' | 'native_sweep'
  from_address TEXT, to_address TEXT, tx_hash TEXT, status TEXT,  -- 'planned'|'sent'|'confirmed'|'failed'
  admin_id TEXT, created_at INTEGER
);
```

## Endpoints (admin-only, requireRole 'admin')

- `POST /wallet/admin/sweep/preview { userId }` → plan, no broadcast.
- `POST /wallet/admin/sweep { userId }` → execute the user's plan.
- `POST /wallet/admin/sweep/all` → batch across all users (preview + execute
  variants via a `broadcast` flag).

## UI (landing admin panel)

- Per-user "Flush to treasury" on the admin users table → shows the preview
  (legs + amounts) → explicit "Broadcast" confirm.
- A batch "Sweep all deposits" action with the same preview→confirm.

## Safety rails

- **Preview-first / dry-run default:** `broadcast` defaults to false everywhere.
- Skip any asset that can't cover its own gas (no negative sweeps).
- Dust thresholds per chain (don't sweep sub-fee amounts).
- Idempotency per (user, chain, asset) within a short window; sweeps record
  tx hashes so re-runs don't double-broadcast the same balance.
- Gas-funding waits for confirmation before the token transfer.
- Every leg audited in `treasury_sweeps` with status transitions.

## Testing

- Key derivation: `deriveUserPrivKey` for a known index derives the address
  that matches `deriveUserAddresses` (priv→pubkey→address round-trip).
- Plan builder (pure): given balances + fee estimates, emits the correct legs
  (gas-fund before token; skip dust; skip if underfunded).
- Preview endpoint returns a plan and broadcasts nothing (assert no tx sent).
- Typecheck wallet + landing.

## Rollout

Implement in order: shared plan/audit + key derivation → EVM → Tron → BTC →
admin UI. Ship preview-only first if needed; broadcasting gated behind explicit
admin confirm.

## Out of scope

- Auto/scheduled sweeping (manual admin action only for v1).
- Sweeping to anywhere other than the treasury.
