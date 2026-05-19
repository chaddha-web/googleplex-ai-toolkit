import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTION_REGISTRY, type DaoActionKind } from "@googolplex/dao-actions";

export default function ActionFormPage({ params }: { params: { kind: string } }) {
  const kind = decodeURIComponent(params.kind) as DaoActionKind;
  const meta = ACTION_REGISTRY[kind];
  if (!meta) notFound();

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <Link href="/proposals/new" className="text-xs opacity-60 hover:opacity-100">
        ← All actions
      </Link>
      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{meta.label}</h1>
        <p className="opacity-70 mt-1">{meta.description}</p>
        <div className="flex flex-wrap gap-3 mt-3 text-xs opacity-60">
          <span>kind: <code>{meta.kind}</code></span>
          <span>surface: <code>{meta.surface}</code></span>
          <span>handler: <code>{meta.handler}</code></span>
          <span>default lane: <code>{meta.defaultLane}</code></span>
        </div>
      </header>

      <div className="rounded-lg border border-dashed border-white/15 p-6 text-sm opacity-70">
        Form fields for <code>{meta.kind}</code> render here in the next sprint, generated from the
        TypeScript shape in <code>packages/dao-actions</code>. On submit the action will be encoded
        via <code>encodeAction()</code> and posted to <code>GoogolplexGovernor.propose()</code>.
      </div>
    </main>
  );
}
