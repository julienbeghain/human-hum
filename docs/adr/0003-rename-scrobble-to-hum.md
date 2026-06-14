# ADR 0003: Rename "scrobble" to "hum"

## Status

Accepted — 2026-06-14

## Context

Human Hum called its central unit — a recorded play event — a "scrobble." That word is Last.fm's, not the product's. It had leaked out of the Last.fm import boundary into the generic core: the fact table (`listen.scrobbles`), every count field, the `/scrobbles` route, and the UI strings all said "scrobble," even though the other planned sources (Spotify, Tidal) have no such concept.

This is the same kind of leak the glossary already guards against elsewhere ("poll is reserved for Spotify"). A person reading the app, or a developer reading the schema, met vendor jargon where they should meet the product's own vocabulary, and a future source integrator would inherit a term that does not apply to their source.

A secondary problem rode along with the name: four overlapping local count fields (`playCount`, `scrobbleCount`, `trackPlayCount`, `artistPlayCount`) and a separate source-reported total (`remotePlaycount`) were all loosely called some flavour of "play count," so it was never obvious which number was canonical or which one was the import-completeness denominator.

## Decision

Rename the recorded artifact from **scrobble** to **hum** everywhere in the generic core, and split the act from the record:

- **Unit:** `scrobble` → **`hum`** — the recorded artifact, a noun only.
- **Act vs. record:** `listen` is the act *and the verb*. The system *records a listen → writes a hum*. There is no verb "to hum." `recordListen()` keeps its name (it names the act); only artifact-typed symbols change (`ScrobbleResult` → `HumResult`, insert target → `hums`). `ListenInput` stays.
- **Schema:** the `listen` namespace stays; `listen.scrobbles` → **`listen.hums`**. All derived identifiers (sequence, indexes, FKs) regenerate from the renamed Drizzle definition. Migrations `0000`–`0003` are **squashed** into a fresh `0000` that creates `listen.hums` directly — the DB is wiped and re-imported, so this is a clean rename, not a backfill.
- **Route:** `/scrobbles` → `/hums`, hard rename, no redirect (pre-release, single-user, no inbound links).
- **Count cleanup** splits two conflated quantities:
  - *Local entity counts* collapse into the **`humCount`** family: `playCount` / `scrobbleCount` → `humCount`, `trackPlayCount` → `trackHumCount`, `artistPlayCount` → `artistHumCount`.
  - *The source's reported total* (`getRemotePlaycount` / `remotePlaycount`) is the import-completeness denominator, not our own count → `getRemoteTotal()` / `remoteTotal`.
- **Generic import functions:** `importScrobbles` / `syncScrobbles` / `getScrobbles` → `importHums` / `syncHums` / `getHums`.
- **Tagline:** "personal music scrobbling platform" → a "listening-history" framing.

### Last.fm boundary (the carve-out)

"Scrobble" is Last.fm's word and stays correct in exactly three places, all of which are preserved:

1. The `audioscrobbler.com` API hostname.
2. The `data.user.playcount` wire field returned by Last.fm's `user.getInfo` (kept as `playcount` where it is parsed).
3. Prose/comments that explain the Last.fm translation, plus the immutable ADR records (ADR-0001, ADR-0002), which carry dated forward-notes rather than being rewritten.

Everywhere else, "scrobble" should be grep-clean.

## Alternatives considered

**Keep "scrobble."** Rejected: it is source-specific jargon in a multi-source product; it mislabels the generic fact table and misleads the next source integrator.

**Use "play" or "stream."** Rejected: "play" collides with the verb and with the old count-field soup; "stream" implies a delivery mechanism. Neither is product-native.

**Make "hum" a verb too** ("to hum a track"). Rejected: the act already has a clear verb, `listen`. Keeping `hum` a noun-only artifact and `listen` the act/verb keeps `recordListen()` honest and the types legible.

**Migrate the data with `ALTER ... RENAME` instead of squashing.** Rejected: the DB is wiped and re-imported from Last.fm, so a squash to a fresh `0000` is simpler and makes "grep-clean" literally true (no pre-rename SQL lingers in the applied migration set). Pre-squash history stays in git.

## Consequences

- The user sees "hums" in the UI and at `/hums`; the developer reads one consistent term; the next source integrator inherits product-native language.
- A single `humCount` family removes the "which count is canonical?" guessing; `remoteTotal` is unmistakably the completeness denominator, not our count.
- The existing test suite acts as a regression net: every test asserts the *same external behavior* against the new names, never the rename mechanics.
- "Scrobble" surviving only at the documented carve-outs means a single grep verifies the leak is closed.
- ADR-0001 and ADR-0002 remain accurate via forward-notes without being rewritten; ADR-0002's unbuilt auth spec now points `user_id` at `listen.hums`.
