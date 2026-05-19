# Execution Plan

> Status: **Draft V1.0** — Milestone sequencing based on PRD V1.0.

## Milestones
- **M1 (Frontend MVP):** ~80% complete. UI themes done; foundations in flight (Sprint 6.5).
- **M1.5 (Foundations):** Auth, Turnstile, Email, Analytics, Performance. (Sprint 6.5)
- **M2 (Governance + Real Infrastructure):** Real MPC, real IPFS, real Escrow on Shasta, Biconomy live.


## Workstreams
- **Web3 / Chain** — Wallet key management, smart contract development (Escrow, DAO).
- **AI & Hosting** — AI API integrations (LLM and Image gen), dynamic site generation, and automated deployment pipelines.
- **Backend / DB** — Off-chain social consensus state, user sessions, project tracking data model.
- **Frontend / UX** — Unified dashboard for wallet, kanban, and voting.

## Dependencies
- AI services depend on chosen provider APIs (OpenAI/Anthropic).
- Wallet multi-chain compatibility requires robust RPC node providers.

## Risks
- **Security:** Multi-chain wallet vulnerabilities and smart contract exploits.
- **Sybil Attacks:** Social voting (REQ-G2) manipulation.
- **Scalability:** High server load for AI site generation and hosting.

## Current status
- 2026-05-18: PRD V1.0 reviewed; initial Execution Plan and Architecture drafts created.
