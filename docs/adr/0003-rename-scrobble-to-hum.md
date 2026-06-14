# ADR 0003: Rename "scrobble" → "hum"

## Status

Accepted — 2026-06-14. Not yet implemented (tracked in GH #56). The CONTEXT.md
glossary flip, the ADR forward-notes below, and the code rename all land together
in the #56 PR — the glossary is not flipped ahead of the code.

## Context

"Scrobble" is Last.fm's word for a recorded play event. It leaked out of the
Last.fm boundary into the generic core — the fact table, every count, the route,
the UI — even though Spotify and Tidal (planned sources) have no concept of a
"scrobble." The glossary already isolates other source-specific terms ("poll is
reserved for Spotify"); this corrects the same kind of leak for the central unit.

## Decision

Rename the recorded play artifact from **scrobble** to **hum** everywhere in the
generic core. "Human Hum" → a hum is the product-native unit.

- **Act vs. record split.** `listen` is the act (and the verb); `hum` is the
  recorded artifact (a noun only). There is deliberately no "to hum" verb — the
  system *records a listen*, which *writes a hum*. The product tagline changes
  from "a personal music scrobbling platform" to a "listening-history" framing.
- **`recordListen()` is unchanged.** It names the act. Only the artifact-typed
  symbols around it change: `ScrobbleResult` → `HumResult`, insert target
  `scrobbles` → `hums`. `ListenInput` stays (it describes the act).
- **Last.fm boundary (narrow).** "scrobble" survives *only* where it names
  Last.fm's own vocabulary: the `audioscrobbler.com` hostname (an external fact)
  and prose/comments that explain the translation ("a Last.fm scrobble becomes a
  hum"). The source-agnostic functions that merely live under `importers/`
  (`importScrobbles`/`syncScrobbles`/`getScrobbles`) are core, not Last.fm-bound,
  and become `importHums`/`syncHums`/`getHums`. Last.fm's read API returns no
  field literally named "scrobble," so there is no wire-schema token to preserve.
- **Count cleanup splits two conflated concepts.**
  - *Local entity counts* (`count(hums.id)`): collapse `playCount`,
    `scrobbleCount`, `trackPlayCount`, `artistPlayCount` into the **`humCount`**
    family (`humCount`, `trackHumCount`, `artistHumCount`). `ScrobbleCountTable`
    → `HumCountTable`, taking `humCount` directly (the redundant
    `scrobbleCount: track.playCount` presentation alias disappears).
  - *The source's reported total* (`getRemotePlaycount`/`remotePlaycount`) is a
    different quantity — the denominator for import completeness, not our count —
    so it does **not** fold into `humCount`. It becomes source-neutral
    `getRemoteTotal()`/`remoteTotal`. Last.fm's `data.user.playcount` wire field
    is kept (boundary vocabulary).
- **Schema.** The Postgres `listen` namespace stays: `listen.scrobbles` →
  **`listen.hums`**. All derived identifiers (sequence, indexes, FKs) regenerate
  from the renamed Drizzle definition.
- **Route.** `/scrobbles` → `/hums`, hard rename, no redirect (pre-release,
  single-user — no inbound links to preserve).

## Considered options

**Migrations — squash vs. additive rename.** Chose to **squash** the four
existing migrations into a fresh `0000` creating `listen.hums` directly, rather
than adding a `0004` `ALTER TABLE … RENAME`. The DB is wiped on big design
changes (no environment depends on the incremental ledger), and squashing is the
only way to make the "grep-clean" acceptance criterion literally true — an
additive rename leaves `"scrobbles"` in the immutable `drizzle/meta` snapshots
forever. Trade-off: the pre-squash history (including the `0002` album_id
data-migration) is discarded; it remains recoverable in git, and the *why* lives
in ADR-0001.

**Coining a "to hum" verb.** Rejected — reads as a typo/sound. `listen` already
carries the act/verb load.

**Renaming `recordListen()` → `recordHum()`.** Rejected — it would put the
artifact noun on the verb, breaking the act/record split this rename establishes.

## Consequences

- **ADR-0001 and ADR-0002 keep "scrobble" in their bodies** (immutable records),
  each gaining a dated forward-note pointing here and instructing the reader to
  read "scrobble" as "hum." This matters because the matt-pocock domain-doc
  contract (`docs/agents/domain.md`) binds downstream skills to an ADR's
  vocabulary when they work in its area — ADR-0002 is an accepted-but-unbuilt
  spec for auth (#9/#13), so without the note the implementer would reintroduce
  "scrobble" straight from the spec.
- **"grep-clean" is scoped**, not absolute: it excludes generated/vendored
  artifacts (`.next/`, `graphify-out/`, `drizzle/meta/` if any survives), the
  `audioscrobbler.com` hostname, the kept `data.user.playcount` field, and the
  quoted-historical text in ADR-0001/0002.
- After the CONTEXT.md flip, the **Hum** glossary entry avoids `scrobble, play,
  stream` — but **not** `listen`, which becomes a first-class term (the act).
