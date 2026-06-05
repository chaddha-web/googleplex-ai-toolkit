# GoogolPlex — Loom Demo Walkthrough

Everything runs locally with **no real money** (chain ops are simulated). Real
OTP emails still send. The generated store is genuinely live at a local URL.

## 0. Start the stack
```bash
bash scripts/dev-demo.sh
```
Wait for all three to be up, then open **http://localhost:3000**.

- **Demo account:** `morsemus@gmail.com` (signs up as a normal user — full dashboard).
- **Hidden demo panel:** bottom-left **⚙** button. It has off-camera buttons to
  simulate deposits. Keep it off-screen while recording.

> If a port is busy, stop any already-running dev servers first.

---

## 1. Sign up / log in (OTP)
1. Go to **/signup**, enter name + `morsemus@gmail.com`.
2. The 6-digit OTP arrives by email. Enter it (off-camera if you prefer).
3. You land on the dashboard. *(Distinct signup vs login + welcome emails fire.)*

## 2. Set the wallet password
- Follow the setup prompt to set a wallet password (used to confirm withdrawals).
  Status becomes **“awaiting activation deposit.”**

## 3. Activate the wallet — $1 USDT (BEP20)
1. (Optional) Show the **Wallet → Deposit** screen and the BEP20 address.
2. **Off-camera:** open the ⚙ panel → **“Simulate $1 USDT (BEP20)”**.
   The page refreshes; wallet is now **Active**. *(Activation email fires.)*

## 4. Generate the 10B Seva Credit
- On the dashboard, the **“Generate Seva Credit”** card now appears →
  click it → watch it count up to **10,000,000,000**. *(Seva compliance email fires.)*
- Open **Wallet** to show the Seva Credit balance.

## 5. Top up — $100 USDT (TRC20)
- **Off-camera:** ⚙ panel → **“Simulate $100 USDT (TRC20)”**.
- **Wallet** now shows ≈ **$101** total, with the deposit in transaction history
  (tap a row → detail page with tx hash, sender, explorer links). *(Deposit email fires.)*

## 6. Activate the Studio ($18)
- Go to **Studio** → pay the one-time **$18** unlock (deducted from balance →
  ≈ **$83** left). Studio unlocks.

## 7. Build the cleaning business in the Studio
1. Store name: **Lustre** (or anything).
2. Description: *“A premium home & office cleaning concierge, founded by Fateh…”*
3. Click **Generate brand & site**. You’ll see:
   - the **logo**, the **brand kit** (names, palette, typography, story), and
   - a **live website preview** + **Open store ↗**.
4. Open the live store: **http://localhost:3000/store/lustre-by-fateh**
   (hero, services, the founder = Fateh, mission, “Developed by GoogolPlex AI Powerbox”).

> Demo mode shows the pre-built Lustre store. To make it truly AI-generative,
> an admin pastes a provider key in **Admin → Settings** and turns demo mode off
> — same UI, real generation.

## 8. Use the Community
- Open **Community**, leave a comment / like / cast a vote (PARTY-gated).

## 9. Withdraw $20 USDT (TRC20)
1. **Wallet → Withdraw** → asset **USDT / TRON**, amount **$20**, paste a
   destination TRON address.
2. Confirm with your **wallet password** (or OTP).
3. Success screen + **confirmation email** + a realistic **tx hash**.
   *(Demo mode: nothing is broadcast on-chain; balance drops to ≈ $63.)*

---

## What’s real vs simulated
| Real | Simulated (demo mode) |
|---|---|
| OTP + all branded emails (Resend) | Deposits crediting (⚙ panel) |
| Auth, sessions, dashboard, community | The $20 withdrawal broadcast (fake hash) |
| Studio generate→publish pipeline + the live store | Token prices fixed (USDT=$1) |
| 10B Seva Credit mint, ledger, history | — |

## Going live later
- Turn off the demo flags (`WALLET_DEMO_MODE`, `STUDIO_DEMO_MODE`,
  `NEXT_PUBLIC_DEMO_MODE`) → real chain deposits/withdrawals + real AI generation.
- Real master xpubs + KMS seeds are required for real on-chain addresses/signing.
