# Workstreams — Claude ↔ Gemini Distribution

> Companion to [COMMS.md](COMMS.md). This file defines **who owns what** for each sprint. Coordination lives in COMMS; assignments live here. After each sprint, both agents cross-check each other's work and post review notes in COMMS.

## Workflow loop

1. **Distribute** — both agents read this file's current sprint and own their chunk.
2. **Build** — each agent works on its assigned files independently.
3. **Announce** — each agent posts a `*-done` entry in COMMS.md when finished (`Status: TODO`, addressed to the other agent for review).
4. **Cross-check** — the other agent reviews the work, posts findings in COMMS (issues, suggestions, approvals).
5. **Fix** — original owner addresses review comments. Repeat until both `DONE`.
6. **Advance** — both agents update this file's "Current sprint" to the next sprint.

## Rules

- Do not touch files outside your assigned list without flagging in COMMS first.
- If you discover a shared file needs editing, raise it as a new COMMS entry.
- Cross-check is mandatory before a sprint closes — no self-approvals.
- Sprints are intentionally small (1–2 hours of work each) so the cross-check loop stays tight.

---

## Sprint 1 — Repo scaffold ✅ CLOSED (2026-05-18)
Both chunks built, cross-checked, fixes applied. Monorepo skeleton stands.

## Sprint 2 — First real surfaces ✅ CLOSED (2026-05-18)
Both chunks landed: dashboard mock, EVM adapter, identity skeletons (Claude); Escrow.sol + 4-path tests, CIDRegistry.sol, brand-kit type + prompt (Gemini). Cross-checks approved with 2 nits queued into Sprint 3.

## Sprint 6.5 — Foundations (Auth + Turnstile + SES + Analytics + Perf)
- **1. Identity/Auth:** Build `/login`, `/signup` (route group), `next-auth` v5 with email-OTP/WebAuthn.
- **2. CAPTCHA:** Implement `Turnstile` component + server middleware.
- **3. Email:** SES adapter, React Email templates (OTP, notifications).
- **4. Analytics:** PostHog + Sentry instrumentation.
- **5. Perf:** Edge runtime tags, bundle analyzer, PWA configuration.
- **6. Deploy:** Blue/green script + GHA workflow.

## Sprint 6 — Frontend/UI execution sprint (current, Gemini-driven)
...

**Owner:** **Gemini takes the entire sprint.** Claude handed off the architecture, the type contracts (`@googolplex/dao-actions`), the governance-service backend, the deployment infra design, and the admin scaffold. Sprint 6 is "build out every feature surface on the frontend so the V1 product is demoable end-to-end." Claude stays on backend handler stubs + supporting `apps/web` server actions / API routes as needed when Gemini blocks.

**Conventions for Gemini:**
- Every task is numbered `X.Y` — finish them in roughly that order, post a single COMMS entry per theme (1.x, 2.x, etc.) when its sub-tasks land. No need for a per-task ping.
- Use existing shared types from `@googolplex/dao-actions`, `@googolplex/wallet`, `@googolplex/identity`. Don't redefine.
- Tailwind + shadcn/ui throughout. Match the dark/glassy aesthetic already in `apps/web/app/dashboard/page.tsx` and `apps/admin/app/page.tsx`.
- All data fetches: Server Components by default. Use Route Handlers (`app/api/...`) for any client mutations.
- Where backend isn't ready, mock with a typed placeholder + a `TODO(claude):` comment naming the endpoint Claude needs to ship. Claude will pick those up.
- All forms validate at the type-shape level (e.g. `DaoAction` discriminated union ensures only valid payloads compile).
- Post a COMMS check-in after each theme so Claude can cross-check incrementally instead of one giant review at the end.

### Theme 1 — Wallet UI (`apps/web/app/wallet/`)
- **1.1** `/wallet` send screen: chain picker (use `SUPPORTED_M1_CHAINS`), recipient address input with validation, amount + max button, gas-abstraction toggle (REQ-W2), submit calls `POST /api/wallet/send` (stub).
- **1.2** `/wallet/receive` screen: per-chain QR code (use `qrcode` lib) + copyable address, chain selector.
- **1.3** `/wallet/history` transactions list (paginated, infinite-scroll), filter by chain + direction (in/out/swap).
- **1.4** `/wallet/tokens` list with import-by-contract-address modal.

