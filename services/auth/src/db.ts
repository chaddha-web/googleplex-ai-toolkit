import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * SQLite-backed storage for the auth service. The schema is auto-migrated
 * on boot via a single CREATE TABLE IF NOT EXISTS pass — fine for the
 * current shape. When we outgrow it we move to Drizzle + Postgres without
 * touching the route layer.
 */

const DB_PATH = resolve(process.env.AUTH_DB_PATH ?? "./data/auth.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                           TEXT PRIMARY KEY,
    email                        TEXT NOT NULL UNIQUE,
    code11                       TEXT NOT NULL UNIQUE,
    first_name                   TEXT NOT NULL,
    last_name                    TEXT NOT NULL,
    role                         TEXT NOT NULL DEFAULT 'user',
    age                          INTEGER,
    country                      TEXT,
    gender                       TEXT,
    consented_terms_at           INTEGER,
    consented_privacy_at         INTEGER,
    notifications_opt_in         INTEGER NOT NULL DEFAULT 0,
    notifications_opt_in_at      INTEGER,
    profile_completed_at         INTEGER,
    wallet_password_hash         TEXT,
    wallet_password_set_at       INTEGER,
    wallet_status                TEXT NOT NULL DEFAULT 'pending_password',
    wallet_status_changed_at     INTEGER,
    initial_deposit_credited_usd REAL NOT NULL DEFAULT 0,
    initial_deposit_completed_at INTEGER,
    tokens_minted                INTEGER NOT NULL DEFAULT 0,
    tokens_minted_at             INTEGER,
    created_at                   INTEGER NOT NULL,
    updated_at                   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otp_sessions (
    id              TEXT PRIMARY KEY,
    email           TEXT NOT NULL,
    code_hash       TEXT NOT NULL,
    mode            TEXT NOT NULL CHECK (mode IN ('signup','login')),
    first_name      TEXT,
    last_name       TEXT,
    expires_at      INTEGER NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_otp_email          ON otp_sessions (email);
  CREATE INDEX IF NOT EXISTS idx_otp_idempotency    ON otp_sessions (idempotency_key);
  CREATE INDEX IF NOT EXISTS idx_otp_expires        ON otp_sessions (expires_at);

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    token_hash      TEXT NOT NULL UNIQUE,
    family_id       TEXT NOT NULL,
    expires_at      INTEGER NOT NULL,
    revoked_at      INTEGER,
    replaced_by_id  TEXT,
    user_agent      TEXT,
    ip              TEXT,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_user   ON refresh_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens (family_id);
`);

// ────────────────────────────────────────────────────────────────────────────
// Types — kept colocated so the rest of the service only depends on this file.

export type UserRole = "user" | "admin";

export type UserRow = {
  id: string;
  email: string;
  code11: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  age: number | null;
  country: string | null;
  gender: string | null;
  consented_terms_at: number | null;
  consented_privacy_at: number | null;
  notifications_opt_in: number;
  notifications_opt_in_at: number | null;
  profile_completed_at: number | null;
  wallet_password_hash: string | null;
  wallet_password_set_at: number | null;
  wallet_status: "pending_password" | "pending_initial_deposit" | "active" | "locked";
  wallet_status_changed_at: number | null;
  initial_deposit_credited_usd: number;
  initial_deposit_completed_at: number | null;
  tokens_minted: number;
  tokens_minted_at: number | null;
  created_at: number;
  updated_at: number;
};

// Backfill migration for existing rows from before the role column existed.
try {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
} catch {
  /* column already exists — fine */
}
try { db.exec(`ALTER TABLE users ADD COLUMN wallet_password_hash TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN wallet_password_set_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN wallet_status TEXT NOT NULL DEFAULT 'pending_password'`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN wallet_status_changed_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN initial_deposit_credited_usd REAL NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN initial_deposit_completed_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN age INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN country TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN gender TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN consented_terms_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN consented_privacy_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN notifications_opt_in INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN notifications_opt_in_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN profile_completed_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN tokens_minted INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN tokens_minted_at INTEGER`); } catch {}

export type OtpRow = {
  id: string;
  email: string;
  code_hash: string;
  mode: "signup" | "login";
  first_name: string | null;
  last_name: string | null;
  expires_at: number;
  attempts: number;
  idempotency_key: string | null;
  created_at: number;
};

