/**
 * Bitcoin balance reads via mempool.space REST. No native token support
 * (BTC is the only asset on this chain we care about).
 */

const API = process.env.BTC_API_URL ?? "https://mempool.space/api";

export async function getBtcBalance(address: string): Promise<string> {
  const res = await fetch(`${API}/address/${address}`);
  if (!res.ok) throw new Error(`mempool /address ${res.status}`);
  const data: {
    chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
    mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
  } = await res.json();
  const c = data.chain_stats ?? {};
  const m = data.mempool_stats ?? {};
  const sats =
    ((c.funded_txo_sum ?? 0) - (c.spent_txo_sum ?? 0)) +
    ((m.funded_txo_sum ?? 0) - (m.spent_txo_sum ?? 0));
  // RAW base-unit string (satoshis), no BTC division.
  return BigInt(Math.trunc(sats)).toString();
}

export async function pingBtc(): Promise<number> {
  const res = await fetch(`${API}/blocks/tip/height`);
  if (!res.ok) throw new Error(`mempool /blocks/tip/height ${res.status}`);
  return Number(await res.text());
}
