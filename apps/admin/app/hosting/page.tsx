import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@googolplex/ui/components/skeleton";
import { Suspense } from "react";

async function getDeployments() {
  const res = await fetch("http://localhost:3001/api/hosting", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch deployments");
  return res.json();
}

function HostingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-3 w-[150px]" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-6 w-[80px]" />
              <Skeleton className="h-8 w-[100px]" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function DeploymentsList() {
  const deployments = await getDeployments();
  return (
    <div className="space-y-4">
      {deployments.map((d: any) => (
        <Card key={d.name}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-bold">{d.url}</div>
              <div className="text-xs text-muted-foreground">Internal name: {d.name}</div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={d.status === 'active' ? 'success' : 'destructive'}>{d.status}</Badge>
              <Button size="sm" variant={d.status === 'active' ? 'destructive' : 'outline'}>
                {d.status === 'active' ? 'Propose Takedown' : 'Reinstate'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function HostingPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Hosting Controller</h1>
      <Suspense fallback={<HostingSkeleton />}>
        <DeploymentsList />
      </Suspense>
    </div>
  );
}
