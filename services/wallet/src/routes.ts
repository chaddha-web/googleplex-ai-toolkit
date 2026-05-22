import type { FastifyInstance } from "fastify";
import { db } from "./db/index.js";
import { 
  userWalletAddresses, 
  ledgerBalances, 
  ledgerEntries, 
  deposits, 
  withdrawals, 
  swaps 
} from "./db/schema.js";
import { requireAuth, requireInternal, requireRole } from "./lib/guard.js";
import { eq, and, desc } from "drizzle-orm";
import { ulid } from "ulid";
import { reconcile, type UserAddressMap } from "./reconcile.js";
import {
  ASSET_INSTANCES,
  LOGICAL_ASSETS,
  aggregate,
  type LogicalAsset,
  type PerChainRawBalances
} from "./assets.js";
import { deriveUserAddresses } from "./hd.js";
import { TOKENS, findToken } from "./tokens.js";
import { priceUsd, coinAmountForUsd } from "./prices.js";
import { sendWithdrawal, isValidDestination } from "./withdraw.js";
import { notify } from "./notify.js";

// Withdrawal safety caps (USD). Fully-automatic model still bounds blast radius.
const MAX_WITHDRAW_PER_TX_USD = Number(process.env.MAX_WITHDRAW_PER_TX_USD ?? 1000);
const MAX_WITHDRAW_DAILY_USD = Number(process.env.MAX_WITHDRAW_DAILY_USD ?? 5000);

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

