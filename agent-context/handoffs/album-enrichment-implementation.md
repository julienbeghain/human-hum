# Handoff: Album Enrichment — Query Integration Next

**Date**: 2026-05-16 16:15
**Branch**: feat/album-tracks-schema

## Goal
On-demand album enrichment for `/albums/[id]` — artwork, track ordering, duration from LastFM `album.getInfo`.

## Current State
Phase 1 fully complete (schema + enrichment module). Branch rebased on main. All quality gates green. Beads issues `human-hum-ebq` and `human-hum-4z3` closed. GH #44 and #45 still open on GitHub (work done, need closing).

**Also done this session (on main):**
- Beads upgraded v0.61.0 → v1.0.4 (Homebrew)
- `bd doctor --fix` untracked 13 sensitive/runtime files, updated .gitignore
- Agent instruction misalignments fixed (removed `bd dolt push`, rewrote agent-workflow.md, deleted progress.txt)
- Feature branch rebased on main — no more beads file noise

## What's Left
1. **Close GH #44 and #45** — work committed, just need GitHub closure
2. **`human-hum-iky`** (GH #46) — Query + page integration:
   - Update `getAlbumDetail` for enriched/un-enriched paths
   - Trigger enrichment on page visit when `enriched_at` is null
   - Render tracks in album order
3. **`human-hum-3lv`** (GH #47) — Album artwork via Next.js `<Image>`
4. **`human-hum-3tj`** (GH #48) — `"use client"` sortable track table + duration column

## Key Decisions
- `album_tracks` PK is `(album_id, track_number)` — see `docs/adr/0001-album-tracks-bridge-table.md`
- `enriched_at` separates "has been enriched" from "has artwork"
- Failure does NOT set `enriched_at` — retries on next visit
- `enrichAlbum` propagates fetcher errors — caller decides error UX
- Track matching: exact name + same artist only
- No Dolt remote — skip `bd dolt push` in session close

## Gotchas
- `getAlbumDetail` currently derives tracks via GROUP BY on scrobbles. Enriched path is completely different query shape (from `album_tracks` with LEFT JOIN).
- `scrobbles.album_id` is nullable — enrichment queries must handle this.
- LastFM `tracks.track` can be a single object (not array) when album has 1 track — handled in `LastfmAlbumInfoFetcher`.

## Active Workflow
- `/feature-workflow` Step 6 (Build) — `human-hum-iky` is next ready issue
- Plan: `agent-context/plans/2026-05-13-issue-43-album-enrichment.md`
- PRD: https://github.com/julienbeghain/human-hum/issues/43

## Suggested Skills
- `/feature-dev` for `human-hum-iky` — involves both DB queries and React page changes
- `/tdd-loop` could work for just the query portion if scoped tightly

## Beads Issues
- `human-hum-iky` — Query + page integration (open, **unblocked**, next up)
- `human-hum-3lv` — Album artwork (open, blocked by iky)
- `human-hum-3tj` — Sort toggle + duration (open, blocked by iky)

## Files of Interest
- `packages/db/src/enrichment.ts` — enrichment module (interface + orchestrator)
- `packages/db/src/enrichment.test.ts` — 7 tests showing PGLite testing pattern
- `packages/db/src/queries/albums.ts` — current `getAlbumDetail` (to be modified next)
- `apps/web/app/albums/[id]/page.tsx` — album detail page (to be modified next)