export type RefreshRow = {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: number;
  revoked_at: number | null;
  replaced_by_id: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Prepared statements

export const stmts = {
  user: {
    byEmail: db.prepare<[string], UserRow>(`SELECT * FROM users WHERE email = ?`),
    byId:    db.prepare<[string], UserRow>(`SELECT * FROM users WHERE id = ?`),
    byCode:  db.prepare<[string], UserRow>(`SELECT * FROM users WHERE code11 = ?`),
    listAll: db.prepare<[], UserRow>(`SELECT * FROM users ORDER BY created_at DESC`),
    insert:  db.prepare(`
      INSERT INTO users (id, email, code11, first_name, last_name, role, wallet_status, wallet_status_changed_at, initial_deposit_credited_usd, tokens_minted, tokens_minted_at, created_at, updated_at)
      VALUES (@id, @email, @code11, @first_name, @last_name, @role, @wallet_status, @wallet_status_changed_at, @initial_deposit_credited_usd, @tokens_minted, @tokens_minted_at, @created_at, @updated_at)
    `),
    updateWalletPassword: db.prepare(`
      UPDATE users SET 
        wallet_password_hash = @wallet_password_hash,
        wallet_password_set_at = @wallet_password_set_at,
        wallet_status = @wallet_status,
        wallet_status_changed_at = @wallet_status_changed_at,
        updated_at = @updated_at
      WHERE id = @id
    `),
    updateWalletStatus: db.prepare(`
      UPDATE users SET
        wallet_status = @wallet_status,
        wallet_status_changed_at = @wallet_status_changed_at,
        initial_deposit_credited_usd = @initial_deposit_credited_usd,
        initial_deposit_completed_at = @initial_deposit_completed_at,
        updated_at = @updated_at
      WHERE id = @id
    `),
    updateProfile: db.prepare(`
      UPDATE users SET
        age = @age,
        country = @country,
        gender = @gender,
        consented_terms_at = @consented_terms_at,
        consented_privacy_at = @consented_privacy_at,
        notifications_opt_in = @notifications_opt_in,
        notifications_opt_in_at = @notifications_opt_in_at,
        profile_completed_at = @profile_completed_at,
        updated_at = @updated_at
      WHERE id = @id
    `)
  },
  otp: {
    insert: db.prepare(`
      INSERT INTO otp_sessions
        (id, email, code_hash, mode, first_name, last_name, expires_at, attempts, idempotency_key, created_at)
      VALUES
        (@id, @email, @code_hash, @mode, @first_name, @last_name, @expires_at, @attempts, @idempotency_key, @created_at)
    `),
    byIdempotency: db.prepare<[string, number], OtpRow>(`
      SELECT * FROM otp_sessions
      WHERE idempotency_key = ? AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `),
    activeForEmail: db.prepare<[string, number], OtpRow>(`
      SELECT * FROM otp_sessions
      WHERE email = ? AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `),
    bumpAttempts: db.prepare(`UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = ?`),
    delete: db.prepare(`DELETE FROM otp_sessions WHERE id = ?`),
    deleteExpired: db.prepare(`DELETE FROM otp_sessions WHERE expires_at < ?`)
  },
  refresh: {
    insert: db.prepare(`
      INSERT INTO refresh_tokens
        (id, user_id, token_hash, family_id, expires_at, revoked_at, replaced_by_id, user_agent, ip, created_at)
      VALUES
        (@id, @user_id, @token_hash, @family_id, @expires_at, NULL, NULL, @user_agent, @ip, @created_at)
    `),
    byHash:  db.prepare<[string], RefreshRow>(`SELECT * FROM refresh_tokens WHERE token_hash = ?`),
    revoke:  db.prepare(`UPDATE refresh_tokens SET revoked_at = ?, replaced_by_id = ? WHERE id = ?`),
    revokeFamily: db.prepare(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ?`)
  }
};

// Best-effort housekeeping every 5 min.
setInterval(() => {
  try {
    stmts.otp.deleteExpired.run(Date.now());
  } catch {
    /* ignore */
  }
}, 5 * 60 * 1000).unref();
