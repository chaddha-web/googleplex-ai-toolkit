# Product Requirements Document (PRD)

| | |
|---|---|
| **Project** | Googolplex Ecosystem |
| **Status** | Draft / V1.0 |
| **Audience** | Web3 Founders, Creators, DAOs, Crypto Freelancers |
| **Date** | May 2026 |

---

## 1. Executive Summary

Googolplex is an all-in-one Web3 ecosystem designed to remove the friction of launching, managing, and funding decentralized projects. Currently, builders must piece together a fragmented stack: separate wallets, disconnected DAO tools, standalone project management software, and manual website deployment. Googolplex centralizes this workflow.

By combining a multi-chain wallet, a dual-layer governance system, an AI-powered asset generation suite, and smart-contract-linked project tracking, Googolplex acts as a complete **"decentralized operating system."** It empowers creators to move from idea to funded, launched, and community-governed protocol within a single platform.

## 2. Product Vision & Scope

**Vision Statement:** To become the universal launchpad and workspace for the decentralized web, where AI handles the heavy lifting of brand and development, and the community handles governance and funding.

The core scope of the V1 Googolplex platform includes five major pillars:

- **Universal Web3 Wallet** — a native, in-house built wallet architecture.
- **Dual-Layer DAO** — token-weighted voting paired with social consensus algorithms.
- **AI Toolkit & Hosting** — generative AI for brand kits and automated web deployment.
- **Decentralized Project Tracker** — Kanban-style boards linked to smart contracts.
- **The Ecosystem Hub** — a public-facing platform tracking network activity and active projects.

## 3. Detailed Functional Requirements

### 3.1 Universal Multi-Chain Wallet
The foundation of the platform's economic layer. It must support high-throughput EVM chains alongside UTXO architectures to ensure maximum liquidity and user onboarding.

- **REQ-W1 — Multi-Chain Support Protocol**
  The wallet must natively support and manage keys for Bitcoin (BTC), Ethereum (ETH), Binance Smart Chain (BSC), Polygon (MATIC), and Tron (TRX). Users must be able to view aggregate balances across all chains in a unified fiat-equivalent dashboard.
  _Scope note:_ M1 ships EVM chains only (ETH, BSC, MATIC). BTC (UTXO) and TRX ship in M2 as separate sub-milestones.
- **REQ-W2 — Cross-Chain Swaps & Gas Abstraction**
  Implement background routing allowing users to pay gas fees in the native Googolplex token or stablecoins, obfuscating the complexity of holding multiple native gas tokens (e.g., TRX for Tron, ETH for Ethereum).

### 3.2 Dual-Layer Governance & Execution System
The DAO is **the platform's control plane** — every privileged action (treasury moves, hosting takedowns, AI spend caps, parameter changes) is decided by token-holder vote and dispatched by the platform's governance service.

**Architecture choice (this is important):** voting is a **backend service**, not an on-chain Governor. Voting power is computed by snapshotting users' **GGX (TRC-20) balances on Tron** at proposal-open time — the same token they hold in their Googolplex multi-chain wallet (REQ-W1). Backend tallies; when a proposal passes, the backend's dispatcher invokes the relevant internal handler. There is no on-chain `Governor.sol`, no `execute()` calldata, no on-chain timelock contract.

**Trade-off, stated honestly:** this collapses trust to "the operator(s) running the backend." That's the cost of avoiding gas fees, on-chain coordination overhead, and a smart-contract audit on the governance layer. The mitigations are operational (multi-operator signoff on deploys, append-only audit logs, public proposal/vote/outcome history), not cryptographic. The Tron token itself is real — users can hold/transfer/trade GGX freely — but the voting + execution pipeline is Web2. See §6 risk callouts.

- **REQ-G1 — Token-Weighted Voting (Tron-snapshotted)**
  Users vote on proposals via authenticated API calls. Voting power = the user's GGX TRC-20 balance at the snapshot block recorded when the proposal opens. Snapshots are produced by reading Tron full-node state; the snapshot block hash is published in the proposal record so anyone can reproduce the tally independently. Quorum and proposal-creation thresholds are stored in backend `protocolParams` and are themselves DAO-changeable (REQ-AD4).
