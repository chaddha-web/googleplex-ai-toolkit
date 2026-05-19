// hCaptcha IdentityProvider — baseline tier (ADR-003 / REQ-G2).
// Calls hCaptcha's siteverify endpoint with the secret + user-supplied token.

import type { IdentityProvider, IdentityVerification } from "../index.js";

export interface HcaptchaPayload {
  token: string;
  remoteIp?: string;
}

export interface HcaptchaOptions {
  secret: string;
  endpoint?: string;
}

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export class HcaptchaProvider implements IdentityProvider {
  readonly name = "hcaptcha";
  readonly tier = "baseline" as const;
  private readonly opts: Required<HcaptchaOptions>;

  constructor(opts: HcaptchaOptions) {
    this.opts = {
      secret: opts.secret,
      endpoint: opts.endpoint ?? "https://api.hcaptcha.com/siteverify"
    };
  }

  async verify(_userId: string, payload?: HcaptchaPayload): Promise<IdentityVerification> {
    if (!payload?.token) {
      throw new Error("HcaptchaProvider.verify: missing token");
    }

    const body = new URLSearchParams({
      secret: this.opts.secret,
      response: payload.token
    });
    if (payload.remoteIp) body.set("remoteip", payload.remoteIp);

    const res = await fetch(this.opts.endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });

    if (!res.ok) {
      throw new Error(`HcaptchaProvider.verify: HTTP ${res.status}`);
    }

    const json = (await res.json()) as SiteverifyResponse;

    return {
      tier: "baseline",
      score: json.success ? 1.0 : 0.0,
      provider: this.name,
      verifiedAt: Date.now()
    };
  }
}
