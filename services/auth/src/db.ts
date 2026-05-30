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
    studio_unlocked_at           INTEGER,
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

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    is_secret  INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS community_proposals (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS community_votes (
    proposal_id TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    direction   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS community_reactions (
    proposal_id TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    kind        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS community_comments (
    id          TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    author      TEXT,
    body        TEXT NOT NULL,
    parent_id   TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ccomments_prop ON community_comments (proposal_id);

  CREATE TABLE IF NOT EXISTS community_comment_likes (
    comment_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (comment_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_cvotes_prop ON community_votes (proposal_id);
  CREATE INDEX IF NOT EXISTS idx_creactions_prop ON community_reactions (proposal_id);

  -- ── Email marketing (admin campaigns) ─────────────────────────────────
  -- A campaign is the editable draft + the eventual send record. We keep
  -- the markdown source as the source of truth and re-render HTML at send
  -- time so we can always tweak the template without rewriting old drafts.
  CREATE TABLE IF NOT EXISTS email_campaigns (
    id              TEXT PRIMARY KEY,
    subject         TEXT NOT NULL,
    body_md         TEXT NOT NULL,
    audience_json   TEXT NOT NULL,        -- {tiers, requireOptIn, from, to, countries}
    status          TEXT NOT NULL,        -- draft|sending|sent|failed
    created_by      TEXT NOT NULL,        -- admin user id
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    sent_at         INTEGER,
    recipient_count INTEGER,
    sent_count      INTEGER NOT NULL DEFAULT 0,
    fail_count      INTEGER NOT NULL DEFAULT 0,
    error           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_email_campaigns_created ON email_campaigns (created_at);

  -- One row per recipient per campaign — full audit trail for who got
  -- what, and a hook to gate re-tries if a send fails partway through.
  CREATE TABLE IF NOT EXISTS email_sends (
    id          TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    email       TEXT NOT NULL,
    status      TEXT NOT NULL,            -- queued|sent|failed|skipped_unsubscribed
    resend_id   TEXT,                     -- id Resend returned
    error       TEXT,
    sent_at     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends (campaign_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_email_sends_camp_user ON email_sends (campaign_id, user_id);

  -- Persistent unsubscribe list. Survives user deletion and is consulted
  -- before every send so we never re-email an unsubscriber.
  CREATE TABLE IF NOT EXISTS email_unsubscribes (
    email           TEXT PRIMARY KEY,
    unsubscribed_at INTEGER NOT NULL,
    reason          TEXT
  );

  -- Inbound emails routed through Resend → our webhook.
  CREATE TABLE IF NOT EXISTS email_inbound (
    id           TEXT PRIMARY KEY,
    from_email   TEXT NOT NULL,
    from_name    TEXT,
    to_email     TEXT NOT NULL,
    subject      TEXT,
    body_text    TEXT,
    body_html    TEXT,
    resend_id    TEXT,
    received_at  INTEGER NOT NULL,
    read_at      INTEGER,
    archived_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_email_inbound_received ON email_inbound (received_at);
`);

// Seed a few starter proposals once.
try {
  const n = (db.prepare(`SELECT COUNT(*) c FROM community_proposals`).get() as { c: number }).c;
  if (n === 0) {
    const seed = db.prepare(
      `INSERT INTO community_proposals (id, title, description, status, created_at) VALUES (@id,@title,@description,@status,@created_at)`
    );
    const now = Date.now();
    const rows = [
      { id: "p-treasury-usdc", title: "Treasury: diversify 50k USDT → USDC", description: "Reduce single-issuer risk by splitting stablecoin reserves.", status: "open", created_at: now },
      { id: "p-hosting-cap", title: "Cap Q3 hosting subsidy at $12k/mo", description: "Keep platform infrastructure costs predictable for the quarter.", status: "open", created_at: now - 1 },
      { id: "p-grants", title: "Open a community builder grants round", description: "Fund 5 member-led projects from the community pool.", status: "open", created_at: now - 2 }
    ];
    for (const r of rows) seed.run(r);
  }
} catch {
  /* ignore seed errors */
}

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
  studio_unlocked_at: number | null;
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
try { db.exec(`ALTER TABLE users ADD COLUMN studio_unlocked_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE community_comments ADD COLUMN parent_id TEXT`); } catch {}

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
    mintTokens: db.prepare(`
      UPDATE users SET tokens_minted = @tokens_minted, tokens_minted_at = @tokens_minted_at, updated_at = @updated_at WHERE id = @id
    `),
    promoteByCode: db.prepare(`
      UPDATE users SET role = 'admin', updated_at = @updated_at WHERE code11 = @code11
    `),
    unlockStudio: db.prepare(`
      UPDATE users SET
        studio_unlocked_at = @studio_unlocked_at,
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
  settings: {
    get: db.prepare<[string], { key: string; value: string | null; is_secret: number }>(
      `SELECT key, value, is_secret FROM settings WHERE key = ?`
    ),
    all: db.prepare<[], { key: string; value: string | null; is_secret: number }>(
      `SELECT key, value, is_secret FROM settings`
    ),
    upsert: db.prepare(`
      INSERT INTO settings (key, value, is_secret, updated_at)
      VALUES (@key, @value, @is_secret, @updated_at)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        is_secret = excluded.is_secret,
        updated_at = excluded.updated_at
    `),
    delete: db.prepare(`DELETE FROM settings WHERE key = ?`)
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
  },
  email: {
    // Campaigns
    campaignList: db.prepare(`SELECT id, subject, status, created_at, sent_at, recipient_count, sent_count, fail_count FROM email_campaigns ORDER BY created_at DESC LIMIT 200`),
    campaignById: db.prepare(`SELECT * FROM email_campaigns WHERE id = ?`),
    campaignInsert: db.prepare(`
      INSERT INTO email_campaigns
        (id, subject, body_md, audience_json, status, created_by, created_at, updated_at)
      VALUES
        (@id, @subject, @body_md, @audience_json, 'draft', @created_by, @created_at, @updated_at)
    `),
    campaignUpdate: db.prepare(`
      UPDATE email_campaigns
         SET subject = @subject, body_md = @body_md, audience_json = @audience_json, updated_at = @updated_at
       WHERE id = @id
    `),
    campaignStatus: db.prepare(`
      UPDATE email_campaigns
         SET status = @status, recipient_count = @recipient_count, sent_count = @sent_count, fail_count = @fail_count,
             sent_at = @sent_at, error = @error, updated_at = @updated_at
       WHERE id = @id
    `),
    campaignDelete: db.prepare(`DELETE FROM email_campaigns WHERE id = ?`),
    // Per-recipient sends
    sendInsert: db.prepare(`
      INSERT OR IGNORE INTO email_sends (id, campaign_id, user_id, email, status) VALUES (@id, @campaign_id, @user_id, @email, 'queued')
    `),
    sendMark: db.prepare(`
      UPDATE email_sends SET status = @status, resend_id = @resend_id, error = @error, sent_at = @sent_at WHERE id = @id
    `),
    sendsForCampaign: db.prepare(`SELECT id, user_id, email, status, resend_id, error, sent_at FROM email_sends WHERE campaign_id = ? ORDER BY sent_at DESC LIMIT 500`),
    // Unsubscribes
    unsubGet: db.prepare(`SELECT email FROM email_unsubscribes WHERE email = ?`),
    unsubAdd: db.prepare(`INSERT OR IGNORE INTO email_unsubscribes (email, unsubscribed_at, reason) VALUES (?, ?, ?)`),
    // Inbox
    inboxInsert: db.prepare(`
      INSERT INTO email_inbound (id, from_email, from_name, to_email, subject, body_text, body_html, resend_id, received_at)
      VALUES (@id, @from_email, @from_name, @to_email, @subject, @body_text, @body_html, @resend_id, @received_at)
    `),
    inboxList: db.prepare(`SELECT id, from_email, from_name, to_email, subject, received_at, read_at, archived_at FROM email_inbound WHERE archived_at IS NULL ORDER BY received_at DESC LIMIT 200`),
    inboxById: db.prepare(`SELECT * FROM email_inbound WHERE id = ?`),
    inboxMarkRead: db.prepare(`UPDATE email_inbound SET read_at = ? WHERE id = ? AND read_at IS NULL`),
    inboxArchive: db.prepare(`UPDATE email_inbound SET archived_at = ? WHERE id = ?`)
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
