import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

async function getSybilData() {
  const res = await fetch("http://localhost:3001/api/sybil", { cache: "no-store" });
  if (!res.ok) return { totalFlagged: 0, recentAnomalies: [] };
  return res.json();
}

export default async function SybilConsolePage() {
  const data = await getSybilData();

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Sybil Console</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sybil Detection Analytics: {data.totalFlagged} total flagged</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.recentAnomalies.map((a: any) => (
              <li key={a.id} className="text-sm">
                {a.proposal} - Spike: {a.spike} - {new Date(a.timestamp).toLocaleString()}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
