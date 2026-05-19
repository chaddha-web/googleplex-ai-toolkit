import { IdentityBadge } from "@/components/identity-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function ProfilePage({ params }: { params: { address: string } }) {
  // Mock profile data
  const profile = {
    handle: "cryptonaut",
    tier: "verified",
    balance: "1,200 GGX",
    recentActivity: [
      { action: "Voted on Prop #42", timestamp: Date.now() - 3600000 },
      { action: "Claimed Bounty: Landing Page", timestamp: Date.now() - 7200000 }
    ]
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">{profile.handle}</h1>
        <IdentityBadge tier={profile.tier as any} />
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm">Wallet: {params.address}</div>
          <div className="text-sm">Balance: {profile.balance}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {profile.recentActivity.map((a, i) => (
              <li key={i} className="text-sm">{a.action} - {new Date(a.timestamp).toLocaleTimeString()}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
