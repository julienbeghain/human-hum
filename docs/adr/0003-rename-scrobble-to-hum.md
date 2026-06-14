# ADR 0003: Rename "scrobble" → "hum"

## Status

Accepted — 2026-06-14

## Context

"Scrobble" is Last.fm's word for a recorded play event. It leaked out of the Last.fm boundary into the generic core — the fact table, every count, the route, the UI — even though Spotify and Tidal (planned sources) have no concept of a "scrobble." The glossary already isolates other source-specific terms ("poll is reserved for Spotify"); this corrects the same kind of leak for the central unit.

This decision is accepted but not yet implemented (tracked in GH #56). The CONTEXT.md glossary flip, the forward-notes on ADR-0001/0002, and the code rename all land together in the #56 PR — the glossary is deliberately not flipped ahead of the code, so it never names symbols that don't exist yet.

## Decision

Rename the recorded play artifact from **scrobble** to **hum** everywhere in the generic core — a hum is the product-native unit ("Human Hum").

- **Act vs. record split.** `listen` is the act (and the verb); `hum` is the recorded artifact, a noun only. There is deliberately no "to hum" verb — the system *records a listen*, which *writes a hum*. The product tagline changes from "a personal music scrobbling platform" to a "listening-history" framing.
- **`recordListen()` is unchanged.** It names the act. Only the artifact-typed symbols around it change: `ScrobbleResult` → `HumResult`, insert target `scrobbles` → `hums`. `ListenInput` stays (it describes the act).
- **Last.fm boundary is narrow.** "scrobble" survives only where it names Last.fm's own vocabulary: the `audioscrobbler.com` hostname, Last.fm's `data.user.playcount` wire field, and prose/comments explaining the translation ("a Last.fm scrobble becomes a hum"). The source-agnostic functions that merely live under `importers/` (`importScrobbles`/`syncScrobbles`/`getScrobbles`) are core, not Last.fm-bound, and become `importHums`/`syncHums`/`getHums`.
- **Counts split two conflated quantities.** Local entity counts (`count(hums.id)`) collapse `playCount`, `scrobbleCount`, `trackPlayCount`, and `artistPlayCount` into the **`humCount`** family (`humCount`, `trackHumCount`, `artistHumCount`); `ScrobbleCountTable` → `HumCountTable` takes `humCount` directly. The source's reported total (`getRemotePlaycount`/`remotePlaycount`) is a different quantity — the denominator for import completeness, not our count — so it becomes source-neutral `getRemoteTotal()`/`remoteTotal` rather than folding into `humCount`.
- **Schema.** The Postgres `listen` namespace stays: `listen.scrobbles` → **`listen.hums`**; derived identifiers (sequence, indexes, FKs) regenerate from the renamed Drizzle definition. The four existing migrations are **squashed** into a fresh `0000` that creates `listen.hums` directly, since the DB is wiped on big design changes and no environment depends on the incremental ledger.
- **Route.** `/scrobbles` → `/hums`, a hard rename with no redirect (pre-release, single-user — no inbound links to preserve).

## Alternatives considered

**Additive `0004` rename migration** (instead of squashing) — an `ALTER TABLE … RENAME` on top of the existing history. Rejected because the DB is wiped anyway, and an additive rename leaves `"scrobbles"` in the immutable `drizzle/meta` snapshots forever, making the "grep-clean" acceptance criterion impossible to satisfy literally. The squash discards the pre-squash history (including the `0002` album_id data-migration), but it stays recoverable in git and its rationale lives in ADR-0001.

**Coining a "to hum" verb** — rejected; it reads as a typo or a sound. `listen` already carries the act/verb load.

**Renaming `recordListen()` → `recordHum()`** — rejected; it would put the artifact noun on the verb, breaking the act/record split this rename establishes.

## Consequences

- **ADR-0001 and ADR-0002 keep "scrobble" in their bodies** (immutable records), each gaining a dated forward-note pointing here and instructing the reader to read "scrobble" as "hum." This matters because the domain-doc contract (`docs/agents/domain.md`) binds downstream skills to an ADR's vocabulary when they work in its area — ADR-0002 is an accepted-but-unbuilt spec for auth (#9/#13), so without the note the implementer would reintroduce "scrobble" straight from the spec.
- **"grep-clean" is scoped, not absolute.** It excludes generated/vendored artifacts (`.next/`, `graphify-out/`, `drizzle/meta/`), the `audioscrobbler.com` hostname, the kept `data.user.playcount` field, and the quoted-historical text in ADR-0001/0002.
- After the CONTEXT.md flip, the **Hum** glossary entry avoids `scrobble`, `play`, and `stream` — but not `listen`, which becomes a first-class term (the act).
