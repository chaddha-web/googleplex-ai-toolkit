# @googolplex/wallet-service

Custodial wallet infrastructure for the GoogolPlex platform.

This pass covers **address derivation and balance reads**. Signing,
sweeping, and the watcher cron come in subsequent passes — but the
foundation here lets you verify your RPC keys and KMS setup against
the live chains today.

## Architecture (current pass)

```
                ┌───────────────────────────────────────────┐
   one-shot     │  init-seeds                               │
   bootstrap    │    • generate 3 BIP-39 mnemonics          │
                │    • derive account-level xpubs           │
                │    • KMS-encrypt the mnemonics, write     │
                │      ciphertexts to data/seeds/*.bin      │
                │    • print xpubs for .env                 │
                └───────────────────────────────────────────┘

   per-user     ┌───────────────────────────────────────────┐
   on signup    │  deriveUserAddresses(userIndex, xpubs)    │
                │    • pure-local, no RPC, microseconds     │
                │    • returns { eth, bsc, polygon, tron, btc } │
                └───────────────────────────────────────────┘

   periodic     ┌───────────────────────────────────────────┐
   (future)     │  watcher cron (next pass)                 │
                │    • calls getXxxBalance per address      │
                │    • diffs vs last snapshot               │
                │    • credits ledger                       │
                │    • queues sweep when threshold hit      │
                └───────────────────────────────────────────┘
```

## What's here

```
services/wallet/
├── src/
│   ├── tokens.ts          # supported assets registry (ETH/BNB/TRX/BTC + USDT/USDC/PARTY)
│   ├── hd.ts              # BIP-44 derivation + per-chain address encoding
│   ├── kms.ts             # AWS KMS envelope encryption for seeds
│   └── chain/
│       ├── eth.ts         # viem client, native + ERC20 reads
│       ├── bsc.ts         # viem client, native + BEP20 reads
│       ├── polygon.ts     # viem client, native POL + ERC20 reads
│       ├── tron.ts        # TronGrid REST, native + TRC20 reads
│       └── btc.ts         # mempool.space REST, native balance
├── bin/
│   ├── check-rpcs.ts      # ping every RPC, ✓/✗
│   ├── init-seeds.ts      # one-shot bootstrap (run ONCE per env)
│   ├── derive.ts          # print addresses for a user index
│   └── check-balances.ts  # live balance read for any address
├── data/                  # gitignored — seed ciphertexts live here
├── .env.example
└── README.md
```

## Setup, end to end

1. **Copy env template:**
   ```
   cp services/wallet/.env.example services/wallet/.env
   ```
2. **Fill in `.env`:** drop in your `ETH_RPC_URL`, `TRON_API_KEY`,
   `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   `KMS_KEY_ID`. Polygon reuses the same Alchemy key as Ethereum
   (`POLYGON_RPC_URL`) so the deposit indexer gets full transfer history.
   The BSC and BTC URLs already have sensible public defaults baked in.
3. **Verify RPCs reachable:**
   ```
   cd services/wallet
   npm run check-rpcs
   ```
   You should see `✓ block <N>` for all five chains.
4. **Generate the master seeds (one-time):**
   ```
   npm run init-seeds
   ```
   This:
   - Generates 3 brand-new BIP-39 mnemonics (EVM, BTC, Tron)
   - KMS-encrypts each one and writes the ciphertext to
     `data/seeds/{evm,btc,tron}.bin`
   - Prints the three xpubs — **copy them into your `.env`** under
     `EVM_MASTER_XPUB`, `BTC_MASTER_XPUB`, `TRON_MASTER_XPUB`
   - The mnemonics themselves are never written to disk or printed.
     They live only inside KMS from this point on.
5. **Derive a user's addresses:**
   ```
   npm run derive -- 0      # user #0
   npm run derive -- 1      # user #1
   ```
6. **Check what's at an address:**
   ```
   npm run balances -- eth  0xAbC...
   npm run balances -- tron T...
   ```

## Security model

| What | Where it lives | If app server is compromised |
|---|---|---|
| Mnemonic plaintext | Never on disk; only briefly in app memory during signing (future pass) | Bounded to whatever signs while attacker is in |
| Encrypted ciphertext | `data/seeds/<chain>.bin` | Useless without KMS:Decrypt IAM permission |
| KMS key | Inside AWS HSM | Can never be extracted |
| Account-level xpub | `.env` (public information) | No signing capability, only enables derivation |
| Per-user addresses | Derived on demand, optionally cached in DB | Public — anyone can see what's at them |

To rotate keys: provision a new KMS key, re-encrypt the existing
ciphertexts with the new key (KMS `ReEncrypt`), delete the old
ciphertexts. Addresses don't change.

## Token allowlist (`src/tokens.ts`)

Adding a new asset is one entry. **Always verify the contract address
and decimals on the relevant block explorer first** — anyone can deploy
a contract called "USDC."

Current registry:

| Symbol | Chain | Decimals | Note |
|---|---|---|---|
| ETH | Ethereum | 18 | native |
| BNB | BSC | 18 | native |
| POL | Polygon | 18 | native (renamed from MATIC, Sept 2024) |
| TRX | Tron | 6 | native |
| BTC | Bitcoin | 8 | native |
| USDC | Ethereum (ERC20) | 6 | |
| USDT | Ethereum (ERC20) | 6 | |
| USDT | BSC (BEP20) | 18 | yes, 18 not 6 |
| USDC | BSC (BEP20) | 18 | |
| USDC | Polygon | 6 | native Circle USDC — **not** the bridged USDC.e |
| USDT | Polygon | 6 | |
| USDT | Tron (TRC20) | 6 | |
| PARTY | Tron (TRC20) | **6 (assumed)** | ⚠ confirm on tronscan |

## Next pass

- Watcher service: cron every 30 min, polls all known user addresses,
  credits ledger on positive deltas
- Sweep planner: when balance > threshold, queue sweep tx (no signing
  yet — admin reviews queue)
- KMS-based transaction signer for sweeps + withdrawals
- Postgres schema for `user_wallet_addresses`, `deposits`, `sweeps`,
  `withdrawals`
- Wire `services/auth` signup hook → allocate userIndex + insert addresses
