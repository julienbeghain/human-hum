# ADR 0002: Multi-user with user-scoped scrobbles

## Status

Accepted — 2026-05-16

> **Forward note (2026-06-14):** Per [ADR-0003](0003-rename-scrobble-to-hum.md), the recorded play event was renamed from "scrobble" to **hum** and the `scrobbles` fact table to `listen.hums`. This auth spec is not yet built: when it is, the `user_id` column lands on `listen.hums` (not "scrobbles"), the dedup key becomes `(user_id, track_id, listened_at)` on that table, and "user-scoped scrobbles" should be read as "user-scoped hums". This record is left otherwise unchanged.

## Context

The system is currently single-user with no `user_id` on any table. The question arose: if two users scrobble the same track, does the data duplicate or share? This forced a decision about how multi-user should work.

The schema already follows a star-schema pattern — dimension tables (`artists`, `albums`, `tracks`) describe the catalog, and the fact table (`scrobbles`) records listening events. The deduplication key is currently `(track_id, listened_at)`.

## Decision

When auth lands, adopt a **shared-catalog, user-scoped-fact** model:

- **Dimension tables remain shared.** A track is a global catalog entry — "Bohemian Rhapsody" by Queen exists once regardless of how many users scrobble it. No `user_id` on `artists`, `albums`, `tracks`, or `album_tracks`.
- **The fact table gets a `user_id` column.** Each scrobble is owned by exactly one user.
- **Dedup key becomes `(user_id, track_id, listened_at)`.** Two different users can scrobble the same track at the same second without collision.
- **Scrobbles are private by default.** All queries are scoped to the authenticated user.
- **Visibility via asymmetric follow.** User A follows User B → A can see all of B's data. B sees nothing of A's unless B also follows A. The follow is a binary gate — no granular per-feature visibility settings.
- **Implementation is deferred.** The `user_id` column will be added when auth is built, not before. The DB can be wiped for this migration (see project memory).

## Alternatives considered

**Add `user_id` now with a placeholder user** — pre-wires the column so auth is a smaller migration. Rejected because it adds noise to every query today (filtering by a meaningless ID) and the DB wipe policy makes the future migration trivial anyway.

**Per-user dimension tables** — each user gets their own copy of tracks/artists. Rejected because it defeats the catalog model, bloats storage, and makes cross-user features (recommendations, social) impossible without reconciliation.

**Symmetric (mutual) sharing** — requires a request/accept state machine and forces both parties to share. Rejected in favour of the simpler asymmetric follow which avoids rejection awkwardness and matches Last.fm's established mental model.

## Consequences

- No schema changes are needed today — this is a documented forward decision.
- When auth lands, the single-user scrobbles will be assigned to the first authenticated user during migration.
- The follow model is simple to implement (one directional row per relationship) but means "mutual" visibility requires two rows.
- All query paths in `apps/web` will need a `WHERE user_id = ?` clause once the column exists.