// Auth service base — in prod this is the internal container address
// (http://auth:4200), set via AUTH_BASE_URL in docker-compose. Falls back to
// localhost only for local dev where both services run on the host.
const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://localhost:4200").replace(
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
    // Allocate the next derivation index. (Count-based; fine for a single
    // wallet instance. A dedicated sequence is the long-term fix.)
    const allRows = await db
      .select({ id: userWalletAddresses.user_id })
      .from(userWalletAddresses);
    const userIndex = allRows.length + 1;

    const addrs = deriveUserAddresses({
      userIndex,
      evmXpub: EVM_XPUB,
      btcXpub: BTC_XPUB,
      tronXpub: TRON_XPUB
    });

    await db.transaction(async (tx) => {
      // Re-check inside the tx to avoid a duplicate row on a race.
      const again = await tx
        .select({ id: userWalletAddresses.user_id })
        .from(userWalletAddresses)
        .where(eq(userWalletAddresses.user_id, userId))
        .limit(1);
      if (again.length > 0) return;

      await tx.insert(userWalletAddresses).values({
        user_id: userId,
        user_index: userIndex,
        eth: addrs.eth,
        bsc: addrs.bsc,
        tron: addrs.tron,
        btc: addrs.btc
      });
      for (const t of TOKENS) {
        await tx.insert(ledgerBalances).values({
          user_id: userId,
          chain: t.chain,
          symbol: t.symbol,
          raw: "0",
          decimals: t.decimals
        });
      }
    });
  })().finally(() => provisioning.delete(userId));

  provisioning.set(userId, p);
  return p;
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

    await ensureUserWallet(user.sub);
    const addrs = await db.select().from(userWalletAddresses).where(eq(userWalletAddresses.user_id, user.sub)).limit(1);
    if (addrs.length === 0) return reply.code(404).send({ error: "No addresses found" });

    const a = addrs[0]!;
    const snap = await reconcile({ eth: a.eth, bsc: a.bsc, tron: a.tron, btc: a.btc });

    // Diff against ledger and update
    let initialDepositCreditedUsd = 0;
    
    await db.transaction(async (tx) => {
      const existingBalances = await tx.select().from(ledgerBalances).where(eq(ledgerBalances.user_id, user.sub));
      
      for (const t of TOKENS) {
        const onChainRaw = snap.perChain[t.chain as keyof typeof snap.perChain]?.[t.symbol] || "0";
        const ledgerRow = existingBalances.find(b => b.chain === t.chain && b.symbol === t.symbol);
        const ledgerRaw = ledgerRow ? ledgerRow.raw : "0";

        if (BigInt(onChainRaw) > BigInt(ledgerRaw)) {
          const delta = BigInt(onChainRaw) - BigInt(ledgerRaw);
          const refTxHash = "sync-" + Date.now() + "-" + t.chain + "-" + t.symbol; // simplified tx hash logic
          const dId = ulid();

          await tx.insert(deposits).values({
            id: dId,
            user_id: user.sub,
            chain: t.chain,
            symbol: t.symbol,
            amount_raw: delta.toString(),
            tx_hash: refTxHash,
            confirmed_at: Date.now(),
            credited_at: Date.now()
          });

          await tx.insert(ledgerEntries).values({
            id: ulid(),
            user_id: user.sub,
            chain: t.chain,
            symbol: t.symbol,
            delta_raw: delta.toString(),
            kind: "deposit",
            ref_tx_hash: refTxHash,
            ref_id: dId
          });

          if (ledgerRow) {
            await tx.update(ledgerBalances)
              .set({ raw: onChainRaw, updated_at: Date.now() })
              .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, t.chain), eq(ledgerBalances.symbol, t.symbol)));
          } else {
            await tx.insert(ledgerBalances).values({
              user_id: user.sub,
              chain: t.chain,
              symbol: t.symbol,
              raw: onChainRaw,
              decimals: t.decimals
            });
          }

          // Initial deposit logic: USD = 1 for USDT/USDC on eth/bsc/tron
          if (["USDT", "USDC"].includes(t.symbol) && ["eth", "bsc", "tron"].includes(t.chain)) {
            const usdValue = Number(delta) / (10 ** t.decimals); // fixed $1
            initialDepositCreditedUsd += usdValue;
          }
        }
      }
    });

    if (initialDepositCreditedUsd > 0) {
      try {
        const authResp = await fetch(AUTH_BASE + "/internal/users/" + user.sub + "/wallet-status", {
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
          app.log.error(`Failed to update initial deposit for ${user.sub}: ${authResp.status}`);
        }
      } catch (e) {
        app.log.error(e);
      }
    }

    // Return fresh JIT view
    return reply.send(snap.byLogicalAsset);
  });

  // POST /wallet/withdrawals
  app.post("/wallet/withdrawals", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

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

    // ── Withdrawal caps (USD) ────────────────────────────────────────────
    const usdPrice = priceUsd(symbol as any) ?? 0;
    const human = Number(BigInt(amountRaw)) / 10 ** token.decimals;
    const usdValue = human * usdPrice;

    if (usdPrice > 0 && usdValue > MAX_WITHDRAW_PER_TX_USD) {
      return reply.code(400).send({
        error: `Withdrawal exceeds the per-transaction limit of $${MAX_WITHDRAW_PER_TX_USD}.`
      });
    }

    // Daily cap: sum non-failed withdrawals in the last 24h (USD).
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
      if (dayUsd + usdValue > MAX_WITHDRAW_DAILY_USD) {
        return reply.code(400).send({
          error: `This would exceed your 24h withdrawal limit of $${MAX_WITHDRAW_DAILY_USD}.`
        });
      }
    }

    const wId = ulid();

    // Trigger OTP
    let otpSessionId = "stub-otp";
    try {
      // In reality, hit POST http://localhost:4200/auth/otp/request
      const res = await fetch(AUTH_BASE + "/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, mode: "login" })
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

    return reply.send({ withdrawalId: wId, otpSessionId });
  });

  // POST /wallet/withdrawals/:id/confirm
  app.post("/wallet/withdrawals/:id/confirm", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    const { id } = req.params;
    const { code, walletPassword } = req.body as any;
    if (!code && !walletPassword) return reply.code(400).send({ error: "Missing code or walletPassword" });

    // Validate code or wallet password
    if (walletPassword) {
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
    } else {
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

    // Atomic debit
    let success = false;
    await db.transaction(async (tx) => {
      const balRow = await tx.select().from(ledgerBalances)
        .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)))
        .limit(1);

      if (balRow.length === 0 || BigInt(balRow[0]!.raw) < BigInt(w.amount_raw)) {
        throw new Error("Insufficient balance");
      }

      const newBal = (BigInt(balRow[0]!.raw) - BigInt(w.amount_raw)).toString();
      await tx.update(ledgerBalances).set({ raw: newBal, updated_at: Date.now() })
        .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)));

      await tx.insert(ledgerEntries).values({
        id: ulid(),
        user_id: user.sub,
        chain: w.chain,
        symbol: w.symbol,
        delta_raw: "-" + w.amount_raw,
        kind: "withdrawal",
        ref_id: w.id
      });

      await tx.update(withdrawals).set({ status: "signing" }).where(eq(withdrawals.id, w.id));
      success = true;
    });

    if (!success) return reply.code(400).send({ error: "Insufficient balance" });

    // Balance is debited and the row is in "signing". Pay out from the company
    // treasury wallet. On any broadcast failure, REFUND the ledger so the user
    // never loses funds to a failed send.
    await db.update(withdrawals).set({ signed_at: Date.now() }).where(eq(withdrawals.id, w.id));
    let txHash: string;
    try {
      txHash = await sendWithdrawal({
        chain: w.chain,
        symbol: w.symbol,
        amountRaw: w.amount_raw,
        destAddress: w.dest_address
      });
    } catch (e) {
      app.log.error({ err: e, withdrawalId: w.id }, "withdrawal broadcast failed — refunding");
      // Refund: re-credit the debited balance + reversing ledger entry.
      await db.transaction(async (tx) => {
        const balRow = await tx.select().from(ledgerBalances)
          .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)))
          .limit(1);
        const cur = balRow.length ? BigInt(balRow[0]!.raw) : 0n;
        await tx.update(ledgerBalances).set({ raw: (cur + BigInt(w.amount_raw)).toString(), updated_at: Date.now() })
          .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, w.chain), eq(ledgerBalances.symbol, w.symbol)));
        await tx.insert(ledgerEntries).values({
          id: ulid(),
          user_id: user.sub,
          chain: w.chain,
          symbol: w.symbol,
          delta_raw: "+" + w.amount_raw,
          kind: "withdrawal_refund",
          ref_id: w.id
        });
        await tx.update(withdrawals).set({ status: "failed" }).where(eq(withdrawals.id, w.id));
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

    await db.update(withdrawals).set({ status: "broadcast", broadcast_at: Date.now(), tx_hash: txHash }).where(eq(withdrawals.id, w.id));

    notify(
      `💸 <b>Withdrawal sent</b>\n${w.symbol} on ${w.chain}\n` +
        `to <code>${w.dest_address}</code>\ntx: <code>${txHash}</code>`
    );

    return reply.send({ ok: true, status: "broadcast", txHash });
  });

  // GET /wallet/history
  app.get("/wallet/history", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    const entries = await db.select().from(ledgerEntries)
      .where(eq(ledgerEntries.user_id, user.sub))
      .orderBy(desc(ledgerEntries.created_at))
      .limit(50);

    return reply.send(entries);
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
    const coinAmount = coinAmountForUsd(STUDIO_FEE_USD, asset);
    if (coinAmount === null) {
      return reply.code(400).send({ error: `${asset} is not priced right now.` });
    }

    // Find a chain instance of this asset whose ledger balance covers the fee.
    const instances = ASSET_INSTANCES[asset] ?? [];
    let charged: { chain: string; symbol: string; raw: string } | null = null;

    try {
      await db.transaction(async (tx) => {
        for (const t of instances) {
          const requiredRaw = toRawUnits(coinAmount, t.decimals);
          const rows = await tx
            .select()
            .from(ledgerBalances)
            .where(
              and(
                eq(ledgerBalances.user_id, user.sub),
                eq(ledgerBalances.chain, t.chain),
                eq(ledgerBalances.symbol, t.symbol)
              )
            )
            .limit(1);
          if (rows.length === 0) continue;
          const have = BigInt(rows[0]!.raw);
          if (have < requiredRaw) continue;

          const newBal = (have - requiredRaw).toString();
          await tx
            .update(ledgerBalances)
            .set({ raw: newBal, updated_at: Date.now() })
            .where(
              and(
                eq(ledgerBalances.user_id, user.sub),
                eq(ledgerBalances.chain, t.chain),
                eq(ledgerBalances.symbol, t.symbol)
              )
            );
          await tx.insert(ledgerEntries).values({
            id: ulid(),
            user_id: user.sub,
            chain: t.chain,
            symbol: t.symbol,
            delta_raw: "-" + requiredRaw.toString(),
            kind: "studio_fee",
            ref_id: "studio-unlock"
          });
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
          }
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

  // POST /wallet/swaps
  app.post("/wallet/swaps", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;

    // Fixed price book implementation omitted for brevity, returns 501
    return reply.code(501).send({ error: "Swaps not fully implemented in v1" });
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
        m = { eth: {}, bsc: {}, tron: {}, btc: {} };
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
    const snap = await reconcile({ eth: a.eth, bsc: a.bsc, tron: a.tron, btc: a.btc });
    const actualUsd = snap.byLogicalAsset.reduce((s, x) => s + (x.usd ?? 0), 0);
    return reply.send({ actualUsd });
  });

  app.get("/wallet/admin/withdrawals", async (req: any, reply) => {
    if (!await requireRole(req, reply, "admin")) return;
    return reply.code(501).send({ error: "Not implemented" });
  });

  app.post("/wallet/admin/withdrawals/:id/approve", async (req: any, reply) => {
    if (!await requireRole(req, reply, "admin")) return;
    return reply.code(501).send({ error: "Not implemented" });
  });

  app.post("/wallet/admin/withdrawals/:id/reject", async (req: any, reply) => {
    if (!await requireRole(req, reply, "admin")) return;
    return reply.code(501).send({ error: "Not implemented" });
  });
}
