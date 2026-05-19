import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@googolplex/ui/components/skeleton";
import { Suspense } from "react";

async function getParams() {
  const res = await fetch("http://localhost:3001/api/params", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch parameters");
  return res.json();
}

function ParamsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-3 w-[150px]" />
            </div>
            <div className="flex items-center gap-6">
              <Skeleton className="h-4 w-[60px]" />
              <Skeleton className="h-8 w-[100px]" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function ParamsList() {
  const params = await getParams();
  return (
    <div className="space-y-4">
      {params.map((p: any) => (
        <Card key={p.key}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-sm font-bold">{p.key}</div>
              <div className="text-xs text-muted-foreground">{p.description}</div>
            </div>
            <div className="flex items-center gap-6">
              <div className="font-mono text-success">{p.value}</div>
              <Button size="sm" variant="outline">Propose Change</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function ParamsPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Protocol Parameters</h1>
      <Suspense fallback={<ParamsSkeleton />}>
        <ParamsList />
      </Suspense>
    </div>
  );
}

