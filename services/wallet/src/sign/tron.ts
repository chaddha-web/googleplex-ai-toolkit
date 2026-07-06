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

// ── Sweep primitives (read balances + sign from an arbitrary derived key) ──

function tronFrom(priv: string): InstanceType<typeof TronWeb> {
  const headers: Record<string, string> = {};
  if (process.env.TRON_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRON_API_KEY;
  return new TronWeb({
    fullHost: process.env.TRON_API_URL ?? "https://api.trongrid.io",
    headers,
    privateKey: priv.replace(/^0x/, "")
  });
}

/** ~40 TRX to cover an unstaked TRC20 transfer's energy burn (SUN). */
export const TRON_SWEEP_GAS_SUN = BigInt(process.env.TRON_SWEEP_GAS_SUN ?? 40_000_000);
/** Leave ~1.1 TRX so the native-sweep tx itself can pay its fee. */
export const TRON_NATIVE_RESERVE_SUN = 1_100_000n;

export async function tronNativeBalance(address: string): Promise<bigint> {
  const tw = await tron();
  const sun = await tw.trx.getBalance(address);
  return BigInt(Math.trunc(Number(sun)));
}

export async function tronTrc20Balance(contract: string, address: string): Promise<bigint> {
  const tw = await tron();
  const c = await tw.contract().at(contract);
  const bal: any = await c.balanceOf(address).call();
  return BigInt(bal.toString());
}

export async function tronSendNativeFromPriv(opts: {
  priv: string;
  to: string;
  amountRaw: string;
}): Promise<string> {
  if (!TronWeb.isAddress(opts.to)) throw new Error("Invalid Tron address");
  const tw = tronFrom(opts.priv);
  const res: any = await tw.trx.sendTransaction(opts.to, Number(BigInt(opts.amountRaw)));
  const txid = res?.txid ?? res?.transaction?.txID;
  if (!txid) throw new Error("Tron broadcast returned no txid");
  return txid as string;
}

export async function tronSendTrc20FromPriv(opts: {
  priv: string;
  contract: string;
  to: string;
  amountRaw: string;
}): Promise<string> {
  if (!TronWeb.isAddress(opts.to)) throw new Error("Invalid Tron address");
  const tw = tronFrom(opts.priv);
  const c = await tw.contract().at(opts.contract);
  const txid: string = await c.transfer(opts.to, opts.amountRaw).send({ feeLimit: FEE_LIMIT_SUN });
  if (!txid) throw new Error("Tron TRC20 broadcast returned no txid");
  return txid;
}

/** Poll until `address` holds at least `minSun`, or timeout. */
export async function tronWaitBalance(
  address: string,
  minSun: bigint,
  timeoutMs = 90_000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await tronNativeBalance(address)) >= minSun) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}
