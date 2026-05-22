import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { db, stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";

// Prepared statements (colocated — community is self-contained).
const q = {
  proposals: db.prepare(`SELECT * FROM community_proposals ORDER BY created_at DESC`),
  proposalById: db.prepare(`SELECT * FROM community_proposals WHERE id = ?`),
  voteCounts: db.prepare(
    `SELECT direction, COUNT(*) c FROM community_votes WHERE proposal_id = ? GROUP BY direction`
  ),
  reactionCounts: db.prepare(
    `SELECT kind, COUNT(*) c FROM community_reactions WHERE proposal_id = ? GROUP BY kind`
  ),
  commentCount: db.prepare(
    `SELECT COUNT(*) c FROM community_comments WHERE proposal_id = ?`
  ),
  myVote: db.prepare(
    `SELECT direction FROM community_votes WHERE proposal_id = ? AND user_id = ?`
  ),
  myReaction: db.prepare(
    `SELECT kind FROM community_reactions WHERE proposal_id = ? AND user_id = ?`
  ),
  upsertVote: db.prepare(
    `INSERT INTO community_votes (proposal_id,user_id,direction,created_at) VALUES (@proposal_id,@user_id,@direction,@created_at)
     ON CONFLICT(proposal_id,user_id) DO UPDATE SET direction=excluded.direction, created_at=excluded.created_at`
  ),
  getReaction: db.prepare(
    `SELECT kind FROM community_reactions WHERE proposal_id = ? AND user_id = ?`
  ),
  upsertReaction: db.prepare(
    `INSERT INTO community_reactions (proposal_id,user_id,kind,created_at) VALUES (@proposal_id,@user_id,@kind,@created_at)
     ON CONFLICT(proposal_id,user_id) DO UPDATE SET kind=excluded.kind, created_at=excluded.created_at`
  ),
  deleteReaction: db.prepare(
    `DELETE FROM community_reactions WHERE proposal_id = ? AND user_id = ?`
  ),
  // comments with like count + whether the caller liked it (param order: userId, proposalId)
  comments: db.prepare(
    `SELECT c.id, c.author, c.body, c.created_at, c.parent_id AS parentId,
       (SELECT COUNT(*) FROM community_comment_likes l WHERE l.comment_id = c.id) AS likes,
       (SELECT COUNT(*) FROM community_comment_likes l WHERE l.comment_id = c.id AND l.user_id = ?) AS myLiked
     FROM community_comments c WHERE c.proposal_id = ? ORDER BY c.created_at ASC LIMIT 400`
  ),
  insertComment: db.prepare(
    `INSERT INTO community_comments (id,proposal_id,user_id,author,body,parent_id,created_at) VALUES (@id,@proposal_id,@user_id,@author,@body,@parent_id,@created_at)`
  ),
  commentById: db.prepare(`SELECT id, proposal_id FROM community_comments WHERE id = ?`),
  getCommentLike: db.prepare(`SELECT 1 c FROM community_comment_likes WHERE comment_id = ? AND user_id = ?`),
  addCommentLike: db.prepare(`INSERT OR IGNORE INTO community_comment_likes (comment_id,user_id,created_at) VALUES (?,?,?)`),
  delCommentLike: db.prepare(`DELETE FROM community_comment_likes WHERE comment_id = ? AND user_id = ?`)
};

export async function communityRoutes(app: FastifyInstance) {
  const requireUser = async (req: any, reply: any) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Sign in to participate." });
      return null;
    }
    const claims = await verifyAccessToken(header.slice(7).trim());
    if (!claims) {
      reply.code(401).send({ error: "Invalid or expired token." });
      return null;
    }
    const user = stmts.user.byId.get(claims.sub);
    if (!user) {
      reply.code(401).send({ error: "User no longer exists." });
      return null;
    }
    return user;
  };

  // GET /community/proposals — list with tallies + caller's vote/reaction.
  app.get("/community/proposals", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const rows = q.proposals.all() as Array<{
      id: string;
      title: string;
      description: string | null;
      status: string | null;
      created_at: number;
    }>;
    const proposals = rows.map((p) => {
      const votes = q.voteCounts.all(p.id) as Array<{ direction: string; c: number }>;
      const reacts = q.reactionCounts.all(p.id) as Array<{ kind: string; c: number }>;
      const yes = votes.find((v) => v.direction === "yes")?.c ?? 0;
      const no = votes.find((v) => v.direction === "no")?.c ?? 0;
      const likes = reacts.find((r) => r.kind === "like")?.c ?? 0;
      const dislikes = reacts.find((r) => r.kind === "dislike")?.c ?? 0;
      const comments = (q.commentCount.get(p.id) as { c: number }).c;
      const mv = q.myVote.get(p.id, user.id) as { direction: string } | undefined;
      const mr = q.myReaction.get(p.id, user.id) as { kind: string } | undefined;
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        yes,
        no,
        likes,
        dislikes,
        comments,
        myVote: mv?.direction ?? null,
        myReaction: mr?.kind ?? null
      };
    });
    return reply.send({ proposals });
  });

  // POST /community/proposals/:id/vote { direction } — needs active wallet.
  app.post("/community/proposals/:id/vote", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (user.wallet_status !== "active") {
      return reply.code(403).send({ error: "Activate your wallet to vote." });
    }
    const { id } = req.params;
    if (!q.proposalById.get(id)) return reply.code(404).send({ error: "No such proposal." });
    const direction = (req.body as any)?.direction;
    if (direction !== "yes" && direction !== "no") {
      return reply.code(400).send({ error: "direction must be yes or no." });
    }
    q.upsertVote.run({ proposal_id: id, user_id: user.id, direction, created_at: Date.now() });
    return reply.send({ ok: true });
  });

  // POST /community/proposals/:id/react { kind } — like/dislike toggle.
  app.post("/community/proposals/:id/react", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params;
    if (!q.proposalById.get(id)) return reply.code(404).send({ error: "No such proposal." });
    const kind = (req.body as any)?.kind;
    if (kind !== "like" && kind !== "dislike") {
      return reply.code(400).send({ error: "kind must be like or dislike." });
    }
    const existing = q.getReaction.get(id, user.id) as { kind: string } | undefined;
    if (existing?.kind === kind) {
      // Toggling the same reaction off.
      q.deleteReaction.run(id, user.id);
      return reply.send({ ok: true, myReaction: null });
    }
    q.upsertReaction.run({ proposal_id: id, user_id: user.id, kind, created_at: Date.now() });
    return reply.send({ ok: true, myReaction: kind });
  });

  // GET /community/proposals/:id/comments — flat list (with parentId + likes);
  // the client builds the reply tree.
  app.get("/community/proposals/:id/comments", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params;
    const rows = q.comments.all(user.id, id) as Array<{
      id: string;
      author: string;
      body: string;
      created_at: number;
      parentId: string | null;
      likes: number;
      myLiked: number;
    }>;
    const comments = rows.map((c) => ({
      id: c.id,
      author: c.author,
      body: c.body,
      created_at: c.created_at,
      parentId: c.parentId,
      likes: c.likes,
      myLiked: c.myLiked > 0
    }));
    return reply.send({ comments });
  });

  // POST /community/proposals/:id/comments { body, parentId? }
  app.post("/community/proposals/:id/comments", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params;
    if (!q.proposalById.get(id)) return reply.code(404).send({ error: "No such proposal." });
    const text = String((req.body as any)?.body ?? "").trim();
    if (!text || text.length > 1000) {
      return reply.code(400).send({ error: "Comment must be 1–1000 characters." });
    }
    // Optional parent (reply). Must belong to the same proposal.
    let parent_id: string | null = null;
    const rawParent = (req.body as any)?.parentId;
    if (typeof rawParent === "string" && rawParent) {
      const parent = q.commentById.get(rawParent) as { id: string; proposal_id: string } | undefined;
      if (!parent || parent.proposal_id !== id) {
        return reply.code(400).send({ error: "Invalid parent comment." });
      }
      parent_id = parent.id;
    }
    const author = `${user.first_name} ${user.last_name}`.trim() || "Member";
    const row = {
      id: crypto.randomUUID(),
      proposal_id: id,
      user_id: user.id,
      author,
      body: text,
      parent_id,
      created_at: Date.now()
    };
    q.insertComment.run(row);
    return reply.send({
      ok: true,
      comment: {
        id: row.id,
        author,
        body: text,
        parentId: parent_id,
        likes: 0,
        myLiked: false,
        created_at: row.created_at
      }
    });
  });

  // POST /community/comments/:commentId/like — toggle a like on a comment.
  app.post("/community/comments/:commentId/like", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { commentId } = req.params;
    if (!q.commentById.get(commentId)) return reply.code(404).send({ error: "No such comment." });
    const existing = q.getCommentLike.get(commentId, user.id);
    if (existing) {
      q.delCommentLike.run(commentId, user.id);
      return reply.send({ ok: true, liked: false });
    }
    q.addCommentLike.run(commentId, user.id, Date.now());
    return reply.send({ ok: true, liked: true });
  });
}
