import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@googolplex/ui/components/skeleton";
import { Suspense } from "react";

async function getActivity() {
  const res = await fetch("http://localhost:3000/api/hub/activity", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

function ActivitySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 flex justify-between items-center">
            <div className="space-y-2">
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-3 w-[200px]" />
            </div>
            <Skeleton className="h-4 w-[80px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function ActivityList() {
  const activities = await getActivity();
  return (
    <div className="space-y-4">
      {activities.map((a: any) => (
        <Card key={a.id}>
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <div className="font-bold">{a.action}</div>
              <div className="text-xs text-muted-foreground">{a.details}</div>
            </div>
            <div className="text-xs text-muted-foreground">{new Date(a.timestamp).toLocaleTimeString()}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function HubActivityPage() {
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Global Activity Feed</h1>
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityList />
      </Suspense>
    </div>
  );
}
