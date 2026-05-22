/**
 * Tron payout signer — native TRX + TRC20 (USDT/USDC/PARTY) from the company
 * treasury key, via TronGrid.
 */

import { TronWeb } from "tronweb";
import { privKeyForChain } from "../treasury.js";

// Max network fee we'll spend on a TRC20 transfer (SUN). 100 TRX ceiling —
// covers energy burn when the treasury isn't staked for energy.
const FEE_LIMIT_SUN = 100_000_000;

async function tron(): Promise<InstanceType<typeof TronWeb>> {
  const priv = (await privKeyForChain("tron")).replace(/^0x/, "");
  const headers: Record<string, string> = {};
  if (process.env.TRON_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRON_API_KEY;
  return new TronWeb({
    fullHost: process.env.TRON_API_URL ?? "https://api.trongrid.io",
    headers,
    privateKey: priv
  });
}

export function isValidTronAddress(addr: string): boolean {
  return TronWeb.isAddress(addr);
}

/** Send native TRX. amountRaw = SUN string. Returns txid. */
export async function sendTronNative(opts: {
  to: string;
  amountRaw: string;
}): Promise<string> {
  if (!TronWeb.isAddress(opts.to)) throw new Error("Invalid Tron address");
  const tw = await tron();
  const res: any = await tw.trx.sendTransaction(opts.to, Number(BigInt(opts.amountRaw)));
  const txid = res?.txid ?? res?.transaction?.txID;
  if (!txid) throw new Error("Tron broadcast returned no txid");
  return txid as string;
}

/** Send a TRC20 token. amountRaw = base units string. Returns txid. */
export async function sendTronTrc20(opts: {
  contract: string;
  to: string;
  amountRaw: string;
}): Promise<string> {
  if (!TronWeb.isAddress(opts.to)) throw new Error("Invalid Tron address");
  const tw = await tron();
  const contract = await tw.contract().at(opts.contract);
  const txid: string = await contract
    .transfer(opts.to, opts.amountRaw)
    .send({ feeLimit: FEE_LIMIT_SUN });
  if (!txid) throw new Error("Tron TRC20 broadcast returned no txid");
  return txid;
}
