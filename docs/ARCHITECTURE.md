# Architecture

> Status: **Draft V1.0** — Layer breakdown and preliminary data models based on PRD V1.0.

## High-level diagram
```
         [ Frontend (Next.js / React) ]
                   │
    ┌──────────────┼──────────────┐
    │              │              │
[ Web3 API ]  [ Backend API ] [ AI Services ]
    │              │              │
[ Blockchains ] [ Database ]  [ LLM / GenAI APIs ]
```

## Layers
- **Frontend** — Next.js (React) unified dashboard. Manages client-side state for the wallet, project boards, and DAO voting.
- **Backend / API** — Node.js / Express or NestJS. Handles off-chain logic, API rate limiting, AI orchestration, and project Kanban states.
- **Chain layer (Web3)** —
  - RPC providers for multi-chain interaction (Ethers.js / Web3.js / native BTC/TRX SDKs).
  - Solidity Smart Contracts (Escrow/Bounties, Token-weighted DAO governance).
- **Data Layer** — PostgreSQL for off-chain state (project boards, user profiles, social consensus votes). Redis for caching and rate-limiting.
- **AI services (coding features)** — Integrations with OpenAI/Anthropic for REQ-A1 (brand kits) and REQ-A2 (code generation).
- **Hosting layer** — Automated deployment pipeline to AWS S3/CloudFront or Vercel for zero-click web deployment (REQ-A2).

## Key Architectural Systems

### ADR-001 — MPC wallet key management (2026-05-18)
- **Context:** In-house multi-chain wallet is a major attack surface. External wallet connect (e.g. WalletConnect/MetaMask) introduces uncontrolled entropy and complicates UX/security consistency.
- **Decision:** Use platform-issued, 2-of-2 threshold-MPC wallet (user shard + server shard). User shard is PRF-encrypted using output from the device's WebAuthn passkey. Never connect external wallets.
- **Consequences:** Removes seed-phrase UX friction and single-point-of-failure. Ensures all users adhere to the platform's security policy. Supports 3-of-5 social recovery + 7-day OTP-email fallback. Requires audited MPC library (e.g. `silent-shard-sdk` scheduled for Sprint 7 swap-in).


### 2. Dual-Layer Governance Data Model
- **On-chain (Token Voting - REQ-G1):** Standard OpenZeppelin Governor contracts linked to the native ERC-20 token. Hard execution guarantees.
- **Off-chain (Social Consensus - REQ-G2):** Stored in PostgreSQL. High write-volume for upvotes/downvotes. Requires a lightweight Sybil resistance module (e.g., verified email + CAPTCHA, or Worldcoin integration) to compute the "Sentiment Score" without incurring gas fees.

## Integration points
- Wallets / chain RPC — Infura, Alchemy, or native nodes.
- AI model providers — OpenAI, Anthropic, Midjourney/DALL-E.
- Social / identity — Email-based account with IdentityBadge derived from signal sources.

## Decisions log (ADR-style)

### ADR-001 — MPC wallet key management (2026-05-18)
- **Context:** In-house multi-chain wallet is a major attack surface.
- **Decision:** Use platform-issued, 2-of-2 threshold-MPC wallet (user shard + server shard). User shard is PRF-encrypted using output from the device's WebAuthn passkey. Never connect external wallets.
- **Consequences:** Removes seed-phrase UX friction and single-point-of-failure. Ensures all users adhere to the platform's security policy. Supports 3-of-5 social recovery + 7-day OTP-email fallback. Requires audited MPC library (e.g. `silent-shard-sdk` scheduled for Sprint 7 swap-in).

### ADR-002 — Hybrid hosting (centralized default + IPFS opt-in) (2026-05-18)
- **Context:** REQ-A2 (integrated hosting) slightly contradicts Web3 ethos if strictly centralized.
- **Decision:** Ship Vercel/CloudFront in M1, add IPFS mirror toggle (REQ-A3) in M2.
- **Consequences:** Preserves "<5 min deploy" KPI, costs extra pinning ops, requires CID-on-chain registry contract.

### ADR-003 — Pluggable IdentityProvider interface (2026-05-18)
- **Context:** REQ-G2 Sybil resistance must not lock us to one vendor.
- **Decision:** Define a single `IdentityProvider` interface (`verify(user) -> {tier, score}`) with adapters for Turnstile, Worldcoin, Gitcoin Passport. Note: `IdentityBadge` is a property of the email-based account and does not gate wallet access.
- **Consequences:** Uniform sentiment-score weighting, easier to add future identity systems, requires shared trust-tier taxonomy.

### ADR-004 — Tooling stack (2026-05-18)
- **Context:** Initial tooling choices lock in for the rest of the project and must support both web/frontend scale and smart contract development.
- **Decision:** Use npm workspaces, Hardhat for smart contracts, Next.js App Router for frontend, and Tailwind + shadcn/ui for styling.
- **Consequences:** Consolidates dependencies in a single repo, provides modern React features, standardizes UI development, and aligns with established Web3 tooling (Hardhat).


### ADR-009 — Passwordless authentication (2026-05-18)
- **Context:** Need zero-friction, max-security authentication.
- **Decision:** Email-OTP via SES + WebAuthn passkey + Turnstile. No passwords, no SMS, no SIWE.
- **Consequences:** New-device flow requires OTP; sensitive actions require passkey tap. Recovery via social guardians + delayed OTP.

### ADR-010 — Drizzle ORM + Postgres/SQLite dual-target (2026-05-18)
- **Context:** Need identical code path in dev (SQLite) and prod (Postgres).
- **Decision:** Use Drizzle ORM for schema definition in `packages/db/src/schema/`.
- **Consequences:** Type-safe migrations; forward-compatible schema changes required.

### ADR-011 — Blue/green zero-downtime deploys on Traefik (2026-05-18)
- **Context:** Maintain high availability during updates.
- **Decision:** Deploy to blue/green stacks behind Traefik.
- **Consequences:** Expand→migrate→contract migration pattern; 60s drain window for SSE/WS; leadership-elected advisory-locked crons.

### ADR-012 — Cloudflare CDN + edge runtime for read-heavy routes (2026-05-18)
- **Context:** LCP/INP performance budgets.
- **Decision:** Cloudflare origin shielding + `runtime = 'edge'` for new read routes. One Sentry project shared by web + admin + services, multi-app via `app` tag.
- **Consequences:** Reduced origin load, improved latency; cold-start sensitive code stays on Node.

### ADR-005 — `apps/admin` as a separate Next.js app (2026-05-18)
- **Context:** PRD §3.5 (REQ-AD1..AD4) introduces an operator-facing admin panel: treasury monitor, hosting takedown, Sybil console, parameter adjustment. Folding this into `apps/web` would couple end-user and operator code paths, blur auth boundaries (admin needs hard-gated access + audit logging), and increase the blast radius of any frontend bug.
- **Decision:** Ship the admin surface as its own Next.js App Router project at `apps/admin`, deployed to a separate subdomain (e.g. `admin.googolplex.app`). Shares `packages/*` (wallet, identity, ui) but no route or auth code with `apps/web`. Admin auth requires the `high-stakes` identity tier from ADR-003 (Worldcoin / Gitcoin Passport). All takedown / parameter-adjustment actions emit append-only audit events.
- **Consequences:** Two Next.js apps to build/deploy (acceptable cost — they share dependencies via workspaces). Clear blast-radius separation. Future on-chain audit log can reuse `CIDRegistry`-style append-only pattern. **Scope:** M3 — scaffold after M2 governance ships, since REQ-AD4 parameter adjustment depends on a working `GoogolplexGovernor`.
