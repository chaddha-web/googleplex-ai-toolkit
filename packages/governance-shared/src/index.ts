// ExecutionReceipt signing — v1 uses a single HMAC-SHA256 key per ADR-006
// migration plan. Sprint 6+ swaps for 3-of-5 threshold signatures.

import { createHmac, randomBytes } from "node:crypto";
import type { DaoAction, ExecutionReceipt, DaoActionKind, Hex } from "@googolplex/dao-actions";

export interface ReceiptSigner {
  sign(proposalId: string, action: DaoAction): ExecutionReceipt;
  verify(receipt: ExecutionReceipt, action: DaoAction): boolean;
}

export function canonicalActionHash(action: DaoAction): Hex {
  // Deterministic JSON: sort keys so two equivalent actions hash identically.
  const sortedKeys = Object.keys(action).sort();
  const canonical = sortedKeys.map((k) => `${k}:${JSON.stringify((action as unknown as Record<string, unknown>)[k])}`).join("|");
  return ("0x" + createHmac("sha256", "canonical-action").update(canonical).digest("hex")) as Hex;
}

export function createReceiptSigner(secret: string): ReceiptSigner {
  if (!secret || secret.length < 32) {
    throw new Error("Receipt signer secret must be at least 32 chars");
  }
  return {
    sign(proposalId, action) {
      const nonce = ("0x" + randomBytes(16).toString("hex")) as Hex;
      const actionHash = canonicalActionHash(action);
      const issuedAt = Math.floor(Date.now() / 1000);
      const msg = `${proposalId}|${action.kind}|${actionHash}|${issuedAt}|${nonce}`;
      const signature = ("0x" + createHmac("sha256", secret).update(msg).digest("hex")) as Hex;
      return {
        proposalId,
        actionKind: action.kind,
        actionHash,
        issuedAt,
        nonce,
        signature
      };
    },
    verify(receipt, action) {
      if (receipt.actionKind !== action.kind) return false;
      const expectedHash = canonicalActionHash(action);
      if (receipt.actionHash !== expectedHash) return false;
      const msg = `${receipt.proposalId}|${receipt.actionKind}|${receipt.actionHash}|${receipt.issuedAt}|${receipt.nonce}`;
      const expected = "0x" + createHmac("sha256", secret).update(msg).digest("hex");
      return expected === receipt.signature;
    }
  };
}

// Convenience for handlers (mirrors what each backend handler will import).
export function verifyReceiptOrThrow(signer: ReceiptSigner, receipt: ExecutionReceipt, action: DaoAction, kind: DaoActionKind): void {
  if (receipt.actionKind !== kind) throw new Error(`Receipt kind mismatch: expected ${kind} got ${receipt.actionKind}`);
  if (!signer.verify(receipt, action)) throw new Error("Invalid ExecutionReceipt signature");
}
