# Handoff: Album Enrichment — Ready to Implement

**Date**: 2026-05-13 16:00
**Branch**: main

## Goal
Implement on-demand album enrichment for `/albums/[id]` — artwork, track numbers, duration — fetched from LastFM's `album.getInfo` API. This makes the album page feel like a music app instead of a data table.

## Current State
Design phase is complete. All artifacts are committed and pushed. No code has been written yet — the next session starts implementation from phase 1.

**What was produced this session:**
- PRD published as GitHub issue #43
- ADR 0001 written (album_tracks bridge table rationale)
- CONTEXT.md updated with "Track number" and "Enrichment" glossary terms
- 4-phase implementation plan filed
- Project audit rebuilt as interactive data-driven dashboard

## What's Left
All four implementation phases, in order:

1. **Phase 1: Schema + enrichment module** — Drizzle migration, `AlbumInfoFetcher` port, `enrichAlbum` deep module, PGLite tests
2. **Phase 2: Query + page integration** — update `getAlbumDetail`, trigger enrichment on page visit, tracks in album order
3. **Phase 3: Artwork** — display cover art via Next.js `<Image>`
4. **Phase 4: Sort toggle + duration** — `"use client"` sortable table component, duration column

Suggest breaking these into GitHub sub-issues via `/to-issues` before starting implementation.

## Key Decisions
- **`album_tracks` bridge table** with stored `name` + nullable `track_id` — full tracklist from API, not just scrobbled tracks. PK is `(album_id, track_number)`. See ADR 0001.
- **`enriched_at` timestamp** on `albums` — separates "has been enriched" from "has artwork". Prevents re-fetching albums with no LastFM art.
- **On-demand enrichment** — triggered in the server component when `enriched_at IS NULL`. No bulk CLI command.
- **Failure = no `enriched_at`** — retries on next visit. Page degrades to scrobble-derived tracklist.
- **`AlbumInfoFetcher` port** — injected into `enrichAlbum`, mockable (true external dependency pattern from deep-modules.md).
- **Client-side sort** — `"use client"` leaf component for the track table toggle. No server round-trip.
- **DB can be wiped** — don't over-constrain to avoid backwards-incompatible changes. This is an incremental build.

## Gotchas
- Track names from `album.getInfo` may not exactly match tracks in the `tracks` table (casing, remaster suffixes). Initial strategy is exact match + same artist. Fuzzy matching deferred.
- `scrobbles.album_id` is nullable — some scrobbles have no album. The enrichment query must handle this.
- The existing `getAlbumDetail` derives tracks from scrobbles via GROUP BY. The enriched path uses `album_tracks` with a LEFT JOIN for live counts — completely different query shape.
- `LastfmFetcher` in `packages/db/src/importers/lastfm.ts` already has retry + rate limiting for `user.getRecentTracks`. The new `AlbumInfoFetcher` is a separate interface — don't conflate the two.

## Active Workflow
- Plan: `agent-context/plans/2026-05-13-issue-43-album-enrichment.md`
- PRD: https://github.com/julienbeghain/human-hum/issues/43
- ADR: `docs/adr/0001-album-tracks-bridge-table.md`

## Suggested Skills
- `/to-issues` — break the 4-phase plan into GitHub sub-issues under #43
- `/feature-dev` — implement each phase
- `/tdd-loop` — phase 1 (enrichment module) is well-scoped for autonomous TDD

## Beads Issues
No beads issues for this work yet. GitHub #43 is the tracker. Consider `/gh-to-beads` to import.

Open beads (unrelated): `human-hum-8f7` (Stats dashboard), `human-hum-vsa` (Auth), `human-hum-ixc` (Spotify), `human-hum-irq` (AI).

## Files of Interest
- `packages/db/src/schema.ts` — current schema, migration target
- `packages/db/src/queries/albums.ts` — `getAlbumDetail` to modify
- `packages/db/src/importers/lastfm.ts` — existing LastFM API patterns (retry, rate limiting)
- `apps/web/app/albums/[id]/page.tsx` — current album detail page
- `.claude/deep-modules.md` — architecture principles (port injection, test strategy)
- `.claude/architecture.md` — key design decisions
