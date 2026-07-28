import type { FastifyInstance } from "fastify";
import { db, rawDb } from "./db/index.js";
import { 
  userWalletAddresses, 
  ledgerBalances, 
  ledgerEntries, 
  deposits, 
  withdrawals, 
  swaps,
  sales
} from "./db/schema.js";
import { requireAuth, requireInternal, requireRole, requireCapability, requireFounder } from "./lib/guard.js";
import { auditToAuth } from "./audit.js";
import { eq, and, desc } from "drizzle-orm";
import { ulid } from "ulid";
import { reconcile, type UserAddressMap } from "./reconcile.js";
import { scanIncomingTransfers } from "./scan.js";
import {
  ASSET_INSTANCES,
  LOGICAL_ASSETS,
  aggregate,
  totalUsd,
  type LogicalAsset,
  type PerChainRawBalances
} from "./assets.js";
import { deriveUserAddresses } from "./hd.js";
import { TOKENS, findToken } from "./tokens.js";
import { priceUsd, coinAmountForUsd, quoteSwap } from "./prices.js";
import { previewUser, executeUser } from "./sweep.js";
import { withdrawalAddresses, payoutAddressForChain, privKeyForChain } from "./treasury.js";
import { effectiveLimits, checkCooldown, financeConfig } from "./withdraw-limits.js";
import { sendWithdrawal, isValidDestination } from "./withdraw.js";
import {
  isDemoAccount,
  demoUserIds,
  demoTxHash,
  fabricatedUsd,
  fabricatedCredits,
  recordFabricated,
  reversalPlan,
  MAX_CREDIT_USD
} from "./demo.js";
import { notify } from "./notify.js";

// Withdrawal safety caps (USD). Fully-automatic model still bounds blast radius.
const MAX_WITHDRAW_PER_TX_USD = Number(process.env.MAX_WITHDRAW_PER_TX_USD ?? 1000);
const MAX_WITHDRAW_DAILY_USD = Number(process.env.MAX_WITHDRAW_DAILY_USD ?? 5000);
// Protected-liquidity floor: the $1 backing each member's 10B tokens. A
// withdrawal dropping total usable balance below this forfeits their tokens
// to the admin. Configurable so the backing amount can be tuned later.
const PROTECTED_FLOOR_USD = Number(process.env.PROTECTED_FLOOR_USD ?? 1);

// One-time fee (USD) to unlock the AI Studio. Charged in any priced coin at
// its live price; the platform keeps it (debited as a fee, not credited back).
const STUDIO_FEE_USD = 18;

// Convert a human coin amount to raw base units without Number overflow for
// high-decimal tokens: keep up to 6 decimals of precision in Number math, then
// scale the rest with BigInt.
function toRawUnits(coinAmount: number, decimals: number): bigint {
  const p = Math.min(decimals, 6);
  const head = BigInt(Math.ceil(coinAmount * 10 ** p));
  return head * 10n ** BigInt(Math.max(0, decimals - p));
}

// Display helpers for the admin accounting/ledger/transaction views. Raw base
// units → human amount and USD (best-effort; unknown tokens price at 0). Number()
// is fine here — these views only read, they never move money.
function toAmount(chain: string | null | undefined, symbol: string, raw: string): number {
  const t = findToken((chain ?? "") as any, symbol);
  const dec = t?.decimals ?? 18;
  try {
    return Number(BigInt(raw)) / 10 ** dec;
  } catch {
    return 0;
  }
}
function toUsd(chain: string | null | undefined, symbol: string, raw: string): number {
  return toAmount(chain, symbol, raw) * (priceUsd(symbol as any) ?? 0);
}

/** Amount to actually send after deducting the flat withdrawal fee (kept by the
 *  platform in the treasury). Never deducts if the fee is unset or ≥ the amount. */
async function netWithdrawRaw(
  chain: string,
  symbol: string,
  amountRaw: string
): Promise<{ sendRaw: string; feeRaw: string }> {
  const fee = (await financeConfig()).fees[`${chain}:${symbol}`] ?? 0;
  if (fee <= 0) return { sendRaw: amountRaw, feeRaw: "0" };
  const dec = findToken(chain as any, symbol)?.decimals ?? 18;
  const feeRaw = toRawUnits(fee, dec);
  const amt = BigInt(amountRaw);
  if (feeRaw <= 0n || feeRaw >= amt) return { sendRaw: amountRaw, feeRaw: "0" };
  return { sendRaw: (amt - feeRaw).toString(), feeRaw: feeRaw.toString() };
}

// Auth service base — in prod this is the internal container address
// (http://auth:4200), set via AUTH_BASE_URL in docker-compose. Falls back to
// localhost only for local dev where both services run on the host.
const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://auth:4200").replace(
  /\/$/,
  ""
);

// Master xpubs (public — safe to hold in env). init-seeds prints these as
// *_MASTER_XPUB; we keep the legacy *_XPUB names as a fallback.
const EVM_XPUB =
  process.env.EVM_MASTER_XPUB || process.env.EVM_XPUB || "xpub_placeholder";
const BTC_XPUB =
  process.env.BTC_MASTER_XPUB || process.env.BTC_XPUB || "xpub_placeholder";
const TRON_XPUB =
  process.env.TRON_MASTER_XPUB || process.env.TRON_XPUB || "xpub_placeholder";

