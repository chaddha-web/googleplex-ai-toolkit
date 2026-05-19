// @googolplex/dao-actions — typed surface for REQ-G3 (DAO Action Bus).
// Every privileged platform write is modeled as a DaoAction. After a proposal
// passes (Tron-snapshotted token vote, see ADR-006), the governance-service
// dispatches the action to the resolved handler with a signed ExecutionReceipt.
// Shared by apps/admin (proposal builder), apps/web (proposal list),
// governance-service (dispatcher), and each backend handler (receipt verifier).
// See docs/PRD.md §3.2 and docs/ARCHITECTURE.md ADR-006.

export type ChainId = "ethereum" | "bsc" | "polygon" | "bitcoin" | "tron";
export type Hex = `0x${string}`;
export type Address = Hex;

/** Lane assignment from REQ-G4. Sentiment-assisted reduces required token quorum. */
export type ProposalLane = "standard" | "sentiment-assisted";

/** Surface taxonomy mirrors the REQ-G3 table in PRD §3.2. */
export type ActionSurface =
  | "treasury"
  | "gas"
  | "ai"
  | "hosting"
  | "ipfs"
  | "identity"
  | "params";

// ─── Treasury ────────────────────────────────────────────────────────────────

export interface TreasuryTransfer {
  kind: "treasury.transfer";
  token: Address;
  to: Address;
  amount: string;
}

export interface TreasurySwap {
  kind: "treasury.swap";
  srcToken: Address;
  dstToken: Address;
  amount: string;
  dex: string;
}

export interface TreasuryFundEscrow {
  kind: "treasury.fundEscrow";
  projectId: string;
  milestoneId: number;
  amount: string;
}

// ─── Gas abstraction (REQ-W2) ────────────────────────────────────────────────

export interface GasSetFeeBps {
  kind: "gas.setFeeBps";
  chain: ChainId;
  bps: number;
}

export interface GasSetSubsidyCap {
  kind: "gas.setSubsidyCap";
  chain: ChainId;
  amount: string;
}

// ─── AI spend (REQ-AD2) ──────────────────────────────────────────────────────

export interface AiSetModelBudget {
  kind: "ai.setModelBudget";
  model: string;
  dailyCapUsd: number;
}

export interface AiPauseGeneration {
  kind: "ai.pauseGeneration";
  reason: string;
}

// ─── Hosting (REQ-AD2) ───────────────────────────────────────────────────────

export interface HostingTakedown {
  kind: "hosting.takedown";
  subdomain: string;
  reason: string;
}

export interface HostingReinstate {
  kind: "hosting.reinstate";
  subdomain: string;
}

export interface HostingSetTier {
  kind: "hosting.setTier";
  projectId: string;
  tier: "free" | "standard" | "pro" | "enterprise";
}

// ─── IPFS / CIDRegistry (REQ-A3) ─────────────────────────────────────────────

export interface IpfsSetPinningBudget {
  kind: "ipfs.setPinningBudget";
  monthlyUsd: number;
}

export interface IpfsForceUnpinIllegal {
  kind: "ipfs.forceUnpinIllegal";
  cid: string;
}

// ─── Identity (REQ-G2 / ADR-003) ─────────────────────────────────────────────

export interface IdentityEnableProvider {
  kind: "identity.enableProvider";
  name: string;
  configJson: string;
}

export interface IdentityDisableProvider {
  kind: "identity.disableProvider";
  name: string;
}

export interface IdentitySetMinTrustScore {
  kind: "identity.setMinTrustScore";
  action: string;
  score: number;
}

// ─── Params (generic kv slot) ────────────────────────────────────────────────

export interface ParamsSet {
  kind: "params.set";
  key: Hex;
  value: Hex;
}

// ─── Emergency (REQ-G5) ──────────────────────────────────────────────────────

export interface GovernancePauseAll {
  kind: "governance.pauseAll";
  reason: string;
}

export interface GovernanceUnpause {
  kind: "governance.unpause";
}

// ─── Union ───────────────────────────────────────────────────────────────────

