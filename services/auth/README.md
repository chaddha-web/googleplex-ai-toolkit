# @googolplex/auth — central auth service

Fastify HTTP service that issues OTP sign-in codes, mints **short-lived JWT
access tokens** and **rotating refresh tokens**, and owns the canonical user
table. Designed to be called from the landing page, the client web app, and
the admin app.

## Stack

- **Fastify 4** (matches the rest of `services/*`)
- **better-sqlite3** for storage — single file at `./data/auth.db`. Easy to
  swap to Postgres later: the route layer only talks to `src/db.ts`.
- **jose** for JWT (HS256). Refresh tokens are opaque random bytes,
  sha256-hashed in the DB.
- **resend** for delivery of the 6-digit OTP email.

## Endpoints

All routes return JSON. CORS is open to the origins in `CORS_ORIGINS`.

| Method · Path | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ ok, name, ts }` |
| `POST /auth/otp/request` | `{ email, mode: 'signup'\|'login', firstName?, lastName? }` | `{ ok }` or `{ ok, replayed: true }` |
| `POST /auth/otp/verify` | `{ email, code }` | `{ ok, accessToken, accessTokenExpiresIn, refreshToken, refreshTokenExpiresAt, user }` |
| `POST /auth/refresh` | `{ refreshToken }` | `{ ok, accessToken, accessTokenExpiresIn, refreshToken, refreshTokenExpiresAt }` |
| `POST /auth/logout` | `{ refreshToken }` | `{ ok }` |
| `GET /auth/me` | `Authorization: Bearer <access>` | `{ ok, user }` |

### Headers

- `Idempotency-Key` (or `X-Idempotency-Key`) — on `POST /auth/otp/request`.
  Replays return `{ ok: true, replayed: true }` without sending a second
  email. Safe to send the same key across client retries.

## Tokens

- **Access token** — JWT (HS256), `iss=googolplex.auth`, `aud=googolplex.client`.
  Claims: `sub` (user id), `email`, `code11`, `type=access`. Default TTL **15 min**.
- **Refresh token** — opaque base64url-encoded 32-byte random string. Stored
  sha256-hashed in `refresh_tokens`. Default TTL **30 days**. Every
  `POST /auth/refresh` rotates: the presented token is marked revoked, a new
  pair is issued, and the chain is linked via `replaced_by_id` for audit.
  Reuse of a revoked token **burns the entire family** (`family_id`) — that's
  the theft-detection signal.

## Users

Every user gets:

- A v4 UUID (`id`) — internal, never exposed in URLs.
- An **11-character alphanumeric code** (`code11`) — generated at signup
  from a Crockford-style alphabet (A–Z + 0–9 minus I, L, O, U), uniqueness
  enforced via `UNIQUE` constraint + collision-retry in `src/code.ts`.
- `email` (unique), `first_name`, `last_name`, timestamps.

The `code11` is returned in every access token claim and the `/auth/me`
response so the rest of the platform can show it without a roundtrip.

## Running it

```bash
# from monorepo root
npm install
cp services/auth/.env.example services/auth/.env
# edit services/auth/.env — at minimum set JWT_SECRET
npm run dev:auth
# → http://localhost:4200
```

`openssl rand -hex 32` is the recommended way to generate `JWT_SECRET`.

Without `RESEND_API_KEY` the service logs OTPs to stdout instead of sending
email — great for local development.

The SQLite file is created on first boot at `services/auth/data/auth.db`.
It's gitignored — every developer gets their own.

## Wiring the clients

All three frontends should hit `${AUTH_BASE}/auth/*` where `AUTH_BASE` is an
env var (e.g. `http://localhost:4200` in dev, `https://auth.googolplex.io`
in prod). Keep tokens in:

- **Access token** — memory (a React context, Zustand store, etc.).
  Short-lived enough that an XSS attacker only gets a few minutes of access.
- **Refresh token** — `httpOnly` cookie set by your client app *after*
  receiving it from `/auth/otp/verify`. Or `localStorage` if you accept the
  XSS tradeoff. (`httpOnly` cookie requires same-site or a proxy.)

### Landing page (`apps/landing` / standalone repo)

Replace the local `/api/otp/*` routes with calls to the central service:

```ts
await fetch(`${process.env.NEXT_PUBLIC_AUTH_BASE}/auth/otp/request`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Idempotency-Key": key },
  body: JSON.stringify({ email, mode: "signup", firstName, lastName })
});
```

On successful verify, persist `refreshToken` (cookie/localStorage) and the
`user` object, then `router.push('/')`.

### Web client (`apps/web`)

- Wrap the app in an `<AuthProvider>` that:
  - On mount, reads the stored refresh token and calls `POST /auth/refresh`
    to obtain a fresh access token + new refresh.
  - Schedules a refresh ~60s before access expiry.
  - Exposes `accessToken`, `user`, `signOut()`.
- Add an `authFetch` helper that injects the `Authorization` header and,
  on 401, attempts a single refresh + retry before bouncing to `/login`.

### Admin (`apps/admin`)

Same `AuthProvider` pattern, plus a server-side guard for admin-only
endpoints — currently the auth service issues the same shape of token
regardless of role; add a `role` column to `users` and surface it in the
access claim when admin-only routes land.

## Roadmap

- [ ] **Postgres + Drizzle** — port `src/db.ts` to drizzle-orm using the
      same schema. The route layer doesn't change.
- [ ] **Role/permission column** on `users`, surfaced in the access claim.
- [ ] **Email templates** in `@googolplex/email` package (reuse across
      service-to-user mails: OTP, password resets if we ever add them,
      governance proposal notices).
- [ ] **Rate limiting** on `/auth/otp/request` per IP + per email — currently
      the only guard is the OTP active-row + idempotency dedupe.
- [ ] **WebAuthn / passkey** path — `@simplewebauthn/server` is already
      pinned at the monorepo root; add a `/auth/passkey/*` route group.
