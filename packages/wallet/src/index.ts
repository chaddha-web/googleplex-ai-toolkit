// @googolplex/wallet — multi-chain MPC wallet client (skeleton).
// See ADR-001 (MPC key management) and REQ-W1/W2 in docs/PRD.md.

export type ChainId = "ethereum" | "bsc" | "polygon" | "bitcoin" | "tron";

export type Address = string;

export interface Balance {
  chain: ChainId;
  address: Address;
  symbol: string;
  amount: string;
  fiatUsd?: string;
}

// Per-chain adapter — to be implemented in later sprints (M1: EVM only).
export interface ChainAdapter {
  chain: ChainId;
  getBalances(address: Address): Promise<Balance[]>;
  sendTransaction(tx: unknown): Promise<string>;
}

// MPC client interface — wraps the threshold signing flow per ADR-001.
export interface MpcClient {
  createWallet(userId: string): Promise<{ address: Address; chain: ChainId }>;
  signMessage(userId: string, chain: ChainId, payload: Uint8Array): Promise<Uint8Array>;
}

export const SUPPORTED_M1_CHAINS: ChainId[] = ["ethereum", "bsc", "polygon"];
