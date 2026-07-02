# ADR 0007: Release / recording / artist identity model

## Status

Accepted — 2026-07-02

> Establishes the canonical identity layer (artist M2M, ISRC/UPC keys, release type) that the
> TIDAL-primary enrichment reshape ([ADR-0008](0008-platform-agnosticism-system-of-record.md)) builds
> on. Partially supersedes [ADR-0005](0005-tidal-catalog-enrichment-source.md) on ISRC storage grain:
> ISRC's canonical home moves from `album_tracks` (per-edition) to `tracks` (the recording).

## Context

Today's schema models identity single-artist and single-source. `tracks` and `albums` each carry one
scalar `artist_id` FK, so a track credited to two artists cannot be represented — the second credit is
lost, fragmenting the same recording across artist rows. `isrc` lives on `album_tracks` (per-edition),
which is the wrong grain for a key that identifies a recording. There is no `release_type` column. And
`mbid` (LastFM-sourced) is treated as a usable external id.

Research (the 2026-06-21 grill plus the 2026-06-17 catalog probes, synthesised in the `~/Vaults/humanhum`
research vault) settled the model:

- **Artist credit is many-to-many**, in credit order — this is how both TIDAL (`/relationships/artists`)
  and Spotify (`artists[]`) natively return it, and it fixes the fragmentation bug.
- **The industry identity keys the DSPs actually expose are ISRC (recording) and UPC (release)** — both
  present in ~100% of the TIDAL probe. Neither is schema-guaranteed (Spotify's `external_ids` wobbled
  Feb→Mar 2026; reissues get fresh ISRCs), so neither can be required.
- **There is no portable cross-platform artist key.** The standard one (ISNI) is absent from both
  catalog APIs; platform artist IDs are proprietary and non-portable. So internal artist identity stays
  name-based.
- **`mbid` is unreliable** — several 404 against MusicBrainz, others are bare stubs; MB's ISRC index is
  near-empty. It cannot be an identity or credit-resolution key.
- **Release type differs across primaries** — TIDAL has `ALBUM/EP/SINGLE` (no `COMPILATION`), Spotify has
  `album/single/compilation` (no `EP`). Neither emits the full set our glossary defines.

## Decision

**1. Artists are many-to-many via join tables, with a denormalized lead-artist scalar retained.**
Add `track_artists (track_id → tracks.id, artist_id → artists.id, credit_order int)` and
`album_artists (album_id → albums.id, artist_id → artists.id, credit_order int)`, each with composite PK
`(entity_id, artist_id)` and an index on `artist_id` for reverse lookups. Track credits attach at the
**recording** grain (`tracks`), not the per-edition `album_tracks` — the same recording carries the same
performers on every album, so one truth avoids drift. Album credits attach at the **release** grain
(`albums`). `credit_order` is a plain app-owned int filled from the source array's index (a stripped-down
DDEX SequenceNumber). The existing scalar `tracks.artist_id` / `albums.artist_id` **stay**, mirroring
`credit_order = 0` — the lead artist — so the `(name, lead-artist)` bootstrap and today's unique dedup
indexes remain cheap scalar lookups.

**2. Performer tier only; roles deferred.** `track_artists` carries no `role` column. It models the
billed/performing tier (ID3 `TPE1`/`ARTISTS`). Producers, writers, engineers — the full DDEX contributor
graph — are the separate ISRC-keyed Credits.fm layer (its own pending ADR), and TIDAL under client-creds
returns no role data anyway. A `role` column would be unpopulated and speculative; it is an additive
migration if that layer lands.

**3. Identity keys are ISRC (recording) and UPC (release), used only when present.**
- `tracks.isrc` (nullable) is the canonical ISRC home. `album_tracks.isrc` remains the enrichment
  *staging* cell where TIDAL first observes it per matched track, flowing up to the linked `tracks` row.
- `albums.upc` (nullable) holds the release barcode.
- Both enforce dedup **only where present**, via a partial unique index (`unique(isrc) where isrc is not
  null`, `unique(upc) where upc is not null`). Neither is ever `NOT NULL`.
- `(name, lead-artist)` remains the non-blocking bootstrap that lets a row exist with no external key.

**4. `mbid` is a non-authoritative hint, not a key.** Keep the columns on `artists`/`albums`/`tracks`, but
never dedup or resolve credits through them. Credits resolve ISRC → Credits.fm, never via `mbid`.

**5. `release_type` is a nullable enum `{album, single, ep, compilation}`.** TIDAL is authoritative for
`album`/`single`/`ep` (the only primary that distinguishes EP). `compilation` is **derived** — set when
the album artist resolves to *Various Artists* or >1 distinct album artist across the tracklist — not read
from a source enum value, since TIDAL cannot label it and Spotify's label is not trusted to override.
Null = unknown until enriched.

## Alternatives considered

**Fully normalize — drop the scalar `artist_id`, derive lead from `credit_order = 0`.** Rejected: the
identity bootstrap and dedup rest on `(name, lead-artist)`, which wants to stay a directly-indexable
scalar. Dropping it forces a function/materialized index and reworks every existing query and both unique
indexes for a sync cost that is small and local ("set it to whoever is credit-order 0").

**Add a `role` column now.** Rejected as speculative — see Decision 2.

**Keep ISRC on `album_tracks` as canonical.** Rejected: ISRC identifies a recording, so storing it
per-edition gives the same recording a separate cell on every album — the wrong grain for a dedup key.

**`NOT NULL` on ISRC/UPC.** Rejected: neither is schema-guaranteed at the source, and requiring them would
block ingestion of the bootstrap `(name, lead-artist)` records that must always be allowed to exist.

**Drop `mbid`.** Rejected: the columns are harmless as opportunistic hints; the hazard is *trusting* mbid
as a key, which Decision 4 forbids. Dropping buys nothing.

## Consequences

- Migrations are **additive** (new tables, new nullable columns, partial-unique indexes). The hum-snapshot
  reseed path makes even a non-additive reshape cheap — rebuild from the snapshot, no LastFM re-pull.
- The denormalized `artist_id` must be kept equal to `credit_order = 0` wherever credits are written — a
  local invariant the write path owns.
- `compilation` detection depends on album-artist multiplicity being resolved, so it is a post-enrichment
  determination, not known at ingest.
- Cross-platform artist identity remains unsolved by design (no portable key exists); platform artist IDs,
  if ever stored, are disposable linkage, never identity — consistent with ADR-0008.
