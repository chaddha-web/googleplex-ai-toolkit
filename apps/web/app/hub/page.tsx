import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function HubPage() {
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Hub</h1>
      <Card>
        <CardContent>
          <p>Global Activity Feed...</p>
        </CardContent>
      </Card>
    </div>
  );
}
