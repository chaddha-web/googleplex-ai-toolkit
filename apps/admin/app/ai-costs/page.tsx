import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

async function getAiCosts() {
  const res = await fetch("http://localhost:3001/api/ai-costs", { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function AiCostsPage() {
  const costs = await getAiCosts();

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">AI Model Costs</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {costs.map((c: any) => (
          <Card key={c.model}>
            <CardHeader>
              <CardTitle>{c.model}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Daily Spend: {c.dailySpend}</p>
              <p>Daily Cap: {c.cap}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
