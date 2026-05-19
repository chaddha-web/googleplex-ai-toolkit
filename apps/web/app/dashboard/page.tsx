import { EvmAdapter } from "@googolplex/wallet/src/adapters/evm";
import { SUPPORTED_M1_CHAINS, type Balance } from "@googolplex/wallet";
import { WalletWidget } from "@/components/wallet-widget";
import { Suspense } from "react";
import { Skeleton } from "@googolplex/ui/components/skeleton";

// Demo address for unauthenticated dashboard preview. Replace once SIWE sign-in lands (REQ-G2 verified tier).
const DEMO_ADDRESS = process.env.NEXT_PUBLIC_DEMO_ADDRESS ?? "0x0000000000000000000000000000000000000000";

type Project = {
  id: string;
  name: string;
  status: "draft" | "active" | "funded";
  tvlUsd: number;
  openMilestones: number;
};

const MOCK_PROJECTS: Project[] = [
  { id: "p1", name: "Aurora DAO", status: "active", tvlUsd: 124_500, openMilestones: 3 },
  { id: "p2", name: "Pixel Bazaar", status: "funded", tvlUsd: 48_200, openMilestones: 1 },
  { id: "p3", name: "Mesh Bridge", status: "draft", tvlUsd: 0, openMilestones: 0 }
];

const statusStyles: Record<Project["status"], string> = {
  draft: "bg-zinc-700/40 text-zinc-300",
  active: "bg-emerald-700/30 text-emerald-300",
  funded: "bg-indigo-700/30 text-indigo-300"
};

async function loadBalances(address: string): Promise<{ balances: Balance[]; error?: string }> {
  const evmChains = SUPPORTED_M1_CHAINS.filter((c) => c === "ethereum" || c === "bsc" || c === "polygon");
  try {
    const results = await Promise.all(
      evmChains.map((chain) => new EvmAdapter({ chain: chain as "ethereum" | "bsc" | "polygon" }).getBalances(address))
    );
    return { balances: results.flat() };
  } catch (e) {
    return { balances: [], error: e instanceof Error ? e.message : "unknown" };
  }
}

function DashboardSkeleton() {
  return (
    <>
      <section className="mb-10">
        <Skeleton className="w-full h-32 rounded-xl" />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-5 w-[120px]" />
                <Skeleton className="h-4 w-[60px]" />
              </div>
              <div className="space-y-2 mt-4">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-[30px]" />
                  <Skeleton className="h-4 w-[60px]" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-[20px]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

async function DashboardContent() {
  const { balances, error } = await loadBalances(DEMO_ADDRESS);

  return (
    <>
      <section className="mb-10">
        <WalletWidget balances={balances} error={error} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MOCK_PROJECTS.map((p) => (
            <article
              key={p.id}
              className="rounded-lg border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">{p.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded ${statusStyles[p.status]}`}>
                  {p.status}
                </span>
              </div>
              <dl className="text-sm space-y-1 opacity-80">
                <div className="flex justify-between">
                  <dt>TVL</dt>
                  <dd>${p.tvlUsd.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Open milestones</dt>
                  <dd>{p.openMilestones}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-baseline justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm opacity-60 break-all">
            Live balances for <code className="opacity-80">{DEMO_ADDRESS.slice(0, 6)}…{DEMO_ADDRESS.slice(-4)}</code>
          </p>
        </div>
        <button className="px-4 py-2 rounded-md bg-white text-black text-sm font-medium hover:opacity-90 whitespace-nowrap self-start md:self-auto">
          + New Project
        </button>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}