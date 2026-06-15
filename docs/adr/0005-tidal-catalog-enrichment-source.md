# ADR 0005: TIDAL is a second, catalog-only enrichment source

## Status

Accepted — 2026-06-15

## Context

LastFM is today's only enrichment source: `album.getInfo` fills an album's artwork and
tracklist, gated by the single `listen.albums.enriched_at` marker. Two gaps motivate a
second source. LastFM frequently returns **no album artwork** (a null image, or its
shared star placeholder), and it carries **no track durations or canonical links**. TIDAL's
catalog has reliable cover art, ISO-8601 track durations, stable track ids, ISRCs, and
shareable track links.

ADR-0004 already decided that enrichment completion is keyed per `(entity, source)` and
deferred the concrete per-source shape to "whoever builds the second source," with a
recorded mandate: add per-source completion, do not overload `enriched_at`, do not let one
source's failure block another's. ADR-0004 also anticipated that TIDAL would be
**multi-grain** — enriching the album (artwork) as well as its tracks. This ADR is that work.

TIDAL exposes two different surfaces with two different auth models: **catalog reads**
(search, album/track lookup) authenticate with an app-level **client-credentials** token,
while anything that writes on a user's behalf (playlist creation, library changes) requires
**user OAuth**. Only catalog reads are needed here.

## Decision

Add TIDAL as a **supplemental, catalog-only** enrichment source alongside LastFM.

- **Auth split.** Catalog reads use a client-credentials app token (cached in-memory with
  expiry). The user-OAuth write surface (playlist export, future direct integration) is out
  of scope and must never be wired through the catalog token.

- **Data-model grain.** TIDAL is multi-grain under a single pass. Per-track data
  (`tidal_track_id`, `isrc`, `tidal_link`, and `duration` filled only when null) lands on
  **`album_tracks`** — the album-context grain (ADR-0001), not `tracks`, which collapses every
  edition into one row and has no album column. Album **artwork** fills **`albums.image_url`**
  when LastFM's value is missing — null *or* the LastFM star placeholder — so TIDAL repairs
  the placeholder case, not only the null subset. TIDAL never overrides genuine LastFM art.
  Cost accepted: the same recording on N albums is looked up N times (no cross-album reuse).

- **Per-source completion.** Add an `albums.tidal_enriched_at` column (album grain, mirroring
  the existing marker) and rename `albums.enriched_at` → `albums.lastfm_enriched_at`. The
  rename removes the asymmetry ADR-0004 flagged: `enriched_at` reads as "fully enriched" when
  it only ever meant the LastFM pass. Two columns beat a completion table at two sources; the
  table stays deferred until a third album-enriching source or a real status vocabulary exists.

- **The TIDAL pass reads `lastfm_enriched_at` as a data precondition, and this honours
  ADR-0004.** TIDAL supplements rows LastFM creates, so it no-ops until the tracklist exists;
  reading the LastFM marker is the cheapest way to detect "rows are durable." This is a genuine
  data dependency, not the failure-coupling ADR-0004 forbids: TIDAL's own skip/completion gate
  is `tidal_enriched_at` (not overloaded), a LastFM failure only *defers* TIDAL (it never undoes
  or hides it), and the two markers stay independent.

- **No-match is final, transient failure is not.** A pass that searches and confidently finds
  nothing — whole-album (album absent from TIDAL) or per-track (no counterpart in the matched
  tracklist) — is a *completed* pass: it writes `tidal_enriched_at` and is never retried. A
  no-match track is represented by `tidal_enriched_at IS NOT NULL` ∧ `tidal_track_id IS NULL`,
  with no per-track status column. A transient failure (429/5xx/network) throws before the
  marker write, leaving it null for a clean retry on the next visit. As with LastFM, the
  completion marker is written **last**, only after all data is durable.

- **Matching favours precision over recall.** Album-first: search TIDAL for the album, keep
  only results whose normalized title and artist match, pick the highest `popularity` as a
  tie-break, and treat "no exact normalized-title match" as a whole-album no-match rather than
  fuzzy-guessing — attaching the wrong edition's ids and links is worse than no data. Within the
  matched album, align tracks by normalized name (the existing `normalizeTrackName`); a
  non-unique normalized name is a no-match rather than a mis-assignment. ISRC is stored output,
  not a join key — LastFM provides none on the first pass.

- **Country.** Catalog requests send a hardcoded `countryCode=GB` constant for deterministic,
  market-scoped results. Under multi-user auth this becomes a per-user-profile value.

## Alternatives considered

**Store TIDAL per-track data on `tracks`.** Rejected: `tracks` is keyed `(name, artist_id)`
and has no album column, so it cannot hold a per-edition id, duration, or link.

**A per-source completion table** (`album_enrichments` keyed by `(album_id, source)`).
Rejected as premature at two sources — ADR-0004 already deferred it; columns are the additive,
lower-cost choice until a third source or status vocabulary forces the table.

**Fill artwork only when `image_url IS NULL`.** Rejected: it misses LastFM's non-null star
placeholder, which is a large share of the missing-artwork problem this ADR exists to fix.

**Per-track TIDAL search instead of album-first.** Rejected for the on-visit path: N calls per
album is too slow, and the background batch that would make it viable does not exist (no cron or
queue). Album-first is ~2 calls and fits the existing on-visit model.

**Fuzzy album/track matching.** Rejected: a supplemental source attaching the wrong edition's
metadata is worse than leaving a gap. Exact normalized matching keeps "definitive no-match"
meaningful.

## Consequences

- The on-visit album page runs two independent, self-gating passes — LastFM then TIDAL — each
  with its own try/catch, so one source's failure degrades gracefully without touching the other.
  On a new album's first visit both run sequentially in one request; thereafter both gates skip.
- Because LastFM `enrichAlbum` delete-recreates `album_tracks`, TIDAL's columns survive only as
  long as LastFM never re-runs after TIDAL — which its `lastfm_enriched_at` gate guarantees. This
  ordering coupling is load-bearing and must be preserved if either pass changes.
- A future third-party write integration inherits a recorded boundary: catalog reads and user
  writes are different auth surfaces; do not merge them.
- `countryCode` is hardcoded `GB` today and is the documented seam for per-user market scoping
  when auth lands.
</content>
</invoke>
