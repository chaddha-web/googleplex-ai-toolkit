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
 * EVM (ETH/BSC) is fully implemented (preview + execute). Tron and BTC report
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

const EVM_CHAINS = ["eth", "bsc"] as const;
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

export async function previewUser(userId: string): Promise<SweepPlan> {
  const row = await userRow(userId);
  const plan: SweepPlan = {
    userId,
    userIndex: row.user_index,
    supported: ["eth", "bsc"],
    pending: ["tron", "btc"],
    legs: [],
    skipped: []
  };
  const treasury = await treasuryAddress("evm");
  await planEvm("eth", row.eth, treasury, plan);
  await planEvm("bsc", row.bsc, treasury, plan);
  // Tron/BTC: surfaced as pending so the admin knows they aren't swept yet.
  if (row.tron) plan.skipped.push({ chain: "tron", symbol: "*", reason: "execution pending on-chain validation" });
  if (row.btc) plan.skipped.push({ chain: "btc", symbol: "*", reason: "execution pending on-chain validation" });
  return plan;
}

/**
 * Execute the EVM legs of the plan. Gas-fund legs run first (treasury → user)
 * and are awaited before the dependent token transfer. Every broadcast leg is
 * recorded in treasury_sweeps. The user ledger is never touched.
 */
export async function executeUser(userId: string, adminId: string): Promise<SweepResult> {
  const row = await userRow(userId);
  const treasury = await treasuryAddress("evm");
  const mnemonic = await masterMnemonic("evm");
  const userPriv = deriveUserPrivKey(mnemonic, "eth", row.user_index); // EVM key

  const plan = await previewUser(userId);
  const out: SweepResult = { ok: true, legs: [] };

  const record = (
    leg: SweepLeg,
    status: string,
    txHash?: string,
    error?: string
  ) => {
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

  for (const leg of plan.legs.filter((l) => l.chain === "eth" || l.chain === "bsc")) {
    const chain = leg.chain as EvmChain;
    try {
      let hash: string;
      if (leg.kind === "gas_fund") {
        // Treasury pays the gas to the user address, then we wait for it.
        hash = await evm.sendEvmNative({ chain, to: leg.to, amountRaw: leg.amountRaw });
        record(leg, "sent", hash);
        const ok = await evm.evmWaitReceipt(chain, hash);
        if (!ok) throw new Error("gas-fund tx reverted");
      } else if (leg.kind === "token_sweep") {
        const token = TOKENS.find((t) => t.chain === chain && t.symbol === leg.symbol && !t.native)!;
        hash = await evm.evmSendErc20FromPriv({
          chain,
          priv: userPriv,
          token: token.address!,
          to: treasury,
          amountRaw: leg.amountRaw
        });
        record(leg, "sent", hash);
      } else {
        hash = await evm.evmSendNativeFromPriv({
          chain,
          priv: userPriv,
          to: treasury,
          amountRaw: leg.amountRaw
        });
        record(leg, "sent", hash);
      }
    } catch (e) {
      out.ok = false;
      record(leg, "failed", undefined, (e as Error).message);
    }
  }

  return out;
}
