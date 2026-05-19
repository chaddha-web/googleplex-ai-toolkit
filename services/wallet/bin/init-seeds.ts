/**
 * Generates one fresh BIP-39 mnemonic per chain family (EVM, BTC, Tron),
 * encrypts each via AWS KMS, writes the ciphertext to
 *   services/wallet/data/seeds/<name>.bin
 * and prints the corresponding public xpubs for you to paste into .env.
 *
 *   npm run init-seeds --workspace @googolplex/wallet
 *
 * ⚠ Run this exactly ONCE per environment. Running again overwrites the
 *   ciphertexts and abandons the old addresses (deposits to those addresses
 *   become permanently inaccessible). The script bails if seed files already
 *   exist — delete them by hand if you really mean to regenerate.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { newMnemonic, xpubFromMnemonic } from "../src/hd.js";
import { encryptSeed, saveCiphertext, type SeedFile } from "../src/kms.js";

type Plan = { file: SeedFile; chain: "eth" | "btc" | "tron"; xpubVar: string };

const PLAN: Plan[] = [
  { file: "evm",  chain: "eth",  xpubVar: "EVM_MASTER_XPUB" }, // ETH + BSC
  { file: "btc",  chain: "btc",  xpubVar: "BTC_MASTER_XPUB" },
  { file: "tron", chain: "tron", xpubVar: "TRON_MASTER_XPUB" }
];

// Refuse to clobber existing ciphertexts.
for (const p of PLAN) {
  const path = resolve(`./data/seeds/${p.file}.bin`);
  if (existsSync(path)) {
    console.error(
      `[init-seeds] Refusing to overwrite ${path}\n` +
      `  Existing seeds were already generated. Delete the file BY HAND if\n` +
      `  you genuinely intend to start over (deposits to old addresses will\n` +
      `  become inaccessible).`
    );
    process.exit(1);
  }
}

if (!process.env.KMS_KEY_ID || !process.env.AWS_REGION) {
  console.error("[init-seeds] AWS_REGION and KMS_KEY_ID must be set in .env");
  process.exit(1);
}

console.log("Generating seeds…\n");

const xpubs: Record<string, string> = {};

for (const p of PLAN) {
  const mnemonic = newMnemonic();
  const xpub = xpubFromMnemonic(mnemonic, p.chain);
  const ciphertext = await encryptSeed(Buffer.from(mnemonic, "utf8"));
  await saveCiphertext(p.file, ciphertext);
  xpubs[p.xpubVar] = xpub;
  console.log(`  ✓ ${p.file.padEnd(5)} seed encrypted → data/seeds/${p.file}.bin`);
}

console.log("\nPaste these lines into services/wallet/.env:\n");
for (const [k, v] of Object.entries(xpubs)) {
  console.log(`${k}=${v}`);
}

console.log("\nNext: npm run check-rpcs --workspace @googolplex/wallet");
console.log("Then: npm run derive --workspace @googolplex/wallet 0    # user #0");