- REQ-G2 — Social Consensus Mechanism (Up/Down Voting)
  Non-holders and community members can comment on proposals and use a Reddit-style upvote/downvote system. The resulting **Sentiment Score** is displayed alongside the token vote and feeds into REQ-G4 (sentiment-assisted lane). Tiered Sybil resistance:
  1. Baseline — email + Turnstile (blocks the bulk of bot spam).
  2. Verified — Platform identity tier (computed via signal sources); grants weighted social vote.
  3. High-stakes — optional Worldcoin / Gitcoin Passport gate, configurable per-DAO.
  The system must expose a pluggable `IdentityProvider` interface to avoid vendor lock-in.

- **REQ-G3 — DAO Action Bus (the integration layer)**
  Every privileged platform action is modeled as a typed `DaoAction` and dispatched by the **`governance-service`** after a proposal passes. The Action Bus is the only authorized writer for these surfaces:
  | Surface | Handler | Action examples |
  |---|---|---|
  | **Treasury** | `treasury-service` | `transfer(token, to, amount)`, `swap(srcToken, dstToken, amount, dex)`, fund a per-project escrow tranche (REQ-P2 — this still hits the on-chain `Escrow` contract) |
  | **Gas abstraction (REQ-W2)** | `gas-relayer` | `setGasFeeBps(chain, bps)`, `setSubsidyCap(chain, amount)` |
  | **AI spend (REQ-AD2)** | `ai-orchestrator` | `setModelBudget(model, dailyCapUsd)`, `pauseGeneration(reason)` |
  | **Hosting (REQ-AD2)** | `hosting-controller` | `takedown(subdomain, reason)`, `reinstate(subdomain)`, `setHostingTier(projectId, tier)` |
  | **IPFS / CIDRegistry (REQ-A3)** | `cidRegistry-service` | `setPinningBudget(monthlyUsd)`, `forceUnpinIllegal(cid)` (and updates the on-chain `CIDRegistry` contract for the unpin record) |
  | **Identity (REQ-G2)** | `identity-service` | `enableProvider(name, config)`, `disableProvider(name)`, `setMinTrustScore(action, score)` |
  | **Params** | `governance-service` | generic kv `setProtocolParam(key, value)` for future params |
  Every handler MUST verify the incoming dispatch carries a valid signed `ExecutionReceipt` from `governance-service` (HMAC or asymmetric signature, key rotated per-deploy). No handler accepts direct operator calls. Every dispatch writes an append-only `audit_log` row containing `{proposal_id, action, executor_signature, timestamp}` — this log is the substitute for on-chain `execute()` transparency.
- **REQ-G4 — Sentiment-Assisted Lane**
  Proposals declare a lane at creation:
  1. **Standard lane** — token-quorum only. Required for treasury moves > 1% of TVL, parameter changes affecting fees / token economics, IPFS pinning budget, identity threshold changes.
  2. **Sentiment-assisted lane** — for low-financial-risk actions (takedown reversals, hosting tier bumps below a $/mo cap, IdentityProvider enable/disable, AI model budget tweaks). High Sentiment Score reduces the required token quorum by up to 50%. Sentiment counted only from `verified`-tier identities or above; baseline-tier votes are visibility-only.
  The lane assignment per action kind is stored in backend `protocolParams` and is itself DAO-changeable.
- **REQ-G5 — Execution Delay & Emergency Brake**
  Passed proposals enter a configurable **execution delay** (default 48h) before the backend dispatcher fires. During the delay anyone can challenge the proposal (`POST /proposals/:id/challenge`) — challenges trigger a re-snapshot vs. the original snapshot to detect post-vote token swings, surface the diff publicly, and (if threshold exceeded) auto-cancel the execution. Emergency pause (`pauseAll(reason)`) is a special proposal type requiring a **super-majority** (default 75% of GGX supply voted For) and a `high-stakes` identity tier (Worldcoin / Gitcoin Passport) to *initiate*. Once active, the dispatcher refuses to fire any `DaoAction`. Unpause requires standard governance.

### 3.3 Generative AI Studio & Automated Hosting
This module reduces the time-to-market for new founders from weeks to minutes.

- **REQ-A1 — Comprehensive Brand Kit Generation**
  Given a simple text prompt describing the project, the AI toolkit must generate: a primary logo, color palette, typography guidelines, and social media banner assets.
- **REQ-A2 — Zero-Click Web Deployment**
  The AI will generate landing page copy, layout HTML/CSS, and automatically push the compiled code to Googolplex's integrated server hosting. The user receives a live, shareable subdomain (e.g., `project.googolplex.app`) instantly.
