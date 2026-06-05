#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GoogolPlex — local DEMO stack (for recording the Loom).
#
# Starts auth (4200) + wallet (4201) + web (3000) with demo flags:
#   • WALLET_DEMO_MODE=1   → /wallet/demo/deposit works; withdrawals don't
#                            broadcast (realistic fake tx hash). No real chain.
#   • STUDIO_DEMO_MODE=1    → Studio "Generate" returns the pre-built showcase
#                            store (no AI key needed).
#   • NEXT_PUBLIC_DEMO_MODE=1 → the hidden ⚙ demo panel (bottom-left) appears,
#                            with off-camera "Simulate $1 / $100 deposit" buttons.
#   • ADMIN_EMAILS=""       → the demo account signs up as a normal USER (so the
#                            dashboard isn't bounced).
#
# Real OTP emails still send (via Resend) to whatever email you log in with.
# Run from the repo root with git-bash:   bash scripts/dev-demo.sh
# Stop with Ctrl+C (kills all three).
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")/.."

mkdir -p services/auth/data services/wallet/data

echo "Starting GoogolPlex demo stack → auth :4200 · wallet :4201 · web :3000"
echo "Open http://localhost:3000  (demo panel = bottom-left ⚙)"
echo

npx concurrently -k -n auth,wallet,web -c green,yellow,cyan \
  "CORS_ORIGINS=http://localhost:3000,http://localhost:3010 ADMIN_EMAILS= npm run dev --workspace services/auth" \
  "WALLET_DEMO_MODE=1 CORS_ORIGINS=http://localhost:3000,http://localhost:3010 npm run dev --workspace services/wallet" \
  "STUDIO_DEMO_MODE=1 NEXT_PUBLIC_DEMO_MODE=1 NEXT_PUBLIC_AUTH_BASE=http://localhost:4200 NEXT_PUBLIC_WALLET_BASE=http://localhost:4201 AUTH_INTERNAL_BASE=http://localhost:4200 PORT=3000 npm run dev --workspace apps/web"
