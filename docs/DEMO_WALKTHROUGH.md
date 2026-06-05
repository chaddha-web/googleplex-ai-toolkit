# GoogolPlex — Loom Demo (live, on production)

The demo runs on the **real** site (`ggakingclub.com`). You create a fresh
account; I credit it off-camera with an admin CLI on the server; you record the
journey; then I **delete the account and revert everything**.

> Nothing in the app shows "demo". The only special pieces are server-side and
> get torn down afterwards.

## What I set up on the server (before you record)
- `STUDIO_DEMO_MODE=1` → the Studio "Generate" returns the pre-built showcase
  store (no AI key needed). *(Removed after.)*
- `WALLET_NOBROADCAST_EMAILS=<your demo email>` → only this account's withdrawals
  confirm without an on-chain broadcast. Everyone else is unaffected. *(Removed after.)*

## The recording flow

1. **Landing** — open `https://ggakingclub.com`. Show the marketing site.
2. **Sign up** — `/signup`, new email + name. Enter the OTP from your inbox
   (off-camera). *(Distinct signup + welcome emails fire.)*
3. **Wallet password** — set it when prompted (used to confirm withdrawals).
4. **Open the Wallet once** — this provisions your deposit addresses. *(Required
   before I can credit.)*
5. **→ Tell me the email.** I run, on the box:
   ```
   docker exec gplex-wallet npx tsx --env-file=.env bin/credit-user.ts \
     --email <you> --amount 1 --asset USDT --chain bsc
   ```
   Your wallet flips **Active** (activation email fires).
6. **Generate Seva Credit** — dashboard card → counts up to **10,000,000,000**.
7. **$100 top-up** — I run the credit CLI again (`--amount 100 --chain tron`).
   Wallet shows ≈ **$101**, with both deposits in transaction history (tap a row
   → tx hash, sender, explorer links).
8. **Studio ($18)** — unlock the Studio (balance → ≈ $83).
9. **Build the business** — store name **Lustre**, describe the cleaning company
   (founder = you). **Generate** → logo + brand kit + **live store preview**.
   Open it: `https://app.ggakingclub.com/store/lustre-by-fateh`
   (hero, services, founder, mission, "Developed by GoogolPlex AI Powerbox").
10. **Community** — comment / like / vote.
11. **Withdraw $20 USDT (TRC20)** — Wallet → Withdraw → USDT/TRON, $20, paste a
    destination address → confirm with wallet password. Success + email + tx
    hash. (No on-chain broadcast for this account; balance → ≈ $63.)

## Teardown (after you record) — I run this
```
# delete the account + ALL its data (wallet + auth)
docker exec gplex-wallet npx tsx --env-file=.env bin/purge-user.ts --email <you> --yes
```
Then I revert the two env flags (`STUDIO_DEMO_MODE`, `WALLET_NOBROADCAST_EMAILS`)
in `.env.prod` and restart the affected containers. Nothing demo-related remains.

## Kept permanently (not torn down)
- The **Lustre showcase store** (`demo-sites/lustre-by-fateh.html`) — it's the
  website we built.
- The **real Studio pipeline** (brand kit + full site generation + publish). To
  make it genuinely AI-generative: add a provider key in **Admin → Settings** and
  remove `STUDIO_DEMO_MODE` — same UI, real output.

## Admin CLI reference
| Action | Command (in `gplex-wallet` container) |
|---|---|
| Credit / activate | `npx tsx --env-file=.env bin/credit-user.ts --email <e> --amount <n> --asset USDT --chain bsc\|tron\|eth` |
| Purge (delete everything) | `npx tsx --env-file=.env bin/purge-user.ts --email <e> --yes` |
