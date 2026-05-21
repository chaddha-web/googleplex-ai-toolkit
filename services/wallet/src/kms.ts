/**
 * AWS KMS envelope-encryption for the master HD-wallet seeds.
 *
 * - encryptSeed(plaintext)  → ciphertext bytes (safe to write to disk)
 * - decryptSeed(ciphertext) → plaintext bytes (in-memory only, never persisted)
 *
 * The KMS key id never leaves the env. The encrypted ciphertext is stored at
 * services/wallet/data/seeds/<chain>.bin and is meaningless without an IAM
 * principal that's been granted KMS:Decrypt on that key.
 */

import {
  KMSClient,
  EncryptCommand,
  DecryptCommand
} from "@aws-sdk/client-kms";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const REGION = process.env.AWS_REGION;
const KEY_ID = process.env.KMS_KEY_ID;

let _client: KMSClient | null = null;
function client(): KMSClient {
  if (!_client) {
    if (!REGION) throw new Error("AWS_REGION not set");
    _client = new KMSClient({ region: REGION });
  }
  return _client;
}

export async function encryptSeed(plaintext: Uint8Array): Promise<Uint8Array> {
  if (!KEY_ID) throw new Error("KMS_KEY_ID not set");
  const out = await client().send(
    new EncryptCommand({ KeyId: KEY_ID, Plaintext: plaintext })
  );
  if (!out.CiphertextBlob) throw new Error("KMS returned no ciphertext");
  return out.CiphertextBlob;
}

export async function decryptSeed(ciphertext: Uint8Array): Promise<Uint8Array> {
  const out = await client().send(new DecryptCommand({ CiphertextBlob: ciphertext }));
  if (!out.Plaintext) throw new Error("KMS returned no plaintext");
  return out.Plaintext;
}

// ────────────────────────────────────────────────────────────────────────────
// On-disk seed store (the ciphertext, not the seed itself)
// ────────────────────────────────────────────────────────────────────────────

export type SeedFile =
  | "evm"
  | "btc"
  | "tron"
  // Company hot-wallet (treasury) keys used to pay withdrawals.
  | "treasury-evm"
  | "treasury-tron"
  | "treasury-btc";

// Where the encrypted seed ciphertexts live. In prod this MUST point at the
// persistent volume (WALLET_SEED_DIR=/data/seeds) so seeds survive container
// recreates — losing them locks all custodial funds. Defaults to a local path
// for dev.
const SEED_DIR = process.env.WALLET_SEED_DIR || "./data/seeds";

function seedPath(name: SeedFile): string {
  return resolve(`${SEED_DIR}/${name}.bin`);
}

export async function saveCiphertext(name: SeedFile, ciphertext: Uint8Array) {
  const path = seedPath(name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, ciphertext);
}

export async function loadCiphertext(name: SeedFile): Promise<Uint8Array> {
  const path = seedPath(name);
  return readFile(path);
}

/**
 * Convenience: load the ciphertext for a chain, decrypt it via KMS, and
 * hand back the mnemonic / seed plaintext. Caller is responsible for
 * never persisting the result.
 */
export async function loadAndDecryptSeed(name: SeedFile): Promise<Uint8Array> {
  const ciphertext = await loadCiphertext(name);
  return decryptSeed(ciphertext);
}
