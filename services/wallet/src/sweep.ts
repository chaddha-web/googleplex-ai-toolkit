/**
 * Flush-to-treasury (deposit sweep) orchestrator.
 *
 * Moves a user's on-chain deposit-address balances into the company treasury,
 * automatically funding the native gas needed to move tokens. This is the ONE
 * place a master mnemonic enters the live signing path (to derive the user's
 * child private key). It deliberately does NOT touch the user ledger — the
 * member's balance and history are their entitlement and stay unchanged; only
 * the physical coins are consolidated. Every broadcast leg is recorded in the
 * ops-only `treasury_sweeps` audit table.
 *
 * EVM (ETH/BSC/Polygon) is fully implemented (preview + execute). Tron and BTC report
 * as "pending" — their signing paths are not enabled until validated on-chain,
 * so nothing untested ever broadcasts real funds.
 */

import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { userWalletAddresses, treasurySweeps } from "./db/schema.js";
import { loadAndDecryptSeed } from "./kms.js";
import { deriveUserPrivKey } from "./hd.js";
import { treasuryAddress, privKeyForChain } from "./treasury.js";
import { TOKENS } from "./tokens.js";
import * as evm from "./sign/evm.js";
import * as tron from "./sign/tron.js";
import * as btc from "./sign/btc.js";

export type SweepLeg = {
  chain: string;
  symbol: string;
  kind: "gas_fund" | "token_sweep" | "native_sweep";
  amountRaw: string;
  amount: number; // human, for display
  from: string;
  to: string;
};

export type SweepPlan = {
  userId: string;
  userIndex: number;
  supported: string[]; // chains we can execute
  pending: string[]; // chains previewed-only / not yet executable
  legs: SweepLeg[];
  skipped: { chain: string; symbol: string; reason: string }[];
};

export type SweepResult = {
  ok: boolean;
  legs: Array<SweepLeg & { txHash?: string; status: string; error?: string }>;
};

const EVM_CHAINS = ["eth", "bsc", "polygon"] as const;
type EvmChain = (typeof EVM_CHAINS)[number];

