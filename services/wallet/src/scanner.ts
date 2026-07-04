import { refreshUserDeposits } from "./routes.js";

// Background deposit scanner.
//
// Deposit detection is otherwise pull-based (the member clicks Refresh, which
// runs refreshUserDeposits). A member who deposits but never returns would
// stay stuck at pending_initial_deposit forever — their funds sit on-chain,
// uncredited, and activation never fires. This loop closes that gap.
//
// Scope is deliberately narrow: it only reconciles users the auth service says
// are still awaiting their activation deposit, so RPC load stays bounded to the
// (small) set of not-yet-active members rather than the whole user base.
// ponytail: pending-only + serial reconcile. If active-member ongoing deposits
// ever need auto-credit too, widen the auth query — the per-user logic is
// already shared with the route.

type MiniLog = { info: (...a: any[]) => void; error: (...a: any[]) => void };

const AUTH_BASE = (process.env.AUTH_BASE_URL || "http://localhost:4200").replace(/\/$/, "");
const INTERVAL_MS = Number(process.env.DEPOSIT_SCAN_MS ?? 120_000);

async function fetchPendingUserIds(): Promise<string[]> {
  const res = await fetch(AUTH_BASE + "/internal/wallet/pending-deposit-users", {
    headers: { Authorization: "Bearer " + process.env.INTERNAL_SERVICE_TOKEN }
  });
  if (!res.ok) throw new Error(`pending-deposit-users ${res.status}`);
  const body = (await res.json()) as { userIds?: string[] };
  return body.userIds ?? [];
}

export function startDepositScanner(log: MiniLog): void {
  if (INTERVAL_MS <= 0) {
    log.info("[scanner] disabled (DEPOSIT_SCAN_MS <= 0)");
    return;
  }

  let running = false;
  const tick = async () => {
    if (running) return; // never overlap cycles
    running = true;
    try {
      const ids = await fetchPendingUserIds();
      for (const id of ids) {
        try {
          await refreshUserDeposits(id, log);
        } catch (e) {
          log.error({ err: e, userId: id }, "[scanner] refresh failed for user");
        }
      }
      if (ids.length) log.info(`[scanner] reconciled ${ids.length} pending user(s)`);
    } catch (e) {
      log.error({ err: e }, "[scanner] cycle failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.(); // don't keep the process alive just for the scanner
  log.info(`[scanner] deposit scanner started (every ${INTERVAL_MS}ms)`);
  // Kick one cycle shortly after boot (let RPCs/price feed warm up first).
  setTimeout(tick, 10_000).unref?.();
}