- **REQ-A3 — Optional Decentralized Mirror (IPFS)**
  Users may toggle a "Decentralize" option that mirror-publishes the generated site to IPFS (via Pinata / web3.storage) and records the resulting CID on-chain. Preserves the speed of centralized hosting for the default path while honoring Web3 ethos for projects that opt in. _M2 scope._

### 3.4 Smart Project Tracking & Bounties
The workspace where builders manage their operations, uniquely tied to the wallet and DAO features.

- **REQ-P1 — AI-Populated Kanban Roadmaps**
  Upon generating a website (REQ-A2), the system automatically creates a project tracking board populated with recommended milestones (e.g., "Write Whitepaper", "Deploy ERC-20", "Audit Contracts") based on the project category.
- **REQ-P2 — Milestone-Linked Escrow & Bounties**
  Project tasks can have cryptocurrency bounties attached via the native wallet. When a freelancer moves a task to "Review" and the founder approves it, a smart contract automatically releases the escrowed funds to the freelancer's wallet. Large project milestones can trigger DAO votes (REQ-G1) to release treasury funding tranches.

### 3.5 Centralized & Federated Admin Panel
The Admin Panel acts as the nerve center for the platform operators. Because Googolplex combines autonomous AI tools with financial infrastructure, the admin layer must balance automated risk flagging with manual operational overrides.

> _Note:_ source draft referenced these as REQ-A1..A4; renumbered to REQ-AD1..AD4 to avoid collision with the AI Studio requirements in §3.3.

- **REQ-AD1 — Multi-Chain Wallet & Liquidity Monitor**
  - **Treasury View:** Real-time visibility into the platform's core operating wallets and gas-abstraction pools across BTC, ETH, BSC, Polygon, and Tron.
  - **Anomalous Activity Triggers:** Automated alerts that temporarily freeze platform-managed smart contract interactions if a sudden, unexplained spike in transaction frequency or volume occurs.
- **REQ-AD2 — AI Infrastructure & Server Resource Management**
  - **Container & Hosting Dashboard:** Monitor server resources consumed by auto-generated, hosted user websites.
  - **One-Click Takedown Protocol:** Instantly suspend hosting for any AI-generated subdomain that violates terms of service (e.g., phishing pages, malicious scripts, illegal content) without disrupting the main ecosystem hub.
  - **Model Cost Analytics:** Track token consumption costs for the AI brand and website generators to maintain profitable operational margins.
- **REQ-AD3 — Dual-Layer Governance & Content Moderation**
  - **Sybil & Bot Protection Console:** Monitoring interface for the social consensus layer (up/down votes and comments). Velocity graphs surface coordinated bot attacks aiming to manipulate sentiment scores. Ties to REQ-G2 tiers and ADR-003.
  - **Flagged Content Queue:** Moderation pipeline for user-reported comments or proposal descriptions; admins can remove spam or abusive language while maintaining an immutable on-chain or append-only log of the action for transparency.
- **REQ-AD4 — Token & Platform Configuration Control**
  - **Parameter Adjustment UI:** The admin panel exposes every `DaoAction` from REQ-G3 as a one-click "Propose to DAO" form (treasury moves, gas-abstraction fees, AI budgets, takedowns, hosting tiers, etc.). The form constructs a typed `DaoAction` payload and POSTs it to `governance-service`'s `/proposals` endpoint, which records the proposal, opens the Tron-balance snapshot, and tracks the proposal through vote → execution delay → dispatch.
  - **No bypass:** the admin panel has no direct write access to any of the surfaces in REQ-G3's table. Operators cannot mutate parameters, take down sites, or move treasury funds without a passed DAO proposal. The panel is a *proposal builder + status dashboard*, not a control panel in the legacy sense. Each backend handler enforces the `ExecutionReceipt` signature check — even a compromised admin panel cannot forge a dispatch.
  - **Exception — REQ-G5 emergency brake:** operators with the `high-stakes` identity tier may *initiate* the emergency-pause proposal, which still requires the super-majority token vote to pass. Initiation is logged in the audit trail.

### 3.8 Auth & Wallet (REQ-AU1..AU6)
- **REQ-AU1:** Platform-issued MPC wallet only. Never "connect external wallet."
- **REQ-AU2:** Passwordless auth: Email-OTP + WebAuthn passkey (no passwords, no SMS).
- **REQ-AU3:** Turnstile CAPTCHA required on signup, login, OTP-send, OTP-resend.
- **REQ-AU4:** Sensitive-action re-auth via passkey tap for MPC signing.
- **REQ-AU5:** Recovery via 3-of-5 social guardians OR email-OTP fallback gated by 7-day delay.
- **REQ-AU6:** Session revoke-all and per-device passkey management in user settings.

