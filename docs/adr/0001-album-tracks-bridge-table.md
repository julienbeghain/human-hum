# ADR 0001: Album tracks as a bridge table with stored names

## Status

Accepted — 2026-05-13

> **Forward note (2026-06-14):** Per [ADR-0003](0003-rename-scrobble-to-hum.md), the recorded play event was renamed from "scrobble" to **hum** and the `scrobbles` fact table to `listen.hums`. Read every "scrobble" / "scrobble count" / "scrobbles table" below as "hum" / "hum count" / "`listen.hums`". This record is left otherwise unchanged.

## Context

The album detail page needs to display tracks in their original album order (by track number) with scrobble counts. The current schema has no concept of track number — tracks are linked to albums only through scrobbles, and displayed ranked by play count.

Album metadata (tracklist, artwork, duration) comes from LastFM's `album.getInfo` API via on-demand enrichment. The tracklist from that API may not perfectly match the tracks already in the `tracks` dimension table (name variations, missing MBIDs, tracks the user has never scrobbled).

## Decision

Introduce an `album_tracks` bridge table that stores the full tracklist from the enrichment API:

```
album_tracks
├── album_id      integer, FK → albums.id, NOT NULL
├── track_number  integer, NOT NULL
├── name          text, NOT NULL           -- from album.getInfo
├── track_id      integer, FK → tracks.id  -- nullable
├── duration      integer                  -- seconds, nullable
├── PRIMARY KEY (album_id, track_number)
```

Key choices:

- **`name` is stored directly** rather than relying solely on `track_id` to resolve the name. This means the album page can show the complete tracklist even when tracks haven't been scrobbled or can't be matched.
- **`track_id` is nullable.** When a match to an existing track is found, it's linked. When not, the row still represents a real track on the album — it just has no scrobble data.
- **PK is `(album_id, track_number)`** not `(album_id, track_id)`, because unmatched tracks have no `track_id`. A track appears at most once per album at a given position.
- **Scrobble counts are computed at query time** by LEFT JOINing through `track_id` to the scrobbles table. They are never stored on `album_tracks`.

## Alternatives considered

**Match-only approach** — only create `album_tracks` rows for tracks that match existing rows in `tracks`. Simpler, but the album page would show gaps (missing tracks the user never scrobbled), making it look broken rather than informative.

**Store track number on scrobbles** — mirrors the existing pattern of album-on-scrobble. Rejected because it denormalizes (same value repeated per scrobble) and requires backfilling every scrobble row.

**Store track number on tracks** — simple, but wrong when the same track appears on multiple albums at different positions (deluxe editions, compilations).

## Consequences

- The album page shows a complete tracklist that looks like the back of a record sleeve, with 0-scrobble tracks visible as useful information.
- Track matching logic (exact name, MBID, fuzzy) is an implementation detail hidden inside the enrichment module — it can be improved over time without schema changes.
- The `album_tracks` table is populated by enrichment, not by the import/sync pipeline. It has no timestamps.
