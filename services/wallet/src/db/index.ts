import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema.js";

const DB_PATH = resolve(process.env.WALLET_DB_PATH ?? "./data/wallet.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const rawDb = sqlite;
export const db = drizzle(sqlite, { schema });

// Schema bootstrap — single CREATE TABLE IF NOT EXISTS pass on boot.
// Production should move to drizzle-kit migrations, but for v1 dev/SQLite
// this keeps the service self-contained.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user_wallet_addresses (
    user_id    TEXT PRIMARY KEY,
    user_index INTEGER NOT NULL,
    eth        TEXT NOT NULL,
    bsc        TEXT NOT NULL,
    tron       TEXT NOT NULL,
    btc        TEXT NOT NULL,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS ledger_balances (
    user_id    TEXT NOT NULL,
    chain      TEXT NOT NULL,
    symbol     TEXT NOT NULL,
    raw        TEXT NOT NULL DEFAULT '0',
    decimals   INTEGER NOT NULL,
    updated_at INTEGER,
    PRIMARY KEY (user_id, chain, symbol)
  );

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    chain       TEXT,
    symbol      TEXT NOT NULL,
    delta_raw   TEXT NOT NULL,
    kind        TEXT NOT NULL,
    ref_tx_hash TEXT,
    ref_id      TEXT,
    created_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    chain         TEXT NOT NULL,
    symbol        TEXT NOT NULL,
    amount_raw    TEXT NOT NULL,
    tx_hash       TEXT NOT NULL UNIQUE,
    block_number  INTEGER,
    confirmed_at  INTEGER,
    credited_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    chain           TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    amount_raw      TEXT NOT NULL,
    dest_address    TEXT NOT NULL,
    status          TEXT NOT NULL,
    otp_session_id  TEXT,
    tx_hash         TEXT,
    fee_raw         TEXT,
    requested_at    INTEGER,
    signed_at       INTEGER,
    broadcast_at    INTEGER,
    confirmed_at    INTEGER,
    failure_reason  TEXT
  );

  CREATE TABLE IF NOT EXISTS swaps (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    from_symbol  TEXT NOT NULL,
    from_chain   TEXT NOT NULL,
    from_raw     TEXT NOT NULL,
    to_symbol    TEXT NOT NULL,
    to_chain     TEXT NOT NULL,
    to_raw       TEXT NOT NULL,
    rate_usd     TEXT NOT NULL,
    created_at   INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_ledger_entries_user ON ledger_entries (user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_withdrawals_user    ON withdrawals (user_id, requested_at);
  CREATE INDEX IF NOT EXISTS idx_deposits_user       ON deposits (user_id, confirmed_at);
`);
