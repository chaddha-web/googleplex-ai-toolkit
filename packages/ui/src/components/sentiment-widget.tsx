import { Button } from "./button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { IdentityBadge, type IdentityTier } from "./identity-badge";


export function SentimentWidget({
  upvotes,
  downvotes,
  userTier,
  onVote
}: {
  upvotes: number;
  downvotes: number;
  userTier: IdentityTier;
  onVote: (direction: 'up' | 'down') => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Community Sentiment</h4>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase">Your Weight:</span>
          <IdentityBadge tier={userTier} />
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8 hover:text-success hover:border-success/50"
            onClick={() => onVote('up')}
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <span className="text-sm font-bold text-success">{upvotes}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8 hover:text-destructive hover:border-destructive/50"
            onClick={() => onVote('down')}
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
          <span className="text-sm font-bold text-destructive">{downvotes}</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Verified tiers grant reduction in the required quorum for this proposal's lane.
      </p>
    </div>
  );
}