### Theme 2 — Auth & Identity (`apps/web/app/auth/` + shared widgets)
- **2.1** SIWE sign-in modal — wallet address connect → backend issues challenge → user signs → session cookie. Use `siwe` npm package or roll the EIP-4361 message manually. Cookie httpOnly + secure.
- **2.2** `<IdentityBadge tier="baseline|verified|high-stakes" />` shared component — drop into proposals page comments, profile page, vote widgets. Use color tokens consistent with the lane badges in admin.
- **2.3** `/profile/[address]` page: shows handle, identity tier breakdown (which providers verified), GGX balance (from `EvmAdapter`-style Tron adapter once Claude ships it — mock balance for now), recent activity feed.
- **2.4** hCaptcha challenge UI — drops into the comments form on proposal detail pages, calls `HcaptchaProvider.verify()` via a server action.

### Theme 3 — AI Studio (`apps/web/app/studio/`) — REQ-A1/A2
- **3.1** `/studio` prompt entry: textarea, project category picker, "generate brand kit" button → calls `POST /api/ai/brand-kit` (Claude TODO). Show streaming progress (skeleton states for logo/palette/typography/banners).
- **3.2** Brand kit preview: logo (image), palette swatches (with hex code copy buttons), typography sample (headings + body), Twitter + Discord banner previews. "Regenerate" + "Approve" buttons.
- **3.3** Website preview iframe: shows the generated site at a sandbox URL. "Edit copy" inline textareas patch the HTML in place (debounced save). "Deploy" button → `POST /api/sites/deploy` returns the assigned `<brandname>.googolplex.app` subdomain — show confirmation modal with link.
- **3.4** Post-deploy: redirect to `/projects/[id]` (which Theme 4 builds) so the AI-populated kanban (REQ-P1) is immediately visible.

### Theme 4 — Project Tracker & Bounties (`apps/web/app/projects/`) — REQ-P1/P2
- **4.1** `/projects` list: card grid of user's projects (status, TVL, open milestones). Reuse the styling from `dashboard/page.tsx`.
- **4.2** `/projects/[id]` Kanban board: 4 columns (Backlog / In Progress / Review / Done), drag-and-drop (use `@dnd-kit/sortable`). Persists via `PATCH /api/projects/[id]/milestones/[mid]` (Claude TODO).
- **4.3** Milestone detail modal: title, description, bounty attach UI (pick wallet token + amount → `Escrow.fund()` via wallet send flow from Theme 1). Visualize escrow state (Unfunded / Funded / Released / Refunded — mirrors `Escrow.sol` enum).
- **4.4** Bounty release flow: when funder hits "Approve & Release", show wallet sign prompt → call `Escrow.approveAndRelease()`. If the milestone is large enough to require DAO approval, route to "Propose to DAO" (creates a `treasury.fundEscrow` proposal via `createGovernanceClient` from Sprint 5).
- **4.5** `/bounties` public freelancer marketplace: browse open bounties across all projects (filterable by chain, amount, tag). "Claim" → moves task to `In Progress` and assigns to the claimant address.

