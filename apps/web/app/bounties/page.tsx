import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@googolplex/ui/components/skeleton";
import { Suspense } from "react";

async function getBounties() {
  const res = await fetch("http://localhost:3000/api/bounties", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch bounties");
  return res.json();
}

function BountiesSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-3 w-[100px]" />
            </div>
            <Skeleton className="h-6 w-[60px]" />
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Skeleton className="h-6 w-[60px]" />
            <Skeleton className="h-8 w-[100px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function BountiesList() {
  const bounties = await getBounties();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {bounties.map((b: any) => (
        <Card key={b.id} className="hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>{b.title}</CardTitle>
              <div className="text-xs text-muted-foreground">Project: {b.project}</div>
            </div>
            <Badge variant="success">{b.amount}</Badge>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Badge variant="outline">{b.tag}</Badge>
            <Button size="sm">Claim Bounty</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function BountiesPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Freelancer Marketplace</h1>
      <Suspense fallback={<BountiesSkeleton />}>
        <BountiesList />
      </Suspense>
    </div>
  );
}
