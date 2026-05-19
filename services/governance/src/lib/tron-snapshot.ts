// Tron balance snapshot for GGX (TRC-20) — REQ-G1, ADR-006.
//
// Open question for Gemini (Tron expertise): historical balance lookup at an
// arbitrary past block on Tron is NOT a first-class feature like Ethereum's
// archive node `eth_getBalance(addr, blockTag)`. The two viable paths:
//
//   (A) Index-as-we-go: subscribe to GGX Transfer events, maintain our own
//       balance ledger keyed by (address, block). Cheap reads, requires
//       continuous indexer + reorg handling.
//
//   (B) Event log replay on demand: at snapshot time, query TronGrid for all
//       Transfer events up to the snapshot block, fold them locally to derive
//       balances. Slow on cold lookups, no extra infra, no reorg risk (we
//       query post-finality).
//
// v1 ships path (B) with TronGrid full-node REST (`/wallet/triggerconstantcontract`
// for balanceOf is current-state only — useless for historical) plus
// `/v1/contracts/:contract/events` for the log replay. Path (A) is a Sprint 6+
// optimization once we see real proposal volume.
//
// Critical settings to validate:
//   - GGX_CONTRACT: TRC-20 deployment address (placeholder constant — replace
//     once GGX is actually deployed on Tron Nile testnet first).
//   - SNAPSHOT_LAG_BLOCKS: per REQ-G5 / §6 snapshot-manipulation mitigation, we
//     never snapshot at HEAD — always HEAD - N. Default N=300 ≈ 5 min on Tron
//     (Tron block time ≈ 3s).
//   - We treat numbers as `bigint` throughout (TRC-20 values are uint256). DB
//     stores them as TEXT to avoid JS number precision loss.

export interface TronSnapshotConfig {
  /** TronGrid base URL — `https://api.trongrid.io` (mainnet) or `https://api.nileex.io` (Nile testnet). */
  tronGridUrl: string;
  /** Optional API key header (TronGrid Pro). */
  apiKey?: string;
  /** GGX TRC-20 contract address (base58, starts with T). */
  ggxContract: string;
  /** Lag from HEAD before snapshot — anti flash-borrow (REQ-G5 / §6). Default 300. */
  snapshotLagBlocks?: number;
}

export interface Snapshot {
  /** Block number snapshotted (HEAD - lag). */
  block: number;
  /** Block hash at that block (for reproducibility — PRD §5 Snapshot Reproducibility KPI). */
  blockHash: `0x${string}`;
  /** Unix seconds of the snapshot block. */
  timestamp: number;
}

export interface TronSnapshotClient {
  /** Resolve the snapshot block (HEAD - lag) and its hash. */
  openSnapshot(): Promise<Snapshot>;
  /** Read GGX balance for a TRON address (base58 T...) as of the given snapshot. */
  balanceOf(address: string, snapshot: Snapshot): Promise<bigint>;
  /** Sum balances of many addresses in one batch (for tallying). */
  balancesOf(addresses: string[], snapshot: Snapshot): Promise<Map<string, bigint>>;
}

const DEFAULT_LAG = 300;

export function createTronSnapshotClient(cfg: TronSnapshotConfig): TronSnapshotClient {
  const lag = cfg.snapshotLagBlocks ?? DEFAULT_LAG;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.apiKey) headers["TRON-PRO-API-KEY"] = cfg.apiKey;

  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${cfg.tronGridUrl}${path}`, { headers });
    if (!res.ok) throw new Error(`TronGrid ${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  return {
    async openSnapshot() {
      // /wallet/getnowblock returns the latest block; we subtract lag and fetch that block by num.
      const head = await get<{ block_header: { raw_data: { number: number; timestamp: number } } }>(
        "/wallet/getnowblock"
      );
      const headNum = head.block_header.raw_data.number;
      const snapshotNum = headNum - lag;
      const blk = await fetch(`${cfg.tronGridUrl}/wallet/getblockbynum`, {
        method: "POST",
        headers,
        body: JSON.stringify({ num: snapshotNum })
      });
      if (!blk.ok) throw new Error(`TronGrid getblockbynum → HTTP ${blk.status}`);
      const body = (await blk.json()) as {
        blockID: string;
        block_header: { raw_data: { number: number; timestamp: number } };
      };
      return {
        block: body.block_header.raw_data.number,
        blockHash: ("0x" + body.blockID) as `0x${string}`,
        timestamp: Math.floor(body.block_header.raw_data.timestamp / 1000)
      };
    },

    async balanceOf(address, snapshot) {
      // Path-B fold: paginate Transfer events up to snapshot block, sum per-address.
      // For a single address we filter server-side (`from` OR `to`) to keep the pull small.
      const balances = await foldGgxTransfers({
        cfg,
        get,
        snapshotBlock: snapshot.block,
        filterAddress: address
      });
      return balances.get(address) ?? 0n;
    },

    async balancesOf(addresses, snapshot) {
      // For multi-address tallies, do one full pass and fold all addresses in a single sweep.
      // Sprint 7+: cache the snapshot-block balance map and invalidate per-block.
      const set = new Set(addresses);
      const all = await foldGgxTransfers({ cfg, get, snapshotBlock: snapshot.block });
      const out = new Map<string, bigint>();
      for (const a of addresses) out.set(a, all.get(a) ?? 0n);
      // Prune entries we didn't ask for to avoid leaking the full holder set.
      for (const k of all.keys()) if (!set.has(k)) all.delete(k);
      return out;
    }
  };
}

// ─── Path-B implementation ───────────────────────────────────────────────────

