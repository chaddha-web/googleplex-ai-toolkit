import type { Balance, ChainId } from "@googolplex/wallet";

const chainLabel: Record<ChainId, string> = {
  ethereum: "Ethereum",
  bsc: "BSC",
  polygon: "Polygon",
  bitcoin: "Bitcoin",
  tron: "Tron"
};

export interface WalletWidgetProps {
  balances: Balance[];
  error?: string;
}

export function WalletWidget({ balances, error }: WalletWidgetProps) {
  const totalUsd = balances.reduce((sum, b) => sum + Number(b.fiatUsd ?? 0), 0);

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/0 p-6">
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-xs uppercase tracking-wider opacity-60">Aggregate balance</span>
        <span className="text-xs opacity-50">{error ? "offline" : "live"}</span>
      </div>
      {error ? (
        <div className="text-sm text-red-300/80 mb-4">RPC error: {error}</div>
      ) : (
        <div className="text-4xl font-semibold mb-6">
          ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      )}
      <ul className="grid grid-cols-3 gap-3 text-sm">
        {balances.map((b) => (
          <li
            key={`${b.chain}-${b.address}`}
            className="rounded-md bg-white/5 px-3 py-2 flex flex-col"
          >
            <span className="text-xs opacity-60">{chainLabel[b.chain]}</span>
            <span className="font-medium">
              {b.amount} {b.symbol}
            </span>
            {b.fiatUsd && <span className="text-xs opacity-50">${Number(b.fiatUsd).toLocaleString()}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