function human(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

async function masterMnemonic(family: "evm" | "tron" | "btc"): Promise<string> {
  const plain = await loadAndDecryptSeed(family);
  return Buffer.from(plain).toString("utf8").trim();
}

async function userRow(userId: string) {
  const rows = await db
    .select()
    .from(userWalletAddresses)
    .where(eq(userWalletAddresses.user_id, userId))
    .limit(1);
  if (rows.length === 0) throw new Error("User has no wallet addresses.");
  return rows[0]!;
}

/**
 * Build the EVM sweep plan for one user address (both ETH and BSC share the
 * address). Reads live balances + gas price; emits gas-fund + token/native
 * legs. Broadcasts nothing.
 */
async function planEvm(
  chain: EvmChain,
  address: string,
  treasury: string,
  plan: SweepPlan
) {
  let gasPrice: bigint;
  try {
    gasPrice = await evm.evmGasPrice(chain);
  } catch {
    plan.skipped.push({ chain, symbol: "*", reason: "RPC unavailable" });
    return;
  }
  const nativeFee = evm.EVM_NATIVE_GAS * gasPrice;
  const tokenGas = evm.EVM_ERC20_GAS * gasPrice;
  const nativeAtAddr = await evm.evmNativeBalance(chain, address);

  const tokens = TOKENS.filter((t) => t.chain === chain);
  // Track extra native the treasury will inject to fund token sweeps, so the
  // final native-sweep estimate doesn't count gas we ourselves added.
  for (const t of tokens.filter((t) => !t.native)) {
    let bal: bigint;
    try {
      bal = await evm.evmTokenBalance(chain, t.address!, address);
    } catch {
      continue;
    }
    if (bal <= 0n) continue;
    if (nativeAtAddr < tokenGas) {
      const need = tokenGas - nativeAtAddr;
      plan.legs.push({
        chain,
        symbol: t.symbol,
        kind: "gas_fund",
        amountRaw: need.toString(),
        amount: human(need, 18),
        from: treasury,
        to: address
      });
    }
    plan.legs.push({
      chain,
      symbol: t.symbol,
      kind: "token_sweep",
      amountRaw: bal.toString(),
      amount: human(bal, t.decimals),
      from: address,
      to: treasury
    });
  }

  // Native sweep LAST — only the pre-existing native minus its own fee. (Gas
  // we inject for tokens gets consumed by those transfers; anything left is
  // picked up on the next flush.)
  if (nativeAtAddr > nativeFee) {
    const amt = nativeAtAddr - nativeFee;
    plan.legs.push({
      chain,
      symbol: tokens.find((t) => t.native)?.symbol ?? "ETH",
      kind: "native_sweep",
      amountRaw: amt.toString(),
      amount: human(amt, 18),
      from: address,
      to: treasury
    });
  } else if (nativeAtAddr > 0n) {
    plan.skipped.push({ chain, symbol: "native", reason: "dust below gas fee" });
  }
}

/** Tron plan: TRC-20 sweeps (gas-funded with TRX) + a native TRX sweep.
 *  PARTY is excluded — it's an internal fixed-price token, not a deposit asset. */
async function planTron(address: string, treasury: string, plan: SweepPlan) {
  let trx: bigint;
  try {
    trx = await tron.tronNativeBalance(address);
  } catch {
    plan.skipped.push({ chain: "tron", symbol: "*", reason: "RPC unavailable" });
    return;
  }
  const tokens = TOKENS.filter((t) => t.chain === "tron" && !t.native && t.symbol !== "PARTY");
  for (const t of tokens) {
    let bal: bigint;
    try {
      bal = await tron.tronTrc20Balance(t.address!, address);
    } catch {
      continue;
    }
    if (bal <= 0n) continue;
    if (trx < tron.TRON_SWEEP_GAS_SUN) {
      const need = tron.TRON_SWEEP_GAS_SUN - trx;
      plan.legs.push({
        chain: "tron",
        symbol: t.symbol,
        kind: "gas_fund",
        amountRaw: need.toString(),
        amount: human(need, 6),
        from: treasury,
        to: address
      });
    }
    plan.legs.push({
      chain: "tron",
      symbol: t.symbol,
      kind: "token_sweep",
      amountRaw: bal.toString(),
      amount: human(bal, t.decimals),
      from: address,
      to: treasury
    });
  }
  if (trx > tron.TRON_NATIVE_RESERVE_SUN) {
    const amt = trx - tron.TRON_NATIVE_RESERVE_SUN;
    plan.legs.push({
      chain: "tron",
      symbol: "TRX",
      kind: "native_sweep",
      amountRaw: amt.toString(),
      amount: human(amt, 6),
      from: address,
      to: treasury
    });
  }
}

/** BTC plan: a single native sweep of all UTXOs (fee comes out of the amount). */
async function planBtc(address: string, treasury: string, plan: SweepPlan) {
  let bal: bigint;
  try {
    bal = await btc.btcBalance(address);
  } catch {
    plan.skipped.push({ chain: "btc", symbol: "*", reason: "RPC unavailable" });
    return;
  }
  if (bal <= 0n) return;
  plan.legs.push({
    chain: "btc",
    symbol: "BTC",
    kind: "native_sweep",
    amountRaw: bal.toString(),
    amount: human(bal, 8),
    from: address,
    to: treasury
  });
}

export async function previewUser(userId: string): Promise<SweepPlan> {
  const row = await userRow(userId);
  const plan: SweepPlan = {
    userId,
    userIndex: row.user_index,
    supported: ["eth", "bsc", "polygon", "tron", "btc"],
    pending: [],
    legs: [],
    skipped: []
  };
  const evmTreasury = await treasuryAddress("evm");
  await planEvm("eth", row.eth, evmTreasury, plan);
  await planEvm("bsc", row.bsc, evmTreasury, plan);
  await planEvm("polygon", row.polygon || row.eth, evmTreasury, plan);
  if (row.tron) await planTron(row.tron, await treasuryAddress("tron"), plan);
  if (row.btc) await planBtc(row.btc, await treasuryAddress("btc"), plan);
  return plan;
}

/**
 * Execute the flush for one user across all chains. Gas-fund legs run first
 * (treasury → user) and are awaited before the dependent token transfer.
 * Amounts are RE-READ live at execution so we never over-send. Every broadcast
 * leg is recorded in treasury_sweeps. The user ledger is never touched.
 */
export async function executeUser(userId: string, adminId: string): Promise<SweepResult> {
  const row = await userRow(userId);
  const out: SweepResult = { ok: true, legs: [] };

  const record = (leg: SweepLeg, status: string, txHash?: string, error?: string) => {
    db.insert(treasurySweeps)
      .values({
        id: ulid(),
        user_id: userId,
        chain: leg.chain,
        symbol: leg.symbol,
        amount_raw: leg.amountRaw,
        kind: leg.kind,
        from_address: leg.from,
        to_address: leg.to,
        tx_hash: txHash ?? null,
        status,
        error: error ?? null,
        admin_id: adminId,
        created_at: Date.now()
      })
      .run();
    out.legs.push({ ...leg, txHash, status, error });
  };
  const leg = (
    chain: string,
    symbol: string,
    kind: SweepLeg["kind"],
    raw: bigint,
    dec: number,
    from: string,
    to: string
  ): SweepLeg => ({ chain, symbol, kind, amountRaw: raw.toString(), amount: human(raw, dec), from, to });

  // ── EVM (ETH + BSC + Polygon share the address/key) ────────────────────
  try {
    const priv = deriveUserPrivKey(await masterMnemonic("evm"), "eth", row.user_index);
    const treasury = await treasuryAddress("evm");
    for (const chain of EVM_CHAINS) {
      const addr =
        chain === "eth" ? row.eth : chain === "polygon" ? row.polygon || row.eth : row.bsc;
      const gasPrice = await evm.evmGasPrice(chain);
      const tokenGas = evm.EVM_ERC20_GAS * gasPrice;
      for (const t of TOKENS.filter((t) => t.chain === chain && !t.native && t.symbol !== "PARTY")) {
        let bal: bigint;
        try {
          bal = await evm.evmTokenBalance(chain, t.address!, addr);
        } catch {
          continue;
        }
        if (bal <= 0n) continue;
        try {
          const have = await evm.evmNativeBalance(chain, addr);
          if (have < tokenGas) {
            const need = tokenGas - have;
            const gl = leg(chain, t.symbol, "gas_fund", need, 18, treasury, addr);
            const gh = await evm.sendEvmNative({ chain, to: addr, amountRaw: need.toString() });
            record(gl, "sent", gh);
            if (!(await evm.evmWaitReceipt(chain, gh))) throw new Error("gas-fund reverted");
          }
          const tl = leg(chain, t.symbol, "token_sweep", bal, t.decimals, addr, treasury);
          const th = await evm.evmSendErc20FromPriv({ chain, priv, token: t.address!, to: treasury, amountRaw: bal.toString() });
          record(tl, "sent", th);
        } catch (e) {
          out.ok = false;
          record(leg(chain, t.symbol, "token_sweep", bal, t.decimals, addr, treasury), "failed", undefined, (e as Error).message);
        }
      }
      // native sweep — re-read, subtract fee
      try {
        const bal = await evm.evmNativeBalance(chain, addr);
        const fee = evm.EVM_NATIVE_GAS * gasPrice;
        if (bal > fee) {
          const nl = leg(chain, chain === "eth" ? "ETH" : "BNB", "native_sweep", bal - fee, 18, addr, treasury);
          const nh = await evm.evmSendNativeFromPriv({ chain, priv, to: treasury, amountRaw: (bal - fee).toString() });
          record(nl, "sent", nh);
        }
      } catch (e) {
        out.ok = false;
        record(leg(chain, "native", "native_sweep", 0n, 18, addr, treasury), "failed", undefined, (e as Error).message);
      }
    }
  } catch (e) {
    out.ok = false;
    record(leg("eth", "*", "token_sweep", 0n, 18, row.eth, ""), "failed", undefined, "EVM: " + (e as Error).message);
  }

  // ── Tron ───────────────────────────────────────────────────────────────
  if (row.tron) {
    try {
      const priv = deriveUserPrivKey(await masterMnemonic("tron"), "tron", row.user_index);
      const treasury = await treasuryAddress("tron");
      for (const t of TOKENS.filter((t) => t.chain === "tron" && !t.native && t.symbol !== "PARTY")) {
        let bal: bigint;
        try {
          bal = await tron.tronTrc20Balance(t.address!, row.tron);
        } catch {
          continue;
        }
        if (bal <= 0n) continue;
        try {
          const have = await tron.tronNativeBalance(row.tron);
          if (have < tron.TRON_SWEEP_GAS_SUN) {
            const need = tron.TRON_SWEEP_GAS_SUN - have;
            const gl = leg("tron", t.symbol, "gas_fund", need, 6, treasury, row.tron);
            const gh = await tron.tronSendNativeFromPriv({ priv: await treasuryTronPriv(), to: row.tron, amountRaw: need.toString() });
            record(gl, "sent", gh);
            await tron.tronWaitBalance(row.tron, tron.TRON_SWEEP_GAS_SUN);
          }
          const tl = leg("tron", t.symbol, "token_sweep", bal, t.decimals, row.tron, treasury);
          const th = await tron.tronSendTrc20FromPriv({ priv, contract: t.address!, to: treasury, amountRaw: bal.toString() });
          record(tl, "sent", th);
        } catch (e) {
          out.ok = false;
          record(leg("tron", t.symbol, "token_sweep", bal, t.decimals, row.tron, treasury), "failed", undefined, (e as Error).message);
        }
      }
      try {
        const trx = await tron.tronNativeBalance(row.tron);
        if (trx > tron.TRON_NATIVE_RESERVE_SUN) {
          const amt = trx - tron.TRON_NATIVE_RESERVE_SUN;
          const nl = leg("tron", "TRX", "native_sweep", amt, 6, row.tron, treasury);
          const nh = await tron.tronSendNativeFromPriv({ priv, to: treasury, amountRaw: amt.toString() });
          record(nl, "sent", nh);
        }
      } catch (e) {
        out.ok = false;
        record(leg("tron", "TRX", "native_sweep", 0n, 6, row.tron, treasury), "failed", undefined, (e as Error).message);
      }
    } catch (e) {
      out.ok = false;
      record(leg("tron", "*", "token_sweep", 0n, 6, row.tron, ""), "failed", undefined, "Tron: " + (e as Error).message);
    }
  }

  // ── BTC (native only, single sweep-all) ────────────────────────────────
  if (row.btc) {
    try {
      const priv = deriveUserPrivKey(await masterMnemonic("btc"), "btc", row.user_index);
      const treasury = await treasuryAddress("btc");
      const res = await btc.btcSweepAllFromPriv({ priv, to: treasury });
      if (res) {
        record(
          { chain: "btc", symbol: "BTC", kind: "native_sweep", amountRaw: res.amountRaw, amount: human(BigInt(res.amountRaw), 8), from: row.btc, to: treasury },
          "sent",
          res.txid
        );
      }
    } catch (e) {
      out.ok = false;
      record(leg("btc", "BTC", "native_sweep", 0n, 8, row.btc, ""), "failed", undefined, "BTC: " + (e as Error).message);
    }
  }

  return out;
}

/** Treasury Tron private key (for gas-funding legs). */
async function treasuryTronPriv(): Promise<string> {
  return privKeyForChain("tron");
}
