/**
 * Company treasury (hot-wallet) keys — the single set of keys that pay out all
 * user withdrawals. One key per chain family:
 *
 *   evm   → ETH + BSC (same secp256k1 key / same 0x address)
 *   tron  → TRX + TRC20
 *   btc   → native segwit (bech32)
 *
 * The raw private keys live ONLY KMS-encrypted on the /data/seeds volume
 * (treasury-*.bin). They are decrypted in-memory at signing time and never
 * persisted in the clear. Whoever holds KMS:Decrypt on the key + these files
 * controls the company funds.
 */

import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { TronWeb } from "tronweb";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import {
  encryptSeed,
  saveCiphertext,
  loadAndDecryptSeed,
  type SeedFile
} from "./kms.js";

bitcoin.initEccLib(ecc);

/** Compressed secp256k1 public key for a raw private key. */
export function btcPubkey(privHex: string): Buffer {
  const pub = ecc.pointFromScalar(Buffer.from(privHex.replace(/^0x/, ""), "hex"), true);
  if (!pub) throw new Error("Invalid BTC private key");
  return Buffer.from(pub);
}

export type TreasuryFamily = "evm" | "tron" | "btc";

const FILE: Record<TreasuryFamily, SeedFile> = {
  evm: "treasury-evm",
  tron: "treasury-tron",
  btc: "treasury-btc"
};

/** Derive the public address for a family from a raw private key (hex, no 0x). */
export function addressForKey(family: TreasuryFamily, privHex: string): string {
  const clean = privHex.replace(/^0x/, "");
  if (family === "evm") {
    return privateKeyToAccount(`0x${clean}`).address;
  }
  if (family === "tron") {
    // TronWeb derives the base58 address from the private key.
    return TronWeb.address.fromPrivateKey(clean) as string;
  }
  // btc — native segwit p2wpkh (bc1…)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: btcPubkey(clean),
    network: bitcoin.networks.bitcoin
  });
  if (!address) throw new Error("Failed to derive BTC treasury address");
  return address;
}

/** Generate a fresh treasury key for a family. Returns the priv (hex) + address. */
export function generateTreasuryKey(family: TreasuryFamily): {
  privHex: string;
  address: string;
} {
  const privHex = randomBytes(32).toString("hex");
  return { privHex, address: addressForKey(family, privHex) };
}

/** Persist a treasury key (KMS-encrypted) to the seeds volume. */
export async function saveTreasuryKey(
  family: TreasuryFamily,
  privHex: string
): Promise<void> {
  const ciphertext = await encryptSeed(Buffer.from(privHex, "utf8"));
  await saveCiphertext(FILE[family], ciphertext);
}

// In-memory cache so we don't hit KMS on every withdrawal.
const cache = new Map<TreasuryFamily, string>();

/** Load + KMS-decrypt the treasury private key (hex). Cached in memory. */
export async function loadTreasuryPriv(family: TreasuryFamily): Promise<string> {
  const hit = cache.get(family);
  if (hit) return hit;
  const plain = await loadAndDecryptSeed(FILE[family]);
  const privHex = Buffer.from(plain).toString("utf8").trim();
  cache.set(family, privHex);
  return privHex;
}

/** Current treasury address for a family (decrypts the key). */
export async function treasuryAddress(family: TreasuryFamily): Promise<string> {
  return addressForKey(family, await loadTreasuryPriv(family));
}

/** Map a chain to its treasury family. */
export function familyForChain(chain: string): TreasuryFamily {
  if (chain === "eth" || chain === "bsc") return "evm";
  if (chain === "tron") return "tron";
  if (chain === "btc") return "btc";
  throw new Error(`Unknown chain: ${chain}`);
}

// ── Admin-imported per-chain keys (override the generated treasury) ────────
const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://localhost:4200").replace(/\/$/, "");
const INTERNAL = process.env.INTERNAL_SERVICE_TOKEN;
type ImportedKeys = Record<string, { address: string | null; privkey: string | null }>;
let importedCache: { at: number; keys: ImportedKeys } | null = null;

async function importedKeys(): Promise<ImportedKeys> {
  if (importedCache && Date.now() - importedCache.at < 60_000) return importedCache.keys;
  if (!INTERNAL) return {};
  try {
    const res = await fetch(`${AUTH_BASE}/internal/settings/wallet`, {
      headers: { Authorization: `Bearer ${INTERNAL}` }
    });
    if (!res.ok) return {};
    const keys = (await res.json()) as ImportedKeys;
    importedCache = { at: Date.now(), keys };
    return keys;
  } catch {
    return {};
  }
}

/**
 * Private key (hex, no 0x) to SIGN withdrawals for a chain. Prefers the
 * admin-imported funded-wallet key for that chain; falls back to the
 * KMS-generated treasury key for the chain's family.
 */
export async function privKeyForChain(
  chain: "eth" | "bsc" | "tron" | "btc"
): Promise<string> {
  const imp = await importedKeys();
  const k = imp[chain]?.privkey;
  if (k && k.trim()) return k.trim().replace(/^0x/, "");
  return loadTreasuryPriv(familyForChain(chain));
}
