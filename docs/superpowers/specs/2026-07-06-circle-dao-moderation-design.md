# Circle DAO — moderated proposals with weight

**Date:** 2026-07-06
**Status:** Approved design, pre-implementation

## Problem

The Circle page (`/community`) reads proposals from `community_proposals`, which is
**seeded once at DB init** — there is no create/edit/manage route anywhere. Admins have
no control over what questions appear. Voting is a bare yes/no + sentiment bar with no
deadline, quorum, commitment, or outcome, so it feels weightless. Member comments have no
edit/delete and no abuse protection.

## Goals

1. Admin is the **sole author** of Circle questions, via a dedicated admin page.
2. Voting **feels consequential**: countdown, quorum, locked (one-shot) vote, hidden results.
3. Members can **edit / delete their own** comments.
4. **Built-in auto-moderation** blocks abuse before it reaches the public feed.
5. Admin can **hide / pin / hard-delete** any comment.

## Decisions (from brainstorming)

- Weight mechanics: **all four** — deadline countdown, quorum target, final locked vote, results hidden until you vote.
- Vote power: **one member, one vote** (no PARTY weighting of the tally; existing PARTY *gate* to vote is unchanged).
- Moderation scope: **proposals + comments**.

## Data model (additive `ALTER TABLE`, same pattern as `avatar_url`)

`community_proposals` add:
- `closes_at INTEGER` — deadline in ms; NULL = no deadline (stays open).
- `quorum INTEGER NOT NULL DEFAULT 0` — votes required for validity.
- `created_by TEXT` — admin user id (audit).
- Reuse existing `status TEXT` with values: `open` (default) | `passed` | `failed` | `closed`.

`community_comments` add:
- `hidden INTEGER NOT NULL DEFAULT 0` — admin moderation.
- `pinned INTEGER NOT NULL DEFAULT 0` — admin pin.
- `deleted INTEGER NOT NULL DEFAULT 0` — author soft-delete (keeps replies intact).
- `edited_at INTEGER` — set on author edit; drives "(edited)" tag.

No new tables. Votes remain one-row-per-user (`PRIMARY KEY (proposal_id, user_id)`).

## Weight mechanics

- **Locked vote**: `/community/proposals/:id/vote` switches from upsert → **insert-once**.
  A second attempt → 409 "Your vote is final." Also rejected once the proposal is closed.
- **Hidden results**: `GET /community/proposals` returns the yes/no split **only if** the
  caller has voted OR the proposal is closed. Otherwise `yes`/`no` are `null`.
- **Quorum pressure**: `totalVotes` and `quorum` are **always** returned (no split leaked),
  so the card shows "42 / 100 votes" + a progress bar even pre-vote.
- **Countdown**: `closesAt` returned; card renders a live client-side ticking timer.
- **No cron**: a proposal is closed when `status !== 'open'` **or** `now >= closes_at`,
  computed on read. Outcome derived at close:
  `totalVotes >= quorum && yes > no → passed`, else `failed`
  (quorum unmet → shown as "No quorum" / failed).

## Endpoints

### Member (existing `requireUser`)
- `GET  /community/proposals` — now includes `closesAt`, `quorum`, `totalVotes`, computed
  `phase` (`open`/`closed`), `outcome`; `yes`/`no` gated as above.
- `POST /community/proposals/:id/vote` — insert-once, deadline-checked, 409 on repeat.
- `PATCH  /community/comments/:id` `{ body }` — **author-only** edit; re-runs abuse filter; sets `edited_at`.
- `DELETE /community/comments/:id` — **author-only** soft-delete (`deleted = 1`); body renders "[deleted]".
- `POST /community/proposals/:id/comments` — unchanged path, now runs the abuse filter on write.
- Comments GET: filters `hidden` (renders "removed by moderator" or drops), orders `pinned` first, maps `deleted` → "[deleted]".

### Admin (new, `requireAdmin` — `user.role === 'admin'`)
- `POST   /community/admin/proposals` `{ title, description, closesAt, quorum }` — create.
- `PATCH  /community/admin/proposals/:id` `{ title?, description?, closesAt?, quorum?, status? }` — edit / close-now.
- `DELETE /community/admin/proposals/:id` — hard delete (cascade votes + comments).
- `POST   /community/admin/comments/:id/moderate` `{ hidden?, pinned? }` — toggle.
- (Admin always sees full tallies + all comments incl. hidden.)

## Anti-abuse filter (stdlib only, one editable file)

`services/auth/src/lib/moderation.ts`:
- A curated blocklist (slurs / harassment / spam patterns).
- Normalize before matching: lowercase, strip non-alphanumerics, collapse spacing and
  common leetspeak (`f u c k`, `a$$`, `@`, `0→o`, `1→i`, `3→e`, `$→s`).
- `isAbusive(text): boolean`. On a hit, the post/edit is **rejected** (400) with
  "Let's keep it respectful — please rephrase." Abuse never reaches the public feed.
- Intentionally simple + tunable; layers under manual admin hide/pin.

## Frontend

### Circle page (`/community`) — member view
Each card gains a live **countdown** and a **quorum progress bar**, with three states:
- *Open, not voted*: Yes/No buttons; split hidden ("Cast your vote to see where the Circle stands").
  Reactions + comments stay visible pre-vote (only the tally hides).
- *Open, voted*: buttons locked, "You voted **YES** ✓", split + bar revealed.
- *Closed*: outcome badge (**Passed** / **Failed** / **No quorum**) + final split.

Comment rows gain: author **Edit** / **Delete** (own only), "(edited)" tag, "[deleted]" body,
pinned float-to-top, hidden ones suppressed for members.

### Admin moderator view (new `apps/landing/app/app/admin/circle/page.tsx`)
Linked from the admin home tool row. Admin always sees full tallies + status.
- **New question** form: title, description, deadline (datetime-local), quorum.
- Per proposal: **edit**, **close now**, **delete**.
- Expandable comments list per proposal with **hide / pin** toggles + hard delete.
- Guarded client-side by `user.role === 'admin'` (bounce to `/app`), server-side by `requireAdmin`.

## Client wiring
Add to `apps/landing/lib/auth-client.ts` (and reuse in web where needed): admin proposal
CRUD + comment moderation; member comment edit/delete. Web's `auth-client.ts` gets comment
edit/delete for the Circle page.

## Out of scope
- PARTY-weighted tallies (explicitly one-member-one-vote).
- Real-time push; polling/refetch on action is fine.
- Cron auto-close (derive on read).

## Testing
- Unit: `isAbusive` normalization + blocklist hits/misses.
- Vote lock: second vote → 409; vote after deadline → rejected.
- Result gating: split null pre-vote, present post-vote / post-close.
- Outcome derivation: quorum met/unmet × yes>no combinations.
- Author edit/delete authorization (non-author → 403).
- Admin authorization on all `/community/admin/*` (non-admin → 403).
