// @googolplex/identity — pluggable Sybil-resistance / identity verification.
// See ADR-003 in docs/ARCHITECTURE.md and REQ-G2 in docs/PRD.md.

export type IdentityTier = "baseline" | "verified" | "high-stakes";

export interface IdentityVerification {
  tier: IdentityTier;
  // 0.0 (untrusted) to 1.0 (fully trusted). Used as a multiplier on the social-consensus vote weight.
  score: number;
  provider: string;
  verifiedAt: number;
}

export interface IdentityProvider {
  readonly name: string;
  readonly tier: IdentityTier;
  verify(userId: string, payload?: unknown): Promise<IdentityVerification>;
}

// Registry helper — adapters (hCaptcha, SIWE, Worldcoin, Gitcoin Passport) register themselves here.
export class IdentityRegistry {
  private providers = new Map<string, IdentityProvider>();

  register(provider: IdentityProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): IdentityProvider | undefined {
    return this.providers.get(name);
  }

  list(): IdentityProvider[] {
    return [...this.providers.values()];
  }
}
