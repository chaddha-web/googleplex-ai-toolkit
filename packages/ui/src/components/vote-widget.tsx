import { Button } from "./button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "./card";
import { Badge } from "./badge";


export function VoteWidget({
  proposalId,
  userWeight,
  hasVoted,
  onVote
}: {
  proposalId: string;
  userWeight: bigint;
  hasVoted: boolean;
  onVote: (choice: 'for' | 'against' | 'abstain') => Promise<void>;
}) {
  return (
    <Card className="border-success/20">
      <CardHeader>
        <CardTitle className="text-lg">Cast Your Vote</CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Your Voting Weight:</span>
          <span className="font-bold text-foreground">{userWeight.toLocaleString()} GGX</span>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3">
        <Button 
          variant="outline" 
          className="border-success/50 hover:bg-success/10"
          disabled={hasVoted}
          onClick={() => onVote('for')}
        >
          For
        </Button>
        <Button 
          variant="outline" 
          className="border-destructive/50 hover:bg-destructive/10"
          disabled={hasVoted}
          onClick={() => onVote('against')}
        >
          Against
        </Button>
        <Button 
          variant="outline" 
          className="border-muted-foreground/50 hover:bg-muted/10"
          disabled={hasVoted}
          onClick={() => onVote('abstain')}
        >
          Abstain
        </Button>
      </CardContent>
      {hasVoted && (
        <CardFooter>
          <Badge variant="success" className="w-full justify-center">You have already voted</Badge>
        </CardFooter>
      )}
    </Card>
  );
}
