import crypto from "node:crypto";
import { db, stmts } from "./db.js";
import { notify } from "./notify.js";

/**
 * Liquidity-exit core. Shared by:
 *   - the user-facing POST /auth/wallet/exit-liquidity (explicit exit), and
 *   - the internal POST /internal/users/:id/exit-liquidity (auto-triggered by
 *     the wallet service when a withdrawal drops the member's total usable
 *     balance below the protected $1 floor).
 *
 * The $1 each member deposits is the protected liquidity backing their 10B
 * personalized tokens. Exiting forfeits the tokens: they're transferred to the
 * admin's holdings and recorded in token_reclaims tagged with the member's
 * reference number (code11). Atomic: the reclaim row and the zeroing of the
 * member's tokens + protected credit happen in one transaction, so we can
 * never move tokens without an audit row (or vice-versa).
 *
 * Returns null when there's nothing to forfeit (no tokens), so callers can
 * treat it as an idempotent no-op.
 */
export type ExitResult = {
  tokens: number;
  usdReleased: number;
  referenceNo: string;
  email: string;
};

export function performLiquidityExit(
  userId: string,
  reason: "explicit" | "withdrawal_floor"
): ExitResult | null {
  const user = stmts.user.byId.get(userId);
  if (!user) return null;

  const tokens = Number(user.tokens_minted) || 0;
  const protectedUsd = Number(user.initial_deposit_credited_usd) || 0;
  if (tokens <= 0) return null; // nothing to forfeit — no-op

  const now = Date.now();
  const tx = db.transaction(() => {
    stmts.reclaim.insert.run({
      id: crypto.randomUUID(),
      user_id: user.id,
      reference_no: user.code11,
      email: user.email,
      tokens,
      usd_released: protectedUsd,
      created_at: now
    });
    stmts.user.exitLiquidity.run({ id: user.id, updated_at: now });
  });
  tx();

  const why =
    reason === "withdrawal_floor"
      ? "withdrew below the protected $1 floor"
      : "explicit exit";
  notify(
    `🔁 <b>Liquidity forfeited</b>\n${user.email}\n` +
      `Ref: <code>${user.code11}</code>\n` +
      `${tokens.toLocaleString()} tokens → admin holdings\n` +
      `${why}`
  );

  return {
    tokens,
    usdReleased: protectedUsd,
    referenceNo: user.code11,
    email: user.email
  };
}
