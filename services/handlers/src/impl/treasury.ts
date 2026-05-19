import type { DispatcherMap } from "../factory.js";
import type { TreasuryTransfer, TreasurySwap } from "@googolplex/dao-actions";

const WALLET_SERVICE_URL = process.env.WALLET_SERVICE_URL || "http://localhost:4201";
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

export const treasuryDispatchers: DispatcherMap = {
  "treasury.transfer": async (action) => {
    const a = action as TreasuryTransfer;
    try {
      const res = await fetch(`${WALLET_SERVICE_URL}/wallet/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${INTERNAL_SERVICE_TOKEN}`
        },
        body: JSON.stringify({
          // Note: Spec for treasury.transfer in dao-actions does not have 'chain'.
          // We need to infer it or update the dao-actions spec if necessary.
          // Assuming 'chain' might need to be extracted from 'token' metadata or similar.
          // For now, passing 'token' as symbol directly as a placeholder.
          symbol: a.token,
          amountRaw: a.amount,
          destAddress: a.to
        })
      });
      if (!res.ok) throw new Error(`Wallet transfer failed: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`[treasury] Transfer failed:`, e);
      return { ok: false, error: "Transfer failed" };
    }
  },
  "treasury.swap": async (action) => {
    const a = action as TreasurySwap;
    try {
      const res = await fetch(`${WALLET_SERVICE_URL}/wallet/swaps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${INTERNAL_SERVICE_TOKEN}`
        },
        body: JSON.stringify({
          fromSymbol: a.srcToken,
          fromRaw: a.amount,
          toSymbol: a.dstToken
        })
      });
      if (!res.ok) throw new Error(`Wallet swap failed: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`[treasury] Swap failed:`, e);
      return { ok: false, error: "Swap failed" };
    }
  },
  "treasury.fundEscrow": async (a) => {
    console.warn(`[treasury] STUB fundEscrow project=${a.projectId} milestone=${a.milestoneId} amount=${a.amount}`);
    return { ok: true, result: { milestoneId: a.milestoneId } };
  }
};
