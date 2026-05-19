import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

/**
 * SQLite schema for the wallet service.
 *
 * Type notes (vs the previous Postgres schema):
 * - `uuid` → `text` (SQLite has no native UUID; we generate them in app code)
 * - `numeric(38,0)` → `text` (SQLite has no fixed-precision decimal; we store
 *   the raw integer as a base-10 string so we keep precision through ETH-scale
 *   amounts. Routes BigInt() it when arithmetic is needed.)
 * - `timestamp(withTimezone)` → `integer` (ms epoch). Cheaper than ISO strings
 *   and easier to compare. Defaults via app code, not SQL.
 * - `bigint(mode:'number')` → `integer` (SQLite's INTEGER is variable-width
 *   and handles up to ~2^63).
 */

export const userWalletAddresses = sqliteTable("user_wallet_addresses", {
  user_id: text("user_id").primaryKey(),
  user_index: integer("user_index").notNull(),
  eth: text("eth").notNull(),
  bsc: text("bsc").notNull(),
  tron: text("tron").notNull(),
  btc: text("btc").notNull(),
  created_at: integer("created_at")
});

export const ledgerBalances = sqliteTable(
  "ledger_balances",
  {
    user_id: text("user_id").notNull(),
    chain: text("chain").notNull(),
    symbol: text("symbol").notNull(),
    raw: text("raw").notNull().default("0"),
    decimals: integer("decimals").notNull(),
    updated_at: integer("updated_at")
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.chain, t.symbol] })
  })
);

export const ledgerEntries = sqliteTable("ledger_entries", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  chain: text("chain"),
  symbol: text("symbol").notNull(),
  delta_raw: text("delta_raw").notNull(),
  kind: text("kind").notNull(), // 'deposit'|'withdrawal'|'swap_in'|'swap_out'|'sweep'|'fee'|'admin_adjust'
  ref_tx_hash: text("ref_tx_hash"),
  ref_id: text("ref_id"),
  created_at: integer("created_at")
});

export const deposits = sqliteTable("deposits", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  chain: text("chain").notNull(),
  symbol: text("symbol").notNull(),
  amount_raw: text("amount_raw").notNull(),
  tx_hash: text("tx_hash").notNull().unique(),
  block_number: integer("block_number"),
  confirmed_at: integer("confirmed_at"),
  credited_at: integer("credited_at")
});

export const withdrawals = sqliteTable("withdrawals", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  chain: text("chain").notNull(),
  symbol: text("symbol").notNull(),
  amount_raw: text("amount_raw").notNull(),
  dest_address: text("dest_address").notNull(),
  status: text("status").notNull(), // 'pending_otp'|'signing'|'broadcasting'|'pending'|'confirmed'|'failed'|'rejected'
  otp_session_id: text("otp_session_id"),
  tx_hash: text("tx_hash"),
  fee_raw: text("fee_raw"),
  requested_at: integer("requested_at"),
  signed_at: integer("signed_at"),
  broadcast_at: integer("broadcast_at"),
  confirmed_at: integer("confirmed_at"),
  failure_reason: text("failure_reason")
});

export const swaps = sqliteTable("swaps", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  from_symbol: text("from_symbol").notNull(),
  from_chain: text("from_chain").notNull(),
  from_raw: text("from_raw").notNull(),
  to_symbol: text("to_symbol").notNull(),
  to_chain: text("to_chain").notNull(),
  to_raw: text("to_raw").notNull(),
  rate_usd: text("rate_usd").notNull(),
  created_at: integer("created_at")
});