### 3.9 Analytics & Observability (REQ-AN1..AN3)
- **REQ-AN1:** PostHog cookieless product analytics, session replay, and feature flags.
- **REQ-AN2:** Sentry for error tracking, Web Vitals, and distributed tracing.
- **REQ-AN3:** SES bounce/complaint webhooks feeding the platform-wide suppression list.

## 4. User Personas

| Persona | Primary Goal | Key Features Utilized |
|---|---|---|
| **The Non-Technical Founder** | Launch a Web3 brand quickly without coding or design skills. | AI Studio, Automated Hosting, AI Roadmaps |
| **The Crypto Freelancer** | Find work, build reputation, and get paid securely without escrow fees. | Project Tracking, Bounty System, Multi-Chain Wallet |
| **The Active Community Member** | Influence the direction of projects without necessarily risking capital. | Dual-Layer Governance (Social Consensus / Upvotes) |

## 5. Success Metrics (KPIs)

- **Wallet Adoption** — Number of Active Wallets, Total Value Locked (TVL) across the 5 supported chains.
- **AI Utilization** — Average time from account creation to first live AI-generated website deployed. **Target: < 5 minutes.**
- **Governance Engagement** — Ratio of token-weighted votes to social consensus votes. A healthy ecosystem should see high social participation.
- **Bounty Velocity** — Total volume of crypto distributed through the automated project tracking board escrows.
- **DAO Coverage** — % of privileged platform actions traceable to a passed proposal + valid `ExecutionReceipt` in the audit log, vs. detected direct-handler-call bypasses. **Target: 100%.** Any bypass is a P0 incident.
- **Proposal Latency** — median time from `POST /proposals` to dispatcher firing, per lane (standard / sentiment-assisted / emergency). Used to tune execution delay + quorum.
- **Snapshot Reproducibility** — % of proposals where an independent re-snapshot from the published Tron block hash matches the recorded tally within 0.1%. **Target: 100%.** Mismatch is a P0 (indicates either bad backend or a chain reorg the indexer missed).

## 6. Open Questions & Technical Considerations

Before moving to technical architecture design, the following risks must be addressed:

- **Security** — An in-house multi-chain wallet is a massive attack vector. Require external auditing by established firms (e.g., CertiK, Trail of Bits) prior to mainnet launch.
- **Hosting Scalability** — Serving thousands of AI-generated websites requires robust load balancing to prevent the main Googolplex hub from going offline during traffic spikes.
- **Spam Prevention** — If non-token holders can participate in social consensus, Sybil attacks (bots creating fake accounts to manipulate upvotes) are highly likely. A lightweight proof-of-humanity or CAPTCHA system is required.
- **Backend trust concentration (load-bearing — read carefully)** — The decision to run governance as a backend service (vs. an on-chain Governor) means **the platform operator is the ultimate trust root**. Anyone with shell access to `governance-service` can in principle forge an `ExecutionReceipt`. Mitigations required before mainnet:
  - **Multi-operator signing key.** The receipt-signing key MUST be a threshold signature (e.g. 3-of-5 of separate operator HSMs / Ledgers). Single-signer compromise should not unlock dispatch.
  - **Public audit log mirroring.** Append-only `audit_log` writes are mirrored to a write-only public bucket every minute, hashed into a daily Merkle root that's optionally pinned on-chain (REQ-A3 / CIDRegistry). Tampering becomes detectable even if the primary DB is rolled back.
  - **Snapshot reproducibility (KPI above).** External parties can replay any tally from the published Tron block hash. Any mismatch publicly demonstrates a backend lie.
  - **Operator KYC + bond.** Each holder of a receipt-signing key has a real-world identity recorded with legal counsel and posts a slashing bond; misbehavior is criminally + civilly enforceable.
  These mitigations move the trust from "cryptographic" to "operational + legal." Acceptable for v1 to ship fast; the migration path to an on-chain Governor (if ever needed) is to redirect each `DaoAction` kind's dispatch from the backend handler to a `Governor.execute()` call without changing the `DaoAction` type contract — that boundary is what makes a future migration cheap.
