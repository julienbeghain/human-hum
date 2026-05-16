# Handoff: Album Enrichment — Artwork & Sort Toggle Remain

**Date**: 2026-05-16 17:28
**Branch**: feat/album-tracks-schema

## Goal
On-demand album enrichment for `/albums/[id]` — artwork, track ordering, duration from LastFM `album.getInfo`.

## Current State
Phases 1-2 complete plus fetcher refactor. Schema, enrichment module, query integration, page integration, and fetcher cleanup all done. Migration applied to Neon.

This session completed:
- `/grill-with-docs` on fetcher instantiation — decided to absorb `LastfmAlbumInfoFetcher` into `enrichAlbum` as a deep module default
- `enrichAlbum` now takes optional `fetcher?` — production callers pass nothing, tests pass fakes
- `LastfmAlbumInfoFetcher` is no longer exported (implementation detail)
- `createDefaultFetcher()` throws if `LASTFM_API_KEY` is missing (configuration error, not silent skip)
- Album page simplified to `enrichAlbum(db, { albumId })` — no API key wiring
- Beads `human-hum-e57` closed
- Committed as `6f24770` and pushed

## What's Left
1. **`human-hum-3lv`** (GH #47) — Album artwork via Next.js `<Image>` with null fallback
2. **`human-hum-3tj`** (GH #48) — `"use client"` sortable track table + duration column
3. These two are independent — can be done in either order
4. After both: Step 7 (test review), Step 8 (sync back to GH), Step 9 (wrap up) per the feature workflow

## Key Decisions
- Enrichment fetcher is absorbed into `enrichAlbum` — the module owns its external dependency (deep module principle)
- Optional `fetcher?` parameter is the test seam — no second function, no factory pattern
- Missing API key throws immediately — configuration error, not graceful degradation
- `sync.ts` was NOT refactored — server action is the right boundary for wiring env vars; its `createDb()` call is a separate concern
- Enrichment is blocking (page waits for API call on first visit) — deliberate simplicity choice from prior session

## Active Workflow
- `/feature-workflow` Step 6 (Build) — two sub-issues remain
- Plan: `agent-context/plans/2026-05-13-issue-43-album-enrichment.md`
- PRD: https://github.com/julienbeghain/human-hum/issues/43

## Suggested Skills
- `/feature-dev` for either `human-hum-3lv` or `human-hum-3tj` — both are small, focused UI tasks
- `/tdd` not needed — they're client component + styling work, not query logic

## Beads Issues
- `human-hum-3lv` — Album artwork display (open, **unblocked**, P2)
- `human-hum-3tj` — Sort toggle + duration (open, **unblocked**, P2)

## Files of Interest
- `packages/db/src/enrichment.ts` — enrichment module with absorbed fetcher
- `apps/web/app/albums/[id]/page.tsx` — simplified page with `enrichAlbum(db, { albumId })`
- `packages/db/src/queries/albums.ts` — enriched/un-enriched query branching
