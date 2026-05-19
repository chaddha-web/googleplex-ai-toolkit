import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ACTION_REGISTRY } from "@googolplex/dao-actions";

export default function NewProposalPage() {
  // Filters out treasury actions for community-facing form per 5.6
  const communityActions = Object.entries(ACTION_REGISTRY).filter(([_, meta]) => meta.handler !== 'treasury');

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <h1 className="text-3xl font-bold">Submit New Proposal</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Proposal Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input placeholder="What should the DAO do?" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea placeholder="Explain the rationale behind this proposal..." className="min-h-[150px]" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Select Action Type</h2>
        <div className="grid grid-cols-1 gap-3">
          {communityActions.map(([kind, meta]) => (
            <Card key={kind} className="hover:border-blue-500/50 cursor-pointer transition-colors group">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium group-hover:text-blue-400">{meta.label}</div>
                  <div className="text-xs text-muted-foreground">{meta.description}</div>
                </div>
                <div className="text-[10px] font-mono opacity-50">{meta.handler}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Button className="w-full h-12 text-lg font-bold">Submit to DAO</Button>
    </div>
  );
}
