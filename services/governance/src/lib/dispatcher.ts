import type { DaoAction, HandlerKey } from "@googolplex/dao-actions";
import { ACTION_REGISTRY } from "@googolplex/dao-actions";
import type { ReceiptSigner } from "@googolplex/governance-shared";

/** Logical handler → base URL (env-loaded). v1 hardcoded; later use service discovery. */
export type HandlerEndpoints = Record<HandlerKey, string>;

export interface Dispatcher {
  dispatch(proposalId: string, action: DaoAction): Promise<{ ok: boolean; status: number; body: unknown }>;
}

export function createDispatcher(signer: ReceiptSigner, endpoints: HandlerEndpoints): Dispatcher {
  return {
    async dispatch(proposalId, action) {
      const handler = ACTION_REGISTRY[action.kind].handler;
      const base = endpoints[handler];
      if (!base) throw new Error(`No endpoint configured for handler "${handler}"`);

      const receipt = signer.sign(proposalId, action);

      const res = await fetch(`${base}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, receipt })
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    }
  };
}