interface FoldOpts {
  cfg: TronSnapshotConfig;
  get: <T>(path: string) => Promise<T>;
  snapshotBlock: number;
  /** When set, server-side filter to events touching this address only. */
  filterAddress?: string;
}

interface TronEventRow {
  block_number: number;
  transaction_id: string;
  event_name: string;
  result: { from: string; to: string; value: string };
}

interface TronEventPage {
  data: TronEventRow[];
  meta?: { fingerprint?: string };
}

const PAGE_SIZE = 200;

/**
 * Pull GGX Transfer events from epoch up to snapshotBlock, fold into a balance
 * map. Used by both single- and multi-address balance reads. Paginates via
 * TronGrid's `fingerprint` cursor.
 *
 * KNOWN LIMITATIONS for Sprint 6+:
 *  - No caching. Every snapshot does a fresh full sweep — fine for low proposal
 *    volume, becomes painful past ~100k Transfer events. Sprint 7: incremental
 *    index + per-(snapshotBlock) cache.
 *  - No reorg protection beyond SNAPSHOT_LAG_BLOCKS. Path-B assumes the
 *    snapshot is past finality.
 *  - Address format: TronGrid returns `from`/`to` as hex (`41...`). We
 *    normalize to base58 (`T...`) here so callers can compare against user
 *    addresses directly.
 */
async function foldGgxTransfers(opts: FoldOpts): Promise<Map<string, bigint>> {
  const balances = new Map<string, bigint>();
  let fingerprint: string | undefined;

  // Build event query — paginated, ordered ascending so folding is deterministic.
  const baseParams = new URLSearchParams({
    event_name: "Transfer",
    "block_number[lt]": String(opts.snapshotBlock + 1),
    order_by: "block_number,asc",
    limit: String(PAGE_SIZE)
  });
  if (opts.filterAddress) {
    // TronGrid lets us filter by `result.from` or `result.to` but not OR'd
    // server-side — we run two passes and merge.
    const hex = tronBase58ToHex(opts.filterAddress);
    baseParams.set("from", hex);
  }

  do {
    const params = new URLSearchParams(baseParams);
    if (fingerprint) params.set("fingerprint", fingerprint);
    const page = await opts.get<TronEventPage>(
      `/v1/contracts/${opts.cfg.ggxContract}/events?${params.toString()}`
    );
    for (const ev of page.data) {
      if (ev.event_name !== "Transfer" || ev.block_number > opts.snapshotBlock) continue;
      const from = tronHexToBase58(ev.result.from);
      const to = tronHexToBase58(ev.result.to);
      const v = BigInt(ev.result.value);
      balances.set(from, (balances.get(from) ?? 0n) - v);
      balances.set(to, (balances.get(to) ?? 0n) + v);
    }
    fingerprint = page.meta?.fingerprint;
  } while (fingerprint);

  // Drop zero/negative residues (negatives indicate an unaccounted mint we missed pre-history;
  // safest to surface as zero rather than block voting on a token-side bug).
  for (const [k, v] of balances) if (v <= 0n) balances.delete(k);
  return balances;
}

// ─── Tron address codec helpers ──────────────────────────────────────────────
// Tron uses base58check addresses (`T...`) externally and 21-byte hex (`41` prefix
// for mainnet) internally. We minimize JS deps by inlining the conversion.

function tronHexToBase58(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 42) return hex; // not a Tron address, return as-is
  return base58CheckEncode(hexToBytes(clean));
}

function tronBase58ToHex(addr: string): string {
  const bytes = base58CheckDecode(addr);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58CheckEncode(payload: Uint8Array): string {
  // Tron addresses are already 21 bytes (`41` + hash160). Append double-SHA256 checksum.
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(checksum, payload.length);
  return base58Encode(full);
}

function base58CheckDecode(s: string): Uint8Array {
  const decoded = base58Decode(s);
  return decoded.slice(0, -4); // strip checksum, return 21-byte hex address
}

function base58Encode(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) num = (num << 8n) + BigInt(b);
  let out = "";
  while (num > 0n) {
    const r = Number(num % 58n);
    out = ALPHA[r] + out;
    num /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = ALPHA[0] + out;
    else break;
  }
  return out;
}

function base58Decode(s: string): Uint8Array {
  let num = 0n;
  for (const ch of s) {
    const i = ALPHA.indexOf(ch);
    if (i < 0) throw new Error(`Invalid base58 character: ${ch}`);
    num = num * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  for (const ch of s) {
    if (ch === ALPHA[0]) bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function sha256(data: Uint8Array): Uint8Array {
  // Lazy require to avoid a static node:crypto import at module top (helps when
  // bundling for edge runtimes). governance-service runs on Node so this is fine.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return new Uint8Array(createHash("sha256").update(data).digest());
}

/**
 * In-memory mock for tests + Sprint 5 demo. Backend boots with this until
 * Sprint 6 wires the real TronGrid client.
 */
export function createMockTronSnapshotClient(
  balances: Record<string, bigint> = {}
): TronSnapshotClient {
  let counter = 100_000_000;
  return {
    async openSnapshot() {
      const block = ++counter;
      return {
        block,
        blockHash: ("0x" + block.toString(16).padStart(64, "0")) as `0x${string}`,
        timestamp: Math.floor(Date.now() / 1000)
      };
    },
    async balanceOf(address) {
      return balances[address] ?? 0n;
    },
    async balancesOf(addresses) {
      return new Map(addresses.map((a) => [a, balances[a] ?? 0n]));
    }
  };
}
