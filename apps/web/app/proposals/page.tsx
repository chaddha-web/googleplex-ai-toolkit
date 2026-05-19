import { Card, CardContent } from "@googolplex/ui/components/card";
import { Badge } from "@googolplex/ui/components/badge";
import { Button } from "@googolplex/ui/components/button";
import { Skeleton } from "@googolplex/ui/components/skeleton";
import Link from "next/link";
import { Suspense } from "react";

async function getProposals() {
  const res = await fetch("http://localhost:3000/api/proposals", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch proposals");
  return res.json();
}

function ProposalListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="flex justify-between items-center py-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-3 w-[100px]" />
            </div>
            <Skeleton className="h-6 w-[60px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function ProposalList() {
  const proposals = await getProposals();
  return (
    <div className="space-y-4">
      {proposals.map((p: any) => (
        <Card key={p.id}>
          <CardContent className="flex justify-between items-center py-4">
            <div>
              <h2 className="font-semibold">{p.title}</h2>
              <Badge className="capitalize">{p.lane}</Badge>
            </div>
            <Badge variant={p.status === 'active' ? 'success' : 'outline'}>{p.status}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function ProposalsPage() {
  return (
    <main className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Proposals</h1>
        <Link href="/proposals/new">
          <Button>New Proposal</Button>
        </Link>
      </div>
      <Suspense fallback={<ProposalListSkeleton />}>
        <ProposalList />
      </Suspense>
    </main>
  );
}