export type DaoAction =
  | TreasuryTransfer
  | TreasurySwap
  | TreasuryFundEscrow
  | GasSetFeeBps
  | GasSetSubsidyCap
  | AiSetModelBudget
  | AiPauseGeneration
  | HostingTakedown
  | HostingReinstate
  | HostingSetTier
  | IpfsSetPinningBudget
  | IpfsForceUnpinIllegal
  | IdentityEnableProvider
  | IdentityDisableProvider
  | IdentitySetMinTrustScore
  | ParamsSet
  | GovernancePauseAll
  | GovernanceUnpause;

export type DaoActionKind = DaoAction["kind"];

// ─── Metadata & lane defaults ────────────────────────────────────────────────

export interface ActionMeta {
  kind: DaoActionKind;
  surface: ActionSurface;
  label: string;
  description: string;
  defaultLane: ProposalLane;
  /**
   * Logical handler key (resolved to a concrete address at runtime via `handlerAddresses`).
   * Governor.propose() requires a `targets[]` array — the proposal builder uses this key
   * to pick the right deployed contract to dispatch the encoded calldata to.
   */
  handler: HandlerKey;
}

/**
 * Logical handler identifiers. Each handler is a backend service that exposes
 * `POST /dispatch` accepting `{ action: DaoAction, receipt: ExecutionReceipt }`.
 * The handler verifies the receipt signature before applying the action.
 * Some handlers (treasury, cidRegistry) also call on-chain contracts as part
 * of their dispatch — that's an implementation detail of the handler.
 */
export type HandlerKey =
  | "treasury"
  | "gasRelayer"
  | "aiOrchestrator"
  | "hostingController"
  | "cidRegistry"
  | "identityRegistry"
  | "governance";

export const ACTION_REGISTRY: Record<DaoActionKind, ActionMeta> = {
  "treasury.transfer": { kind: "treasury.transfer", surface: "treasury", label: "Treasury — transfer", description: "Move tokens from treasury to a recipient.", defaultLane: "standard", handler: "treasury" },
  "treasury.swap": { kind: "treasury.swap", surface: "treasury", label: "Treasury — swap", description: "Swap treasury holdings via a DEX.", defaultLane: "standard", handler: "treasury" },
  "treasury.fundEscrow": { kind: "treasury.fundEscrow", surface: "treasury", label: "Treasury — fund escrow", description: "Fund a per-project milestone escrow tranche.", defaultLane: "standard", handler: "treasury" },
  "gas.setFeeBps": { kind: "gas.setFeeBps", surface: "gas", label: "Gas — set fee (bps)", description: "Update gas-abstraction fee percentage per chain.", defaultLane: "standard", handler: "gasRelayer" },
  "gas.setSubsidyCap": { kind: "gas.setSubsidyCap", surface: "gas", label: "Gas — set subsidy cap", description: "Cap subsidies paid out per chain.", defaultLane: "standard", handler: "gasRelayer" },
  "ai.setModelBudget": { kind: "ai.setModelBudget", surface: "ai", label: "AI — set model daily budget", description: "Daily USD cap for an AI model.", defaultLane: "sentiment-assisted", handler: "aiOrchestrator" },
  "ai.pauseGeneration": { kind: "ai.pauseGeneration", surface: "ai", label: "AI — pause generation", description: "Pause all AI generation with reason.", defaultLane: "sentiment-assisted", handler: "aiOrchestrator" },
  "hosting.takedown": { kind: "hosting.takedown", surface: "hosting", label: "Hosting — takedown subdomain", description: "Suspend a hosted user site for ToS violation.", defaultLane: "sentiment-assisted", handler: "hostingController" },
  "hosting.reinstate": { kind: "hosting.reinstate", surface: "hosting", label: "Hosting — reinstate subdomain", description: "Restore a previously taken-down site.", defaultLane: "sentiment-assisted", handler: "hostingController" },
  "hosting.setTier": { kind: "hosting.setTier", surface: "hosting", label: "Hosting — set project tier", description: "Bump or drop a project's hosting tier.", defaultLane: "sentiment-assisted", handler: "hostingController" },
  "ipfs.setPinningBudget": { kind: "ipfs.setPinningBudget", surface: "ipfs", label: "IPFS — set monthly pinning budget", description: "Monthly USD budget for IPFS pinning ops.", defaultLane: "standard", handler: "cidRegistry" },
  "ipfs.forceUnpinIllegal": { kind: "ipfs.forceUnpinIllegal", surface: "ipfs", label: "IPFS — force unpin illegal CID", description: "Unpin a CID identified as illegal content.", defaultLane: "sentiment-assisted", handler: "cidRegistry" },
  "identity.enableProvider": { kind: "identity.enableProvider", surface: "identity", label: "Identity — enable provider", description: "Enable an IdentityProvider adapter.", defaultLane: "sentiment-assisted", handler: "identityRegistry" },
  "identity.disableProvider": { kind: "identity.disableProvider", surface: "identity", label: "Identity — disable provider", description: "Disable an IdentityProvider adapter.", defaultLane: "sentiment-assisted", handler: "identityRegistry" },
  "identity.setMinTrustScore": { kind: "identity.setMinTrustScore", surface: "identity", label: "Identity — set min trust score", description: "Required trust score for a privileged action.", defaultLane: "standard", handler: "identityRegistry" },
  "params.set": { kind: "params.set", surface: "params", label: "Params — set kv", description: "Write a value to governance-service protocolParams (lane assignments, quorum BPS, execution delay).", defaultLane: "standard", handler: "governance" },
  "governance.pauseAll": { kind: "governance.pauseAll", surface: "params", label: "Governance — emergency pause", description: "Freeze all DaoAction dispatchers. Super-majority + high-stakes identity required (REQ-G5).", defaultLane: "standard", handler: "governance" },
  "governance.unpause": { kind: "governance.unpause", surface: "params", label: "Governance — unpause", description: "Resume DaoAction dispatchers. Standard governance.", defaultLane: "standard", handler: "governance" }
};

