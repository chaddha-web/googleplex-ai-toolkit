import type { DispatcherMap } from "../factory.js";

// REQ-AD2 AI orchestrator. Stub maintains in-memory model budgets + pause flag;
// production: enforced inside the brand-kit + site-gen request handlers.
const budgets = new Map<string, number>();
let paused: { paused: boolean; reason?: string } = { paused: false };

export const aiDispatchers: DispatcherMap = {
  "ai.setModelBudget": async (a) => {
    budgets.set(a.model, a.dailyCapUsd);
    console.warn(`[ai] STUB setModelBudget ${a.model} = $${a.dailyCapUsd}/day`);
    return { ok: true, result: { model: a.model, dailyCapUsd: a.dailyCapUsd } };
  },
  "ai.pauseGeneration": async (a) => {
    paused = { paused: true, reason: a.reason };
    console.warn(`[ai] STUB pauseGeneration reason="${a.reason}"`);
    return { ok: true, result: paused };
  }
};
