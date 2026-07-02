# ADR 0008: Platform agnosticism — Human Hum is the system of record

## Status

Accepted — 2026-07-02

> Supersedes [ADR-0005](0005-tidal-catalog-enrichment-source.md) on TIDAL's role: TIDAL is no longer a
> *supplemental* source that fills LastFM's gaps — it is the **preferred** enrichment source and LastFM
> becomes the fallback. **Extends** [ADR-0004](0004-enrichment-completion-per-source.md): its per-`(entity,
> source)` completion *model* is reaffirmed, but the deferral it set ("two columns beat a table at two
> sources; the table stays deferred until a third album-enriching source exists") has **triggered** — with
> TIDAL + LastFM + Deezer + Apple Music confirmed, completion moves from per-source marker *columns* to a
> normalized **`album_sources`** table.

## Context

Human Hum records what a user listens to and must remain durable across the platforms it draws from. Two
facts force a system-of-record stance rather than a mirror-of-one-platform stance:

- **Some hums are for content no streaming catalog will ever carry** — e.g. an audio-only rip of the
  *Welcome to Sunny Florida* Tori Amos DVD. A model that assumes every recording resolves to a streaming
  catalog is wrong.
- **The only reprovisionable, durable catalog source is TIDAL.** Spotify's Feb→Mar 2026 Dev Mode lockdown
  makes a replacement app strictly weaker (Premium-gated, one Client ID per developer, endpoint-restricted);
  the grandfathered app is a scarce, non-renewable asset. LastFM is rate-limited and lossy on history.

ADR-0005 built TIDAL as a *supplemental* source: LastFM `album.getInfo` drove enrichment (created
`album_tracks`, filled artwork) and TIDAL filled the gaps, with a load-bearing ordering coupling (LastFM's
delete-recreate of `album_tracks` must never run after TIDAL). The pivot inverts the roles, so that coupling
must be dismantled, not preserved.

## Decision

**Hums are tier-0 ground truth; all enrichment is derived and regenerated, never authoritative.** The
system of record is the hum event plus resolved identity (ADR-0007). Artwork, tracklist, durations, ISRC,
UPC, links — all enrichment — are regenerated from sources and are never the thing of record. The hum
snapshot / reseed infra (`packages/db/src/snapshot.ts`, `apps/import/src/{export,reseed}.ts`) is the
enforcement mechanism: the database can be rebuilt from the snapshot with no source re-pull, so enrichment
is safe to throw away and regenerate.

**Display-metadata enrichment is a priority ladder, not a single source.** For the one authoritative set of
displayed metadata per album (artwork, tracklist, durations, release type):

- **TIDAL is preferred** — durable, reprovisionable, carries the identity keys.
- **A future catalog source (Deezer / Apple Music, undecided) is a documented seam** below TIDAL — recorded
  as intent, **not built** (picking one now would be speculative).
- **LastFM is the floor** — the only source that carries non-catalog content, so it can never be removed
  from the enrichment role. It runs only when higher rungs no-match.
- Coverage is explicitly **not** the goal — one good metadata set is enough. The strategic payoff of
  multiple sources is cross-platform links (ADR-0009, roadmap), not filling metadata holes.

**Per-source completion lives in a normalized `album_sources` table, not marker columns.**

```
album_sources (album_id → albums.id, source, enriched_at, matched)
PK (album_id, source)
```

One row per (album, source): `enriched_at` records that the source's pass ran (a no-match is a *completed*
pass — ADR-0005 — with `matched = false`), so a source's own row is its self-gate. This replaces
`albums.lastfm_enriched_at` / `albums.tidal_enriched_at`. A new source (Deezer, Apple Music) is a new
**row**, never a new column — the scaling the ADR-0004 deferral was waiting to justify. No source's row
gates another's.

**The ADR-0005 ordering coupling is replaced by album-level source exclusivity.** The preferred source that
matches an album *owns* its metadata; a lower rung runs only when every higher rung has an `album_sources`
row with `matched = false`. LastFM's delete-recreate therefore only ever runs on albums TIDAL never
matched — nothing to clobber.

**Provenance is first-class and UI-surfaced, but derived — not a stored column.** Which source supplied an
album's displayed metadata is the highest-priority `album_sources` row with `matched = true`, so the UI can
show "tracklist via Last.fm" without a denormalized `enrichment_source` pointer to keep in sync. Album-level
for v1; per-field provenance is an additive later step.

**Spotify is a fragile, opportunistic participant, never depended on.** It is kept out of the metadata
ladder (its metadata access is non-reprovisionable and Premium-gated) but stays in the link fan-out
(ADR-0009) for its share link, and remains the hum-import source (#10). The grandfathered dev app must not
be deleted.

## Alternatives considered

**LastFM narrowed to hums only, dropped from enrichment.** Rejected: non-catalog content means some
recordings have no streaming source at all, so LastFM enrichment is a permanent necessity, not a temporary
patch.

**Collapse to a single TIDAL enrichment marker.** Rejected: multi-source enrichment is permanent, so
ADR-0004's per-source completion is required, not superseded.

**Keep TIDAL supplemental (ADR-0005 ordering).** Rejected: TIDAL is the durable primary; making LastFM
authoritative over the reprovisionable catalog source inverts the durability we actually have.

## Consequences

- The on-visit album path runs the ladder top-down, each rung self-gated by its own `album_sources` row;
  the first rung that matches owns the metadata and is the derived provenance.
- `apps/web/lib/load-album-detail.ts` flips from LastFM-first to TIDAL-first; the LastFM
  `album.getInfo` pass moves from *driver* to *floor fallback*.
- Adding a source later (Deezer/Apple Music) is additive: an enum value and a matcher — completion is just
  new `album_sources` rows, no schema change — then a reseed regenerates enrichment through the new ladder.
- LastFM remains the primary *hum* source; this ADR only changes its *enrichment* role. Hum source vs
  enrichment source stay distinct roles (CONTEXT.md).
