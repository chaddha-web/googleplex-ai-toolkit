import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import IdentityBadge from "@/components/identity-badge";
import VoteWidget from "@/components/vote-widget";
import SentimentWidget from "@/components/sentiment-widget";
import CommentsThread, { type Comment } from "@/components/comments-thread";
// TODO(claude): Import real client once it is fully wired to GOVERNANCE_SERVICE_URL
// import { createGovernanceClient } from "@googolplex/dao-actions";

export default async function ProposalDetailPage({ params }: { params: { id: string } }) {
  // Mock data for 5.2/5.3/5.4/5.5 - to be replaced by createGovernanceClient.getProposal(params.id)
  const proposal = {
    id: params.id,
    title: "Proposal #" + params.id,
    description: "This is a detailed description of the proposal and the actions it intends to perform.",
    state: "active" as const,
    lane: "standard" as const,
    handler: "treasury",
    actionKind: "treasury.transfer",
    snapshotBlock: 12345678,
    votes: {
        for: 12000000n,
        against: 2000000n,
        abstain: 500000n
    },
    sentiment: {
        upvotes: 42,
        downvotes: 12
    },
    quorumRequired: 4000000n,
    endsAt: Math.floor(Date.now() / 1000) + 86400 * 2
  };

  if (!proposal) notFound();

  // Mock comments for 5.5
  const comments: Comment[] = [
    { id: '1', author: '0x1111222233334444555566667777888899990000', tier: 'high-stakes', content: 'This proposal is vital for the ecosystem expansion.', timestamp: Math.floor(Date.now() / 1000) - 3600 },
    { id: '2', author: '0xaaaaabbbbbcccccdddddeeeeefffff000001111', tier: 'verified', content: 'Agreed. The treasury allocation seems reasonable.', timestamp: Math.floor(Date.now() / 1000) - 1800 }
  ];

  // Mock user data for VoteWidget / Sentiment
  const userWeight = 1250n;
  const userTier = "verified" as const;
  const hasVoted = false;

  async function handleVote(choice: 'for' | 'against' | 'abstain') {
    'use server';
    console.log(`Voting ${choice} on proposal ${params.id}`);
    // TODO(claude): createGovernanceClient.castVote({ proposalId: params.id, choice, ... })
  }

  async function handleSentiment(direction: 'up' | 'down') {
    'use server';
    console.log(`Sentiment ${direction} on proposal ${params.id}`);
    // TODO(claude): POST /api/proposals/[id]/sentiment
  }

  const totalVotes = proposal.votes.for + proposal.votes.against + proposal.votes.abstain;
  const forPercent = totalVotes > 0n ? Number((proposal.votes.for * 100n) / totalVotes) : 0;
  const againstPercent = totalVotes > 0n ? Number((proposal.votes.against * 100n) / totalVotes) : 0;
  const abstainPercent = totalVotes > 0n ? Number((proposal.votes.abstain * 100n) / totalVotes) : 0;
  const quorumPercent = Math.min(100, Number((proposal.votes.for * 100n) / proposal.quorumRequired));

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <span>ID: {proposal.id}</span>
            <span>•</span>
            <span>Block: {proposal.snapshotBlock}</span>
          </div>
          <h1 className="text-3xl font-bold">{proposal.title}</h1>
          <div className="flex items-center gap-2 pt-2">
            <Badge variant="outline" className="capitalize">{proposal.state}</Badge>
            <Badge variant="outline" className="capitalize">{proposal.lane} Lane</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">{proposal.handler}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert max-w-none">
              <p>{proposal.description}</p>
            </CardContent>
          </Card>
          
          <SentimentWidget 
            upvotes={proposal.sentiment.upvotes}
            downvotes={proposal.sentiment.downvotes}
            userTier={userTier}
            onVote={handleSentiment}
          />

          <CommentsThread comments={comments} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tally</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-success font-semibold">For</span>
                  <span>{proposal.votes.for.toLocaleString()} GGX ({forPercent}%)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success transition-all" style={{ width: `${forPercent}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-destructive font-semibold">Against</span>
                  <span>{proposal.votes.against.toLocaleString()} GGX ({againstPercent}%)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-destructive transition-all" style={{ width: `${againstPercent}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-semibold">Abstain</span>
                  <span>{proposal.votes.abstain.toLocaleString()} GGX ({abstainPercent}%)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-muted-foreground transition-all" style={{ width: `${abstainPercent}%` }} />
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Quorum Required</span>
                  <span>{proposal.quorumRequired.toLocaleString()} GGX</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${quorumPercent}%` }} />
                  </div>
                  <span className="text-[10px] font-bold">{quorumPercent}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <VoteWidget 
            proposalId={proposal.id}
            userWeight={userWeight}
            hasVoted={hasVoted}
            onVote={handleVote}
          />
        </div>
      </div>
    </div>
  );
}
