import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ProjectKanbanPage({ params }: { params: { id: string } }) {
  const columns = ["Backlog", "In Progress", "Review", "Done"];
  const milestones = [
    { id: 'm1', title: 'Smart Contract Audit', status: 'Backlog', bounty: '1000 GGX' },
    { id: 'm2', title: 'Landing Page v1', status: 'Review', bounty: '500 GGX' }
  ];

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Project #{params.id}</h1>
        <Button>New Milestone</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {columns.map(col => (
          <div key={col} className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground px-2">{col}</h2>
            <div className="min-h-[500px] p-2 bg-muted/20 rounded-lg border-2 border-dashed border-transparent hover:border-muted-foreground/20 transition-colors space-y-3">
              {milestones.filter(m => m.status === col).map(m => (
                <Card key={m.id} className="cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors">
                  <CardContent className="p-3 space-y-2">
                    <div className="text-sm font-medium">{m.title}</div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">{m.bounty}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6">...</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {milestones.filter(m => m.status === col).length === 0 && (
                <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground italic">
                  Drop here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
