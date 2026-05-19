// Single entrypoint for every handler service. Pick which handler this process
// is via the HANDLER env var; the dispatcher map and side-effects are defined
// per-handler in `./impl/*`. v1 ships stub side-effects (log + return ok) for
// every action so the proposal lifecycle is end-to-end demoable; real wiring
// (treasury contract calls, Nginx volume mutations, AI orchestration, etc.)
// lands in the per-handler sprints.

import type { HandlerKey } from "@googolplex/dao-actions";
import { runHandler } from "./factory.js";
import { treasuryDispatchers } from "./impl/treasury.js";
import { gasDispatchers } from "./impl/gas.js";
import { aiDispatchers } from "./impl/ai.js";
import { hostingDispatchers } from "./impl/hosting.js";
import { cidDispatchers } from "./impl/cid.js";
import { identityDispatchers } from "./impl/identity.js";

const handler = (process.env.HANDLER ?? "") as HandlerKey;

const registry = {
  treasury: treasuryDispatchers,
  gasRelayer: gasDispatchers,
  aiOrchestrator: aiDispatchers,
  hostingController: hostingDispatchers,
  cidRegistry: cidDispatchers,
  identityRegistry: identityDispatchers,
  governance: undefined // governance-service handles its own "governance.*" kinds in-process
} as const;

const dispatchers = registry[handler];
if (!dispatchers) {
  console.error(`HANDLER env var must be one of: ${Object.keys(registry).filter((k) => k !== "governance").join(", ")}; got "${handler}"`);
  process.exit(1);
}

await runHandler({ name: handler, dispatchers });
