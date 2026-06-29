# ADR 0006: Two ingest paths — per-row `recordListen` and batched `bulkIngest`

## Status

Accepted — 2026-06-21

## Context

Hums enter the database through `recordListen`, which resolves each entity with a
race-safe select-insert-reselect and inserts one hum — several sequential queries
per row. Over the `neon-http` driver (one HTTP request per query), that is the
right shape for the **online** path: LastFM incremental sync and now-playing,
where volume is tiny and concurrent writers are possible.

It is the wrong shape for a **reseed**. The local reseed snapshot (roadmap H0)
exports the ~150k ground-truth hums to a JSONL artifact and replays them so a
schema change costs a local reload instead of a fresh LastFM re-pull. Replaying
150k rows per-row over the HTTP driver is ~900k round-trips at ~17ms each —
hours from a local machine — which defeats the "cheap to iterate" purpose. A
reseed is the opposite situation from online sync: offline, single-writer,
trusted, already-deduped, high-volume.

`neon-http` supports only single, non-interactive transactions, so an
interactive `db.transaction(tx => …)` that reads ids between writes is not
available. The `db.batch()` array API is also unavailable in the test harness:
db-package tests run on the PGlite driver, whose drizzle instance has no
`.batch()` method (`db.batch()` is a LibSQL/Neon/D1 API). So the staged resolve
must be expressed with plain, driver-agnostic statements that run on both
PGlite and `neon-http`.

## Decision

Add a second ingest path, `bulkIngest`, for offline/trusted/bulk loads, keeping
`recordListen` unchanged for the online/concurrent path.

- **`bulkIngest` keys on `ListenInput`** — the same neutral record the online
  path uses — so any future producer of `ListenInput` batches (a Spotify export
  adapter, a LastFM backfill) can feed it. That reuse is a one-type decision,
  not a plugin layer; no adapter abstraction is built until a second consumer
  exists.
- **Batched, staged resolve, driver-agnostic.** Per ~5,000-row chunk, plain
  multi-row `insert().values([...]).onConflictDoNothing()` followed by a
  select-back of ids by natural key, staged: artists, then albums + tracks
  (using artist ids), then hums. No `db.batch()` or interactive transaction — so
  the path runs identically under the PGlite test harness and the runtime
  `neon-http` driver. ~5 statements per chunk (~150 round-trips for 150k vs.
  ~900k per-row).
- **Idempotency, not a global transaction, provides resumability.** Every insert
  is `onConflictDoNothing` on a natural key (`artists.name`,
  `(name, artist_id)` for albums/tracks, `(track_id, listened_at)` for hums), so
  a crash mid-reseed is recovered by re-running — already-present rows are
  skipped. No cross-chunk transaction is needed or possible on `neon-http`.
- **Snapshot reseed is the only consumer today.** Spotify import and refactoring
  the LastFM backfill onto `bulkIngest` are explicitly deferred.

## Alternatives considered

**Reuse `importHums` / `SourceFetcher` for the reseed** (the original plan). A
`SnapshotFetcher` would shim a local file onto a remote-pagination interface
built to pace rate-limited APIs, inheriting per-page sleeps and `from`/`to`
ceremony that mean nothing for a file — and still writing per-row. Rejected: it
forces a file through an API-shaped seam and keeps the per-row cost that makes
the reseed slow.

**Switch the reseed to the `neon-serverless` WebSocket driver** for interactive
transactions and connection reuse. Rejected: idempotency already makes the
reseed safe without transactions, the staged multi-row inserts already collapse
the round-trips, and a WebSocket-only API would not run under the PGlite test
harness — a second driver is dependency and testability cost for no functional
gain.

**Build a source/adapter abstraction now** so Spotify and LastFM share the path
immediately. Rejected as speculative: the second consumer is not being built, so
its real shape (PII stripping, hum-definition rule, multi-file batching for
Spotify) would be guessed. Keying on `ListenInput` keeps the door open at zero
cost.

## Consequences

- The reseed runs in minutes (~150 round-trips for 150k) instead of hours, making
  schema iteration cheap — the H0 dev-infra goal.
- There are now two ingest paths to keep in mind: `recordListen` (online, per-row,
  race-safe) and `bulkIngest` (offline, batched, idempotent). They share entity
  identity rules and the `(track_id, listened_at)` dedup key, not code.
- Whoever builds Spotify import inherits a recorded seam: produce `ListenInput`
  batches and feed `bulkIngest`; do not reach for `recordListen` for bulk loads.
