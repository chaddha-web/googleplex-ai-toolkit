# GoogolPlex

An all-in-one **Web3 + Social + AI** platform: a passwordless multi-chain wallet, dual-layer DAO governance, AI-generated brand kits with zero-click hosting, and smart-contract-linked project tracking — served from a single npm-workspaces monorepo.

> **Status:** active development. Production runs at `ggakingclub.com` (marketing), `app.ggakingclub.com` (member app), and `auth.ggakingclub.com` (auth service).

Full product spec, system design and roadmap:
[docs/PRD.md](docs/PRD.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Architecture at a glance

```
                         Traefik (TLS, blue/green routing)
                                      │
        ┌──────────────┬──────────────┼──────────────┬──────────────┐
        │              │              │              │              │
   apps/landing    apps/web      apps/admin    services/auth   services/wallet
   (marketing +   (member       (operator     (email-OTP,     (multi-chain
    /app area)     dashboard)     console)      passkey, JWT)   balances/txns)
        │              │              │              │              │
        └──────────────┴──────────────┴──────┬───────┴──────────────┘
                                             │
                    packages/*  (shared: ui, db, wallet, identity, ai, contracts …)
                                             │
                        SQLite (better-sqlite3) · chain RPCs · Resend/SES · LLM APIs
```

### Applications — `apps/`

| App | Package | Dev port | Role |
|-----|---------|:--------:|------|
| `web` | `@googolplex/web` | 3000 | Member dashboard (wallet, Circle, Studio, settings). Next.js App Router, dark "cosmic" theme. |
| `landing` | `@googolplex/landing` | 3010 | Marketing site + `/app` member area + `/app/admin`. Auth flows call `services/auth`. |
| `admin` | `@googolplex/admin` | 3001 | Operator console (treasury, takedowns, Sybil, parameters). Hard-gated, audit-logged. |

### Services — `services/` (Fastify, port via `.env`)

| Service | Package | Prod port | Role |
|---------|---------|:---------:|------|
| `auth` | `@googolplex/auth` | 4200 | Passwordless email-OTP + WebAuthn passkey + Turnstile. Issues JWTs, presence/geo, login-alert + account-suspend. |
| `wallet` | `@googolplex/wallet-service` | 4201 | Multi-chain balances, history, deposits/withdrawals, Seva-credit minting. |
| `governance` | `@googolplex/governance-service` | — | On-chain + social-consensus voting. |
| `handlers` | `@googolplex/handlers` | — | Background workers: treasury, gas, AI, hosting, CID registry, identity. |

### Shared packages — `packages/`

`ui` (React + Tailwind + shadcn primitives) · `db` (Drizzle schema, SQLite dev / Postgres-ready) · `wallet` (MPC wallet client) · `identity` (pluggable Sybil-resistance `IdentityProvider`) · `ai` (brand-kit & site generation) · `contracts` (Hardhat — Escrow, Governor, CIDRegistry) · `dao-actions` · `governance-shared` · `email` · `analytics` · `config` (shared tsconfig/eslint).

---

## Tech stack

- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS, shadcn/ui, framer-motion, react-globe.gl.
- **Backend:** Node ≥20, Fastify services (TypeScript, `tsx`).
- **Auth:** passwordless — email-OTP (Resend/SES) + WebAuthn passkeys + Cloudflare Turnstile; JWT HS256 (`jose`) with rotating refresh-token families.
- **Data:** SQLite via `better-sqlite3`; schema in Drizzle ORM (Postgres-compatible migrations).
- **Chain / Web3:** ethers, multi-chain RPC; Solidity contracts via Hardhat; 2-of-2 threshold-MPC wallet.
- **Infra:** Docker Compose + Traefik on a single VPS; blue/green deploys; Sentry; PostHog.

---

## Getting started

**Prerequisites:** Node ≥20, npm.

```bash
# 1. install all workspaces
npm install

# 2. configure secrets (each service reads its own .env)
#    services/auth/.env, services/wallet/.env, etc.
#    see docs/DEPLOYMENT.md for the full variable list

# 3a. run a single surface
npm run dev:web        # member app on :3000
npm run dev:landing    # marketing + /app on :3010
npm run dev:auth       # auth service

# 3b. or run the whole stack at once (web, admin, landing, auth, governance, handlers)
npm run dev
```

Other useful scripts (root `package.json`):

```bash
npm run build:web            # production build of apps/web
npm run build:landing        # production build of apps/landing
npm run compile:contracts    # Hardhat compile
npm run test:contracts       # Hardhat tests
```

---

## Deployment

Production is a Docker Compose stack behind Traefik on a single VPS. A systemd timer polls `origin/main` and redeploys automatically (blue/green, ~80s). Full runbook — env vars, migrations, TLS, rollback — in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Security notes

- **Passwordless by design** — no passwords, no SMS. Email-OTP + passkey + Turnstile (ADR-009).
- **Wallet keys** — 2-of-2 threshold MPC (user shard + server shard); no external wallet connect (ADR-001). Seed material lives in KMS-backed volumes and is never committed.
- **Never commit secrets.** Each service reads a local `.env`; production secrets live on the VPS only.
- **Presence / geo** stores country/region/rounded coordinates only — never raw IPs.

---

## Documentation index

| Doc | What's in it |
|-----|--------------|
| [docs/PRD.md](docs/PRD.md) | Product requirements (features, KPIs, personas). |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design + ADR decision log. |
| [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) | Milestone roadmap. |
| [docs/WORKSTREAMS.md](docs/WORKSTREAMS.md) | Per-sprint ownership. |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploy + ops runbook. |
| [docs/COMMS.md](docs/COMMS.md) | Cross-agent coordination log. |

---

## License

Proprietary — see [LICENSE](LICENSE). All rights reserved.
