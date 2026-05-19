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
import { ASSET_INSTANCES, aggregate, type LogicalAsset } from "./assets.js";
import { deriveUserAddresses } from "./hd.js";
import { TOKENS } from "./tokens.js";

// TODO: fetch xpubs from ENV (should be passed to the service)
const EVM_XPUB = process.env.EVM_XPUB || "xpub_placeholder";
const BTC_XPUB = process.env.BTC_XPUB || "xpub_placeholder";
const TRON_XPUB = process.env.TRON_XPUB || "xpub_placeholder";

export async function walletRoutes(app: FastifyInstance) {

  // POST /wallet/users (internal service-to-service)
  app.post("/wallet/users", async (req: any, reply) => {
    if (!requireInternal(req, reply)) return;
    const body = req.body as { userId: string };
    if (!body?.userId) return reply.code(400).send({ error: "Missing userId" });

    // Idempotency: check if exists
    const existing = await db.select().from(userWalletAddresses).where(eq(userWalletAddresses.user_id, body.userId)).limit(1);
    if (existing.length > 0) return reply.send({ ok: true });

    // Allocate next userIndex (just count rows for now, though it should be atomic sequence ideally)
    const allRows = await db.select({ id: userWalletAddresses.user_id }).from(userWalletAddresses);
    const userIndex = allRows.length + 1; // start from 1

    const addrs = deriveUserAddresses({
      userIndex,
      evmXpub: EVM_XPUB,
      btcXpub: BTC_XPUB,
      tronXpub: TRON_XPUB
    });

    await db.transaction(async (tx) => {
      await tx.insert(userWalletAddresses).values({
        user_id: body.userId,
        user_index: userIndex,
        eth: addrs.eth,
        bsc: addrs.bsc,
        tron: addrs.tron,
        btc: addrs.btc,
      });

      // Insert zero balances for all ASSET_INSTANCES
      for (const t of TOKENS) {
        await tx.insert(ledgerBalances).values({
          user_id: body.userId,
          chain: t.chain,
          symbol: t.symbol,
          raw: "0",
          decimals: t.decimals,
        });
      }
    });

    return reply.send({ ok: true });
  });

  // GET /wallet/addresses
  app.get("/wallet/addresses", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

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
  app.post("/wallet/refresh", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

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
            confirmed_at: new Date(),
            credited_at: new Date()
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
              .set({ raw: onChainRaw, updated_at: new Date() })
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
        const authResp = await fetch("http://localhost:4200/internal/users/" + user.sub + "/wallet-status", {
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
  app.post("/wallet/withdrawals", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    const { chain, symbol, amountRaw, destAddress } = req.body as any;
    if (!chain || !symbol || !amountRaw || !destAddress) return reply.code(400).send({ error: "Missing fields" });

    // Validate ledger
    const balance = await db.select().from(ledgerBalances)
      .where(and(eq(ledgerBalances.user_id, user.sub), eq(ledgerBalances.chain, chain), eq(ledgerBalances.symbol, symbol)))
      .limit(1);

    if (balance.length === 0 || BigInt(balance[0]!.raw) < BigInt(amountRaw)) {
      return reply.code(400).send({ error: "Insufficient balance" });
    }

    const wId = ulid();

    // Trigger OTP
    let otpSessionId = "stub-otp";
    try {
      // In reality, hit POST http://localhost:4200/auth/otp/request
      const res = await fetch("http://localhost:4200/auth/otp/request", {
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
      otp_session_id: otpSessionId
    });

    return reply.send({ withdrawalId: wId, otpSessionId });
  });

  // POST /wallet/withdrawals/:id/confirm
  app.post("/wallet/withdrawals/:id/confirm", async (req: any, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const user = req.user!;

    const { id } = req.params;
    const { code, walletPassword } = req.body as any;
    if (!code && !walletPassword) return reply.code(400).send({ error: "Missing code or walletPassword" });

    // Validate code or wallet password
    if (walletPassword) {
      try {
        const authResp = await fetch("http://localhost:4200/auth/wallet-password/verify", {
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
        const authResp = await fetch("http://localhost:4200/auth/otp/verify", {
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
      await tx.update(ledgerBalances).set({ raw: newBal, updated_at: new Date() })
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

    // Fake signing for J1, real KMS implementation would go here (or async queue).
    await db.update(withdrawals).set({ status: "pending", signed_at: new Date(), broadcast_at: new Date(), tx_hash: "0xMockHash" }).where(eq(withdrawals.id, w.id));

    return reply.send({ ok: true, status: "pending", txHash: "0xMockHash" });
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
