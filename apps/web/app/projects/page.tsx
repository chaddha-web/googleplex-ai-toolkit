import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function ProjectsPage() {
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Projects</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
            <CardHeader><CardTitle>Project Alpha</CardTitle></CardHeader>
            <CardContent><p>TVL: $500k</p></CardContent>
        </Card>
      </div>
    </div>
  );
}
