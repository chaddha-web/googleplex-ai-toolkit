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
    polygon    TEXT NOT NULL DEFAULT '',
    tron       TEXT NOT NULL,
    btc        TEXT NOT NULL,
    created_at INTEGER
  );

  -- Monotonic counters (e.g. next HD derivation index). A persisted
  -- high-water-mark so deleting a user NEVER lets a new user reuse a
  -- derivation index — reuse would collide onto a live deposit address
  -- and credit one member's on-chain funds to another.
  CREATE TABLE IF NOT EXISTS wallet_meta (
    key   TEXT PRIMARY KEY,
    value INTEGER NOT NULL
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

  -- Ops-only audit of treasury sweeps ("flush to treasury"). Deliberately
  -- SEPARATE from the user ledger — a flush consolidates on-chain coins into
  -- the treasury and must NOT touch the member's balance or history.
  CREATE TABLE IF NOT EXISTS treasury_sweeps (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    chain        TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    amount_raw   TEXT NOT NULL,
    kind         TEXT NOT NULL,   -- gas_fund | token_sweep | native_sweep
    from_address TEXT,
    to_address   TEXT,
    tx_hash      TEXT,
    status       TEXT NOT NULL,   -- sent | confirmed | failed
    error        TEXT,
    admin_id     TEXT,
    created_at   INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_treasury_sweeps_user ON treasury_sweeps (user_id, created_at);

  -- Demo accounts. A listed user's withdrawals COMPLETE IN THE UI WITHOUT EVER
  -- BROADCASTING and without touching the treasury — for exercising the full
  -- member flow on a live box without spending real crypto.
  --
  -- Founder-only, opt-in per user id, and never applied to an account with
  -- real deposit history. Lives in the WALLET db so the no-broadcast decision
  -- is made by the service that moves money. Demo withdrawals are flagged
  -- (withdrawals.is_demo) and excluded from platform accounting, so the real
  -- books stay honest. See src/demo.ts for the full threat model.
  CREATE TABLE IF NOT EXISTS demo_accounts (
    user_id    TEXT PRIMARY KEY,
    note       TEXT,
    created_by TEXT,
    created_at INTEGER
  );

  -- Fabricated credit handed to a demo account, per (chain, symbol).
  --
  -- This is what makes demo mode reversible. Without it, crediting fake
  -- balance and then turning demo mode OFF would leave real, withdrawable
  -- money against the treasury — the one way this feature could actually lose
  -- funds. Disabling demo mode reverses whatever is still here first.
  CREATE TABLE IF NOT EXISTS demo_credits (
    user_id    TEXT NOT NULL,
    chain      TEXT NOT NULL,
    symbol     TEXT NOT NULL,
    raw        TEXT NOT NULL DEFAULT '0',
    usd        REAL NOT NULL DEFAULT 0,
    created_at INTEGER,
    PRIMARY KEY (user_id, chain, symbol)
  );

  -- Revenue. One row per completed purchase, written in the same transaction
  -- as the ledger debit. NOT the same thing as a deposit (a member funding
  -- their own custodial balance earns us nothing).
  CREATE TABLE IF NOT EXISTS sales (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    item            TEXT NOT NULL,   -- 'studio_unlock' | future store slug
    item_name       TEXT,
    chain           TEXT,
    symbol          TEXT NOT NULL,
    amount_raw      TEXT NOT NULL,
    usd             REAL NOT NULL,   -- captured at sale time, never recomputed
    ledger_entry_id TEXT,
    created_at      INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_sales_created ON sales (created_at);
  CREATE INDEX IF NOT EXISTS idx_sales_item    ON sales (item, created_at);
  CREATE INDEX IF NOT EXISTS idx_sales_user    ON sales (user_id, created_at);

  -- Per-user withdrawal-limit overrides. Any NULL field falls back to the
  -- global (admin-settings) limit.
  CREATE TABLE IF NOT EXISTS user_withdraw_limits (
    user_id              TEXT PRIMARY KEY,
    max_per_tx_usd       REAL,
    daily_usd            REAL,
    review_threshold_usd REAL,
    updated_at           INTEGER
  );

  -- 4-eyes: distinct admin approvals for a held withdrawal. Broadcast only fires
  -- once COUNT(DISTINCT admin_id) reaches WITHDRAWAL_APPROVALS_REQUIRED (default 1).
  CREATE TABLE IF NOT EXISTS withdrawal_approvals (
    withdrawal_id TEXT NOT NULL,
    admin_id      TEXT NOT NULL,
    admin_email   TEXT,
    created_at    INTEGER NOT NULL,
    PRIMARY KEY (withdrawal_id, admin_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ledger_entries_user ON ledger_entries (user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_withdrawals_user    ON withdrawals (user_id, requested_at);
  CREATE INDEX IF NOT EXISTS idx_deposits_user       ON deposits (user_id, confirmed_at);
`);

// Backfill migration: on-chain sender, added when deposits are indexed from
// transfer events (older rows from the balance-diff path don't have it).
try {
  sqlite.exec(`ALTER TABLE deposits ADD COLUMN from_address TEXT`);
} catch {
  /* column already exists */
}

// Backfill migration: Polygon deposit address. Polygon shares the EVM
// derivation path, so every existing user's Polygon address IS their ETH
// address — no re-derivation, no new seed, and existing deposit addresses are
// untouched.
try {
  sqlite.exec(`ALTER TABLE user_wallet_addresses ADD COLUMN polygon TEXT NOT NULL DEFAULT ''`);
} catch {
  /* column already exists */
}
sqlite.exec(`UPDATE user_wallet_addresses SET polygon = eth WHERE polygon IS NULL OR polygon = ''`);

// Demo withdrawals are marked so they can be told apart from real ones and
// excluded from accounting. See `demo.ts`.
try {
  sqlite.exec(`ALTER TABLE withdrawals ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0`);
} catch {
  /* column already exists */
}
