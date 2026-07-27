/**
 * Company treasury (hot-wallet) keys — the single set of keys that pay out all
 * user withdrawals. One key per chain family:
 *
 *   evm   → ETH + BSC + Polygon (same secp256k1 key / same 0x address)
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
  if (chain === "eth" || chain === "bsc" || chain === "polygon") return "evm";
  if (chain === "tron") return "tron";
  if (chain === "btc") return "btc";
  throw new Error(`Unknown chain: ${chain}`);
}

// ── Admin-imported per-chain keys (override the generated treasury) ────────
const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://auth:4200").replace(/\/$/, "");
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

export type PayoutChain = "eth" | "bsc" | "polygon" | "tron" | "btc";

/**
 * Private key (hex, no 0x) to SIGN withdrawals for a chain.
 *
 * Each chain has its OWN wallet: the admin-imported key for that chain wins,
 * even when several chains share an address space (eth/bsc/polygon are all
 * secp256k1 0x addresses but may be three different wallets). Only a chain the
 * operator has left entirely unconfigured falls back to the KMS-generated
 * per-family treasury key.
 *
 * Two hard guards, because the failure they prevent is silent and expensive:
 *
 *  1. **Address without key → refuse.** Admin → Settings holds the address and
 *     the key in separate fields. Configuring only the address used to fall
 *     through to the generated treasury key, so the admin panel displayed one
 *     (funded) wallet while payouts were signed by a different (empty) one —
 *     withdrawals fail on insufficient funds and the balance you are looking at
 *     is not the balance being spent.
 *  2. **Key must derive its address.** A key pasted against the wrong chain, or
 *     a typo'd address, would otherwise pay out of an unexpected wallet.
 */
export async function privKeyForChain(chain: PayoutChain): Promise<string> {
  const imp = await importedKeys();
  const key = imp[chain]?.privkey?.trim();
  const addr = imp[chain]?.address?.trim();

  if (key) {
    const priv = key.replace(/^0x/, "");
    if (addr) {
      let derived: string;
      try {
        derived = addressForKey(familyForChain(chain), priv);
      } catch {
        throw new Error(
          `The ${chain.toUpperCase()} treasury private key in Admin → Settings is not a valid key for this chain.`
        );
      }
      if (derived.toLowerCase() !== addr.toLowerCase()) {
        throw new Error(
          `The ${chain.toUpperCase()} treasury key does not match the configured ${chain.toUpperCase()} address ` +
            `(key derives ${derived}). Fix the pair in Admin → Settings before paying out.`
        );
      }
    }
    return priv;
  }

  if (addr) {
    throw new Error(
      `A ${chain.toUpperCase()} treasury address is configured in Admin → Settings but no private key. ` +
        `Import the matching key — refusing to pay out from a different wallet than the one shown.`
    );
  }

  return loadTreasuryPriv(familyForChain(chain));
}

/**
 * The address that actually pays out (and receives sweeps) for a chain — the
 * per-chain imported wallet, else the generated per-family treasury address.
 * Unlike `withdrawalAddresses()` (an admin display of what is configured) this
 * always resolves to a real address, because a sweep needs somewhere to go.
 */
export async function payoutAddressForChain(chain: PayoutChain): Promise<string> {
  const imp = await importedKeys();
  const addr = imp[chain]?.address?.trim();
  if (addr) return addr;
  return treasuryAddress(familyForChain(chain));
}

/**
 * The company payout addresses per chain — ONLY the admin-imported funded-wallet
 * addresses (set in Admin → Settings). Empty string for chains the operator
 * hasn't configured, so the admin view never shows auto-derived / unset wallets.
 */
export async function withdrawalAddresses(): Promise<{
  eth: string;
  bsc: string;
  polygon: string;
  tron: string;
  btc: string;
}> {
  const imp = await importedKeys();
  return {
    eth: imp.eth?.address?.trim() || "",
    bsc: imp.bsc?.address?.trim() || "",
    polygon: imp.polygon?.address?.trim() || "",
    tron: imp.tron?.address?.trim() || "",
    btc: imp.btc?.address?.trim() || ""
  };
}

/**
 * Every address the company can send FROM, lowercased — the KMS-generated
 * treasury address per family plus any admin-imported funded wallets.
 *
 * Used by the deposit indexer to ignore our own outbound transfers (gas-funding
 * legs, withdrawals paid to a member's own deposit address) so they are never
 * credited as deposits. Lowercased because EVM senders arrive checksummed from
 * some providers and lowercase from others; Tron/BTC addresses are
 * case-sensitive but consistently cased, so lowercasing both sides is safe.
 */
export async function treasurySenderAddresses(): Promise<Set<string>> {
  const out = new Set<string>();
  const add = (a?: string | null) => {
    const v = a?.trim();
    if (v) out.add(v.toLowerCase());
  };

  const imp = await importedKeys();
  for (const k of Object.keys(imp)) add(imp[k]?.address);

  // The generated treasury keys are the fallback signers, so they can be
  // senders too. Missing seed files are not an error — a family may be
  // configured purely through an imported wallet.
  for (const family of ["evm", "tron", "btc"] as const) {
    try {
      add(await treasuryAddress(family));
    } catch {
      /* family not provisioned — nothing to exclude */
    }
  }
  return out;
}