- **DAO Action Bus audit scope** — Audit must cover (a) every `DaoAction` handler on each backend service (receipt-signature check + idempotency + replay protection), (b) the `governance-service` itself (snapshot logic, vote tallying, lane quorum math, execution-delay timer, emergency-brake gate), (c) the receipt-signing key custody + threshold ceremony, (d) the proposal-builder UI in the admin panel (REQ-AD4) to ensure no crafted payload can smuggle unintended action kinds past validation, and (e) the audit-log mirror integrity.
- **Snapshot manipulation risk** — Whales could borrow GGX immediately before snapshot, vote, then return. Mitigations: snapshot block = proposal-creation block - N (e.g. N=300 ≈ 5 min on Tron) so attackers can't time it; require minimum hold age (`min_hold_blocks`) for vote weight to count fully; surface "newly acquired" balance share in the proposal UI so social-consensus voters see it.
- **Operator UX during incidents** — Without an admin bypass, a confirmed exploit waits on the 48h execution delay unless `pauseAll` super-majority is reached fast. Tune emergency-brake quorum so it's reachable by the active token holder base within ~hours, not days. Consider a `GuardianMultisig` (5-of-9 trusted parties) authorized to fire `pauseAll` with zero execution-delay — pause-only, no other powers — as a fallback. Decide in a follow-up ADR.

## 7. Infrastructure & Deployment Architecture

V1 ships on a **single AWS Lightsail VPS** running Ubuntu 24.04 LTS (4 vCPU / 16 GB RAM / 320 GB SSD). The entire stack is 100% Dockerized via `docker-compose`, runs on a private internal Docker network, and is reverse-proxied by Traefik for ports 80/443, automatic Let's Encrypt SSL certificates, and wildcard subdomain routing (`*.googolplex.app`). See [docs/DEPLOYMENT.md](DEPLOYMENT.md) for the step-by-step setup guide and the canonical `docker-compose.yml` template.

### 7.1 Why a single VPS in V1
V1 is optimizing for **operational simplicity, not horizontal scale.** A single Lightsail VPS:
- Eliminates the cross-service-trust gap (everything signs receipts with the same on-disk key — see ADR-006 / REQ-G3).
- Keeps the threshold-signing ceremony (PRD §6 mitigations) tractable for the v1 operator team.
- Makes the audit log mirror trivial (one host, one append-only file).
- Defers the cost of multi-region failover, K8s, and service mesh until product-market fit is proven.

Vertical scaling on Lightsail covers us up to several thousand concurrent users; the migration path to ECS / EKS is documented in [docs/DEPLOYMENT.md](DEPLOYMENT.md) "Future scale".

### 7.2 Containers and responsibilities

| Container | Role | Notable mounts / ports |
|---|---|---|
| **traefik** | Reverse proxy. Terminates TLS, issues Let's Encrypt certs (DNS-01 wildcard for `*.googolplex.app`), routes by `Host()` rule. | Ports 80, 443. Mounts `/var/run/docker.sock` (read-only) + `letsencrypt/` volume. |
| **postgres** | Single PostgreSQL 16 container. Holds users, projects, proposals/votes (`governance-service` schema), social feed, audit log mirror. | `pgdata` volume. Internal network only — never exposed. |
| **backend-a** | **App backend.** Owns Social, DAO (`governance-service`), AI Studio orchestration, hosting controller (REQ-AD2 / REQ-A2), project tracker (REQ-P1/P2), every `DaoAction` handler except gas/wallet. Writes AI-generated site bundles to the **shared `user-sites` volume**. | Mounts `user-sites` (RW). |
| **backend-b** | **Multi-chain wallet RPC syncer.** Isolated from backend-a so EVM/BTC/Tron RPC bursts cannot throttle the main app. Owns the EVM `ChainAdapter` calls (REQ-W1), Tron snapshot reads for `governance-service` (REQ-G1), gas-abstraction relayer (REQ-W2 / `gas.*` DaoAction handlers). Communicates with backend-a over the internal network only. | No public route. Optional Redis cache volume. |
| **frontend-web** | Next.js `apps/web` build, served by `next start`. | Internal port 3000. Traefik routes `googolplex.app` here. |
| **frontend-admin** | Next.js `apps/admin` build. | Internal port 3001. Traefik routes `admin.googolplex.app` here. |
| **static-sites** | **Isolated Nginx.** Serves any AI-generated site under `*.googolplex.app`. Watches the shared `user-sites` volume; new directories appear automatically. | Mounts `user-sites` (RO). Internal port 80. |

