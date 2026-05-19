import type { DispatcherMap } from "../factory.js";

// REQ-A3 IPFS / CIDRegistry surface. Stub: tracks pinning budget, no real IPFS calls.
// Production: calls Pinata / web3.storage SDK + writes the unpin record to the
// on-chain CIDRegistry contract (Sprint 7+).
let pinningBudgetUsd = 0;
const unpinned = new Set<string>();

export const cidDispatchers: DispatcherMap = {
  "ipfs.setPinningBudget": async (a) => {
    pinningBudgetUsd = a.monthlyUsd;
    console.warn(`[cid] STUB setPinningBudget = $${a.monthlyUsd}/mo`);
    return { ok: true, result: { monthlyUsd: a.monthlyUsd } };
  },
  "ipfs.forceUnpinIllegal": async (a) => {
    unpinned.add(a.cid);
    console.warn(`[cid] STUB forceUnpinIllegal cid=${a.cid}`);
    return { ok: true, result: { cid: a.cid } };
  }
};