### Theme 5 — DAO Voting UI (`apps/web/app/proposals/`)
- **5.1** Rewrite `/proposals` (currently mock from Sprint 4): fetch live via `createGovernanceClient.listProposals()`. Same UI shell, real data. Add filters: state, lane, action surface.
- **5.2** `/proposals/[id]` detail page: header (title, action kind + handler, lane badge, state badge, snapshot block + reproducibility note), live For/Against/Abstain bars with raw numbers + percentages, quorum-progress ring (against `quorumRequired`), executable countdown timer when state=`delayed` (REQ-G5).
- **5.3** Vote-cast widget (server action): For/Against/Abstain buttons, weight preview (read user's GGX balance at snapshot block), confirm → `createGovernanceClient.castVote()`. Disable when not active or already voted.
- **5.4** Sentiment up/down widget (REQ-G2): up/down arrows visible to all; weighting follows tier (baseline = visibility only, verified+ contributes to sentiment-assisted lane quorum reduction).
- **5.5** Comments thread under each proposal: reverse-chronological, each comment shows `<IdentityBadge>` from Theme 2. hCaptcha required for baseline tier (Theme 2.4). Comments are off-chain; persist via `POST /api/proposals/[id]/comments` (Claude TODO).
- **5.6** `/proposals/new` (in `apps/web`, not just admin): community-facing proposal creator restricted to standard non-treasury action surfaces — gives token holders direct authorship without going through ops.

### Theme 6 — Ecosystem Hub (`apps/web/app/(hub)/`)
- **6.1** Public landing page at `/` (replace current placeholder): hero, total platform stats (TVL, active projects, proposals voted last 7d), CTA buttons (Start a Project, Browse Bounties, View DAO).
- **6.2** `/hub/projects` — public directory of all projects with their hosted-site URL, project type, total bounties paid out, sentiment score.
- **6.3** `/hub/activity` — global activity feed: new proposals, executed actions, deploys, large bounty releases. Real-time-ish (poll every 30s).
- **6.4** `/hub/search` — search across projects, proposals, addresses. Server-side via `GET /api/search?q=...` (Claude TODO).

### Theme 7 — Admin Panel expansions (`apps/admin/app/`)
- **7.1** `/treasury` (REQ-AD1): aggregate balance per chain, list of platform-owned wallets, recent treasury proposals + their state. Live data from backend-b.
- **7.2** `/hosting` (REQ-AD2): list of all `<brandname>.googolplex.app` deployments with takedown status. "Propose Takedown" button → opens the existing proposal builder pre-filled with a `hosting.takedown` action.
- **7.3** `/sybil-console` (REQ-AD3): velocity graphs of upvotes/downvotes per proposal in last 24h. Flag anomalies (sudden spikes from new accounts).
- **7.4** `/audit-log` — immutable feed of every audit event from `governance-service` (proposal.created/vote.cast/proposal.executed/etc.). Filterable by event type + proposal id. Read-only.
- **7.5** `/ai-costs` (REQ-AD2 model cost analytics): chart of daily token spend per model, current daily-cap per model, button to propose changing the cap (`ai.setModelBudget` proposal).
- **7.6** `/params` — dashboard of every `protocolParams` key + current value, button to propose updating each (`params.set` proposal pre-filled).

### Theme 8 — Cross-cutting UI plumbing
- **8.1** `<Toast>` notifications system (use sonner). Wire into form submits across all themes.
- **8.2** Top navbar wallet-connect indicator (shared between web + admin via `packages/ui`): shows truncated address + GGX balance + identity tier dot.
- **8.3** Light/dark theme toggle (currently dark-only). Use `next-themes`. Most components already work; just need a toggle in the navbar and CSS variables for both modes.
- **8.4** Loading skeletons + empty states for every list/grid surface (proposals, projects, bounties, audit log, etc.). Shared `<EmptyState>` and `<Skeleton>` components in `packages/ui`.
- **8.5** Error boundaries on every route group; user-friendly 404 + 500 pages styled in the same aesthetic.

### Claude's parallel lane
- Backend handler stubs (`treasury-service`, `hosting-controller`, `ai-orchestrator`, `cidRegistry-service`, `identity-service`, `gas-relayer`) so Gemini's frontends have a `/dispatch` endpoint to talk to.
- Route Handlers in `apps/web/app/api/...` that proxy to backend services (mostly thin pass-throughs).
- Tron snapshot Path-B fold logic in `services/governance/lib/tron-snapshot.ts` once Gemini confirms the path choice and pastes the GGX TRC-20 address.
- Real `balanceOf` for GGX (via `tron-snapshot`) so Theme 5.3 weight preview is accurate.

### Definition of done (sprint 6)
- All 8 themes' DoD met. Smoke test: a new user can sign in (2.1), generate a site (3.x), deploy to `<brand>.googolplex.app`, see it appear in their dashboard, fund a milestone bounty (4.3), the freelancer claims and completes it (4.4), release fires. Separately: a community member browses proposals (5.x), casts a vote, sees the result. Admin browses takedown queue (7.2) and proposes a takedown → executes after delay → site 404s.
- All UI surfaces have loading + empty + error states.
- COMMS entries per theme posted with cross-check requests.

---

## Sprint 5 — PIVOT: backend governance-service over Tron token snapshots (closed for Gemini's lane, in-flight for Claude's backend handlers)

**Context:** ADR-006 supersedes the on-chain Governor approach. `GoogolplexGovernor.sol` + `GovernanceToken.sol` + `Governor.test.ts` + `IGovernor.sol` removed. GGX lives on Tron as a TRC-20 — backend reads balances at snapshot block, tallies, dispatches via signed `ExecutionReceipt`. PRD §3.2 fully rewritten. The 2 REQ-G5 fixes flagged in the prior Sprint 5 spec are now MOOT — pause/timelock move into backend logic.

**Goal:** stand up `services/governance` as a runnable Node service with the proposal lifecycle wired end-to-end against Tron testnet, plus update `packages/dao-actions` + the admin/web UIs to talk to it (not to a Governor contract).

### Claude owns
- `services/governance/` — NEW Node/TS service (Express or Fastify, sqlite for v1):
  - `POST /proposals` — accept `ProposalPayload`, snapshot Tron block + write to DB.
  - `POST /proposals/:id/votes` — cast a vote (auth: signed message from Tron wallet).
  - `GET /proposals` + `GET /proposals/:id` — list + detail.
  - `lib/tron-snapshot.ts` — TronGrid / TronWeb RPC client; resolve GGX balance for an address at a past block.
  - `lib/tally.ts` — sum For/Against/Abstain weighted by snapshot balances; apply lane quorum override.
  - `lib/dispatcher.ts` — after vote ends + execution delay, sign `ExecutionReceipt` and POST to `<handler>/dispatch`. v1 uses a single signing key (env var); threshold ceremony deferred.
  - `lib/audit.ts` — append-only log writer (every state transition).
- `packages/dao-actions/src/client.ts` — typed HTTP client (`createProposal`, `castVote`, `listProposals`, `getProposal`) so admin + web don't hand-roll fetch.
- `apps/admin/app/proposals/new/[kind]/page.tsx` — generate form fields from each `DaoAction` shape, submit via the new client.
- `apps/web/app/proposals/[id]/page.tsx` — proposal detail (live data from governance-service).
- `apps/web/app/proposals/page.tsx` — drop the mock, read live proposals from the service.

### Gemini owns
- Delete confirmed: `GoogolplexGovernor.sol`, `GovernanceToken.sol`, `Governor.test.ts`, `IGovernor.sol` (done by Claude, but ack the deletion in cross-check).
- `services/governance/lib/tron-snapshot.ts` cross-check + suggest the TronWeb config (Gemini's Tron knowledge welcome — Claude is sketching it from docs).
- `packages/contracts/contracts/Escrow.sol` — add the milestone-DAO-funding hook (REQ-P2 mentions "large milestones can trigger DAO votes"). Specifically: add a `daoApprover` address + `approveByDao(milestoneId)` function that the governance-service treasury handler calls with its receipt-signing wallet. Keeps Escrow's role narrow but lets the DAO actually move treasury funds via it.
- Optionally: a small Hardhat test demonstrating the `daoApprover` path on `Escrow.sol`.

### Definition of done (sprint 5)
- `services/governance` boots, sqlite created, endpoints respond.
- A `params.set` proposal can be created → voted on (mock Tron balance for now) → execution delay → dispatcher fires and writes a row to the governance handler's local handler stub.
- `apps/admin` submits new proposals to the live service; `apps/web/proposals` reads them back.
- `Escrow.daoApprover` lands with a passing test.
- Cross-checks posted.

### Out of scope (Sprint 6+)
- Real TronWeb RPC integration with mainnet balances (use mocks in this sprint).
- 3-of-5 threshold signing (single key signed receipts for now).
- Public Merkle-pinned audit log mirror.
- Snapshot reproducibility tool.

---

## Sprint 4 — DAO Action Bus types + admin scaffold ✅ CLOSED (2026-05-18)
Claude shipped `packages/dao-actions` (full DaoAction taxonomy + ACTION_REGISTRY + handler field per Gemini's request), `apps/admin` scaffold + proposal picker, `apps/web/proposals` mock list. Gemini approved taxonomy and flagged the missing `handler` field — added.

## Sprint 4 — DAO Action Bus types + admin scaffold (archived)

**Goal:** ground the REQ-G3 DAO Action Bus in code by shipping the typed `DaoAction` schema, scaffold `apps/admin` per ADR-005, and give `apps/web` a read-only proposals list. Pure type-layer + frontend work — no contracts conflict with Gemini's in-flight Sprint 3 chunk.

### Claude owns (all)
- `packages/dao-actions/` — typed `DaoAction` discriminated union mirroring the REQ-G3 surface table (treasury, gas, AI, hosting, IPFS, identity, contracts, params), plus calldata encoder stubs for each. Shared by web/admin/backend.
- `apps/admin/` — new Next.js App Router app per ADR-005. Scaffold only: layout, landing page noting "Proposal Builder for `GoogolplexGovernor`", `package.json` declaring `@googolplex/admin`.
- `apps/admin/app/proposals/new/page.tsx` — placeholder proposal-builder UI: lists every `DaoAction` kind from `packages/dao-actions` as a card, click yields a stub form. Wiring to Governor lives in a later sprint.
- `apps/web/app/proposals/page.tsx` — read-only proposals list page (mock data for now; real Governor read in Sprint 5).
- Root `package.json` `workspaces` already covers `apps/*` and `packages/*` — no change needed.

### Gemini owns
- _Still finishing Sprint 3 (Governor + Token + test) with the DAO control-plane revisions from [00:20]._

### Definition of done (sprint 4)
- `packages/dao-actions` exports the full `DaoAction` union with at least one encoder stub per kind.
- `npm run dev --workspace @googolplex/admin` boots on a different port from `@googolplex/web`.
- `/proposals/new` on admin lists all `DaoAction` kinds.
- `/proposals` on web renders the mock list.
- Sprint 4 cross-check posted in COMMS once Gemini's Sprint 3 closes.

---

## Sprint 3 — Governance executable + live data ✅ CLOSED (2026-05-18)
Gemini: Governor + GovernanceToken + happy-path test (7 tests green), all REQ-G3/G4/G5 revisions absorbed. Claude: live EvmAdapter wiring, hCaptcha real verify, ADR-005. Two REQ-G5 enforcement gaps deferred to Sprint 5.

## Sprint 3 — Governance executable + live data (archived)

**Goal:** make governance executable on-chain (Gemini) and replace the dashboard mock with real RPC data (Claude). Hook the admin-panel boundary decision into the architecture.

### Claude owns
- `apps/web/app/dashboard/page.tsx` — convert to async Server Component; fetch live balance via `EvmAdapter` for `NEXT_PUBLIC_DEMO_ADDRESS` (with fallback). Projects stay mocked.
- `apps/web/components/wallet-widget.tsx` — accept `balances` prop, drop hardcoded data.
- `packages/identity/src/adapters/hcaptcha.ts` — implement real `verify()` against `siteverify`.
- `docs/ARCHITECTURE.md` — ADR-005: `apps/admin` as separate Next.js app (REQ-AD1..AD4 surface, M3 scope).

### Gemini owns
- `packages/contracts/contracts/GovernanceToken.sol` — minimal `ERC20Votes`, mintable at deploy.
- `packages/contracts/contracts/GoogolplexGovernor.sol` — concrete `IGovernor` extending OZ Governor + GovernorVotes + GovernorVotesQuorumFraction + GovernorCountingSimple + GovernorTimelockControl. Keep upgrade-target hooks generic (REQ-AD4).
- `packages/contracts/test/Governor.test.ts` — happy path: deploy → mint → delegate → propose → vote → queue → execute.
- Add `@openzeppelin/contracts` to `packages/contracts/package.json`.

### Definition of done (sprint 3)
- `npx hardhat test` passes Escrow + new Governor happy-path.
- `npm run dev:web` shows a live balance for the demo address (or graceful error state).
- hCaptcha `verify()` round-trips against the real endpoint with a valid test secret.
- ADR-005 in `ARCHITECTURE.md`.
- Cross-checks posted in COMMS.

---

## Sprint 2 — First real surfaces (archived)

**Goal:** turn the scaffold into something that runs end-to-end on a single happy path. Each agent ships one runnable artifact in their lane.

### Claude owns
- `/apps/web/app/dashboard/page.tsx` — first real screen: a project dashboard mockup (3 fake projects in cards, wallet balance widget placeholder, "New Project" button). Pure UI, no real data.
- `/apps/web/components/wallet-widget.tsx` — Tailwind component showing aggregate balance across `SUPPORTED_M1_CHAINS` (hardcoded mock values).
- `/packages/wallet/src/adapters/evm.ts` — first `ChainAdapter` impl: an EVM adapter that calls a public RPC (Alchemy demo / public Infura) for `getBalances`. Read-only, no signing.
- `/packages/identity/src/adapters/siwe.ts` + `/packages/identity/src/adapters/hcaptcha.ts` — two `IdentityProvider` skeletons (no real verification yet, but full interface + return shapes correct).

### Gemini owns
- `/packages/contracts/contracts/Escrow.sol` — minimal `IEscrow` implementation (per-milestone mapping, `fund/approveAndRelease/refund`, owner = funder, no DAO hook yet).
- `/packages/contracts/test/Escrow.t.ts` — Hardhat test covering happy path (fund → release) + refund path.
- `/packages/contracts/contracts/CIDRegistry.sol` — minimal `ICIDRegistry` implementation (mapping + access control by msg.sender).
- `/packages/ai/src/brand-kit.ts` — prompt orchestration skeleton: function signature `generateBrandKit(prompt: string): Promise<BrandKit>` that defines the `BrandKit` type (logo url, palette, typography, banners) and stubs the LLM call.
- `/packages/ai/prompts/brand-kit.system.md` — the system prompt template.

### Definition of done (sprint 2)
- `npm install` at root resolves clean.
- `npx hardhat test` inside `packages/contracts` passes the Escrow happy-path test.
- `npm run dev:web` boots and `/dashboard` renders the mock UI.
- `packages/wallet/src/adapters/evm.ts` returns a real (or mocked-but-typed) balance for a known address.
- Cross-check entries posted in COMMS for both chunks.

---

## Sprint 1 — Repo scaffold (archived)

**Goal:** stand up the monorepo skeleton so subsequent sprints can write real code. No business logic yet; placeholders only.

### Claude owns
- `/.gitignore`
- `/package.json` (root, npm workspaces declaring `apps/*` and `packages/*`)
- `/README.md` (one-paragraph project intro + link to docs/)
- `/packages/config/` — shared `tsconfig.base.json`, `eslint.config.mjs`, `package.json` (`@googolplex/config`)
- `/apps/web/` — Next.js App Router scaffold with Tailwind + shadcn placeholders (`package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/.gitkeep`)
- `/packages/wallet/` — skeleton: `package.json` (`@googolplex/wallet`), `src/index.ts` exporting placeholder types for MPC client + chain adapter interface
- `/packages/identity/` — skeleton: `package.json` (`@googolplex/identity`), `src/index.ts` defining the `IdentityProvider` interface from ADR-003 (no adapter impls yet)

### Gemini owns
- `/packages/contracts/` — Hardhat project
  - `package.json` (`@googolplex/contracts`)
  - `hardhat.config.ts`
  - `contracts/interfaces/IEscrow.sol` (REQ-P2 — `Funded`/`Released`/`Refunded` events; `fund`/`approveAndRelease`/`refund` functions)
  - `contracts/interfaces/IGovernor.sol` (REQ-G1 — `propose`/`castVote`/`execute`/`state`)
  - `contracts/interfaces/ICIDRegistry.sol` (ADR-002 / REQ-A3 — `register(siteId, cid)`/`cidOf(siteId)`/`CIDUpdated` event)
  - `test/.gitkeep`
- `/packages/ai/` — skeleton: `package.json` (`@googolplex/ai`), `src/index.ts` placeholder, `prompts/.gitkeep`
- `/packages/ui/` — skeleton: `package.json` (`@googolplex/ui`), `src/index.ts` placeholder

### Definition of done (sprint 1)
- `npm install` at repo root resolves without errors.
- `npx hardhat compile` (inside `packages/contracts`) succeeds against the interface files.
- `npm run dev` inside `apps/web` boots Next.js on a default port.
- Both agents have posted a cross-check entry in COMMS.md approving the other's work.

---

## Sprint 2 — TBD
_To be defined after Sprint 1 cross-check closes._

## Sprint backlog (rough)
- Wallet MPC client integration (ADR-001) — packages/wallet
- Escrow contract implementation + Hardhat tests — packages/contracts
- Governor contract implementation (OpenZeppelin Governor) — packages/contracts
- IdentityProvider adapters (hCaptcha, SIWE) — packages/identity
- AI brand-kit prompt orchestration — packages/ai
- apps/web — wallet connect + first real screen (project dashboard)
- apps/hub — ecosystem activity hub
