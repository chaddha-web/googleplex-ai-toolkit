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

/** TRX balance (decimal string, 6 decimals). */
export async function getTrxBalance(address: string): Promise<string> {
  const res = await fetch(`${API}/v1/accounts/${address}`, { headers: headers() });
  if (!res.ok) throw new Error(`TronGrid /accounts ${res.status}`);
  const data: { data?: { balance?: number }[] } = await res.json();
  const sun = data.data?.[0]?.balance ?? 0;
  return (sun / 1_000_000).toString();
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
  return formatBigDecimal(raw, opts.decimals);
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

function formatBigDecimal(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const s = raw.toString().padStart(decimals + 1, "0");
  const i = s.length - decimals;
  return s.slice(0, i) + "." + s.slice(i).replace(/0+$/, "") || s.slice(0, i);
}

function base58ToHex(b58: string): string {
  // Minimal in-line decoder so we don't import bs58 here too.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bs58check = require("bs58check");
  const bytes: Buffer = bs58check.decode(b58);
  return "0x" + bytes.toString("hex");
}
