import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AdminPage() {
  const stats = [
    { label: "Treasury TVL", value: "$4.2M", href: "/treasury" },
    { label: "Active Deployments", value: "128", href: "/hosting" },
    { label: "Pending Proposals", value: "14", href: "/proposals" },
    { label: "Daily AI Spend", value: "$840", href: "/ai-costs" }
  ];

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Operator Dashboard</h1>
        <Button><Link href="/proposals/new">New Platform Proposal</Link></Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href}>
            <Card className="hover:bg-muted/50 transition-colors">
              <CardHeader className="p-4 pb-0">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="text-2xl font-bold">{s.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Quick Links</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Link href="/sybil-console"><Button variant="outline">Sybil Guard</Button></Link>
            <Link href="/audit-log"><Button variant="outline">Audit Log</Button></Link>
            <Link href="/params"><Button variant="outline">Protocol Params</Button></Link>
            <Link href="/proposals"><Button variant="outline">Proposal List</Button></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
