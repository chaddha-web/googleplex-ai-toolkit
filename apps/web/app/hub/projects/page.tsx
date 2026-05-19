import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@googolplex/ui/components/skeleton";
import { Suspense } from "react";

async function getProjects() {
  const res = await fetch("http://localhost:3000/api/hub/projects", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

function ProjectsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-[150px]" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-3 w-[100px]" />
            <Skeleton className="h-3 w-[120px]" />
            <Skeleton className="h-6 w-[80px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function ProjectsList() {
  const projects = await getProjects();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {projects.map((p: any) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>{p.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">Type: {p.type}</div>
            <div className="text-sm">Bounties Paid: {p.bountiesPaid}</div>
            <Badge variant="outline">Sentiment: {p.sentiment}%</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function HubProjectsPage() {
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Project Directory</h1>
      <Suspense fallback={<ProjectsSkeleton />}>
        <ProjectsList />
      </Suspense>
    </div>
  );
}