/**
 * Runtime resolver: logical HandlerKey → deployed contract address per chain.
 * Populated at app boot from deployment artifacts. Used by the proposal builder
 * to compose Governor.propose() `targets[]` arrays.
 */
export type HandlerAddresses = Record<HandlerKey, Address>;

export const ALL_ACTION_KINDS: DaoActionKind[] = Object.keys(ACTION_REGISTRY) as DaoActionKind[];

// ─── Proposal payload (REQ-G3 backend dispatch contract) ─────────────────────

/** Wire-level proposal as submitted to governance-service POST /proposals. */
export interface ProposalPayload {
  /** Action being proposed. */
  action: DaoAction;
  /** Lane (defaults to ACTION_REGISTRY[action.kind].defaultLane if omitted). */
  lane?: ProposalLane;
  /** Human-readable description shown in the proposal feed. */
  description: string;
  /** Tron address of the proposer, for receipt + audit. */
  proposer: Address;
}

/** Stored proposal record returned by governance-service. */
export interface ProposalRecord extends ProposalPayload {
  id: string;
  state: "pending" | "active" | "succeeded" | "defeated" | "delayed" | "executed" | "cancelled";
  /** Tron block at which voting power was snapshotted. */
  snapshotBlock: number;
  snapshotBlockHash: Hex;
  createdAt: number;
  votingEndsAt: number;
  /** Unix seconds when dispatcher will fire if not challenged (REQ-G5). */
  executableAt?: number;
}

/**
 * ExecutionReceipt — signed by governance-service's threshold key (3-of-5 op
 * HSMs per ADR-006 mitigations). Handlers verify this before applying the
 * action. Receipt is single-use (replay protection via `nonce`).
 */
export interface ExecutionReceipt {
  proposalId: string;
  actionKind: DaoActionKind;
  /** Stable hash of canonicalized action payload. */
  actionHash: Hex;
  /** Issued-at unix seconds. */
  issuedAt: number;
  nonce: Hex;
  /** Threshold signature (concatenated partial sigs or aggregated). */
  signature: Hex;
}

/** Verify a receipt at the handler boundary. Implementation lives in governance-service-client. */
export interface ReceiptVerifier {
  verify(receipt: ExecutionReceipt, action: DaoAction): Promise<boolean>;
}

// ─── HTTP client re-export ────────────────────────────────────────────────────
export { createGovernanceClient, type GovernanceClient, type VoteChoice } from "./client";
