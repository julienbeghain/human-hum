# Ubiquitous Language

## Listening data

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Scrobble** | A single recorded instance of a user listening to a track at a specific time | Play, listen, stream, history entry |
| **Track** | A specific recording identified by name and artist | Song, music |
| **Artist** | A musical performer or group that creates tracks | Band, musician, act |
| **Album** | A collection of tracks released together by an artist | Record, release, LP |
| **MusicBrainz ID (MBID)** | An external unique identifier from the MusicBrainz database, used to match entities across sources | External ID, MB ID |
| **Listening history** | The complete ordered set of a user's scrobbles | Play history, scrobble history, library |

## Data ingestion

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Source** | The service a scrobble originated from (`lastfm`, `spotify`, `tidal`) | Provider, platform, origin |
| **Import** | A one-time bulk operation that loads historical scrobbles from a source into the database | Migration, backfill, seed |
| **Sync** | An incremental fetch of only new scrobbles since the last known `listened_at` | Refresh, update, poll (poll is reserved for Spotify) |
| **Poll** | A recurring, cron-triggered fetch of recently-played tracks from Spotify's API | Cron job, background sync |
| **Upsert** | An insert that silently skips if a matching row already exists (deduplication) | Insert-or-ignore, merge |
| **Cross-source deduplication** | The process of detecting the same listening event reported by multiple sources within a ~30-second window | Dedup, reconciliation |
| **Now playing** | A LastFM API entry with no timestamp, indicating a track currently being listened to — always skipped during import | Currently playing, live track |

## Schema

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Dimension table** | An entity table (`artists`, `albums`, `tracks`) that describes what was listened to | Lookup table, reference table |
| **Fact table** | The `scrobbles` table that records each listening event with foreign keys to dimension tables | Event table, log table |
| **Star schema** | The normalized schema pattern where a central fact table references surrounding dimension tables | Snowflake schema, normalized schema |

## Infrastructure

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Neon** | The serverless Postgres provider hosting the database | DB, database (too generic) |
| **Drizzle** | The TypeScript ORM used for schema definition, queries, and migrations | ORM (too generic) |
| **`packages/db`** | The shared monorepo package containing the Drizzle schema, client, and migrations | DB package, database layer |
| **`apps/import`** | The standalone script package for bulk LastFM import operations | Import script, importer |
| **`apps/web`** | The Next.js 16 application that serves the UI | Frontend, web app, app |

## AI & discovery (phase 8)

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Embedding** | A vector representation of a track used for similarity search | Vector, feature vector |
| **Forgotten favourite** | A track with high historical play count but a long gap since last scrobble | Lost gem, rediscovery |
| **Playlist export** | The act of creating a Tidal playlist from a set of track IDs, making AI recommendations actionable | Playlist creation, playlist generation |

## People

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **User** | An authenticated identity in the system (phase 6+) — before auth, the system is implicitly single-user | Account, listener, member |

## Relationships

- A **Scrobble** references exactly one **Track** and records one **Source**
- A **Track** belongs to exactly one **Artist** and optionally one **Album**
- An **Album** belongs to exactly one **Artist**
- An **Artist**, **Album**, and **Track** may each have an optional **MBID**
- A **Scrobble** is uniquely identified by its `(track_id, listened_at)` pair — this is the deduplication key
- A **User** owns zero or more **Scrobbles** (after phase 6)
- A **Playlist export** transforms a list of **Tracks** into a playable Tidal playlist

## Example dialogue

> **Dev:** "When we **import** from LastFM, do we create a new **artist** row every time we see a name?"
> **Domain expert:** "No — we **upsert** on `(name, mbid)`. If the **artist** already exists, we skip. Same for **tracks** and **albums**."
> **Dev:** "What about **scrobbles** — how do we prevent duplicates?"
> **Domain expert:** "The unique constraint on `(track_id, listened_at)` handles it. Two **scrobbles** for the same **track** at the exact same second are treated as one."
> **Dev:** "And when we add Spotify in phase 7, what happens if the same listen arrives from both **sources**?"
> **Domain expert:** "That's **cross-source deduplication**. If LastFM and Spotify report the same **track** within 30 seconds, we keep the direct **source** (Spotify) and discard the LastFM one."
> **Dev:** "So **sync** and **poll** are different things?"
> **Domain expert:** "Yes. **Sync** is user-triggered and incremental — it fetches new **scrobbles** since the last `listened_at`. **Poll** is cron-triggered, runs every 5 minutes, and only applies to Spotify's recently-played endpoint."

## Flagged ambiguities

- **"sync" vs "poll" vs "import"** — These three terms describe distinct ingestion patterns. **Import** is a one-time bulk load. **Sync** is an on-demand incremental fetch. **Poll** is a recurring background fetch. Do not use them interchangeably.
- **"source" vs "provider"** — Use **source** exclusively. It maps directly to the `source` column on scrobbles (`lastfm`, `spotify`, `tidal`). "Provider" is vague and could refer to OAuth providers, hosting providers, etc.
- **"listen" vs "scrobble"** — A listen is an informal description of the act. A **scrobble** is the recorded data artifact. In code and conversation, always say **scrobble** when referring to the database record.
- **"playlist" vs "playlist export"** — A playlist is the object in Tidal. A **playlist export** is the action of creating one from Human Hum's data. Use **playlist export** when describing the system's behavior; use **playlist** when referring to the Tidal-side object.
