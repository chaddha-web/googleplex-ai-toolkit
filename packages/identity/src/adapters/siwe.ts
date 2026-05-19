// SIWE (Sign-In With Ethereum) IdentityProvider — verified tier (ADR-003 / REQ-G2).
// Skeleton: defines the interface contract and return shape. Real verification
// (EIP-4361 message parsing + signature recovery + min wallet-age check) lands in a later sprint.

import type { IdentityProvider, IdentityVerification } from "../index.js";

export interface SiwePayload {
  message: string;
  signature: `0x${string}`;
  address: `0x${string}`;
}

export interface SiweOptions {
  // Minimum on-chain age (in days) before a wallet earns the "verified" tier.
  minWalletAgeDays?: number;
  // Minimum tx count.
  minTxCount?: number;
}

export class SiweProvider implements IdentityProvider {
  readonly name = "siwe";
  readonly tier = "verified" as const;
  private readonly opts: Required<SiweOptions>;

  constructor(opts: SiweOptions = {}) {
    this.opts = {
      minWalletAgeDays: opts.minWalletAgeDays ?? 30,
      minTxCount: opts.minTxCount ?? 5
    };
  }

  async verify(_userId: string, _payload?: SiwePayload): Promise<IdentityVerification> {
    // TODO(sprint-N): parse EIP-4361 message, recover signer, check wallet age + tx count.
    throw new Error("SiweProvider.verify not yet implemented");
  }
}
