# Plan: Album Detail Page — Enrichment + Artwork + Track Ordering

> Source PRD: [#43 — Album detail page: enrichment infrastructure + artwork + track ordering](https://github.com/julienbeghain/human-hum/issues/43)

## Architectural decisions

Durable decisions that apply across all phases:

- **Route**: `/albums/[id]` — existing route, no new routes
- **Schema**: `albums` table gains `image_url` (text, nullable) and `enriched_at` (timestamp, nullable). New `album_tracks` bridge table with PK `(album_id, track_number)` — see ADR 0001
- **Enrichment port**: `AlbumInfoFetcher` interface in `packages/db`, injected into `enrichAlbum`. LastFM implementation calls `album.getInfo`. True external dependency — mockable at the boundary
- **Enrichment trigger**: on-demand in the server component — if `enriched_at` is null, call `enrichAlbum` before rendering
- **Track matching**: exact name + artist match initially. `track_id` on `album_tracks` is nullable (unscrobbled tracks still appear)
- **Scrobble counts**: always computed live at query time via LEFT JOIN to scrobbles. Never stored on `album_tracks`
- **Failure mode**: enrichment failure does NOT set `enriched_at` (retries on next visit). Page falls back to scrobble-derived tracklist

---

## Phase 1: Schema migration + enrichment module

**User stories**: 7 (fast repeat visits), 8 (graceful degradation), 9 (retry on failure)

### What to build

The enrichment infrastructure in isolation, end-to-end testable without touching the web app. A Drizzle migration adds `image_url` and `enriched_at` to `albums` and creates the `album_tracks` bridge table. An `AlbumInfoFetcher` port defines the contract for fetching album metadata. A LastFM implementation calls `album.getInfo` and parses the response (artwork URL, tracklist with track numbers and durations). The `enrichAlbum` deep module orchestrates: check if already enriched, fetch via the port, write results to DB, match tracks where possible. Tests verify the module's behavior using PGLite and a fake fetcher.

### Acceptance criteria

- [ ] Drizzle migration adds `image_url` (text, nullable) and `enriched_at` (timestamp, nullable) to `albums`
- [ ] Drizzle migration creates `album_tracks` table with `(album_id, track_number)` PK, `name`, nullable `track_id` FK, nullable `duration`
- [ ] `AlbumInfoFetcher` interface defined with a method that accepts album name + artist name and returns artwork URL + tracklist
- [ ] LastFM implementation of `AlbumInfoFetcher` calls `album.getInfo`, extracts largest image URL, parses tracklist with rank and duration
- [ ] `enrichAlbum(db, { albumId, fetcher })` sets `image_url` and `enriched_at` on the album row
- [ ] `enrichAlbum` writes full tracklist to `album_tracks` with correct `track_number` values
- [ ] `enrichAlbum` matches `track_id` for tracks that exist in the `tracks` table (exact name + same artist)
- [ ] `enrichAlbum` leaves `track_id` as NULL for tracks not in the `tracks` table
- [ ] `enrichAlbum` returns early without API call if `enriched_at` is already set
- [ ] `enrichAlbum` does NOT set `enriched_at` if the API call fails — next visit retries
- [ ] `enrichAlbum` sets `enriched_at` but leaves `image_url` NULL if the album has no artwork on LastFM
- [ ] Tests pass using PGLite + fake fetcher covering: successful enrichment, idempotency, track matching, unmatched tracks, failure behavior, no-artwork case

---

## Phase 2: Query changes + page integration

**User stories**: 2 (album order), 4 (all tracks visible), 5 (0 plays for unscrobbled tracks)

### What to build

Update `getAlbumDetail` to use `album_tracks` for enriched albums. The query branches on `enriched_at`: enriched albums get their tracklist from `album_tracks` ordered by `track_number`, with scrobble counts via LEFT JOIN; un-enriched albums fall back to the current scrobble-derived query. The album detail page triggers enrichment when `enriched_at` is null, then renders tracks in album order. Tests verify both query paths.

### Acceptance criteria

- [ ] `getAlbumDetail` returns tracks in `track_number` order for enriched albums
- [ ] `getAlbumDetail` returns tracks in play-count order for un-enriched albums (existing behavior preserved)
- [ ] Scrobble counts are computed live — unscrobbled tracks show 0
- [ ] Return type includes `trackNumber` (nullable) and `duration` (nullable) per track
- [ ] Album detail page calls `enrichAlbum` when `enriched_at` is null before rendering
- [ ] Album detail page displays tracks in track_number order after enrichment
- [ ] Page degrades to scrobble-derived list if enrichment fails
- [ ] Tests for `getAlbumDetail` cover: enriched album track ordering, un-enriched fallback, live scrobble counts, unmatched tracks with 0 plays

---

## Phase 3: Album artwork

**User stories**: 1 (cover artwork on the page)

### What to build

Display the album's cover art on the detail page using Next.js `<Image>` for automatic optimization. The artwork URL is already fetched and stored by phase 1's enrichment. Handle the case where `image_url` is null (no artwork available) gracefully — show a placeholder or omit the image area.

### Acceptance criteria

- [ ] Album artwork displayed on the detail page when `image_url` is present
- [ ] Next.js `<Image>` component used with appropriate sizing
- [ ] No broken image when `image_url` is null — graceful fallback (placeholder or omitted)
- [ ] Artwork is visually integrated with the existing header layout (album name, artist link, scrobble count)

---

## Phase 4: Sort toggle + duration column

**User stories**: 3 (toggle sort order), 6 (track duration)

### What to build

A `"use client"` leaf component that wraps the track table. It receives the full track array from the server and provides a toggle to switch between track-number order (default) and scrobble-count order. The duration column displays each track's duration in a human-readable format. Client-side only — no server round-trip on toggle.

### Acceptance criteria

- [ ] Track table defaults to track-number order
- [ ] Toggle switches to scrobble-count order (descending) and back
- [ ] Sort state does not cause a server round-trip — client-side array sort only
- [ ] `"use client"` boundary is limited to the table + toggle, not the whole page
- [ ] Duration column displays track duration in mm:ss format
- [ ] Duration column handles null duration gracefully (blank or dash)
