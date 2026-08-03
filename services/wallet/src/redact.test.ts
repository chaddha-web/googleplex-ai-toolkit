/**
 * Secret-scrubbing tests.
 *
 *   npx tsx src/redact.test.ts
 *
 * The leak this exists to stop: viem embeds the full RPC URL — Alchemy API key
 * and all — into its error messages, and those errors were being logged, stored
 * on failed sweep rows, and pushed to Telegram. 73 copies of the key were
 * sitting in the production log before this.
 */

import assert from "node:assert";

process.env.BSC_RPC_URL = "https://bnb-mainnet.g.alchemy.com/v2/SUPERSECRETKEY123";
process.env.ETHERSCAN_API_KEY = "ETHERSCANKEY9876";

const { redact, redactedErrorSerializer, redactDeep, _resetRedactCache } = await import("./redact.js");
_resetRedactCache();

// ── URL-shaped credentials ────────────────────────────────────────────────
{
  const msg =
    'HTTP request failed. URL: https://bnb-mainnet.g.alchemy.com/v2/SUPERSECRETKEY123 Details: rate limited';
  const out = redact(msg);
  assert.ok(!out.includes("SUPERSECRETKEY123"), "the API key must not survive");
  assert.ok(out.includes("bnb-mainnet.g.alchemy.com"), "the host stays — it's useful and not secret");
  assert.ok(out.includes("<REDACTED>"));
}

// Any provider, not just the one in the env.
{
  const out = redact("failed: https://eth-mainnet.g.alchemy.com/v2/someOtherKeyAAAA");
  assert.ok(!out.includes("someOtherKeyAAAA"), "unknown keys in URL shape are still scrubbed");
}

// ── Bare secrets from the environment ─────────────────────────────────────
{
  const out = redact("etherscan said no, key=ETHERSCANKEY9876");
  assert.ok(!out.includes("ETHERSCANKEY9876"), "bare env secrets are scrubbed too");
}

// ── Nothing to hide, nothing changed ──────────────────────────────────────
{
  const clean = "insufficient funds for gas * price + value";
  assert.equal(redact(clean), clean, "ordinary messages pass through untouched");
  assert.equal(redact(""), "");
}

// ── Error serializer: message, stack and viem's own fields ────────────────
{
  const err: any = new Error(
    "HttpRequestError: https://bnb-mainnet.g.alchemy.com/v2/SUPERSECRETKEY123 returned 429"
  );
  err.details = "URL: https://bnb-mainnet.g.alchemy.com/v2/SUPERSECRETKEY123";
  err.metaMessages = ["Request body: {}", "URL: https://bnb-mainnet.g.alchemy.com/v2/SUPERSECRETKEY123"];
  err.code = -32005;

  const s = JSON.stringify(redactedErrorSerializer(err));
  assert.ok(!s.includes("SUPERSECRETKEY123"), "no key in message, stack, details or metaMessages");
  assert.ok(s.includes("-32005"), "useful diagnostic fields are kept");
  assert.ok(s.includes("429"), "the actual failure is still legible");
}

// ── Deep scrub: cycles and depth must not explode ─────────────────────────
{
  const a: any = { url: "https://bnb-mainnet.g.alchemy.com/v2/SUPERSECRETKEY123" };
  a.self = a; // cycle
  const out = JSON.stringify(redactDeep(a));
  assert.ok(!out.includes("SUPERSECRETKEY123"));
  assert.ok(out.includes("[Circular]"), "cycles are handled, not thrown on");
}
{
  // Non-objects pass through rather than crashing the logger.
  assert.equal(redactDeep(42), 42);
  assert.equal(redactDeep(null), null);
  assert.equal(redactDeep(undefined), undefined);
}

console.log("✓ redaction tests passed");
