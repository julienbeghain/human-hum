# ADR 0004: Enrichment completion is tracked per (entity, source)

## Status

Accepted — 2026-06-15

> **Forward note (2026-07-01):** Superseded on the concrete column shape by [ADR-0005](0005-tidal-catalog-enrichment-source.md), which built TIDAL as the second album-enriching source. The per-`(entity, source)` completion model below stands, but `listen.albums.enriched_at` was renamed to **`lastfm_enriched_at`** and a second column **`tidal_enriched_at`** was added (two columns, not a completion table). Read every "`enriched_at`" below as "`lastfm_enriched_at`". This record is left otherwise unchanged.

## Context

Enrichment fetches supplementary metadata for an entity from an external API. Today there is exactly one enrichment source — LastFM `album.getInfo`, which enriches an **album** with artwork and its tracklist — and a single nullable `listen.albums.enriched_at` timestamp records that it ran. The on-visit gate in the album detail page reads that column as "already enriched, do not enrich again."

A second source, TIDAL, is planned. It is not confined to tracks: as well as filling missing track durations and attaching canonical track links, TIDAL can enrich the **album** itself (artwork, album-level metadata). So enrichment is becoming both **multi-source** (LastFM, TIDAL, possibly more) and **multi-grain** (a source may enrich an album and/or its tracks), and the sources have **independent failure modes** — TIDAL can be down while LastFM succeeded, or match an album's tracks but not the album.

A single `enriched_at` boolean-in-disguise cannot express "LastFM done, TIDAL pending/failed." Overloading it would recreate — one layer up — the exact partial-completion bug we are fixing at the single-source level: a TIDAL failure would either hide behind LastFM's flag or block/undo LastFM's result.

## Decision

Treat enrichment completion as conceptually keyed by **(entity, source)**, set if and only if *that source's* enrichment of *that entity* fully succeeded.

- **Keep the single `listen.albums.enriched_at` column for now.** It is the degenerate one-source case: it means "this album has been enriched by LastFM," not "this album is finally, fully enriched." No schema is added for a source that does not yet exist.
- **When the second album-enriching source (TIDAL) lands, completion migrates to a per-source representation** — per-source columns or a small completion table; the TIDAL work owns that shape — rather than overloading `enriched_at`. The migration is additive, so deferring it forecloses nothing.
- **One source's failure must never block or undo another source's completion.** Each source sets its completion marker only after its own data is durably written, so a partial write never presents as complete; cross-source state is independent.
- **The on-visit gate stays single-source today** (`if album.enriched_at, skip`) and becomes per-source when the second album-enriching source arrives.

## Alternatives considered

**A single global "enriched" flag per entity.** Rejected: it cannot represent partial multi-source completion, and independent source failures poison each other — a TIDAL outage would either mark the album un-enriched and re-run LastFM, or hide that TIDAL never ran.

**Build the per-source completion model now** (e.g. an `album_enrichments` table keyed by `(album_id, source)`). Rejected as speculative: the second source does not exist yet, so its real requirements (no-confident-match state, status values, album-vs-track grain) would be guessed and almost certainly reshaped when TIDAL is actually built. The additive migration later costs nothing now.

## Consequences

- `enriched_at` keeps meaning exactly what today's code makes it mean — the LastFM album pass — so this decision changes no current behaviour; it fixes the shared *model* so the TIDAL work does not overload the column.
- The album page's "already enriched" gate is explicitly single-source and is a known migration point for the first multi-source-album work.
- Whoever builds TIDAL enrichment inherits a recorded boundary: add per-source completion; do not gate TIDAL on `enriched_at`.
