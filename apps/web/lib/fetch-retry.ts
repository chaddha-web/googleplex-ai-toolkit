/**
 * fetch wrapper with exponential-backoff retry.
 *
 * Retries on:
 *   - network errors (fetch throws)
 *   - HTTP 5xx
 *   - HTTP 429 (respects Retry-After if present)
 *
 * Does NOT retry on other 4xx — those are client errors and won't fix
 * themselves. The caller should pair this with an Idempotency-Key header so
 * the server can dedupe replays.
 */

export type FetchRetryOptions = {
  /** Total attempts including the first one. Defaults to 3. */
  retries?: number;
  /** Base backoff in ms; doubled each retry. Defaults to 400 ms. */
  baseDelayMs?: number;
  /** Random ±jitter ratio. 0.25 means ±25%. Defaults to 0.3. */
  jitter?: number;
  /** Abort signal honoured between attempts. */
  signal?: AbortSignal;
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: FetchRetryOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    baseDelayMs = 400,
    jitter = 0.3,
    signal
  } = opts;

  // Compose any caller-supplied AbortSignal with our own.
  const composed = signal
    ? AbortSignal.any
      ? AbortSignal.any([signal])
      : signal
    : undefined;

  let attempt = 0;
  let lastErr: unknown;

  while (attempt < retries) {
    attempt += 1;
    try {
      const res = await fetch(url, { ...init, signal: composed });
      if (res.ok) return res;

      // 5xx and 429 are retryable; everything else (400-class) is not.
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (!retryable || attempt >= retries) return res;

      const retryAfter = res.headers.get("retry-after");
      const wait = retryAfter
        ? parseRetryAfter(retryAfter)
        : backoff(baseDelayMs, attempt, jitter);
      await sleep(wait, signal);
    } catch (err) {
      lastErr = err;
      // AbortError should not be retried.
      if ((err as Error)?.name === "AbortError") throw err;
      if (attempt >= retries) throw err;
      await sleep(backoff(baseDelayMs, attempt, jitter), signal);
    }
  }

  // Unreachable — the loop always returns or throws — but TS likes a final.
  throw lastErr ?? new Error("fetchWithRetry: exhausted retries");
}

function backoff(base: number, attempt: number, jitter: number): number {
  const exp = base * Math.pow(2, attempt - 1);
  const j = exp * jitter;
  return Math.round(exp - j + Math.random() * (j * 2));
}

function parseRetryAfter(value: string): number {
  // RFC 7231 — either delay-seconds or HTTP-date.
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  return 1000;
}

/**
 * Generate a fresh idempotency key for a request. Uses crypto.randomUUID when
 * available, with a fallback that still produces a 128-bit-ish unique string.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}
