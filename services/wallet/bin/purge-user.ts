/**
 * Demo teardown — delete an account and ALL its data, everywhere.
 *
 * Removes every wallet row for the account (balances, ledger entries, deposits,
 * withdrawals, swaps, addresses) and then calls the auth service to delete the
 * user + auth-side data (sessions, community, token reclaims, email sends).
 * Use after recording a demo so nothing is left behind.
 *
 * Usage (inside the wallet container on the box):
 *   docker exec -it gplex-wallet \
 *     npx tsx --env-file=.env bin/purge-user.ts --email someone@example.com
 *
 * Add --yes to skip the confirmation prompt (non-interactive / docker exec).
 */
import { db } from "../src/db/index.js";
import {
  ledgerBalances,
  ledgerEntries,
  deposits,
  withdrawals,
  swaps,
  userWalletAddresses
} from "../src/db/schema.js";
import { eq } from "drizzle-orm";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://localhost:4200").replace(/\/$/, "");
const INTERNAL = process.env.INTERNAL_SERVICE_TOKEN;

async function main() {
  const email = arg("email");
  if (!email) { console.error("Usage: --email <email> [--yes]"); process.exit(1); }
  if (!INTERNAL) { console.error("INTERNAL_SERVICE_TOKEN not set"); process.exit(1); }
  if (process.argv.indexOf("--yes") < 0) {
    console.error(`Refusing to purge without --yes. This DELETES ${email} and all its data.`);
    process.exit(1);
  }

  // Resolve account.
  const look = await fetch(`${AUTH_BASE}/internal/users/lookup?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: "Bearer " + INTERNAL }
  });
  if (!look.ok) { console.error(`lookup failed (${look.status})`); process.exit(1); }
  const u = (await look.json()) as any;
  const userId = u.id as string;

  // 1) Wallet-side: delete everything for this user.
  db.transaction((tx) => {
    tx.delete(ledgerEntries).where(eq(ledgerEntries.user_id, userId)).run();
    tx.delete(ledgerBalances).where(eq(ledgerBalances.user_id, userId)).run();
    tx.delete(deposits).where(eq(deposits.user_id, userId)).run();
    tx.delete(withdrawals).where(eq(withdrawals.user_id, userId)).run();
    tx.delete(swaps).where(eq(swaps.user_id, userId)).run();
    tx.delete(userWalletAddresses).where(eq(userWalletAddresses.user_id, userId)).run();
  });
  console.log(`✅ wallet data deleted for ${email}`);

  // 2) Auth-side: delete the user + related rows.
  const purge = await fetch(`${AUTH_BASE}/internal/users/${userId}/purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + INTERNAL },
    body: "{}"
  });
  if (!purge.ok) { console.error(`auth purge failed (${purge.status})`); process.exit(1); }
  console.log(`✅ auth account deleted: ${email}`);
  console.log("Done — account fully removed. (Remember to revert STUDIO_DEMO_MODE / WALLET_NOBROADCAST_EMAILS.)");
  process.exit(0);
}
main().catch((e) => { console.error("purge failed:", e); process.exit(1); });
