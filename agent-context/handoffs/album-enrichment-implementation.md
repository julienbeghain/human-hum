# Handoff: Album Enrichment — Enrichment Module Done, Query Integration Next

**Date**: 2026-05-16 15:45
**Branch**: feat/album-tracks-schema

## Goal
On-demand album enrichment for `/albums/[id]` — artwork, track ordering, duration from LastFM `album.getInfo`. Makes the album page feel like a record sleeve instead of a data table.

## Current State
Phase 1 is fully complete (schema + enrichment module). Working tree is clean except beads metadata. No PR opened yet — the branch has more work ahead.

**Done (5 commits on branch):**
- Drizzle migration `0003_exotic_wolf_cub.sql` adds `image_url` + `enriched_at` to `albums`, creates `album_tracks` bridge table
- `schema.ts` updated with `albumTracks` table definition
- 7 schema tests in `schema.test.ts`
- `enrichment.ts`: `AlbumInfoFetcher` interface, `LastfmAlbumInfoFetcher` class, `enrichAlbum` deep module
- `enrichment.test.ts`: 7 PGLite + fake fetcher tests (success, idempotency, track matching, unmatched tracks, failure, no-artwork, empty tracklist)
- Test DDL derived from Drizzle migration files in `test-utils.ts`
- Beads issues `human-hum-ebq` and `human-hum-4z3` closed

**Still open on GitHub:**
- GH #44 (schema) — work done, needs closing on GitHub
- GH #45 (enrichment module) — work done, needs closing on GitHub

## What's Left
In dependency order:

1. **Close GH #44 and #45** — work already committed, just need GitHub issue closure
2. **`human-hum-iky`** (GH #46) — Query + page integration:
   - Update `getAlbumDetail` for enriched/un-enriched paths
   - Trigger enrichment on page visit when `enriched_at` is null
   - Render tracks in album order
3. **`human-hum-3lv`** (GH #47) — Album artwork via Next.js `<Image>`
4. **`human-hum-3tj`** (GH #48) — `"use client"` sortable track table + duration column

## Key Decisions
- `album_tracks` PK is `(album_id, track_number)` — unscrobbled tracks have no track_id. See `docs/adr/0001-album-tracks-bridge-table.md`
- `enriched_at` separates "has been enriched" from "has artwork"
- Failure does NOT set `enriched_at` — retries on next visit
- `AlbumInfoFetcher` is a port interface; `LastfmAlbumInfoFetcher` is the adapter
- Track matching: exact name + same artist. Fuzzy matching deferred.
- Scrobble counts always computed at query time via LEFT JOIN, never stored
- `enrichAlbum` propagates fetcher errors (doesn't swallow them) — caller decides error UX

## Gotchas
- Track names from `album.getInfo` may not match `tracks` table entries (casing, remaster suffixes). Exact match only for now.
- `scrobbles.album_id` is nullable — some scrobbles have no album. Enrichment queries must handle this.
- `getAlbumDetail` in `packages/db/src/queries/albums.ts` currently derives tracks from scrobbles via GROUP BY. The enriched path is a completely different query shape (from `album_tracks` with LEFT JOIN).
- LastFM `tracks.track` can be a single object (not array) when album has 1 track — `LastfmAlbumInfoFetcher` handles this.

## Active Workflow
- `/feature-workflow` Step 6 (Build) — `human-hum-iky` is next ready issue
- Plan: `agent-context/plans/2026-05-13-issue-43-album-enrichment.md`
- PRD: https://github.com/julienbeghain/human-hum/issues/43
- ADR: `docs/adr/0001-album-tracks-bridge-table.md`

## Suggested Skills
- `/feature-dev` — for `human-hum-iky` (query changes + page integration requires understanding both DB queries and the React page)
- `/tdd-loop` — could work for just the query changes portion if scoped tightly

## Beads Issues
**Album enrichment epic:**
- `human-hum-ebq` — Schema migration (closed)
- `human-hum-4z3` — Enrichment module (closed)
- `human-hum-iky` — Query + page integration (open, **unblocked**, next up)
- `human-hum-3lv` — Album artwork (open, blocked by iky)
- `human-hum-3tj` — Sort toggle + duration (open, blocked by iky)

## Files of Interest
- `packages/db/src/enrichment.ts` — the enrichment module just built (interface + orchestrator)
- `packages/db/src/enrichment.test.ts` — 7 tests as examples of the testing pattern
- `packages/db/src/queries/albums.ts` — current `getAlbumDetail` (to be modified next)
- `apps/web/app/albums/[id]/page.tsx` — album detail page (to be modified next)
- `packages/db/src/schema.ts` — schema with `albumTracks` table (lines 53-68)
