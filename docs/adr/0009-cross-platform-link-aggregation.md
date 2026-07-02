# ADR 0009: Cross-platform link aggregation

## Status

Accepted — 2026-07-02 · **Roadmap — deferred, not in the active build.** The decision stands, but
cross-platform links / share are a future roadmap item. The current build (identity model + platform
agnosticism, ADR-0007/0008) captures ISRC/UPC for identity/dedup only; this capability consumes those keys
later. See `docs/roadmap.md`.

> Supersedes [ADR-0005](0005-tidal-catalog-enrichment-source.md) on link storage: the single
> per-edition `album_tracks.tidal_link` is replaced by a recording-grain, per-platform link store. Builds
> on the recording identity key (ISRC) established in [ADR-0007](0007-release-recording-artist-identity-model.md)
> and the platform-agnosticism stance in [ADR-0008](0008-platform-agnosticism-system-of-record.md).

## Context

The reason Human Hum queries multiple platforms is **not** metadata coverage — one good metadata set is
enough (ADR-0008). It is to let a user **share a recording without knowing the recipient's platform**: share
once from Human Hum, and the recipient opens it on TIDAL, Spotify, Apple Music, or Deezer — whichever they
use. This is the "smart URL" pattern (cf. Odesli / song.link).

That capability needs a *set* of links per recording — one per platform — not a single winner. ADR-0005
stored one `tidal_link` per `album_tracks` row (edition grain, single platform), which cannot express a
multi-platform set and sits at the wrong grain: a share link is for the recording, not one album edition.

The enabler is **ISRC** (ADR-0007): the portable recording key that resolves the same recording across every
platform's catalog.

## Decision

**Store platform links at recording grain in a dedicated table.**

```
track_platform_links (
  track_id         → tracks.id,
  platform,                       -- enrichment/link source enum
  url,                            -- the shareable link
  platform_track_id               -- the platform's own id for the recording
)
PK (track_id, platform)           -- one link per platform per recording
```

This supersedes `album_tracks.tidal_link` / `album_tracks.tidal_track_id`: links move from the per-edition
row to the recording (`tracks`), matching where ISRC lives (ADR-0007, D3).

**No link is canonical — the end user picks.** Human Hum stores the set; the share UI presents every
available platform and the recipient chooses.

**Links are collected by fan-out, keyed by ISRC — but the direct match never needs ISRC.**

- When a recording is matched on a platform (album-first, exact name+artist — ADR-0005 discipline), that
  platform's link is stored directly, ISRC or not.
- If that match yields an ISRC, it becomes the key to fan out to the *other* platforms
  (`?filter[isrc]=`), storing each one's link.
- **Empty ISRC ⇒ store only the directly-matched platform's link; do not fan out by name search.** A wrong
  "listen on X" link is worse than a missing one (search rank is imprecise — confirm by artist, never trust
  rank). Fewer links, never a wrong link.

**Non-catalog recordings hold zero platform links** — correct by design: content on no streaming platform
(ADR-0008) has nothing to share to one.

**Links are regenerated, not snapshotted** (ADR-0008) — they are derived enrichment; a reseed re-runs the
fan-out.

## Alternatives considered

**Keep the single `album_tracks.tidal_link`.** Rejected: it holds one platform at edition grain and cannot
represent the multi-platform set the feature requires.

**Store links at edition grain (`album_tracks`).** Rejected: a share link is for the recording; the same
recording on multiple albums would duplicate and risk divergent links.

**Name-search fan-out when ISRC is absent.** Rejected for v1: imprecise search rank risks attaching the
wrong recording's link — worse than offering fewer links. A clearly-flagged best-effort mode is a possible
later enhancement.

**Fold this into ADR-0008.** Rejected: link aggregation is a distinct capability with its own data model and
rationale; keeping it separate keeps each ADR independently revisable.

## Consequences

- `track_platform_links` is populated during enrichment, once per platform the recording resolves on.
- Album-level share links (by UPC) are a later additive step; track links are the core.
- Reissues carrying a fresh ISRC may not cross-link — an accepted v1 gap.
- A new platform joins the fan-out by adding an enum value and a resolver; a reseed backfills its links.
- The share UI depends only on this table, not on any one platform being reachable.