All inter-container traffic stays on a single private Docker bridge network (`googolplex-net`). Only **traefik** publishes ports to the host.

### 7.3 Why backend-a and backend-b are split

The wallet/RPC workload has fundamentally different latency and burst characteristics from the app workload:

- **RPC bursts.** A single multi-chain dashboard load fans out into 5+ RPC calls (one per chain in REQ-W1). At hundreds of concurrent users this can saturate a single Node event loop and starve unrelated request handlers (social feed, DAO votes).
- **External-API failure isolation.** When TronGrid or a public RPC degrades, backend-b's request queue can grow without taking down user signups, DAO voting, or AI generation.
- **Independent scale knobs.** Backend-b can be scaled (more workers / a Redis-backed cache layer) without touching the auth / social code that holds session state.
- **Audit / blast-radius separation.** Treasury-relevant code (REQ-G3 treasury handlers, escrow contract calls) lives in backend-a; passive RPC reads live in backend-b. Compromise of backend-b leaks only public chain data.

Both speak typed contracts from `@googolplex/dao-actions` so the split is invisible to the frontend.

### 7.4 The AI-hosting wildcard trick (REQ-A2 / REQ-AD2)

The "zero-click deploy" requirement (REQ-A2 — user prompt → live `brandname.googolplex.app` in under 5 minutes) is delivered without spinning up a per-site container, without writing per-site Traefik config files, and without a CI/CD round-trip:

1. **AI generation (backend-a).** The AI orchestrator generates HTML/CSS/JS from the user prompt + brand kit (REQ-A1). The output bundle is written to the shared Docker volume at `/var/www/user-sites/<brandname>/`. The directory name IS the subdomain — there's no separate lookup.
2. **Static serving (static-sites container).** Nginx is configured with a single wildcard `server_name *.googolplex.app` plus `root /var/www/user-sites/$subdomain` (extracted via a `map` directive). Any directory that exists under `/var/www/user-sites/` is automatically served. No reload, no config rewrite, no daemon kick.
3. **Routing (traefik).** Traefik's wildcard route `Host(\`{sub:[a-z0-9-]+}.googolplex.app\`)` matches every subdomain and forwards to the static-sites container. The reserved hostnames (`www`, `admin`, `api`) are matched first by priority and route to their respective containers; everything else falls through to static-sites.
4. **Takedown (REQ-AD2 one-click takedown).** A passed `hosting.takedown` `DaoAction` deletes (or moves to `user-sites-quarantine/`) the corresponding directory. Nginx returns 404 immediately — no Traefik config change, no service restart. Reinstate is the reverse operation. All takedowns log to the audit trail per REQ-G3.

**Why this trick matters:** zero CI/CD overhead per site, instant takedown enforcement, and the entire wildcard-subdomain hosting platform is one Nginx container + one volume. Scale concerns (per-site CPU isolation, per-site rate limits) move to Sprint 7+ if needed.

### 7.5 Volumes, backups, and the audit log mirror

- `pgdata` — Postgres data. Nightly `pg_dump` snapshots to S3 (separate AWS account from the VPS).
- `user-sites` — AI-generated site bundles. Snapshotted nightly; loss = users can re-deploy from saved brand kits, so RPO = 24h is acceptable.
- `user-sites-quarantine` — taken-down sites (REQ-AD2). Retained 90 days for appeal review.
- `letsencrypt` — Traefik cert cache. Backed up weekly; if lost, Traefik re-issues on next boot (within rate limits).
- `audit-log-mirror` — append-only mirror of every `governance-service` audit event (per ADR-006 mitigations). Rsynced to a write-only S3 bucket every minute, daily Merkle root pinned via the on-chain `CIDRegistry`.

### 7.6 Future scale

When VPS vertical limits are reached (estimated 5,000+ MAU):
- Lift `postgres` to AWS RDS (multi-AZ).
- Move `static-sites` to S3 + CloudFront — Backend A writes bundles to S3 instead of the shared volume; wildcard CloudFront distribution replaces Nginx.
- Lift `backend-b` to ECS Fargate behind an internal NLB; scale workers per chain.
- Keep `backend-a` and `traefik` co-located until horizontal scale is genuinely required.

The migration is incremental — `docker-compose` services lift to ECS task definitions one at a time without changing the application code.

---

_CONFIDENTIAL_
