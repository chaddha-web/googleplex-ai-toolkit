import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@googolplex/ui/components/skeleton";
import { Suspense } from "react";

async function getAuditLogs() {
  const res = await fetch("http://localhost:3001/api/audit-log", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json();
}

function AuditSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 flex gap-4">
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-4 w-[50px]" />
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-4 w-[80px] ml-auto" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function AuditList() {
  const logs = await getAuditLogs();
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 uppercase text-[10px] font-bold">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Proposal ID</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3 text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logs.map((l: any, i: number) => (
              <tr key={i} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 font-mono text-xs">{l.event}</td>
                <td className="px-4 py-3">{l.id}</td>
                <td className="px-4 py-3 font-mono text-[10px]">{l.user}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{new Date(l.timestamp).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default async function AuditLogPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Audit Log</h1>
      <Suspense fallback={<AuditSkeleton />}>
        <AuditList />
      </Suspense>
    </div>
  );
}

