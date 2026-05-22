/**
 * Bitcoin payout signer — native segwit (p2wpkh) UTXO send from the company
 * treasury key. Reads UTXOs + fee rate and broadcasts via the mempool.space
 * REST API (BTC_API_URL).
 */

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { privKeyForChain, btcPubkey, addressForKey } from "../treasury.js";

bitcoin.initEccLib(ecc);
const NETWORK = bitcoin.networks.bitcoin;
const API = (process.env.BTC_API_URL ?? "https://mempool.space/api").replace(/\/$/, "");
const DUST = 546; // sats — ignore change below this

type Utxo = { txid: string; vout: number; value: number };

export function isValidBtcAddress(addr: string): boolean {
  try {
    bitcoin.address.toOutputScript(addr, NETWORK);
    return true;
  } catch {
    return false;
  }
}

async function fetchUtxos(addr: string): Promise<Utxo[]> {
  const res = await fetch(`${API}/address/${addr}/utxo`);
  if (!res.ok) throw new Error(`UTXO fetch failed: ${res.status}`);
  const all = (await res.json()) as Array<Utxo & { status?: { confirmed?: boolean } }>;
  // Only spend confirmed UTXOs.
  return all.filter((u) => u.status?.confirmed !== false);
}

async function feeRate(): Promise<number> {
  try {
    const res = await fetch(`${API}/v1/fees/recommended`);
    if (res.ok) {
      const f = (await res.json()) as { halfHourFee?: number };
      if (f.halfHourFee && f.halfHourFee > 0) return f.halfHourFee;
    }
  } catch {
    /* fall through */
  }
  return 10; // sat/vB fallback
}

/** Send native BTC. amountRaw = sats string. Returns txid. */
export async function sendBtc(opts: { to: string; amountRaw: string }): Promise<string> {
  if (!isValidBtcAddress(opts.to)) throw new Error("Invalid BTC address");

  const priv = (await privKeyForChain("btc")).replace(/^0x/, "");
  const privBuf = Buffer.from(priv, "hex");
  const pubkey = btcPubkey(priv);
  const fromAddr = addressForKey("btc", priv);
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey, network: NETWORK });
  const script = p2wpkh.output!;

  const amount = Number(BigInt(opts.amountRaw));
  const [utxos, rate] = await Promise.all([fetchUtxos(fromAddr), feeRate()]);

  // Greedy coin selection: largest first until we cover amount + fee.
  utxos.sort((a, b) => b.value - a.value);
  const selected: Utxo[] = [];
  let inSum = 0;
  const estFee = (nIn: number, nOut: number) =>
    Math.ceil(rate * (nIn * 68 + nOut * 31 + 11));

  for (const u of utxos) {
    selected.push(u);
    inSum += u.value;
    const fee = estFee(selected.length, 2);
    if (inSum >= amount + fee) break;
  }

  let fee = estFee(selected.length, 2);
  if (inSum < amount + fee) {
    throw new Error("Insufficient BTC in treasury for amount + fee");
  }

  const psbt = new bitcoin.Psbt({ network: NETWORK });
  for (const u of selected) {
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: { script, value: u.value }
    });
  }
  psbt.addOutput({ address: opts.to, value: amount });

  let change = inSum - amount - fee;
  // If change is below dust, drop it (donate to fee) and recompute with 1 output.
  if (change < DUST) {
    fee = estFee(selected.length, 1);
    change = inSum - amount - fee;
    if (change < 0) throw new Error("Insufficient BTC after fee");
  } else {
    psbt.addOutput({ address: fromAddr, value: change });
  }

  const signer: bitcoin.Signer = {
    publicKey: pubkey,
    sign: (hash: Buffer) => Buffer.from(ecc.sign(hash, privBuf))
  };
  for (let i = 0; i < selected.length; i++) psbt.signInput(i, signer);
  psbt.finalizeAllInputs();

  const rawHex = psbt.extractTransaction().toHex();
  const res = await fetch(`${API}/tx`, { method: "POST", body: rawHex });
  const txid = await res.text();
  if (!res.ok) throw new Error(`BTC broadcast failed: ${txid}`);
  return txid.trim();
}
