import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@googolplex/ui/components/skeleton";
import { Suspense } from "react";

async function getTreasury() {
  const res = await fetch("http://localhost:3001/api/treasury", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch treasury");
  return res.json();
}

function TreasurySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <Skeleton className="h-4 w-[150px]" />
            <Skeleton className="h-6 w-[80px]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-3 w-[200px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function TreasuryList() {
  const wallets = await getTreasury();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {wallets.map((w: any) => (
        <Card key={w.address}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">{w.chain} Platform Wallet</CardTitle>
            <Badge variant="outline">{w.balance}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-xs font-mono text-muted-foreground">{w.address}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function TreasuryPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Treasury Management</h1>
      <Suspense fallback={<TreasurySkeleton />}>
        <TreasuryList />
      </Suspense>
    </div>
  );
}
