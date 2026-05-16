# Handoff: Album Enrichment — Artwork & Sort Toggle Next

**Date**: 2026-05-16 17:10
**Branch**: feat/album-tracks-schema

## Goal
On-demand album enrichment for `/albums/[id]` — artwork, track ordering, duration from LastFM `album.getInfo`.

## Current State
Phases 1 and 2 complete. Schema, enrichment module, query integration, and page integration all done and tested. Migration applied to Neon. GH #44, #45, #46 all closed with checked acceptance criteria and result sections.

This session completed:
- `getAlbumDetail` now branches on `enriched_at` — enriched path queries `album_tracks` with LEFT JOIN, un-enriched falls back to GROUP BY
- `AlbumDetail` type widened with `enrichedAt`, `imageUrl`, `trackNumber`, `duration`
- Album detail page triggers `enrichAlbum` on first visit (blocking, with try/catch fallback)
- 4 new PGLite tests: enriched ordering, unscrobbled 0-count, live count update, un-enriched fallback fields
- `.beads/` fully gitignored and untracked
- GH #43 PRD updated with Implementation Notes section (query shape gotchas)

## What's Left
1. **`human-hum-3lv`** (GH #47) — Album artwork via Next.js `<Image>` with null fallback. Both unblocked.
2. **`human-hum-3tj`** (GH #48) — `"use client"` sortable track table + duration column. Both unblocked.
3. These two are independent — can be done in either order.
4. After both: Step 7 (test review), Step 8 (sync back to GH), Step 9 (wrap up).

## Key Decisions
- Enrichment is blocking (page waits for API call on first visit) — deliberate simplicity choice
- `LastfmAlbumInfoFetcher` is instantiated directly in the page with `process.env.LASTFM_API_KEY!` — known tech debt, tracked as `human-hum-e57`
- `trackId` is nullable in `AlbumDetailTrack` — unscrobbled tracks from enrichment have no match in `tracks` table
- Scrobble counts always computed live via LEFT JOIN, never cached

## Gotchas
- Now documented in GH #43 Implementation Notes section — check there rather than re-listing here

## Active Workflow
- `/feature-workflow` Step 6 (Build) — two sub-issues remain
- Plan: `agent-context/plans/2026-05-13-issue-43-album-enrichment.md`
- PRD: https://github.com/julienbeghain/human-hum/issues/43

## Suggested Skills
- `/feature-dev` for either `human-hum-3lv` or `human-hum-3tj` — both are small, focused UI tasks
- `/tdd` not needed for these — they're client component + styling work, not query logic

## Beads Issues
- `human-hum-3lv` — Album artwork display (open, **unblocked**, P2)
- `human-hum-3tj` — Sort toggle + duration (open, **unblocked**, P2)
- `human-hum-e57` — Rethink fetcher instantiation (open, P3, needs `/grill-me`)

## Files of Interest
- `packages/db/src/queries/albums.ts` — enriched/un-enriched query branching
- `packages/db/src/queries/types.ts` — `AlbumDetailTrack` type definition
- `apps/web/app/albums/[id]/page.tsx` — page with enrichment trigger
- `packages/db/src/enrichment.ts` — enrichment module (unchanged this session)
