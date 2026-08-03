/**
 * Secret scrubbing for logs.
 *
 * viem embeds the FULL request URL in its error messages, and our RPC URLs
 * carry the Alchemy API key in the path. So any `log.error(err)` on a failed
 * RPC call — a rate limit, a dropped connection — writes the key to disk. That
 * was happening: 73 occurrences were sitting in the production log.
 *
 * Rather than fix 14 call sites and hope nobody adds a 15th, this runs as a
 * pino serializer so everything logged is scrubbed on the way out.
 *
 * An Alchemy key cannot sign or move funds — it only reads and broadcasts — so
 * this is quota and privacy exposure, not a second theft vector. It still has
 * no business being in a log file.
 */

/** Provider URLs whose path segment after /v2/ (or /rpc/) is a credential. */
const URL_KEY = /(https?:\/\/[\w.-]+\/(?:v2|v3|rpc|api)\/)[A-Za-z0-9_-]{8,}/gi;

/** Bare API keys pulled from the environment, whatever their shape. */
function envSecrets(): string[] {
  const out: string[] = [];
  for (const name of [
    "ETH_RPC_URL",
    "BSC_RPC_URL",
    "POLYGON_RPC_URL",
    "ALCHEMY_API_KEY",
    "ETHERSCAN_API_KEY",
    "INTERNAL_SERVICE_TOKEN",
    "TELEGRAM_BOT_TOKEN"
  ]) {
    const v = process.env[name];
    if (!v) continue;
    // For a URL, the credential is the last path segment.
    const tail = v.includes("://") ? v.split("/").filter(Boolean).pop() : v;
    if (tail && tail.length >= 8) out.push(tail);
  }
  // Longest first, so a key that contains another as a prefix still scrubs whole.
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

let cached: string[] | null = null;

/** Replace every known secret in a string with a marker. */
export function redact(input: string): string {
  if (!input) return input;
  let s = input.replace(URL_KEY, "$1<REDACTED>");
  cached ??= envSecrets();
  for (const secret of cached) {
    if (secret && s.includes(secret)) s = s.split(secret).join("<REDACTED>");
  }
  return s;
}

/** Deep-scrub anything heading for the log. Depth-capped; cycles are safe. */
export function redactDeep(value: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (depth > 6) return value;
  if (typeof value === "string") return redact(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactDeep(v, depth + 1, seen);
  }
  return out;
}

/**
 * pino error serializer. Errors are the leak path that mattered, because that's
 * where viem puts the URL — message, stack, and its own `details`/`metaMessages`.
 */
export function redactedErrorSerializer(err: any): {
  [key: string]: unknown;
  type: string;
  message: string;
  stack: string;
} {
  const out = {
    type: (err && err.name) || "Error",
    message: redact(String((err && err.message) ?? err ?? "")),
    stack: redact(String((err && err.stack) ?? ""))
  } as { [key: string]: unknown; type: string; message: string; stack: string };
  if (!err || typeof err !== "object") return out;
  for (const k of ["code", "status", "shortMessage", "details", "metaMessages", "cause"]) {
    if (err[k] !== undefined) out[k] = redactDeep(err[k]);
  }
  return out;
}

/** Reset the cached env secrets (tests only). */
export function _resetRedactCache(): void {
  cached = null;
}

/**
 * Scrub anything written straight to the console.
 *
 * The pino serializer only sees what goes through the logger. The leak that
 * actually put the key on disk was a `console.warn` in reconcile.ts, which
 * bypasses pino entirely — as would an uncaught rejection, a dependency's own
 * warning, or the next console.log somebody adds. Patching console closes the
 * whole class rather than one instance of it.
 *
 * Idempotent, and deliberately never throws: a logger that can crash the
 * process is worse than the leak it prevents.
 */
let consoleGuarded = false;
export function guardConsole(): void {
  if (consoleGuarded) return;
  consoleGuarded = true;
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        original(...args.map((a) => (typeof a === "string" ? redact(a) : redactDeep(a))));
      } catch {
        original(...args);
      }
    };
  }
}
