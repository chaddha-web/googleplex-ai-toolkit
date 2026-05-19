// HTTP client for governance-service. Used by apps/admin (create/list/vote)
// and apps/web (list/get). Backend-agnostic — pass the base URL at construction.

import type { ProposalPayload, ProposalRecord } from "./index.js";

export type VoteChoice = "for" | "against" | "abstain";

export interface CastVoteResult {
  ok: true;
  weight: string;
}

export interface GovernanceClient {
  createProposal(payload: ProposalPayload): Promise<ProposalRecord>;
  listProposals(): Promise<ProposalRecord[]>;
  getProposal(id: string): Promise<ProposalRecord>;
  castVote(proposalId: string, voter: string, choice: VoteChoice): Promise<CastVoteResult>;
  closeProposal(id: string): Promise<unknown>;
  executeProposal(id: string): Promise<unknown>;
}

export function createGovernanceClient(baseUrl: string): GovernanceClient {
  const send = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`governance-service ${path} → HTTP ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
  };

  return {
    createProposal: (payload) =>
      send<ProposalRecord>("/proposals", { method: "POST", body: JSON.stringify(payload) }),
    listProposals: () => send<ProposalRecord[]>("/proposals"),
    getProposal: (id) => send<ProposalRecord>(`/proposals/${encodeURIComponent(id)}`),
    castVote: (proposalId, voter, choice) =>
      send<CastVoteResult>(`/proposals/${encodeURIComponent(proposalId)}/votes`, {
        method: "POST",
        body: JSON.stringify({ voter, choice })
      }),
    closeProposal: (id) =>
      send(`/proposals/${encodeURIComponent(id)}/close`, { method: "POST" }),
    executeProposal: (id) =>
      send(`/proposals/${encodeURIComponent(id)}/execute`, { method: "POST" })
  };
}