// Provision a user's HD deposit addresses + zero balances if they don't exist
// yet. Idempotent and single-flighted per user (guards the React StrictMode
// double-call + any concurrent first access). Derives from the master xpubs.
const provisioning = new Map<string, Promise<void>>();
async function ensureUserWallet(userId: string): Promise<void> {
  const existing = await db
    .select({ id: userWalletAddresses.user_id })
    .from(userWalletAddresses)
    .where(eq(userWalletAddresses.user_id, userId))
    .limit(1);
  if (existing.length > 0) return;

  const inflight = provisioning.get(userId);
  if (inflight) return inflight;

  const p = (async () => {
    // better-sqlite3 transactions are SYNCHRONOUS — the callback must not be
    // async / return a promise, and queries inside use sync terminals
    // (.run()/.all()/.get()), never await. (Async-callback transactions throw
    // "Transaction function cannot return a promise" and silently block
    // provisioning — which is what stopped deposits from ever crediting.)
    // Index allocation happens INSIDE the tx so it's atomic with the insert.
    db.transaction((tx) => {
      // Re-check inside the tx to avoid a duplicate row on a race.
      const again = tx
        .select({ id: userWalletAddresses.user_id })
        .from(userWalletAddresses)
        .where(eq(userWalletAddresses.user_id, userId))
        .limit(1)
        .all();
      if (again.length > 0) return;

      // Allocate the next derivation index from a persistent monotonic
      // counter. NEVER count-based: a deleted user used to drop the count,
      // so the next signup reused a live index → same derived address →
      // one member's deposit credited to another. The counter only ever
      // grows; we also floor it at MAX(existing index)+1 so it self-heals
      // from legacy data on first run.
      const meta = rawDb
        .prepare(`SELECT value FROM wallet_meta WHERE key = 'next_user_index'`)
        .get() as { value: number } | undefined;
      const maxRow = rawDb
        .prepare(`SELECT MAX(user_index) AS mx FROM user_wallet_addresses`)
        .get() as { mx: number | null };
      const userIndex = Math.max(
        Number(meta?.value ?? 0),
        Number(maxRow?.mx ?? 0) + 1,
        1
      );
      rawDb
        .prepare(
          `INSERT INTO wallet_meta (key, value) VALUES ('next_user_index', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(userIndex + 1);

      const addrs = deriveUserAddresses({
        userIndex,
        evmXpub: EVM_XPUB,
        btcXpub: BTC_XPUB,
        tronXpub: TRON_XPUB
      });

      tx.insert(userWalletAddresses).values({
        user_id: userId,
        user_index: userIndex,
        eth: addrs.eth,
        bsc: addrs.bsc,
        polygon: addrs.polygon,
        tron: addrs.tron,
        btc: addrs.btc
      }).run();
      for (const t of TOKENS) {
        tx.insert(ledgerBalances).values({
          user_id: userId,
          chain: t.chain,
          symbol: t.symbol,
          raw: "0",
          decimals: t.decimals
        }).run();
      }
    });
  })().finally(() => provisioning.delete(userId));

  provisioning.set(userId, p);
  return p;
}

type MiniLog = { info: (...a: any[]) => void; error: (...a: any[]) => void };

// Core deposit reconcile+credit for one user. Reused by POST /wallet/refresh
// (on-demand, when the member clicks Refresh) AND by the background deposit
// scanner (so a member who deposits but never returns still gets activated).
// Idempotent: only credits the positive on-chain delta over the ledger, and
// dedupes indexed transfers by tx hash — safe to run every cycle.
export async function refreshUserDeposits(
  userId: string,
  log: MiniLog
): Promise<void> {
  await ensureUserWallet(userId);
  const addrs = await db
    .select()
    .from(userWalletAddresses)
    .where(eq(userWalletAddresses.user_id, userId))
    .limit(1);
  if (addrs.length === 0) return;

  const a = addrs[0]!;
  const snap = await reconcile({ eth: a.eth, bsc: a.bsc, polygon: a.polygon || a.eth, tron: a.tron, btc: a.btc });

  // Diff against ledger and update BALANCES (authoritative on-chain via
  // balanceOf). Detects the $1 activation deposit.
  let initialDepositCreditedUsd = 0;
  db.transaction((tx) => {
    const existingBalances = tx.select().from(ledgerBalances).where(eq(ledgerBalances.user_id, userId)).all();

    for (const t of TOKENS) {
      const onChainRaw = snap.perChain[t.chain as keyof typeof snap.perChain]?.[t.symbol] || "0";
      const ledgerRow = existingBalances.find(b => b.chain === t.chain && b.symbol === t.symbol);
      const ledgerRaw = ledgerRow ? ledgerRow.raw : "0";

      if (BigInt(onChainRaw) > BigInt(ledgerRaw)) {
        const delta = BigInt(onChainRaw) - BigInt(ledgerRaw);

        if (ledgerRow) {
          tx.update(ledgerBalances)
            .set({ raw: onChainRaw, updated_at: Date.now() })
            .where(and(eq(ledgerBalances.user_id, userId), eq(ledgerBalances.chain, t.chain), eq(ledgerBalances.symbol, t.symbol)))
            .run();
        } else {
          tx.insert(ledgerBalances).values({
            user_id: userId,
            chain: t.chain,
            symbol: t.symbol,
            raw: onChainRaw,
            decimals: t.decimals
          }).run();
        }

        // Initial deposit logic: USD = 1 for USDT/USDC on eth/bsc/polygon/tron
        if (["USDT", "USDC"].includes(t.symbol) && ["eth", "bsc", "polygon", "tron"].includes(t.chain)) {
          const usdValue = Number(delta) / (10 ** t.decimals); // fixed $1
          initialDepositCreditedUsd += usdValue;
        }
      }
    }
  });

  if (initialDepositCreditedUsd > 0) {
    try {
      const authResp = await fetch(AUTH_BASE + "/internal/users/" + userId + "/wallet-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.INTERNAL_SERVICE_TOKEN
        },
        body: JSON.stringify({
          initialDepositCreditedUsd: initialDepositCreditedUsd
          // The auth service handles the status flip if total >= 1.0
        })
      });
      if (!authResp.ok) {
        log.error(`Failed to update initial deposit for ${userId}: ${authResp.status}`);
      }
    } catch (e) {
      log.error(e);
    }
  }

  // Index individual incoming transfers (real tx hash + sender) for the
  // transaction history. Best-effort + non-fatal. Dedupe by tx hash.
  try {
    const transfers = await scanIncomingTransfers({ eth: a.eth, bsc: a.bsc, polygon: a.polygon || a.eth, tron: a.tron, btc: a.btc });
    if (transfers.length > 0) {
      const existing = db.select({ h: deposits.tx_hash }).from(deposits).where(eq(deposits.user_id, userId)).all();
      const seen = new Set(existing.map((r) => r.h));
      const fresh: typeof transfers = [];
      db.transaction((tx) => {
        for (const tr of transfers) {
          if (seen.has(tr.txHash)) continue;
          seen.add(tr.txHash);
          fresh.push(tr);
          const dId = ulid();
          const ts = tr.ts ?? Date.now();
          tx.insert(deposits).values({
            id: dId,
            user_id: userId,
            chain: tr.chain,
            symbol: tr.symbol,
            amount_raw: tr.amountRaw,
            tx_hash: tr.txHash,
            from_address: tr.from,
            block_number: tr.blockNumber,
            confirmed_at: ts,
            credited_at: Date.now()
          }).run();
          tx.insert(ledgerEntries).values({
            id: ulid(),
            user_id: userId,
            chain: tr.chain,
            symbol: tr.symbol,
            delta_raw: tr.amountRaw, // positive = received
            kind: "deposit",
            ref_tx_hash: tr.txHash,
            ref_id: dId,
            created_at: ts
          }).run();
        }
      });
      // Email a branded confirmation for each newly-indexed deposit.
      for (const tr of fresh) {
        const tok = findToken(tr.chain as any, tr.symbol);
        const human = Number(BigInt(tr.amountRaw)) / 10 ** (tok?.decimals ?? 18);
        const price = priceUsd(tr.symbol as any) ?? null;
        fetch(AUTH_BASE + "/internal/email/deposit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + process.env.INTERNAL_SERVICE_TOKEN
          },
          body: JSON.stringify({
            userId: userId,
            amount: human.toLocaleString(undefined, { maximumFractionDigits: 8 }),
            symbol: tr.symbol,
            chain: tr.chain,
            usd: price != null ? human * price : null,
            txHash: tr.txHash
          })
        }).catch(() => {});
      }
    }
  } catch (e) {
    log.error({ err: e }, "transfer indexing failed (non-fatal)");
  }
}

export async function walletRoutes(app: FastifyInstance) {

  // POST /wallet/users (internal service-to-service)
  app.post("/wallet/users", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;
    const body = req.body as { userId: string };
    if (!body?.userId) return reply.code(400).send({ error: "Missing userId" });
    await ensureUserWallet(body.userId);
    return reply.send({ ok: true });
  });

  // GET /wallet/addresses
  app.get("/wallet/addresses", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    // Auto-provision on first access — no separate signup hook needed.
    await ensureUserWallet(user.sub);

    const addrs = await db.select().from(userWalletAddresses).where(eq(userWalletAddresses.user_id, user.sub)).limit(1);
    if (addrs.length === 0) return reply.code(404).send({ error: "No addresses found" });

    return reply.send({
      eth: addrs[0]!.eth,
      bsc: addrs[0]!.bsc,
      polygon: addrs[0]!.polygon || addrs[0]!.eth,
      tron: addrs[0]!.tron,
      btc: addrs[0]!.btc
    });
  });

  // GET /wallet/balances
  app.get("/wallet/balances", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    await ensureUserWallet(user.sub);
    const balances = await db.select().from(ledgerBalances).where(eq(ledgerBalances.user_id, user.sub));
    
    const rawBalances = {
      eth: {} as Record<string, string>,
      bsc: {} as Record<string, string>,
      polygon: {} as Record<string, string>,
      tron: {} as Record<string, string>,
      btc: {} as Record<string, string>
    };

    for (const b of balances) {
      if (b.chain in rawBalances) {
        (rawBalances as any)[b.chain][b.symbol] = b.raw;
      }
    }

    const aggregated = aggregate(rawBalances);
    return reply.send(aggregated);
  });

  // POST /wallet/refresh
  app.post("/wallet/refresh", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    // Detect + credit any new on-chain deposits (shared with the background
    // scanner). Flips the member to 'active' if the $1 activation clears.
    await refreshUserDeposits(user.sub, app.log);

    // Return the authoritative LEDGER view (same source as GET /wallet/balances).
    // reconcile() above already credited the ledger from any new on-chain
    // deposits — but the ledger, not the live on-chain snapshot, is what the
    // member actually holds: deposits are swept to treasury after crediting (so
    // the deposit address reads ~0 afterwards) and admin/credit adjustments live
    // only in the ledger. Returning snap.byLogicalAsset would wrongly show $0 in
    // those cases, which made Refresh appear to "wipe" the balance.
    const ledgerRows = await db
      .select()
      .from(ledgerBalances)
      .where(eq(ledgerBalances.user_id, user.sub));
    const rawLedger = { eth: {}, bsc: {}, polygon: {}, tron: {}, btc: {} } as Record<
      string,
      Record<string, string>
    >;
    for (const b of ledgerRows) {
      if (b.chain in rawLedger) rawLedger[b.chain]![b.symbol] = b.raw;
    }
    return reply.send(aggregate(rawLedger as any));
  });

  // POST /wallet/withdrawals
  app.post("/wallet/withdrawals", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    // Anti-takeover cooldown (signup + wallet-password-change). Fails closed.
    const cd = await checkCooldown(user.sub);
    if (!cd.ok) return reply.code(403).send({ error: cd.message });

    const { chain, symbol, amountRaw, destAddress } = req.body as any;
    if (!chain || !symbol || !amountRaw || !destAddress) return reply.code(400).send({ error: "Missing fields" });

    // amountRaw must be a positive integer string (base units).
    if (typeof amountRaw !== "string" || !/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) {
      return reply.code(400).send({ error: "amountRaw must be a positive integer string." });
    }
    if (typeof destAddress !== "string" || destAddress.length > 128) {
      return reply.code(400).send({ error: "Invalid destination address." });
    }

    // Validate the destination is a well-formed address for the chain.
    if (!isValidDestination(chain, destAddress)) {
      return reply.code(400).send({ error: "Invalid destination address for this chain." });
    }

    const token = findToken(chain, symbol);
    if (!token) return reply.code(400).send({ error: `Unsupported asset ${symbol} on ${chain}.` });

    // Validate ledger
    const balance = await db.select().from(ledgerBalances)
      .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, chain), eq(ledgerBalances.symbol, symbol)))
      .limit(1);

    if (balance.length === 0 || BigInt(balance[0]!.raw) < BigInt(amountRaw)) {
      return reply.code(400).send({ error: "Insufficient balance" });
    }

    // ── Withdrawal caps (USD), from effective (per-user or global) limits ──
    const limits = await effectiveLimits(user.sub);
    const usdPrice = priceUsd(symbol as any) ?? 0;
    const human = Number(BigInt(amountRaw)) / 10 ** token.decimals;
    const usdValue = human * usdPrice;

    // Minimum withdrawal (per chain:symbol, in the token).
    const minAmt = (await financeConfig()).minimums[`${chain}:${symbol}`] ?? 0;
    if (minAmt > 0 && human < minAmt) {
      return reply.code(400).send({ error: `Minimum withdrawal is ${minAmt} ${symbol} on ${chain}.` });
    }

    if (usdPrice > 0 && usdValue > limits.maxPerTxUsd) {
      return reply.code(400).send({
        error: `Withdrawal exceeds the per-transaction limit of $${limits.maxPerTxUsd}.`
      });
    }

    // Daily cap: sum non-failed withdrawals in the last 24h (USD). Pending and
    // awaiting-approval withdrawals count as outflow (only failed/rejected skip).
    if (usdPrice > 0) {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const recent = await db.select().from(withdrawals)
        .where(and(eq(withdrawals.user_id, user.sub)));
      let dayUsd = 0;
      for (const r of recent) {
        if ((r.requested_at ?? 0) < since) continue;
        if (r.status === "failed" || r.status === "rejected") continue;
        const t = findToken(r.chain as any, r.symbol);
        if (!t) continue;
        const p = priceUsd(r.symbol as any) ?? 0;
        dayUsd += (Number(BigInt(r.amount_raw)) / 10 ** t.decimals) * p;
      }
      if (dayUsd + usdValue > limits.dailyUsd) {
        return reply.code(400).send({
          error: `This would exceed your 24h withdrawal limit of $${limits.dailyUsd}.`
        });
      }
    }

    const wId = ulid();

    // Trigger a BRANDED wallet OTP (not the login template) for this withdrawal.
    let otpSessionId = "stub-otp";
    try {
      const res = await fetch(AUTH_BASE + "/auth/wallet-otp/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization
        },
        body: "{}"
      });
      if (!res.ok) throw new Error("OTP request failed");
      otpSessionId = "called-otp-service";
    } catch (err) {
      app.log.error(err);
      return reply.code(502).send({ error: "Failed to request OTP" });
    }

    await db.insert(withdrawals).values({
      id: wId,
      user_id: user.sub,
      chain,
      symbol,
      amount_raw: amountRaw,
      dest_address: destAddress,
      status: "pending_otp",
      otp_session_id: otpSessionId,
      requested_at: Date.now()
    });

    // Heads-up: a withdrawal is being attempted. Confirmation hasn't fired
    // yet — the user still has to enter the OTP. Pair with the "Withdrawal
    // sent" alert later for the full lifecycle.
    notify(
      `📤 <b>Withdrawal requested</b>\n${symbol} on ${chain}\n` +
        `to <code>${destAddress}</code>\nuser <code>${user.sub}</code>`
    );

    return reply.send({ withdrawalId: wId, otpSessionId });
  });

  // POST /wallet/withdrawals/:id/confirm
  app.post("/wallet/withdrawals/:id/confirm", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    const { id } = req.params;
    const { code, walletPassword } = req.body as any;
    // Withdrawals require BOTH the wallet password AND the emailed OTP.
    if (!walletPassword) return reply.code(400).send({ error: "Wallet password is required." });
    if (!code) return reply.code(400).send({ error: "The emailed verification code is required." });

    // 1) Verify the wallet password.
    {
      try {
        const authResp = await fetch(AUTH_BASE + "/auth/wallet-password/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + req.headers.authorization.slice(7).trim()
          },
          body: JSON.stringify({ password: walletPassword })
        });
        if (!authResp.ok) return reply.code(400).send({ error: "Invalid wallet password" });
      } catch (e) {
        app.log.error(e);
        return reply.code(502).send({ error: "Failed to verify password" });
      }
    }
    // 2) Verify the OTP.
    {
      try {
        const authResp = await fetch(AUTH_BASE + "/auth/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, code })
        });
        if (!authResp.ok) return reply.code(400).send({ error: "Invalid OTP code" });
      } catch (e) {
        app.log.error(e);
        return reply.code(502).send({ error: "Failed to verify OTP" });
      }
    }

    const wRows = await db.select().from(withdrawals)
      .where(and(eq(withdrawals.id, id), eq(withdrawals.user_id, user.sub), eq(withdrawals.status, "pending_otp")))
      .limit(1);

    if (wRows.length === 0) return reply.code(404).send({ error: "Withdrawal not found or not in pending_otp state" });
    const w = wRows[0]!;

    // Atomic debit — synchronous transaction (better-sqlite3).
    let success = false;
    try {
      db.transaction((tx) => {
        const balRow = tx.select().from(ledgerBalances)
          .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)))
          .limit(1)
          .all();

        if (balRow.length === 0 || BigInt(balRow[0]!.raw) < BigInt(w.amount_raw)) {
          throw new Error("Insufficient balance");
        }

        const newBal = (BigInt(balRow[0]!.raw) - BigInt(w.amount_raw)).toString();
        tx.update(ledgerBalances).set({ raw: newBal, updated_at: Date.now() })
          .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)))
          .run();

        tx.insert(ledgerEntries).values({
          id: ulid(),
          user_id: user.sub,
          chain: w.chain,
          symbol: w.symbol,
          delta_raw: "-" + w.amount_raw,
          kind: "withdrawal",
          ref_id: w.id
        }).run();

        tx.update(withdrawals).set({ status: "signing" }).where(eq(withdrawals.id, w.id)).run();
        success = true;
      });
    } catch {
      success = false;
    }

    if (!success) return reply.code(400).send({ error: "Insufficient balance" });

    // ── Large-withdrawal approval hold ─────────────────────────────────────
    // Funds are already debited (reserved). If this is at/above the review
    // threshold, park it as awaiting_approval and DO NOT broadcast — an admin
    // approves (broadcast) or rejects (refund) from the review queue.
    // (A demo account skips the hold — there is nothing to review when nothing
    // can leave.)
    if (!isDemoAccount(user.sub)) {
      const wTok = findToken(w.chain as any, w.symbol);
      const wUsd = wTok ? (Number(BigInt(w.amount_raw)) / 10 ** wTok.decimals) * (priceUsd(w.symbol as any) ?? 0) : 0;
      const limits = await effectiveLimits(user.sub);
      if (wUsd > 0 && wUsd >= limits.reviewThresholdUsd) {
        await db.update(withdrawals).set({ status: "awaiting_approval" }).where(eq(withdrawals.id, w.id));
        notify(
          `🕵️ <b>Withdrawal held for review</b>\n${w.symbol} on ${w.chain} (~$${wUsd.toFixed(2)})\n` +
            `to <code>${w.dest_address}</code>\nuser <code>${user.sub}</code>`
        );
        return reply.send({ ok: true, awaitingApproval: true, withdrawalId: w.id });
      }
    }

    // Demo account: short-circuit BEFORE anything touches the
    // treasury: no key is loaded, no transaction is built, nothing is sent.
    // The ledger is still debited above, so the member sees their balance drop
    // and the withdrawal complete exactly like a real one.
    if (isDemoAccount(user.sub)) {
      const demoNet = await netWithdrawRaw(w.chain, w.symbol, w.amount_raw);
      const demoHash = demoTxHash(w.chain);
      await db
        .update(withdrawals)
        .set({
          status: "confirmed",
          signed_at: Date.now(),
          broadcast_at: Date.now(),
          confirmed_at: Date.now(),
          tx_hash: demoHash,
          fee_raw: demoNet.feeRaw,
          is_demo: 1
        })
        .where(eq(withdrawals.id, w.id));
      app.log.warn(
        { withdrawalId: w.id, userId: user.sub },
        "[demo] withdrawal completed WITHOUT broadcasting (demo account)"
      );
      notify(
        `🧪 <b>DEMO withdrawal</b> (nothing sent on-chain)\n${w.symbol} on ${w.chain}\n` +
          `to <code>${w.dest_address}</code>`
      );
      // The member-facing flow has to look complete, and the confirmation email
      // is part of that — the real path sends one further down, past this
      // early return, so send it here too.
      {
        const dTok = findToken(w.chain as any, w.symbol);
        const dHuman = Number(BigInt(w.amount_raw)) / 10 ** (dTok?.decimals ?? 18);
        fetch(AUTH_BASE + "/internal/email/withdrawal", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.INTERNAL_SERVICE_TOKEN
          },
          body: JSON.stringify({
            userId: user.sub,
            amount: dHuman.toLocaleString(undefined, { maximumFractionDigits: 8 }),
            symbol: w.symbol,
            chain: w.chain,
            dest: w.dest_address,
            txHash: demoHash
          })
        }).catch(() => {});
      }
      return reply.send({ ok: true, status: "broadcast", txHash: demoHash });
    }

    // Balance is debited and the row is in "signing". Pay out from the company
    // treasury wallet. On any broadcast failure, REFUND the ledger so the user
    // never loses funds to a failed send.
    await db.update(withdrawals).set({ signed_at: Date.now() }).where(eq(withdrawals.id, w.id));
    const net = await netWithdrawRaw(w.chain, w.symbol, w.amount_raw);
    let txHash: string;
    try {
      txHash = await sendWithdrawal({
        chain: w.chain,
        symbol: w.symbol,
        amountRaw: net.sendRaw,
        destAddress: w.dest_address
      });
    } catch (e) {
      app.log.error({ err: e, withdrawalId: w.id }, "withdrawal broadcast failed — refunding");
      // Refund: re-credit the debited balance + reversing ledger entry.
      db.transaction((tx) => {
        const balRow = tx.select().from(ledgerBalances)
          .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)))
          .limit(1)
          .all();
        const cur = balRow.length ? BigInt(balRow[0]!.raw) : 0n;
        tx.update(ledgerBalances).set({ raw: (cur + BigInt(w.amount_raw)).toString(), updated_at: Date.now() })
          .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)))
          .run();
        tx.insert(ledgerEntries).values({
          id: ulid(),
          user_id: user.sub,
          chain: w.chain,
          symbol: w.symbol,
          delta_raw: "+" + w.amount_raw,
          kind: "withdrawal_refund",
          ref_id: w.id
        }).run();
        tx.update(withdrawals).set({ status: "failed" }).where(eq(withdrawals.id, w.id)).run();
      });
      notify(
        `⚠️ <b>Withdrawal FAILED — refunded</b>\n${w.symbol} on ${w.chain}\n` +
          `to <code>${w.dest_address}</code>\n${(e as Error).message}`
      );
      return reply.code(502).send({
        error: "Withdrawal could not be broadcast; your balance was refunded.",
        detail: (e as Error).message
      });
    }

    await db.update(withdrawals).set({ status: "broadcast", broadcast_at: Date.now(), tx_hash: txHash, fee_raw: net.feeRaw }).where(eq(withdrawals.id, w.id));

    notify(
      `💸 <b>Withdrawal sent</b>\n${w.symbol} on ${w.chain}\n` +
        `to <code>${w.dest_address}</code>\ntx: <code>${txHash}</code>`
    );

    // Branded withdrawal-sent email (best-effort).
    {
      const tok = findToken(w.chain as any, w.symbol);
      const human = Number(BigInt(w.amount_raw)) / 10 ** (tok?.decimals ?? 18);
      fetch(AUTH_BASE + "/internal/email/withdrawal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + process.env.INTERNAL_SERVICE_TOKEN
        },
        body: JSON.stringify({
          userId: user.sub,
          amount: human.toLocaleString(undefined, { maximumFractionDigits: 8 }),
          symbol: w.symbol,
          chain: w.chain,
          dest: w.dest_address,
          txHash
        })
      }).catch(() => {});
    }

    // ── Protected-liquidity floor check ──────────────────────────────────
    // The $1 a member deposits backs their 10B tokens. They may freely
    // withdraw down to that floor; a withdrawal that drops their TOTAL usable
    // balance below $1 forfeits the liquidity — their tokens are clawed back
    // to admin (recorded with their reference number). The balance was already
    // debited above, so we just re-aggregate the remaining ledger. Best-effort
    // and non-fatal: the withdrawal itself already succeeded.
    try {
      const remaining = await db.select().from(ledgerBalances).where(eq(ledgerBalances.user_id, user.sub));
      const rawRemaining = { eth: {} as Record<string, string>, bsc: {} as Record<string, string>, polygon: {} as Record<string, string>, tron: {} as Record<string, string>, btc: {} as Record<string, string> };
      for (const b of remaining) {
        if (b.chain in rawRemaining) (rawRemaining as any)[b.chain][b.symbol] = b.raw;
      }
      const remainingUsd = aggregate(rawRemaining).reduce((s, a) => s + (a.usd ?? 0), 0);
      if (remainingUsd < PROTECTED_FLOOR_USD) {
        const r = await fetch(AUTH_BASE + "/internal/users/" + user.sub + "/exit-liquidity", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + process.env.INTERNAL_SERVICE_TOKEN
          },
          body: "{}"
        });
        const data = (await r.json().catch(() => ({}))) as any;
        if (data?.forfeited) {
          notify(
            `🔻 <b>Liquidity floor breached</b>\nuser <code>${user.sub}</code>\n` +
              `remaining $${remainingUsd.toFixed(2)} < $${PROTECTED_FLOOR_USD} floor\n` +
              `${Number(data.tokens).toLocaleString()} tokens forfeited (ref ${data.referenceNo})`
          );
        }
      }
    } catch (e) {
      app.log.error({ err: e }, "liquidity floor check failed (non-fatal)");
    }

    return reply.send({ ok: true, status: "broadcast", txHash });
  });

  // GET /wallet/history
  // Returns enriched ledger entries: signed human amount, USD value, the
  // on-chain tx hash, counterparty address + status (joined from the
  // deposit/withdrawal the entry references). Used by the wallet history
  // list + per-transaction detail view.
  app.get("/wallet/history", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    const entries = await db.select().from(ledgerEntries)
      .where(eq(ledgerEntries.user_id, user.sub))
      .orderBy(desc(ledgerEntries.created_at))
      .limit(100);

    // Pull the referenced withdrawals + deposits in bulk for join data.
    const wRows = await db.select().from(withdrawals).where(eq(withdrawals.user_id, user.sub));
    const dRows = await db.select().from(deposits).where(eq(deposits.user_id, user.sub));
    const wById = new Map(wRows.map((w) => [w.id, w]));
    const dById = new Map(dRows.map((d) => [d.id, d]));

    const enriched = entries.map((e) => {
      const t = findToken((e.chain as any) ?? "eth", e.symbol);
      const decimals = t?.decimals ?? 18;
      const signed = BigInt(e.delta_raw); // delta_raw carries the +/- sign
      const human = Number(signed) / 10 ** decimals;
      const price = priceUsd(e.symbol as any) ?? null;
      const usd = price != null ? Math.abs(human) * price : null;

      const w = e.ref_id ? wById.get(e.ref_id) : undefined;
      const d = e.ref_id ? dById.get(e.ref_id) : undefined;
      const txHash = e.ref_tx_hash ?? w?.tx_hash ?? d?.tx_hash ?? null;
      // Counterparty: withdrawals have a destination; deposits have a sender.
      const to = w?.dest_address ?? null;
      const from = d?.from_address ?? null;
      const status =
        w?.status ?? (e.kind === "deposit" ? "confirmed" : "confirmed");

      return {
        id: e.id,
        kind: e.kind,
        chain: e.chain,
        symbol: e.symbol,
        delta_raw: e.delta_raw,
        decimals,
        amount: human, // signed
        usd, // absolute USD value
        tx_hash: txHash,
        to,
        from,
        status,
        created_at: e.created_at
      };
    });

    return reply.send(enriched);
  });

  // GET /wallet/studio/quote
  // Returns the $18-equivalent amount in every priced coin so the UI can show
  // a coin picker. Unpriced coins (no live price) are omitted.
  app.get("/wallet/studio/quote", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;

    const options = LOGICAL_ASSETS.flatMap((asset) => {
      const price = priceUsd(asset);
      const amount = coinAmountForUsd(STUDIO_FEE_USD, asset);
      if (price === null || amount === null) return [];
      return [{ asset, usd: STUDIO_FEE_USD, price, amount }];
    });

    return reply.send({ feeUsd: STUDIO_FEE_USD, options });
  });

  // POST /wallet/studio/unlock  { asset }
  // Charges the $18 Studio fee in `asset` (any priced coin) from the user's
  // ledger balance, records it as a fee (platform keeps it), then tells the
  // auth service to flip studio_unlocked_at. Idempotent.
  app.post("/wallet/studio/unlock", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;
    const bearer = (req.headers.authorization as string) ?? "";

    // Already unlocked? Don't charge twice.
    try {
      const meRes = await fetch(AUTH_BASE + "/auth/me", {
        headers: { Authorization: bearer }
      });
      if (meRes.ok) {
        const me = (await meRes.json()) as any;
        if (me?.user?.studioUnlocked) {
          return reply.send({ ok: true, alreadyUnlocked: true });
        }
      }
    } catch (e) {
      app.log.error(e);
      // Non-fatal — fall through and let the charge proceed.
    }

    const asset = (req.body as any)?.asset as LogicalAsset | undefined;
    if (!asset || !(LOGICAL_ASSETS as string[]).includes(asset)) {
      return reply.code(400).send({ error: "Unknown or missing asset." });
    }

    // In-platform spending requires the wallet password (no OTP).
    const walletPassword = (req.body as any)?.walletPassword as string | undefined;
    if (!walletPassword) {
      return reply.code(400).send({ error: "Wallet password is required." });
    }
    try {
      const pwResp = await fetch(AUTH_BASE + "/auth/wallet-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({ password: walletPassword })
      });
      if (!pwResp.ok) return reply.code(400).send({ error: "Invalid wallet password" });
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: "Failed to verify password" });
    }

    const coinAmount = coinAmountForUsd(STUDIO_FEE_USD, asset);
    if (coinAmount === null) {
      return reply.code(400).send({ error: `${asset} is not priced right now.` });
    }

    // Find a chain instance of this asset whose ledger balance covers the fee.
    const instances = ASSET_INSTANCES[asset] ?? [];
    let charged: { chain: string; symbol: string; raw: string } | null = null;

    try {
      db.transaction((tx) => {
        for (const t of instances) {
          const requiredRaw = toRawUnits(coinAmount, t.decimals);
          const rows = tx
            .select()
            .from(ledgerBalances)
            .where(
              and(
                eq(ledgerBalances.user_id, user.sub),
                eq(ledgerBalances.chain, t.chain),
                eq(ledgerBalances.symbol, t.symbol)
              )
            )
            .limit(1)
            .all();
          if (rows.length === 0) continue;
          const have = BigInt(rows[0]!.raw);
          if (have < requiredRaw) continue;

          const newBal = (have - requiredRaw).toString();
          tx
            .update(ledgerBalances)
            .set({ raw: newBal, updated_at: Date.now() })
            .where(
              and(
                eq(ledgerBalances.user_id, user.sub),
                eq(ledgerBalances.chain, t.chain),
                eq(ledgerBalances.symbol, t.symbol)
              )
            )
            .run();
          const entryId = ulid();
          tx.insert(ledgerEntries).values({
            id: entryId,
            user_id: user.sub,
            chain: t.chain,
            symbol: t.symbol,
            delta_raw: "-" + requiredRaw.toString(),
            kind: "studio_fee",
            ref_id: "studio-unlock"
          }).run();
          // Revenue, recorded in the SAME transaction as the debit so the sale
          // and the ledger can never disagree. USD is the price charged, not a
          // recomputation from today's rate.
          tx.insert(sales).values({
            id: ulid(),
            user_id: user.sub,
            item: "studio_unlock",
            item_name: "Studio unlock",
            chain: t.chain,
            symbol: t.symbol,
            amount_raw: requiredRaw.toString(),
            usd: STUDIO_FEE_USD,
            ledger_entry_id: entryId,
            created_at: Date.now()
          }).run();
          charged = { chain: t.chain, symbol: t.symbol, raw: requiredRaw.toString() };
          break;
        }
        if (!charged) {
          throw new Error("INSUFFICIENT");
        }
      });
    } catch (e) {
      if ((e as Error).message === "INSUFFICIENT") {
        return reply
          .code(400)
          .send({ error: `Insufficient ${asset} balance for the $${STUDIO_FEE_USD} fee.` });
      }
      app.log.error(e);
      return reply.code(500).send({ error: "Failed to charge Studio fee." });
    }

    // Flip the studio flag in auth (idempotent there too).
    try {
      const unlockRes = await fetch(
        AUTH_BASE + "/internal/users/" + user.sub + "/studio-unlock",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.INTERNAL_SERVICE_TOKEN
          },
          body: "{}"
        }
      );
      if (!unlockRes.ok) {
        app.log.error(`studio-unlock auth call failed: ${unlockRes.status}`);
        // The fee was charged; surface a soft error so support can reconcile.
        return reply.code(502).send({
          error: "Fee charged but Studio unlock failed — contact support.",
          charged
        });
      }
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({
        error: "Fee charged but Studio unlock failed — contact support.",
        charged
      });
    }

    const paid = charged as { chain: string; symbol: string } | null;
    if (paid) {
      notify(
        `🎬 <b>Studio unlocked</b> ($${STUDIO_FEE_USD})\n` +
          `user <code>${user.sub}</code>\npaid in ${paid.symbol} on ${paid.chain}`
      );
    }

    return reply.send({ ok: true, charged, studioUnlocked: true });
  });

  // POST /wallet/swaps — convert between ANY two priced ledger assets at the
  // platform rate (PARTY fixed at $10; crypto priced live). Covers crypto→PARTY,
  // PARTY→crypto, and crypto→crypto. Ledger-only: debit the source instance,
  // credit the destination instance, record swap + two ledger entries.
  // In-platform spend → wallet password required (no OTP); a locked wallet is
  // rejected by the verify endpoint (423), so freezes block swaps too.
  //
  // Body: { from:{chain,symbol}, to:{chain,symbol}, amount, walletPassword }.
  // Back-compat: legacy { chain, symbol } (no `to`) still means → PARTY.
  app.post("/wallet/swaps", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;
    const bearer = (req.headers.authorization as string) ?? "";

    const body = (req.body ?? {}) as {
      from?: { chain?: string; symbol?: string };
      to?: { chain?: string; symbol?: string };
      chain?: string; // legacy
      symbol?: string; // legacy
      amount?: number | string;
      walletPassword?: string;
    };
    const from = body.from ?? { chain: body.chain, symbol: body.symbol };
    const to = body.to ?? { chain: "tron", symbol: "PARTY" };
    const fromToken = findToken(from.chain as any, String(from.symbol ?? ""));
    const toToken = findToken(to.chain as any, String(to.symbol ?? ""));
    if (!fromToken) return reply.code(400).send({ error: "Unknown source asset." });
    if (!toToken) return reply.code(400).send({ error: "Unknown destination asset." });
    if (fromToken.chain === toToken.chain && fromToken.symbol === toToken.symbol) {
      return reply.code(400).send({ error: "Source and destination are the same." });
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ error: "Enter a valid amount." });
    }
    if (!body.walletPassword) {
      return reply.code(400).send({ error: "Wallet password is required." });
    }
    try {
      const pw = await fetch(AUTH_BASE + "/auth/wallet-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: bearer },
        body: JSON.stringify({ password: body.walletPassword })
      });
      if (pw.status === 423) {
        return reply.code(423).send({ error: "Wallet is frozen — unlock it first." });
      }
      if (!pw.ok) return reply.code(400).send({ error: "Invalid wallet password" });
    } catch (e) {
      app.log.error(e);
      return reply.code(502).send({ error: "Failed to verify password" });
    }

    // Quote at current prices.
    const received = quoteSwap(fromToken.symbol as LogicalAsset, amount, toToken.symbol as LogicalAsset);
    const rateFrom = priceUsd(fromToken.symbol as LogicalAsset);
    const rateTo = priceUsd(toToken.symbol as LogicalAsset);
    if (received === null || rateFrom === null || rateTo === null) {
      return reply.code(400).send({ error: "One side isn't priced right now." });
    }
    const fromRaw = toRawUnits(amount, fromToken.decimals);
    const toRaw = toRawUnits(received, toToken.decimals);
    if (fromRaw <= 0n || toRaw <= 0n) {
      return reply.code(400).send({ error: "Amount too small to convert." });
    }

    const swapId = ulid();
    try {
      db.transaction((tx) => {
        const srcRows = tx
          .select()
          .from(ledgerBalances)
          .where(
            and(
              eq(ledgerBalances.user_id, user.sub),
              eq(ledgerBalances.chain, fromToken.chain),
              eq(ledgerBalances.symbol, fromToken.symbol)
            )
          )
          .limit(1)
          .all();
        const have = srcRows.length ? BigInt(srcRows[0]!.raw) : 0n;
        if (have < fromRaw) throw new Error("INSUFFICIENT");

        // Debit source instance
        tx.update(ledgerBalances)
          .set({ raw: (have - fromRaw).toString(), updated_at: Date.now() })
          .where(
            and(
              eq(ledgerBalances.user_id, user.sub),
              eq(ledgerBalances.chain, fromToken.chain),
              eq(ledgerBalances.symbol, fromToken.symbol)
            )
          )
          .run();
        // Credit destination instance (upsert)
        const dstRows = tx
          .select()
          .from(ledgerBalances)
          .where(
            and(
              eq(ledgerBalances.user_id, user.sub),
              eq(ledgerBalances.chain, toToken.chain),
              eq(ledgerBalances.symbol, toToken.symbol)
            )
          )
          .limit(1)
          .all();
        if (dstRows.length) {
          const dhave = BigInt(dstRows[0]!.raw);
          tx.update(ledgerBalances)
            .set({ raw: (dhave + toRaw).toString(), updated_at: Date.now() })
            .where(
              and(
                eq(ledgerBalances.user_id, user.sub),
                eq(ledgerBalances.chain, toToken.chain),
                eq(ledgerBalances.symbol, toToken.symbol)
              )
            )
            .run();
        } else {
          tx.insert(ledgerBalances)
            .values({
              user_id: user.sub,
              chain: toToken.chain,
              symbol: toToken.symbol,
              raw: toRaw.toString(),
              decimals: toToken.decimals,
              updated_at: Date.now()
            })
            .run();
        }
        // Audit trail: swap row + paired ledger entries. rate_usd = USD/unit of source.
        tx.insert(swaps)
          .values({
            id: swapId,
            user_id: user.sub,
            from_symbol: fromToken.symbol,
            from_chain: fromToken.chain,
            from_raw: fromRaw.toString(),
            to_symbol: toToken.symbol,
            to_chain: toToken.chain,
            to_raw: toRaw.toString(),
            rate_usd: String(rateFrom),
            created_at: Date.now()
          })
          .run();
        tx.insert(ledgerEntries)
          .values({
            id: ulid(),
            user_id: user.sub,
            chain: fromToken.chain,
            symbol: fromToken.symbol,
            delta_raw: "-" + fromRaw.toString(),
            kind: "swap_out",
            ref_id: swapId,
            created_at: Date.now()
          })
          .run();
        tx.insert(ledgerEntries)
          .values({
            id: ulid(),
            user_id: user.sub,
            chain: toToken.chain,
            symbol: toToken.symbol,
            delta_raw: toRaw.toString(),
            kind: "swap_in",
            ref_id: swapId,
            created_at: Date.now()
          })
          .run();
      });
    } catch (e) {
      if ((e as Error).message === "INSUFFICIENT") {
        return reply.code(400).send({ error: `Not enough ${fromToken.symbol} on ${fromToken.chain}.` });
      }
      throw e;
    }

    notify(
      `🔄 <b>Swap</b>\nuser <code>${user.sub}</code>\n` +
        `${amount} ${fromToken.symbol} (${fromToken.chain}) → ${received.toFixed(6)} ${toToken.symbol} (${toToken.chain})`
    );
    return reply.send({
      ok: true,
      swapId,
      received,
      from: { symbol: fromToken.symbol, chain: fromToken.chain, usd: rateFrom },
      to: { symbol: toToken.symbol, chain: toToken.chain, usd: rateTo }
    });
  });

  // GET /wallet/swaps/quote — authoritative price quote for the convert UI.
  app.get("/wallet/swaps/quote", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const q = req.query as Record<string, string>;
    const fromToken = findToken(q.fromChain as any, q.fromSymbol ?? "");
    const toToken = findToken(q.toChain as any, q.toSymbol ?? "");
    const amount = Number(q.amount);
    if (!fromToken || !toToken) return reply.code(400).send({ error: "Unknown asset." });
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.send({ received: null });
    }
    const received = quoteSwap(fromToken.symbol as LogicalAsset, amount, toToken.symbol as LogicalAsset);
    return reply.send({
      received,
      fromUsd: priceUsd(fromToken.symbol as LogicalAsset),
      toUsd: priceUsd(toToken.symbol as LogicalAsset)
    });
  });

  // Admin routes
  app.get("/wallet/admin/users", async (req: any, reply) => {
    if (!await requireRole(req, reply, "admin")) return;
    return reply.code(501).send({ error: "Not implemented" });
  });

  // GET /wallet/admin/balances — usable (ledger DB) USD totals per user. Cheap
  // (no RPC). Returns { [userId]: usableUsd }.
  app.get("/wallet/admin/balances", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const rows = await db.select().from(ledgerBalances);
    const byUser = new Map<string, PerChainRawBalances>();
    for (const b of rows) {
      let m = byUser.get(b.user_id);
      if (!m) {
        m = { eth: {}, bsc: {}, polygon: {}, tron: {}, btc: {} };
        byUser.set(b.user_id, m);
      }
      if (b.chain in m) (m as any)[b.chain][b.symbol] = b.raw;
    }
    const out: Record<string, number> = {};
    for (const [uid, raw] of byUser) {
      out[uid] = aggregate(raw).reduce((s, a) => s + (a.usd ?? 0), 0);
    }
    return reply.send(out);
  });

  // GET /wallet/admin/user/:id/onchain — ACTUAL on-chain USD for one user
  // (live reconcile via RPC). On-demand only — too costly for the whole list.
  app.get("/wallet/admin/user/:id/onchain", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const { id } = req.params;
    const addrs = await db
      .select()
      .from(userWalletAddresses)
      .where(eq(userWalletAddresses.user_id, id))
      .limit(1);
    if (addrs.length === 0) return reply.send({ actualUsd: 0, note: "no wallet" });
    const a = addrs[0]!;
    const snap = await reconcile({ eth: a.eth, bsc: a.bsc, polygon: a.polygon || a.eth, tron: a.tron, btc: a.btc });
    const actualUsd = snap.byLogicalAsset.reduce((s, x) => s + (x.usd ?? 0), 0);
    return reply.send({ actualUsd });
  });

  // GET /wallet/admin/user/:id/detail — the member's deposit addresses + the
  // full ledger balance breakdown (per logical asset, with USD). Cheap: reads
  // the ledger DB only, no RPC. Powers the admin member popup.
  app.get("/wallet/admin/user/:id/detail", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const { id } = req.params;

    const addrRows = await db
      .select()
      .from(userWalletAddresses)
      .where(eq(userWalletAddresses.user_id, id))
      .limit(1);
    const a = addrRows[0] ?? null;

    const balRows = await db
      .select()
      .from(ledgerBalances)
      .where(eq(ledgerBalances.user_id, id));
    const rawLedger = { eth: {}, bsc: {}, polygon: {}, tron: {}, btc: {} } as Record<
      string,
      Record<string, string>
    >;
    for (const b of balRows) {
      if (b.chain in rawLedger) rawLedger[b.chain]![b.symbol] = b.raw;
    }
    const balances = aggregate(rawLedger as PerChainRawBalances);

    return reply.send({
      addresses: a
        ? { userIndex: a.user_index, eth: a.eth, bsc: a.bsc, polygon: a.polygon || a.eth, tron: a.tron, btc: a.btc }
        : null,
      balances,
      usableUsd: totalUsd(balances)
    });
  });

  // Review queue — withdrawals held for admin approval (default), or a status.
  app.get("/wallet/admin/withdrawals", async (req: any, reply) => {
    if (!(await requireCapability(req, reply, "withdrawals"))) return;
    const status = String(req.query?.status || "awaiting_approval");
    const rows = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.status, status))
      .orderBy(desc(withdrawals.requested_at))
      .limit(200);
    const REQUIRED = Math.max(1, Number(process.env.WITHDRAWAL_APPROVALS_REQUIRED ?? 1));
    const meId = req.user?.sub;
    return reply.send({
      required: REQUIRED,
      withdrawals: rows.map((w) => {
        const t = findToken(w.chain as any, w.symbol);
        const amount = t ? Number(BigInt(w.amount_raw)) / 10 ** t.decimals : 0;
        const usd = amount * (priceUsd(w.symbol as any) ?? 0);
        const appr = rawDb
          .prepare(`SELECT admin_id FROM withdrawal_approvals WHERE withdrawal_id = ?`)
          .all(w.id) as any[];
        return {
          id: w.id,
          userId: w.user_id,
          chain: w.chain,
          symbol: w.symbol,
          amount,
          usd,
          destAddress: w.dest_address,
          requestedAt: w.requested_at,
          status: w.status,
          approvals: appr.length,
          required: REQUIRED,
          mineApproved: meId ? appr.some((a) => a.admin_id === meId) : false
        };
      })
    });
  });

  // Approve a held withdrawal → broadcast from treasury. Funds already debited.
  app.post("/wallet/admin/withdrawals/:id/approve", async (req: any, reply) => {
    if (!(await requireCapability(req, reply, "withdrawals"))) return;
    const admin = req.user!;
    const rows = await db
      .select()
      .from(withdrawals)
      .where(and(eq(withdrawals.id, req.params.id), eq(withdrawals.status, "awaiting_approval")))
      .limit(1);
    if (rows.length === 0) return reply.code(404).send({ error: "No withdrawal awaiting approval with that id." });
    const w = rows[0]!;

    // 4-eyes: record this admin's distinct approval; only broadcast once the
    // required number of distinct admins have approved (default 1 = immediate).
    const REQUIRED = Math.max(1, Number(process.env.WITHDRAWAL_APPROVALS_REQUIRED ?? 1));
    rawDb
      .prepare(`INSERT OR IGNORE INTO withdrawal_approvals (withdrawal_id, admin_id, admin_email, created_at) VALUES (?, ?, ?, ?)`)
      .run(w.id, admin.sub, (admin as any).email ?? null, Date.now());
    const approvals = (rawDb
      .prepare(`SELECT COUNT(DISTINCT admin_id) n FROM withdrawal_approvals WHERE withdrawal_id = ?`)
      .get(w.id) as any).n as number;
    if (approvals < REQUIRED) {
      auditToAuth({
        actorId: admin.sub,
        action: "withdrawal.approve_vote",
        targetId: w.id,
        targetLabel: w.user_id,
        detail: { approvals, required: REQUIRED }
      });
      return reply.send({ ok: true, pending: true, approvals, required: REQUIRED });
    }

    await db.update(withdrawals).set({ status: "signing", signed_at: Date.now() }).where(eq(withdrawals.id, w.id));
    const net = await netWithdrawRaw(w.chain, w.symbol, w.amount_raw);
    let txHash: string;
    try {
      txHash = await sendWithdrawal({ chain: w.chain, symbol: w.symbol, amountRaw: net.sendRaw, destAddress: w.dest_address });
    } catch (e) {
      // Leave it awaiting_approval so the admin can retry; funds stay reserved.
      await db.update(withdrawals).set({ status: "awaiting_approval" }).where(eq(withdrawals.id, w.id));
      return reply.code(502).send({ error: "Broadcast failed — still held for retry.", detail: (e as Error).message });
    }
    await db.update(withdrawals).set({ status: "broadcast", broadcast_at: Date.now(), tx_hash: txHash, fee_raw: net.feeRaw }).where(eq(withdrawals.id, w.id));
    notify(`✅ <b>Withdrawal approved + sent</b>\n${w.symbol} on ${w.chain}\ntx <code>${txHash}</code> · by ${admin.sub}`);
    auditToAuth({
      actorId: admin.sub,
      action: "withdrawal.approve",
      targetId: w.id,
      targetLabel: w.user_id,
      detail: { chain: w.chain, symbol: w.symbol, txHash }
    });
    return reply.send({ ok: true, txHash });
  });

  // Reject a held withdrawal → refund the debited balance exactly.
  app.post("/wallet/admin/withdrawals/:id/reject", async (req: any, reply) => {
    if (!(await requireCapability(req, reply, "withdrawals"))) return;
    const admin = req.user!;
    const rows = await db
      .select()
      .from(withdrawals)
      .where(and(eq(withdrawals.id, req.params.id), eq(withdrawals.status, "awaiting_approval")))
      .limit(1);
    if (rows.length === 0) return reply.code(404).send({ error: "No withdrawal awaiting approval with that id." });
    const w = rows[0]!;
    db.transaction((tx) => {
      const bal = tx.select().from(ledgerBalances)
        .where(and(eq(ledgerBalances.user_id, w.user_id), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)))
        .limit(1).all();
      const cur = bal.length ? BigInt(bal[0]!.raw) : 0n;
      tx.update(ledgerBalances).set({ raw: (cur + BigInt(w.amount_raw)).toString(), updated_at: Date.now() })
        .where(and(eq(ledgerBalances.user_id, w.user_id), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)))
        .run();
      tx.insert(ledgerEntries).values({
        id: ulid(), user_id: w.user_id, chain: w.chain, symbol: w.symbol,
        delta_raw: "+" + w.amount_raw, kind: "withdrawal_refund", ref_id: w.id
      }).run();
      tx.update(withdrawals).set({ status: "rejected" }).where(eq(withdrawals.id, w.id)).run();
    });
    notify(`🚫 <b>Withdrawal rejected + refunded</b>\n${w.symbol} on ${w.chain}\nuser <code>${w.user_id}</code> · by ${admin.sub}`);
    auditToAuth({
      actorId: admin.sub,
      action: "withdrawal.reject",
      targetId: w.id,
      targetLabel: w.user_id,
      detail: { chain: w.chain, symbol: w.symbol }
    });
    return reply.send({ ok: true });
  });

  // ── Accounting metrics — platform-wide money totals for the admin dash ────
  app.get("/wallet/admin/accounting", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;

    // Demo balances are fabricated, so they must
    // never inflate platform accounting. Excluded here rather than filtered in
    // the UI, so every consumer of this endpoint sees honest numbers.
    const demoIds = new Set(demoUserIds());
    const notDemo = (userId: string) => !demoIds.has(userId);

    const balRows = (
      rawDb.prepare(`SELECT user_id, chain, symbol, raw FROM ledger_balances`).all() as any[]
    ).filter((b) => notDemo(b.user_id));
    let holdingsUsd = 0;
    const byChain: Record<string, number> = {};
    for (const b of balRows) {
      const u = toUsd(b.chain, b.symbol, b.raw);
      holdingsUsd += u;
      byChain[b.chain] = (byChain[b.chain] ?? 0) + u;
    }

    const sumUsd = (rows: any[], chainKey = "chain", symKey = "symbol", rawKey = "amount_raw") =>
      rows.reduce((n, r) => n + toUsd(r[chainKey], r[symKey], r[rawKey]), 0);

    const dep = (
      rawDb.prepare(`SELECT user_id, chain, symbol, amount_raw FROM deposits`).all() as any[]
    ).filter((d) => notDemo(d.user_id));
    // `is_demo = 0` keeps fabricated payouts out of "withdrawn out" — they never
    // left the treasury, so counting them would understate real funds.
    const wOut = rawDb
      .prepare(`SELECT chain, symbol, amount_raw FROM withdrawals WHERE status IN ('broadcast','confirmed') AND is_demo = 0`)
      .all() as any[];
    const wPend = rawDb
      .prepare(`SELECT chain, symbol, amount_raw FROM withdrawals WHERE status='awaiting_approval' AND is_demo = 0`)
      .all() as any[];

    const one = (sql: string) => (rawDb.prepare(sql).get() as any)?.n ?? 0;

    return reply.send({
      holdingsUsd,
      depositsUsd: sumUsd(dep),
      withdrawnUsd: sumUsd(wOut),
      pendingUsd: sumUsd(wPend),
      byChain,
      counts: {
        members: one(`SELECT COUNT(DISTINCT user_id) n FROM ledger_balances WHERE raw != '0'`),
        deposits: dep.length,
        withdrawals: one(`SELECT COUNT(*) n FROM withdrawals`),
        pendingWithdrawals: wPend.length,
        sweeps: one(`SELECT COUNT(*) n FROM treasury_sweeps`),
        ledgerEntries: one(`SELECT COUNT(*) n FROM ledger_entries`)
      }
    });
  });

  // ── Ledger explorer — every credit/debit against member balances ──────────
  app.get("/wallet/admin/ledger", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const limit = Math.min(Math.max(Number(req.query?.limit) || 200, 1), 500);
    const kind = req.query?.kind ? String(req.query.kind) : null;
    const userId = req.query?.userId ? String(req.query.userId) : null;
    const where: string[] = [];
    const params: any = { limit };
    if (kind) {
      where.push("kind = @kind");
      params.kind = kind;
    }
    if (userId) {
      where.push("user_id = @userId");
      params.userId = userId;
    }
    const rows = rawDb
      .prepare(
        `SELECT id, user_id, chain, symbol, delta_raw, kind, ref_tx_hash, ref_id, created_at
         FROM ledger_entries
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY created_at DESC LIMIT @limit`
      )
      .all(params) as any[];
    return reply.send({
      entries: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        chain: r.chain,
        symbol: r.symbol,
        amount: toAmount(r.chain, r.symbol, r.delta_raw),
        usd: toUsd(r.chain, r.symbol, r.delta_raw),
        kind: r.kind,
        txHash: r.ref_tx_hash,
        refId: r.ref_id,
        createdAt: r.created_at
      }))
    });
  });

  // ── System transactions — unified on-chain feed (deposits, withdrawals, sweeps) ─
  app.get("/wallet/admin/transactions", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 300);

    type Tx = {
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
    const tx: Tx[] = [];

    for (const d of rawDb
      .prepare(`SELECT id, user_id, chain, symbol, amount_raw, tx_hash, confirmed_at FROM deposits ORDER BY confirmed_at DESC LIMIT @limit`)
      .all({ limit }) as any[]) {
      tx.push({
        id: d.id, type: "deposit", direction: "in", userId: d.user_id, chain: d.chain, symbol: d.symbol,
        amount: toAmount(d.chain, d.symbol, d.amount_raw), usd: toUsd(d.chain, d.symbol, d.amount_raw),
        txHash: d.tx_hash, status: "confirmed", at: d.confirmed_at
      });
    }
    for (const w of rawDb
      .prepare(`SELECT id, user_id, chain, symbol, amount_raw, tx_hash, dest_address, status, broadcast_at, requested_at FROM withdrawals WHERE tx_hash IS NOT NULL ORDER BY broadcast_at DESC LIMIT @limit`)
      .all({ limit }) as any[]) {
      tx.push({
        id: w.id, type: "withdrawal", direction: "out", userId: w.user_id, chain: w.chain, symbol: w.symbol,
        amount: toAmount(w.chain, w.symbol, w.amount_raw), usd: toUsd(w.chain, w.symbol, w.amount_raw),
        txHash: w.tx_hash, dest: w.dest_address, status: w.status, at: w.broadcast_at ?? w.requested_at
      });
    }
    for (const s of rawDb
      .prepare(`SELECT id, user_id, chain, symbol, amount_raw, tx_hash, kind, status, created_at FROM treasury_sweeps WHERE tx_hash IS NOT NULL ORDER BY created_at DESC LIMIT @limit`)
      .all({ limit }) as any[]) {
      tx.push({
        id: s.id, type: "sweep", direction: "sweep", userId: s.user_id, chain: s.chain, symbol: s.symbol,
        amount: toAmount(s.chain, s.symbol, s.amount_raw), usd: toUsd(s.chain, s.symbol, s.amount_raw),
        txHash: s.tx_hash, status: s.status, at: s.created_at
      });
    }

    tx.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    return reply.send({ transactions: tx.slice(0, limit) });
  });

  // ── Demo accounts ─────────────────────────────────────────────────────────
  // Founder-only: these decide whether a member's withdrawals are real, and can
  // conjure balance from nothing. See demo.ts for the threat model.

  app.get("/wallet/admin/demo-accounts", async (req: any, reply) => {
    if (!(await requireFounder(req, reply))) return;
    const rows = rawDb
      .prepare(`SELECT user_id, note, created_by, created_at FROM demo_accounts ORDER BY created_at DESC`)
      .all() as any[];
    return reply.send({
      enabled: (process.env.DEMO_ACCOUNTS_ENABLED ?? "1") !== "0",
      maxCreditUsd: MAX_CREDIT_USD,
      accounts: rows.map((r) => ({
        userId: r.user_id,
        note: r.note,
        createdBy: r.created_by,
        at: r.created_at,
        fabricatedUsd: fabricatedUsd(r.user_id),
        credits: fabricatedCredits(r.user_id).map((c) => ({
          chain: c.chain,
          symbol: c.symbol,
          amount: toAmount(c.chain, c.symbol, c.raw),
          usd: c.usd
        }))
      }))
    });
  });

  app.post("/wallet/admin/demo-accounts/:id", async (req: any, reply) => {
    if (!(await requireFounder(req, reply))) return;
    const userId = String(req.params.id);
    const on = req.body?.demo !== false;

    if (on) {
      // A member with real deposit history must never be switched to fake
      // withdrawals — they would be told their money was sent when it wasn't.
      const realDeposits = (
        rawDb.prepare(`SELECT COUNT(*) n FROM deposits WHERE user_id = ?`).get(userId) as any
      ).n as number;
      if (realDeposits > 0) {
        return reply.code(400).send({
          error: `This account has ${realDeposits} real on-chain deposit(s). Refusing to make it a demo account.`
        });
      }
      rawDb
        .prepare(
          `INSERT INTO demo_accounts (user_id, note, created_by, created_at) VALUES (?,?,?,?)
             ON CONFLICT(user_id) DO UPDATE SET note = excluded.note`
        )
        .run(userId, String(req.body?.note ?? "").slice(0, 200), req.user!.sub, Date.now());

      auditToAuth({
        actorId: req.user!.sub,
        action: "demo.enable",
        targetId: userId,
        targetLabel: userId,
        detail: { note: req.body?.note ?? null }
      });
      notify(`🧪 <b>Demo mode ENABLED</b>\nuser <code>${userId}</code>\nwithdrawals will NOT broadcast`);
      return reply.send({ ok: true, demo: true });
    }

    // ── Turning demo mode OFF ──────────────────────────────────────────────
    // Claw back any fabricated balance still in the ledger FIRST. Otherwise
    // fake credit becomes real, withdrawable money against the treasury the
    // moment this flag flips — the one way this feature could lose funds.
    const plan = reversalPlan(userId);
    const reversed: Array<{ chain: string; symbol: string; amount: number }> = [];
    db.transaction((tx) => {
      for (const r of plan) {
        const cur = tx
          .select()
          .from(ledgerBalances)
          .where(
            and(
              eq(ledgerBalances.user_id, userId),
              eq(ledgerBalances.chain, r.chain),
              eq(ledgerBalances.symbol, r.symbol)
            )
          )
          .limit(1)
          .all();
        const have = cur.length ? BigInt(cur[0]!.raw) : 0n;
        const next = have - BigInt(r.reverseRaw);
        tx.update(ledgerBalances)
          .set({ raw: (next < 0n ? 0n : next).toString(), updated_at: Date.now() })
          .where(
            and(
              eq(ledgerBalances.user_id, userId),
              eq(ledgerBalances.chain, r.chain),
              eq(ledgerBalances.symbol, r.symbol)
            )
          )
          .run();
        tx.insert(ledgerEntries)
          .values({
            id: ulid(),
            user_id: userId,
            chain: r.chain,
            symbol: r.symbol,
            delta_raw: "-" + r.reverseRaw,
            kind: "admin_adjust",
            ref_id: "demo-reversal",
            created_at: Date.now()
          })
          .run();
        reversed.push({
          chain: r.chain,
          symbol: r.symbol,
          amount: toAmount(r.chain, r.symbol, r.reverseRaw)
        });
      }
    });
    rawDb.prepare(`DELETE FROM demo_credits WHERE user_id = ?`).run(userId);
    rawDb.prepare(`DELETE FROM demo_accounts WHERE user_id = ?`).run(userId);

    auditToAuth({
      actorId: req.user!.sub,
      action: "demo.disable",
      targetId: userId,
      targetLabel: userId,
      detail: { reversed }
    });
    notify(
      `🧪 <b>Demo mode DISABLED</b>\nuser <code>${userId}</code>\n` +
        (reversed.length
          ? `clawed back: ${reversed.map((r) => `${r.amount} ${r.symbol}`).join(", ")}`
          : "no fabricated balance left to claw back")
    );
    return reply.send({ ok: true, demo: false, reversed });
  });

  /**
   * Credit a demo account's balance — a manual, audited ledger adjustment.
   *
   * Recorded as `admin_adjust`, NOT a deposit: no money arrived on-chain, and a
   * deposits row would corrupt real deposit history. Tracked in `demo_credits`
   * so it can be clawed back if demo mode is ever lifted.
   */
  app.post("/wallet/admin/demo-accounts/:id/credit", async (req: any, reply) => {
    if (!(await requireFounder(req, reply))) return;
    const userId = String(req.params.id);
    if (!isDemoAccount(userId)) {
      return reply.code(400).send({ error: "Not a demo account. Mark it as one first." });
    }
    const { chain, symbol, amount } = (req.body ?? {}) as {
      chain?: string;
      symbol?: string;
      amount?: number;
    };
    const tok = chain && symbol ? findToken(chain as any, symbol) : null;
    if (!tok) return reply.code(400).send({ error: "Unknown (chain, symbol)." });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return reply.code(400).send({ error: "Bad amount." });

    // Bound the blast radius: per credit, and in aggregate per account.
    const price = priceUsd(tok.symbol as any) ?? 0;
    const thisUsd = amt * price;
    if (thisUsd > MAX_CREDIT_USD) {
      return reply
        .code(400)
        .send({ error: `That is $${thisUsd.toFixed(2)} — over the $${MAX_CREDIT_USD} per-credit cap.` });
    }
    if (fabricatedUsd(userId) + thisUsd > MAX_CREDIT_USD) {
      return reply
        .code(400)
        .send({ error: `Account would exceed the $${MAX_CREDIT_USD} total fabricated-credit cap.` });
    }

    const raw = BigInt(Math.round(amt * 10 ** tok.decimals));
    db.transaction((tx) => {
      const cur = tx
        .select()
        .from(ledgerBalances)
        .where(
          and(
            eq(ledgerBalances.user_id, userId),
            eq(ledgerBalances.chain, tok.chain),
            eq(ledgerBalances.symbol, tok.symbol)
          )
        )
        .limit(1)
        .all();
      if (cur.length) {
        tx.update(ledgerBalances)
          .set({ raw: (BigInt(cur[0]!.raw) + raw).toString(), updated_at: Date.now() })
          .where(
            and(
              eq(ledgerBalances.user_id, userId),
              eq(ledgerBalances.chain, tok.chain),
              eq(ledgerBalances.symbol, tok.symbol)
            )
          )
          .run();
      } else {
        tx.insert(ledgerBalances)
          .values({
            user_id: userId,
            chain: tok.chain,
            symbol: tok.symbol,
            raw: raw.toString(),
            decimals: tok.decimals,
            updated_at: Date.now()
          })
          .run();
      }
      tx.insert(ledgerEntries)
        .values({
          id: ulid(),
          user_id: userId,
          chain: tok.chain,
          symbol: tok.symbol,
          delta_raw: "+" + raw.toString(),
          kind: "admin_adjust",
          ref_id: "demo-credit",
          created_at: Date.now()
        })
        .run();
    });
    recordFabricated(userId, tok.chain, tok.symbol, raw, thisUsd);

    auditToAuth({
      actorId: req.user!.sub,
      action: "demo.credit",
      targetId: userId,
      targetLabel: userId,
      detail: { chain: tok.chain, symbol: tok.symbol, amount: amt, usd: thisUsd }
    });
    notify(
      `🧪 <b>Demo credit</b>\n${amt} ${tok.symbol} on ${tok.chain} (~$${thisUsd.toFixed(2)})\n` +
        `user <code>${userId}</code>`
    );

    // The branded deposit email a real deposit would produce. The transfer
    // indexer that normally sends it never runs here — there is no on-chain
    // transfer to index.
    if (req.body?.email !== false) {
      fetch(AUTH_BASE + "/internal/email/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.INTERNAL_SERVICE_TOKEN
        },
        body: JSON.stringify({
          userId,
          amount: amt.toLocaleString(undefined, { maximumFractionDigits: 8 }),
          symbol: tok.symbol,
          chain: tok.chain,
          usd: price ? thisUsd : null,
          txHash: demoTxHash(tok.chain)
        })
      }).catch(() => {});
    }

    return reply.send({ ok: true, chain: tok.chain, symbol: tok.symbol, amount: amt, usd: thisUsd });
  });


  // ── Sales / revenue ───────────────────────────────────────────────────────
  // Revenue only: what members paid US. Deliberately excludes deposits (a
  // member funding their own custodial balance) and withdrawals (paying them
  // back out) — neither is income.
  app.get("/wallet/admin/sales", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const item = req.query?.item ? String(req.query.item) : null;

    const where = item ? "WHERE item = @item" : "";
    const params: any = { limit, item };

    const rows = rawDb
      .prepare(
        `SELECT id, user_id, item, item_name, chain, symbol, amount_raw, usd, created_at
           FROM sales ${where}
          ORDER BY created_at DESC
          LIMIT @limit`
      )
      .all(params) as any[];

    const totals = rawDb
      .prepare(`SELECT COUNT(*) n, COALESCE(SUM(usd), 0) usd FROM sales`)
      .get() as { n: number; usd: number };

    // Revenue by product, so a new product shows up here with no code change.
    const byItem = rawDb
      .prepare(
        `SELECT item, item_name, COUNT(*) n, COALESCE(SUM(usd), 0) usd
           FROM sales GROUP BY item ORDER BY usd DESC`
      )
      .all() as any[];

    const since = (ms: number) =>
      (
        rawDb
          .prepare(`SELECT COUNT(*) n, COALESCE(SUM(usd), 0) usd FROM sales WHERE created_at >= ?`)
          .get(Date.now() - ms) as { n: number; usd: number }
      );

    // Last 30 days as daily buckets for the trend line.
    const daily = rawDb
      .prepare(
        `SELECT date(created_at / 1000, 'unixepoch') d, COUNT(*) n, COALESCE(SUM(usd), 0) usd
           FROM sales WHERE created_at >= ?
          GROUP BY d ORDER BY d ASC`
      )
      .all(Date.now() - 30 * 864e5) as any[];

    return reply.send({
      sales: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        item: r.item,
        itemName: r.item_name,
        chain: r.chain,
        symbol: r.symbol,
        amount: toAmount(r.chain, r.symbol, r.amount_raw),
        usd: r.usd,
        at: r.created_at
      })),
      totals: { count: totals.n, usd: totals.usd },
      byItem: byItem.map((b) => ({ item: b.item, itemName: b.item_name, count: b.n, usd: b.usd })),
      periods: {
        today: since(864e5),
        week: since(7 * 864e5),
        month: since(30 * 864e5)
      },
      daily: daily.map((d) => ({ date: d.d, count: d.n, usd: d.usd }))
    });
  });

  // ── Withdrawal (treasury) wallet balances — live on-chain read ────────────
  app.get("/wallet/admin/treasury-wallets", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const addresses = await withdrawalAddresses();
    const configured = !!(addresses.eth || addresses.bsc || addresses.polygon || addresses.tron || addresses.btc);

    // Per-chain signing health. The address shown above is what the operator
    // CONFIGURED; `signer` is the wallet that would actually be debited. When
    // those differ the admin is reading a balance that isn't the one being
    // spent, so surface it explicitly rather than letting a payout fail later.
    const chains = ["eth", "bsc", "polygon", "tron", "btc"] as const;
    const wallets = await Promise.all(
      chains.map(async (chain) => {
        const address = addresses[chain];
        let signer: string | null = null;
        let error: string | null = null;
        try {
          await privKeyForChain(chain); // throws on address-without-key / mismatch
          signer = await payoutAddressForChain(chain);
        } catch (e) {
          error = (e as Error).message;
        }
        return {
          chain,
          address,
          signer,
          source: address ? "imported" : signer ? "generated" : null,
          ok: !error,
          error
        };
      })
    );

    if (!configured) {
      return reply.send({ configured: false, addresses, wallets, balances: [], totalUsd: 0 });
    }
    try {
      const snap = await reconcile(addresses, { force: !!req.query?.force });
      // Per-chain breakdown so the admin can see WHICH chain/address holds what.
      // Use aggregate()'s perChain amounts — already scaled by token decimals
      // (snap.perChain is RAW base units, which is what caused the huge numbers).
      const holdings: Array<{ chain: string; symbol: string; amount: number; usd: number }> = [];
      for (const b of snap.byLogicalAsset) {
        const price = priceUsd(b.asset) ?? 0;
        for (const pc of b.perChain) {
          if (!(pc.amount > 0)) continue;
          holdings.push({ chain: pc.chain, symbol: b.asset, amount: pc.amount, usd: pc.amount * price });
        }
      }
      holdings.sort((a, b) => b.usd - a.usd || b.amount - a.amount);
      // Total across everything priced, including native gas coins.
      const totalUsd = holdings.reduce((s, h) => s + h.usd, 0);
      return reply.send({
        configured: true,
        addresses,
        balances: snap.byLogicalAsset,
        holdings,
        totalUsd,
        fetchedAt: snap.fetchedAt
      });
    } catch (e) {
      return reply.code(502).send({ error: "On-chain read failed: " + (e as Error).message });
    }
  });

  // Read a user's override + effective limits (prefills the admin form).
  app.get("/wallet/admin/users/:id/withdraw-limits", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const o = rawDb
      .prepare(`SELECT max_per_tx_usd, daily_usd, review_threshold_usd FROM user_withdraw_limits WHERE user_id = ?`)
      .get(req.params.id) as any;
    const eff = await effectiveLimits(String(req.params.id));
    return reply.send({
      override: {
        maxPerTxUsd: o?.max_per_tx_usd ?? null,
        dailyUsd: o?.daily_usd ?? null,
        reviewThresholdUsd: o?.review_threshold_usd ?? null
      },
      effective: {
        maxPerTxUsd: eff.maxPerTxUsd,
        dailyUsd: eff.dailyUsd,
        reviewThresholdUsd: eff.reviewThresholdUsd
      }
    });
  });

  // Set / clear a user's per-user withdrawal-limit override. null clears a field.
  app.post("/wallet/admin/users/:id/withdraw-limits", async (req: any, reply) => {
    if (!(await requireRole(req, reply, "admin"))) return;
    const b = (req.body ?? {}) as { maxPerTxUsd?: number | null; dailyUsd?: number | null; reviewThresholdUsd?: number | null };
    const norm = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
    rawDb.prepare(
      `INSERT INTO user_withdraw_limits (user_id, max_per_tx_usd, daily_usd, review_threshold_usd, updated_at)
       VALUES (@user_id, @max_per_tx_usd, @daily_usd, @review_threshold_usd, @updated_at)
       ON CONFLICT(user_id) DO UPDATE SET
         max_per_tx_usd=excluded.max_per_tx_usd, daily_usd=excluded.daily_usd,
         review_threshold_usd=excluded.review_threshold_usd, updated_at=excluded.updated_at`
    ).run({
      user_id: req.params.id,
      max_per_tx_usd: norm(b.maxPerTxUsd),
      daily_usd: norm(b.dailyUsd),
      review_threshold_usd: norm(b.reviewThresholdUsd),
      updated_at: Date.now()
    });
    auditToAuth({
      actorId: req.user?.sub,
      action: "withdrawal.set_limits",
      targetId: String(req.params.id),
      targetLabel: String(req.params.id),
      detail: {
        maxPerTxUsd: norm(b.maxPerTxUsd),
        dailyUsd: norm(b.dailyUsd),
        reviewThresholdUsd: norm(b.reviewThresholdUsd)
      }
    });
    return reply.send({ ok: true });
  });

  // Caller's effective limits + 24h usage — powers the withdraw UI.
  app.get("/wallet/withdrawals/limits", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;
    const limits = await effectiveLimits(user.sub);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recent = await db.select().from(withdrawals).where(eq(withdrawals.user_id, user.sub));
    let usedUsd = 0;
    for (const r of recent) {
      if ((r.requested_at ?? 0) < since) continue;
      if (r.status === "failed" || r.status === "rejected") continue;
      const t = findToken(r.chain as any, r.symbol);
      if (!t) continue;
      usedUsd += (Number(BigInt(r.amount_raw)) / 10 ** t.decimals) * (priceUsd(r.symbol as any) ?? 0);
    }
    return reply.send({
      maxPerTxUsd: limits.maxPerTxUsd,
      dailyUsd: limits.dailyUsd,
      reviewThresholdUsd: limits.reviewThresholdUsd,
      usedUsd,
      remainingUsd: Math.max(0, limits.dailyUsd - usedUsd)
    });
  });

  // ── Flush to treasury (deposit sweep) — admin only ─────────────────────
  // Preview computes the plan (gas-fund + sweep legs) and broadcasts NOTHING.
  app.post("/wallet/admin/sweep/preview", async (req: any, reply) => {
    if (!(await requireCapability(req, reply, "flush"))) return;
    const userId = (req.body as any)?.userId;
    if (!userId) return reply.code(400).send({ error: "userId required." });
    try {
      return reply.send({ ok: true, plan: await previewUser(String(userId)) });
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Execute — broadcasts the EVM legs, auto-funding gas, and records every leg
  // in treasury_sweeps. The user ledger is never touched.
  app.post("/wallet/admin/sweep", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireCapability(req, reply, "flush"))) return;
    const admin = req.user!;
    const userId = (req.body as any)?.userId;
    if (!userId) return reply.code(400).send({ error: "userId required." });
    try {
      const result = await executeUser(String(userId), admin.sub);
      notify(
        `💸 <b>Treasury flush</b>\nuser <code>${userId}</code> · by ${admin.sub}\n` +
          result.legs
            .map((l) => `${l.kind} ${l.amount} ${l.symbol} (${l.chain}) — ${l.status}`)
            .join("\n")
      );
      auditToAuth({
        actorId: admin.sub,
        action: "treasury.flush",
        targetId: String(userId),
        targetLabel: String(userId),
        detail: { legs: result.legs.length }
      });
      return reply.send({ ...result });
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Batch preview — plan for every user with a wallet (broadcasts nothing).
  app.post("/wallet/admin/sweep/all/preview", async (req: any, reply) => {
    if (!(await requireCapability(req, reply, "flush"))) return;
    const users = await db.select().from(userWalletAddresses);
    const plans = [];
    for (const u of users) {
      try {
        plans.push(await previewUser(u.user_id));
      } catch {
        /* skip users we can't plan */
      }
    }
    const totalLegs = plans.reduce((n, p) => n + p.legs.length, 0);
    return reply.send({ ok: true, users: plans.length, totalLegs, plans });
  });

  // Batch execute — flush every user in turn (reuses the safe per-user path).
  app.post("/wallet/admin/sweep/all", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireCapability(req, reply, "flush"))) return;
    const admin = req.user!;
    const users = await db.select().from(userWalletAddresses);
    let swept = 0;
    let legs = 0;
    for (const u of users) {
      try {
        const r = await executeUser(u.user_id, admin.sub);
        if (r.legs.length) swept++;
        legs += r.legs.length;
      } catch {
        /* continue with the rest */
      }
    }
    notify(`💸 <b>Batch treasury flush</b>\n${swept} users · ${legs} legs · by ${admin.sub}`);
    auditToAuth({
      actorId: admin.sub,
      action: "treasury.flush_all",
      targetLabel: `${swept} users`,
      detail: { swept, legs }
    });
    return reply.send({ ok: true, usersSwept: swept, legs });
  });
}
