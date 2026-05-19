import type { DispatcherMap } from "../factory.js";

// REQ-G2 / ADR-003 identity registry. Stub maintains an in-memory provider
// enable/disable state + min-trust-score per action.
const providers = new Map<string, { enabled: boolean; configJson: string }>();
const minScore = new Map<string, number>();

export const identityDispatchers: DispatcherMap = {
  "identity.enableProvider": async (a) => {
    providers.set(a.name, { enabled: true, configJson: a.configJson });
    console.warn(`[identity] STUB enableProvider ${a.name}`);
    return { ok: true, result: { name: a.name } };
  },
  "identity.disableProvider": async (a) => {
    const cur = providers.get(a.name);
    providers.set(a.name, { enabled: false, configJson: cur?.configJson ?? "{}" });
    console.warn(`[identity] STUB disableProvider ${a.name}`);
    return { ok: true, result: { name: a.name } };
  },
  "identity.setMinTrustScore": async (a) => {
    minScore.set(a.action, a.score);
    console.warn(`[identity] STUB setMinTrustScore ${a.action} = ${a.score}`);
    return { ok: true, result: { action: a.action, score: a.score } };
  }
};
