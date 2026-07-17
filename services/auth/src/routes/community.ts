import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { db, stmts } from "../db.js";
import { verifyAccessToken } from "../jwt.js";
import { isAbusive, ABUSE_MESSAGE } from "../moderation.js";
import { permsForUser } from "../permissions.js";

// Prepared statements (colocated — community is self-contained).
const q = {
  proposals: db.prepare(`SELECT * FROM community_proposals ORDER BY created_at DESC`),
  proposalById: db.prepare(`SELECT * FROM community_proposals WHERE id = ?`),
  insertProposal: db.prepare(
    `INSERT INTO community_proposals (id,title,description,status,closes_at,quorum,created_by,created_at)
     VALUES (@id,@title,@description,@status,@closes_at,@quorum,@created_by,@created_at)`
  ),
  updateProposal: db.prepare(
    `UPDATE community_proposals
       SET title=@title, description=@description, status=@status, closes_at=@closes_at, quorum=@quorum
     WHERE id=@id`
  ),
  deleteProposal: db.prepare(`DELETE FROM community_proposals WHERE id = ?`),
  delProposalVotes: db.prepare(`DELETE FROM community_votes WHERE proposal_id = ?`),
  delProposalReactions: db.prepare(`DELETE FROM community_reactions WHERE proposal_id = ?`),
  delProposalCommentLikes: db.prepare(
    `DELETE FROM community_comment_likes WHERE comment_id IN (SELECT id FROM community_comments WHERE proposal_id = ?)`
  ),
  delProposalComments: db.prepare(`DELETE FROM community_comments WHERE proposal_id = ?`),
  voteCounts: db.prepare(
    `SELECT direction, COUNT(*) c FROM community_votes WHERE proposal_id = ? GROUP BY direction`
  ),
  reactionCounts: db.prepare(
    `SELECT kind, COUNT(*) c FROM community_reactions WHERE proposal_id = ? GROUP BY kind`
  ),
  commentCount: db.prepare(
    `SELECT COUNT(*) c FROM community_comments WHERE proposal_id = ? AND hidden = 0 AND deleted = 0`
  ),
  myVote: db.prepare(
    `SELECT direction FROM community_votes WHERE proposal_id = ? AND user_id = ?`
  ),
  myReaction: db.prepare(
    `SELECT kind FROM community_reactions WHERE proposal_id = ? AND user_id = ?`
  ),
  insertVote: db.prepare(
    `INSERT INTO community_votes (proposal_id,user_id,direction,created_at) VALUES (@proposal_id,@user_id,@direction,@created_at)`
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
  // comments with like count + whether the caller liked it. Param order: userId, proposalId.
  // Admin sees everything (incl. hidden); members get hidden filtered by the caller.
  commentsAll: db.prepare(
    `SELECT c.id, c.author, c.body, c.created_at, c.parent_id AS parentId, c.user_id AS userId,
       c.hidden, c.pinned, c.deleted, c.edited_at AS editedAt,
       (SELECT COUNT(*) FROM community_comment_likes l WHERE l.comment_id = c.id) AS likes,
       (SELECT COUNT(*) FROM community_comment_likes l WHERE l.comment_id = c.id AND l.user_id = ?) AS myLiked
     FROM community_comments c WHERE c.proposal_id = ?
     ORDER BY c.pinned DESC, c.created_at ASC LIMIT 400`
  ),
  commentsVisible: db.prepare(
    `SELECT c.id, c.author, c.body, c.created_at, c.parent_id AS parentId, c.user_id AS userId,
       c.hidden, c.pinned, c.deleted, c.edited_at AS editedAt,
       (SELECT COUNT(*) FROM community_comment_likes l WHERE l.comment_id = c.id) AS likes,
       (SELECT COUNT(*) FROM community_comment_likes l WHERE l.comment_id = c.id AND l.user_id = ?) AS myLiked
     FROM community_comments c WHERE c.proposal_id = ? AND c.hidden = 0
     ORDER BY c.pinned DESC, c.created_at ASC LIMIT 400`
  ),
  insertComment: db.prepare(
    `INSERT INTO community_comments (id,proposal_id,user_id,author,body,parent_id,created_at) VALUES (@id,@proposal_id,@user_id,@author,@body,@parent_id,@created_at)`
  ),
  commentById: db.prepare(
    `SELECT id, proposal_id, user_id, deleted FROM community_comments WHERE id = ?`
  ),
  editComment: db.prepare(
    `UPDATE community_comments SET body=@body, edited_at=@edited_at WHERE id=@id`
  ),
  softDeleteComment: db.prepare(`UPDATE community_comments SET deleted=1 WHERE id = ?`),
  moderateComment: db.prepare(
    `UPDATE community_comments SET hidden=@hidden, pinned=@pinned WHERE id=@id`
  ),
  hardDeleteComment: db.prepare(
    `DELETE FROM community_comments WHERE id = ? OR parent_id = ?`
  ),
  delCommentLikesFor: db.prepare(
    `DELETE FROM community_comment_likes WHERE comment_id = ? OR comment_id IN (SELECT id FROM community_comments WHERE parent_id = ?)`
  ),
  getCommentLike: db.prepare(`SELECT 1 c FROM community_comment_likes WHERE comment_id = ? AND user_id = ?`),
  addCommentLike: db.prepare(`INSERT OR IGNORE INTO community_comment_likes (comment_id,user_id,created_at) VALUES (?,?,?)`),
  delCommentLike: db.prepare(`DELETE FROM community_comment_likes WHERE comment_id = ? AND user_id = ?`)
};

type ProposalRow = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  closes_at: number | null;
  quorum: number | null;
  created_at: number;
};

