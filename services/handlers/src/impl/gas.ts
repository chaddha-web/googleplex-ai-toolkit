import type { DispatcherMap } from "../factory.js";

// REQ-W2 gas-abstraction relayer config. Stub mutates an in-memory map;
// production: backend-b reads these from Postgres and applies to relayed txs.
const feeBps = new Map<string, number>();
const subsidyCap = new Map<string, string>();

export const gasDispatchers: DispatcherMap = {
  "gas.setFeeBps": async (a) => {
    feeBps.set(a.chain, a.bps);
    console.warn(`[gas] STUB setFeeBps ${a.chain} = ${a.bps}`);
    return { ok: true, result: { chain: a.chain, bps: a.bps } };
  },
  "gas.setSubsidyCap": async (a) => {
    subsidyCap.set(a.chain, a.amount);
    console.warn(`[gas] STUB setSubsidyCap ${a.chain} = ${a.amount}`);
    return { ok: true, result: { chain: a.chain, amount: a.amount } };
  }
};
