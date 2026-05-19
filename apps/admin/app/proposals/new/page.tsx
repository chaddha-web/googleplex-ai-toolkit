import Link from "next/link";
import { ACTION_REGISTRY, ALL_ACTION_KINDS, type ActionSurface } from "@googolplex/dao-actions";

const surfaceLabel: Record<ActionSurface, string> = {
  treasury: "Treasury",
  gas: "Gas abstraction",
  ai: "AI spend",
  hosting: "Hosting",
  ipfs: "IPFS",
  identity: "Identity",
  params: "Params / governance"
};

const surfaceOrder: ActionSurface[] = [
  "treasury",
  "gas",
  "ai",
  "hosting",
  "ipfs",
  "identity",
  "params"
];

export default function NewProposalPage() {
  const grouped = surfaceOrder.map((surface) => ({
    surface,
    actions: ALL_ACTION_KINDS
      .map((k) => ACTION_REGISTRY[k])
      .filter((a) => a.surface === surface)
  }));

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">New proposal</h1>
        <p className="opacity-70 max-w-2xl">
          Pick an action surface. Every option below is a typed{" "}
          <code>DaoAction</code> (REQ-G3) that compiles to <code>Governor.propose()</code> calldata.
          Selecting an action opens its form; the form posts to the proposal builder which
          submits on-chain — token holders then vote, the timelock runs, and{" "}
          <code>execute()</code> dispatches the action.
        </p>
      </header>

      <div className="space-y-8">
        {grouped.map(({ surface, actions }) => (
          <section key={surface}>
            <h2 className="text-sm uppercase tracking-wider opacity-50 mb-3">
              {surfaceLabel[surface]}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {actions.map((a) => (
                <Link
                  key={a.kind}
                  href={`/proposals/new/${encodeURIComponent(a.kind)}`}
                  className="block rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-medium">{a.label}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        a.defaultLane === "sentiment-assisted"
                          ? "bg-emerald-700/30 text-emerald-300"
                          : "bg-zinc-700/40 text-zinc-300"
                      }`}
                    >
                      {a.defaultLane}
                    </span>
                  </div>
                  <p className="text-sm opacity-70">{a.description}</p>
                  <div className="flex justify-between items-center mt-2 text-xs opacity-40">
                    <code>{a.kind}</code>
                    <span>→ <code>{a.handler}</code></span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
