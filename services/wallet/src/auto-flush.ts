/**
 * Auto-flush — a scheduled worker that sweeps member on-chain deposits into the
 * treasury once they cross a per-chain USD threshold (Admin → Settings). Reuses
 * the existing safe per-user sweep (executeUser); the destination is ALWAYS the
 * treasury (never a settings-configurable address), and it only moves
 * platform-custodied coins — a member's ledger entitlement is untouched.
 *
 * Disabled when all thresholds are 0/unset. Bounded per run.
 */

import { db } from "./db/index.js";
import { userWalletAddresses } from "./db/schema.js";
import { reconcile, type ReconcileResult } from "./reconcile.js";
import { executeUser } from "./sweep.js";
import { financeConfig } from "./withdraw-limits.js";
import { priceUsd } from "./prices.js";
import { auditToAuth } from "./audit.js";
import { notify } from "./notify.js";

type Chain = "eth" | "bsc" | "tron" | "btc";
const CHAINS: Chain[] = ["eth", "bsc", "tron", "btc"];
const INTERVAL_MS = Number(process.env.AUTO_FLUSH_INTERVAL_MS ?? 10 * 60_000);
const MAX_PER_RUN = Number(process.env.AUTO_FLUSH_MAX_PER_RUN ?? 25);

/** USD held on one chain for a reconcile snapshot. */
function chainUsd(snap: ReconcileResult, chain: Chain): number {
  let sum = 0;
  for (const b of snap.byLogicalAsset) {
    const pc = b.perChain.find((p) => p.chain === chain);
    if (pc && pc.amount > 0) sum += pc.amount * (priceUsd(b.asset) ?? 0);
  }
  return sum;
}

let inFlight = false;

async function runOnce(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const { flushThresholds } = await financeConfig();
    const active = CHAINS.filter((c) => (flushThresholds[c] ?? 0) > 0);
    if (active.length === 0) return; // feature disabled — nothing to do

    const users = await db.select().from(userWalletAddresses);
    let swept = 0;
    for (const u of users) {
      if (swept >= MAX_PER_RUN) break;
      let snap: ReconcileResult;
      try {
        snap = await reconcile({ eth: u.eth, bsc: u.bsc, tron: u.tron, btc: u.btc });
      } catch {
        continue;
      }
      const trigger = active.find((c) => chainUsd(snap, c) >= (flushThresholds[c] ?? Infinity));
      if (!trigger) continue;
      try {
        const r = await executeUser(u.user_id, "system:auto-flush");
        if (r.legs.length > 0) {
          swept++;
          auditToAuth({
            actorId: "system:auto-flush",
            action: "treasury.flush",
            targetId: u.user_id,
            targetLabel: u.user_id,
            detail: { auto: true, chain: trigger, legs: r.legs.length }
          });
        }
      } catch {
        /* skip this user, continue the run */
      }
    }
    if (swept > 0) notify(`🤖 <b>Auto-flush</b> swept ${swept} member wallet(s) to treasury.`);
  } finally {
    inFlight = false;
  }
}

let started = false;
/** Start the auto-flush loop (idempotent). Call once at boot. */
export function startAutoFlush(): void {
  if (started) return;
  started = true;
  const t = setInterval(() => void runOnce(), INTERVAL_MS);
  if (typeof t.unref === "function") t.unref();
}
