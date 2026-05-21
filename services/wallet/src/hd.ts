/**
 * HD-wallet derivation. One master xpub per chain (xprv lives in KMS); per-user
 * addresses are derived deterministically from `userIndex`. No private keys on
 * disk, no per-user keys generated, signup costs zero RPC calls.
 *
 * BIP-44 paths:
 *   EVM (ETH + BSC)  m/44'/60'/0'/0/i
 *   BTC              m/44'/0'/0'/0/i   (encoded as native-segwit p2wpkh / bech32)
 *   TRON             m/44'/195'/0'/0/i
 */

import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { publicKeyToAddress } from "viem/utils";
import bs58check from "bs58check";
import { createHash } from "node:crypto";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";

bitcoin.initEccLib(ecc as never);

export type Chain = "eth" | "bsc" | "tron" | "btc";

// ────────────────────────────────────────────────────────────────────────────
// Mnemonic + master key
// ────────────────────────────────────────────────────────────────────────────

export function newMnemonic(): string {
  return generateMnemonic(wordlist, 256); // 24 words
}

export function masterFromMnemonic(mnemonic: string): HDKey {
  const seed = mnemonicToSeedSync(mnemonic);
  return HDKey.fromMasterSeed(seed);
}

function accountPath(chain: Chain): string {
  switch (chain) {
    case "eth":
    case "bsc":
      return "m/44'/60'/0'/0";
    case "btc":
      return "m/44'/0'/0'/0";
    case "tron":
      return "m/44'/195'/0'/0";
  }
}

/**
 * Derive the chain's account-level xpub from a mnemonic. This is the value
 * you publish to the wallet service via env vars after running init-seeds.
 */
export function xpubFromMnemonic(mnemonic: string, chain: Chain): string {
  const root = masterFromMnemonic(mnemonic);
  const account = root.derive(accountPath(chain));
  if (!account.publicExtendedKey) throw new Error(`Failed to derive xpub for ${chain}`);
  return account.publicExtendedKey;
}

/**
 * Derive a user-index public key from an xpub. Returns the 33-byte
 * compressed pubkey ready for chain-specific address encoding.
 */
export function derivePubkey(xpub: string, userIndex: number): Uint8Array {
  const account = HDKey.fromExtendedKey(xpub);
  const child = account.deriveChild(userIndex);
  if (!child.publicKey) throw new Error("HDKey produced no public key");
  return child.publicKey;
}

// ────────────────────────────────────────────────────────────────────────────
// Address encoders — chain-specific
// ────────────────────────────────────────────────────────────────────────────

function uncompressedPubkey(compressed: Uint8Array): Uint8Array {
  // secp256k1 point decompression — returns 65 bytes (0x04 || x || y).
  return secp256k1.ProjectivePoint.fromHex(compressed).toRawBytes(false);
}

/** EVM (ETH and BSC share the same address space). */
export function evmAddressFromPubkey(compressedPubkey: Uint8Array): string {
  // viem expects an uncompressed pubkey hex with the leading 0x04 trimmed,
  // OR a compressed one — either works through publicKeyToAddress.
  // It returns a checksummed 0x… address.
  const hex = ("0x" + Buffer.from(uncompressedPubkey(compressedPubkey)).toString("hex")) as `0x${string}`;
  return publicKeyToAddress(hex);
}

/**
 * Tron address from compressed pubkey:
 *   1. Decompress, take keccak256 of x||y (last 64 bytes), last 20 bytes
 *   2. Prepend 0x41 (Tron mainnet prefix)
 *   3. Base58Check encode → "T..." address
 */
export function tronAddressFromPubkey(compressedPubkey: Uint8Array): string {
  const uncompressed = uncompressedPubkey(compressedPubkey);
  const hash: Uint8Array = keccak_256(uncompressed.slice(1));
  const last20 = hash.slice(-20);
  const tronBytes = new Uint8Array(21);
  tronBytes[0] = 0x41;
  tronBytes.set(last20, 1);
  return bs58check.encode(Buffer.from(tronBytes));
}

/** Bitcoin native segwit (bech32) — bc1q… */
export function btcAddressFromPubkey(compressedPubkey: Uint8Array): string {
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(compressedPubkey),
    network: bitcoin.networks.bitcoin
  });
  if (!address) throw new Error("Failed to derive BTC p2wpkh address");
  return address;
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level: derive all addresses for a user from the published xpubs
// ────────────────────────────────────────────────────────────────────────────

export type UserAddresses = {
  userIndex: number;
  eth: string; // also valid as the BSC address
  bsc: string;
  tron: string;
  btc: string;
};

export function deriveUserAddresses(opts: {
  userIndex: number;
  evmXpub: string;
  btcXpub: string;
  tronXpub: string;
}): UserAddresses {
  const evmPub = derivePubkey(opts.evmXpub, opts.userIndex);
  const eth = evmAddressFromPubkey(evmPub);
  return {
    userIndex: opts.userIndex,
    eth,
    bsc: eth,
    tron: tronAddressFromPubkey(derivePubkey(opts.tronXpub, opts.userIndex)),
    btc: btcAddressFromPubkey(derivePubkey(opts.btcXpub, opts.userIndex))
  };
}

// keep node:crypto import live (used by bs58check internally on some platforms)
void createHash;