/** A proposal is closed once an admin sets a terminal status or the deadline passes. */
function isClosed(p: ProposalRow): boolean {
  if (p.status && p.status !== "open") return true;
  return p.closes_at != null && Date.now() >= p.closes_at;
}

/** Outcome is only meaningful once closed. */
function outcomeOf(
  p: ProposalRow,
  yes: number,
  no: number,
  total: number
): "passed" | "failed" | "no_quorum" | null {
  if (p.status === "passed") return "passed";
  if (p.status === "failed") return "failed";
  if (!isClosed(p)) return null;
  const quorum = p.quorum ?? 0;
  if (total < quorum) return "no_quorum";
  return yes > no ? "passed" : "failed";
}

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

  const requireAdmin = async (req: any, reply: any) => {
    const user = await requireUser(req, reply);
    if (!user) return null;
    if (user.role !== "admin") {
      reply.code(403).send({ error: "Admin only." });
      return null;
    }
    if (!permsForUser(user).includes("moderation")) {
      reply.code(403).send({ error: "You don't have permission to moderate the Circle." });
      return null;
    }
    return user;
  };

  // GET /community/proposals — list with tallies + caller's vote/reaction.
  // Yes/No split is withheld until the caller has voted or the proposal closed.
  app.get("/community/proposals", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const isAdmin = user.role === "admin";
    const rows = q.proposals.all() as ProposalRow[];
    const proposals = rows.map((p) => {
      const votes = q.voteCounts.all(p.id) as Array<{ direction: string; c: number }>;
      const reacts = q.reactionCounts.all(p.id) as Array<{ kind: string; c: number }>;
      const yes = votes.find((v) => v.direction === "yes")?.c ?? 0;
      const no = votes.find((v) => v.direction === "no")?.c ?? 0;
      const total = yes + no;
      const likes = reacts.find((r) => r.kind === "like")?.c ?? 0;
      const dislikes = reacts.find((r) => r.kind === "dislike")?.c ?? 0;
      const comments = (q.commentCount.get(p.id) as { c: number }).c;
      const mv = q.myVote.get(p.id, user.id) as { direction: string } | undefined;
      const mr = q.myReaction.get(p.id, user.id) as { kind: string } | undefined;
      const closed = isClosed(p);
      // Reveal the split to the author-admin, to anyone who has voted, or once closed.
      const reveal = isAdmin || !!mv || closed;
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        phase: closed ? "closed" : "open",
        closesAt: p.closes_at,
        quorum: p.quorum ?? 0,
        totalVotes: total,
        outcome: outcomeOf(p, yes, no, total),
        yes: reveal ? yes : null,
        no: reveal ? no : null,
        likes,
        dislikes,
        comments,
        myVote: mv?.direction ?? null,
        myReaction: mr?.kind ?? null
      };
    });
    return reply.send({ proposals });
  });

  // POST /community/proposals/:id/vote { direction } — one-shot, deadline-gated.
  app.post("/community/proposals/:id/vote", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (user.wallet_status !== "active") {
      return reply.code(403).send({ error: "Activate your wallet to vote." });
    }
    const { id } = req.params;
    const proposal = q.proposalById.get(id) as ProposalRow | undefined;
    if (!proposal) return reply.code(404).send({ error: "No such proposal." });
    if (isClosed(proposal)) {
      return reply.code(403).send({ error: "Voting has closed on this question." });
    }
    const direction = (req.body as any)?.direction;
    if (direction !== "yes" && direction !== "no") {
      return reply.code(400).send({ error: "direction must be yes or no." });
    }
    if (q.myVote.get(id, user.id)) {
      return reply.code(409).send({ error: "Your vote is final — it can't be changed." });
    }
    q.insertVote.run({ proposal_id: id, user_id: user.id, direction, created_at: Date.now() });
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
      q.deleteReaction.run(id, user.id);
      return reply.send({ ok: true, myReaction: null });
    }
    q.upsertReaction.run({ proposal_id: id, user_id: user.id, kind, created_at: Date.now() });
    return reply.send({ ok: true, myReaction: kind });
  });

  // GET /community/proposals/:id/comments — flat list (client builds the tree).
  app.get("/community/proposals/:id/comments", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const isAdmin = user.role === "admin";
    const { id } = req.params;
    const stmt = isAdmin ? q.commentsAll : q.commentsVisible;
    const rows = stmt.all(user.id, id) as Array<{
      id: string;
      author: string;
      body: string;
      created_at: number;
      parentId: string | null;
      userId: string;
      hidden: number;
      pinned: number;
      deleted: number;
      editedAt: number | null;
      likes: number;
      myLiked: number;
    }>;
    const comments = rows.map((c) => ({
      id: c.id,
      author: c.author,
      body: c.deleted ? "[deleted]" : c.body,
      created_at: c.created_at,
      parentId: c.parentId,
      likes: c.likes,
      myLiked: c.myLiked > 0,
      mine: c.userId === user.id,
      hidden: c.hidden > 0,
      pinned: c.pinned > 0,
      deleted: c.deleted > 0,
      editedAt: c.editedAt
    }));
    return reply.send({ comments });
  });

  // POST /community/proposals/:id/comments { body, parentId? } — abuse-filtered.
  app.post("/community/proposals/:id/comments", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params;
    if (!q.proposalById.get(id)) return reply.code(404).send({ error: "No such proposal." });
    const text = String((req.body as any)?.body ?? "").trim();
    if (!text || text.length > 1000) {
      return reply.code(400).send({ error: "Comment must be 1–1000 characters." });
    }
    if (isAbusive(text)) {
      return reply.code(400).send({ error: ABUSE_MESSAGE });
    }
    // Optional parent (reply). Must belong to the same proposal.
    let parent_id: string | null = null;
    const rawParent = (req.body as any)?.parentId;
    if (typeof rawParent === "string" && rawParent) {
      const parent = q.commentById.get(rawParent) as
        | { id: string; proposal_id: string }
        | undefined;
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
        mine: true,
        hidden: false,
        pinned: false,
        deleted: false,
        editedAt: null,
        created_at: row.created_at
      }
    });
  });

  // PATCH /community/comments/:id { body } — author edits their own comment.
  app.patch("/community/comments/:id", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params;
    const c = q.commentById.get(id) as
      | { id: string; user_id: string; deleted: number }
      | undefined;
    if (!c) return reply.code(404).send({ error: "No such comment." });
    if (c.user_id !== user.id) {
      return reply.code(403).send({ error: "You can only edit your own comments." });
    }
    if (c.deleted) return reply.code(400).send({ error: "This comment was deleted." });
    const text = String((req.body as any)?.body ?? "").trim();
    if (!text || text.length > 1000) {
      return reply.code(400).send({ error: "Comment must be 1–1000 characters." });
    }
    if (isAbusive(text)) return reply.code(400).send({ error: ABUSE_MESSAGE });
    const editedAt = Date.now();
    q.editComment.run({ id, body: text, edited_at: editedAt });
    return reply.send({ ok: true, body: text, editedAt });
  });

  // DELETE /community/comments/:id — author soft-deletes (keeps reply thread).
  app.delete("/community/comments/:id", async (req: any, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params;
    const c = q.commentById.get(id) as { id: string; user_id: string } | undefined;
    if (!c) return reply.code(404).send({ error: "No such comment." });
    if (c.user_id !== user.id) {
      return reply.code(403).send({ error: "You can only delete your own comments." });
    }
    q.softDeleteComment.run(id);
    return reply.send({ ok: true });
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

  // ── Admin: the sole author of Circle questions + comment moderation ────────

  // POST /community/admin/proposals { title, description?, closesAt?, quorum? }
  app.post("/community/admin/proposals", async (req: any, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const b = (req.body ?? {}) as any;
    const title = String(b.title ?? "").trim();
    if (!title || title.length > 200) {
      return reply.code(400).send({ error: "Title must be 1–200 characters." });
    }
    const description = b.description ? String(b.description).trim().slice(0, 2000) : null;
    const closes_at =
      b.closesAt != null && Number.isFinite(Number(b.closesAt)) ? Number(b.closesAt) : null;
    const quorum = Number.isFinite(Number(b.quorum)) ? Math.max(0, Math.floor(Number(b.quorum))) : 0;
    const row = {
      id: crypto.randomUUID(),
      title,
      description,
      status: "open",
      closes_at,
      quorum,
      created_by: admin.id,
      created_at: Date.now()
    };
    q.insertProposal.run(row);
    return reply.send({ ok: true, id: row.id });
  });

  // PATCH /community/admin/proposals/:id — edit fields / set status (close-now).
  app.patch("/community/admin/proposals/:id", async (req: any, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params;
    const p = q.proposalById.get(id) as ProposalRow | undefined;
    if (!p) return reply.code(404).send({ error: "No such proposal." });
    const b = (req.body ?? {}) as any;

    const title = b.title != null ? String(b.title).trim() : p.title;
    if (!title || title.length > 200) {
      return reply.code(400).send({ error: "Title must be 1–200 characters." });
    }
    const description =
      b.description !== undefined
        ? b.description
          ? String(b.description).trim().slice(0, 2000)
          : null
        : p.description;
    const closes_at =
      b.closesAt !== undefined
        ? b.closesAt != null && Number.isFinite(Number(b.closesAt))
          ? Number(b.closesAt)
          : null
        : p.closes_at;
    const quorum =
      b.quorum !== undefined && Number.isFinite(Number(b.quorum))
        ? Math.max(0, Math.floor(Number(b.quorum)))
        : p.quorum ?? 0;
    const allowedStatus = ["open", "closed", "passed", "failed"];
    const status =
      b.status != null && allowedStatus.includes(String(b.status)) ? String(b.status) : p.status;

    q.updateProposal.run({ id, title, description, status, closes_at, quorum });
    return reply.send({ ok: true });
  });

  // DELETE /community/admin/proposals/:id — remove the question and all its data.
  app.delete("/community/admin/proposals/:id", async (req: any, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params;
    if (!q.proposalById.get(id)) return reply.code(404).send({ error: "No such proposal." });
    const tx = db.transaction((pid: string) => {
      q.delProposalCommentLikes.run(pid);
      q.delProposalComments.run(pid);
      q.delProposalReactions.run(pid);
      q.delProposalVotes.run(pid);
      q.deleteProposal.run(pid);
    });
    tx(id);
    return reply.send({ ok: true });
  });

  // POST /community/admin/comments/:id/moderate { hidden?, pinned? }
  app.post("/community/admin/comments/:id/moderate", async (req: any, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params;
    const c = q.commentById.get(id) as { id: string } | undefined;
    if (!c) return reply.code(404).send({ error: "No such comment." });
    const full = db
      .prepare(`SELECT hidden, pinned FROM community_comments WHERE id = ?`)
      .get(id) as { hidden: number; pinned: number };
    const b = (req.body ?? {}) as any;
    const hidden = b.hidden !== undefined ? (b.hidden ? 1 : 0) : full.hidden;
    const pinned = b.pinned !== undefined ? (b.pinned ? 1 : 0) : full.pinned;
    q.moderateComment.run({ id, hidden, pinned });
    return reply.send({ ok: true, hidden: hidden > 0, pinned: pinned > 0 });
  });

  // DELETE /community/admin/comments/:id — hard delete (comment + its replies).
  app.delete("/community/admin/comments/:id", async (req: any, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params;
    if (!q.commentById.get(id)) return reply.code(404).send({ error: "No such comment." });
    const tx = db.transaction((cid: string) => {
      q.delCommentLikesFor.run(cid, cid);
      q.hardDeleteComment.run(cid, cid);
    });
    tx(id);
    return reply.send({ ok: true });
  });
}
