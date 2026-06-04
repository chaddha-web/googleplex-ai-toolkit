/**
 * Tron client via TronGrid REST. Avoids tronweb's heavy crypto bundle —
 * we only need read calls (native + TRC20 balanceOf) and don't sign here.
 */

const API = process.env.TRON_API_URL ?? "https://api.trongrid.io";
const KEY = process.env.TRON_API_KEY;

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (KEY) h["TRON-PRO-API-KEY"] = KEY;
  return h;
}

/** TRX balance as a RAW base-unit string (sun, 6 decimals). */
export async function getTrxBalance(address: string): Promise<string> {
  const res = await fetch(`${API}/v1/accounts/${address}`, { headers: headers() });
  if (!res.ok) throw new Error(`TronGrid /accounts ${res.status}`);
  const data: { data?: { balance?: number }[] } = await res.json();
  const sun = data.data?.[0]?.balance ?? 0;
  return BigInt(sun).toString();
}

/** TRC20 balanceOf via trigger_constant_contract. */
export async function getTrc20Balance(opts: {
  holder: string;
  token: string;
  decimals: number;
}): Promise<string> {
  // balanceOf(address) selector = 70a08231; encode holder as 32-byte big-endian.
  const holderHex = base58ToHex(opts.holder).slice(2); // strip 0x → 21 bytes
  // Tron addresses are 21 bytes (0x41 + 20). We need just the trailing 20 bytes
  // padded to 32 for the call.
  const evmHex = holderHex.slice(2); // drop the 0x41 prefix → 20 bytes hex
  const padded = evmHex.padStart(64, "0");
  const parameter = padded;

  const body = {
    contract_address: opts.token,
    owner_address: opts.holder,
    function_selector: "balanceOf(address)",
    parameter,
    visible: true
  };

  const res = await fetch(`${API}/wallet/triggerconstantcontract`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`TronGrid /triggerconstantcontract ${res.status}`);
  const data: { constant_result?: string[] } = await res.json();
  const hex = data.constant_result?.[0] ?? "0";
  const raw = BigInt("0x" + hex);
  return raw.toString();
}

export async function pingTron(): Promise<number> {
  const res = await fetch(`${API}/wallet/getnowblock`, { headers: headers() });
  if (!res.ok) throw new Error(`TronGrid /getnowblock ${res.status}`);
  const data: { block_header?: { raw_data?: { number?: number } } } = await res.json();
  return data.block_header?.raw_data?.number ?? 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Local helpers
// ────────────────────────────────────────────────────────────────────────────

// Pure-JS base58check decode for TRON addresses. We deliberately avoid
// require("bs58check") here: this module runs under ESM (tsx/Node ESM), where
// `require` is undefined — so the old code threw "require is not defined" on
// EVERY TRC20 balance read, silently zeroing all Tron deposits. This decoder
// returns the 21-byte payload (0x41 version + 20 address bytes), checksum
// stripped — matching the previous bs58check.decode() output shape.
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58ToHex(b58: string): string {
  let num = 0n;
  for (const ch of b58) {
    const idx = B58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base58 char '${ch}'`);
    num = num * 58n + BigInt(idx);
  }
  // Count leading '1's → leading zero bytes.
  let leadingZeros = 0;
  for (const ch of b58) {
    if (ch === "1") leadingZeros++;
    else break;
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  hex = "00".repeat(leadingZeros) + hex;
  const full = Buffer.from(hex, "hex"); // version(1) + payload(20) + checksum(4) = 25
  const payload = full.subarray(0, full.length - 4); // strip 4-byte checksum → 21 bytes
  return "0x" + payload.toString("hex");
}
