import {
  createTronSnapshotClient,
  createMockTronSnapshotClient,
  type TronSnapshotClient
} from "./tron-snapshot.js";

let client: TronSnapshotClient | null = null;

/**
 * The GGX snapshot client used for token-weighted voting. Uses the real TronGrid
 * client when GGX is configured (GGX_CONTRACT + TRON_GRID_URL); otherwise falls
 * back to the in-memory mock so the token-weighted flow works end-to-end until
 * the token is actually deployed on Tron.
 */
export function snapshotClient(): TronSnapshotClient {
  if (client) return client;
  const ggxContract = process.env.GGX_CONTRACT;
  const tronGridUrl = process.env.TRON_GRID_URL;
  if (ggxContract && tronGridUrl) {
    client = createTronSnapshotClient({
      ggxContract,
      tronGridUrl,
      apiKey: process.env.TRON_API_KEY,
      snapshotLagBlocks: process.env.SNAPSHOT_LAG_BLOCKS
        ? Number(process.env.SNAPSHOT_LAG_BLOCKS)
        : undefined
    });
  } else {
    client = createMockTronSnapshotClient();
  }
  return client;
}

/** True once GGX is deployed + configured (real weights instead of mock). */
export function tokenWeightedLive(): boolean {
  return !!(process.env.GGX_CONTRACT && process.env.TRON_GRID_URL);
}
