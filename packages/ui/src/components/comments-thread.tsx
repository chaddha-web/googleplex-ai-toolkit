import { Card, CardContent } from "./card";
import { Avatar, AvatarFallback } from "./avatar";
import { IdentityBadge, type IdentityTier } from "./identity-badge";



export interface Comment {
  id: string;
  author: string;
  tier: IdentityTier;
  content: string;
  timestamp: number;
}

export function CommentsThread({ comments }: { comments: Comment[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Discussion</h3>
      <div className="space-y-4">
        {comments.map((c) => (
          <Card key={c.id} className="bg-muted/10 border-none">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px]">{c.author.slice(2, 4)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-mono">{c.author.slice(0, 6)}...{c.author.slice(-4)}</span>
                  <IdentityBadge tier={c.tier} className="scale-90" />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.timestamp * 1000).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed pl-8">
                {c.content}
              </p>
            </CardContent>
          </Card>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No comments yet.</p>
        )}
      </div>
    </div>
  );
}
