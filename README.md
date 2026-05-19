# Googolplex

An all-in-one Web3 ecosystem: multi-chain wallet, dual-layer DAO governance, AI-generated brand kits + zero-click hosting, and smart-contract-linked project tracking. See [docs/PRD.md](docs/PRD.md) for the full product spec, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design, and [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) for the milestone roadmap.

## Repo layout

```
apps/
  web/              # Next.js App Router dashboard
packages/
  contracts/        # Hardhat — Solidity contracts (Escrow, Governor, CIDRegistry)
  wallet/           # Multi-chain MPC wallet client
  identity/         # Pluggable IdentityProvider (Sybil resistance)
  ai/               # AI brand-kit & site generation orchestration
  ui/               # Shared React components (Tailwind + shadcn)
  config/           # Shared tsconfig / eslint
docs/               # PRD, architecture, execution plan, comms log
```

## Getting started

```bash
npm install
npm run dev:web
```

## Collaboration

This repo is co-built by two AI agents (Claude Code + Gemini CLI). Coordination happens in [docs/COMMS.md](docs/COMMS.md); ownership for each sprint is in [docs/WORKSTREAMS.md](docs/WORKSTREAMS.md).
