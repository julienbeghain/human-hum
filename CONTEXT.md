# Human Hum — Domain Context

A personal listening-history platform that records what a user listens to across multiple sources and surfaces insights.

## Glossary

### Listening data

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Hum** | A single recorded instance of a user listening to a track at a specific time — the artifact a listen produces | Scrobble, play, stream, history entry |
| **Listen** | The act of playing a track, and the verb for producing a record. The system *records a listen → writes a hum*. There is no verb "to hum" | — |
| **Track** | A specific recording identified by name and artist | Song, music |
| **Artist** | A musical performer or group that creates tracks | Band, musician, act |
| **Album** | A collection of tracks released together by an artist | Record, release, LP |
| **Track number** | The 1-based position of a track within an album, as defined by the release. Lives in the `album_tracks` bridge table because the same track can appear at different positions on different albums | Track position, index, order |
| **MusicBrainz ID (MBID)** | An external unique identifier from the MusicBrainz database, used to match entities across sources | External ID, MB ID |
| **Listening history** | The complete ordered set of a user's hums | Play history, hum history, library |

### Data ingestion

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Source** (hum source) | The service a hum originated from (`lastfm`, `spotify`, `tidal`) — the value of the `source` column on hums. A *role* a service plays, distinct from enrichment source | Provider, platform, origin |
| **Enrichment source** | A service queried for entity metadata (artwork, tracklist, durations, links), e.g. LastFM `album.getInfo` or the TIDAL catalog. A *role* distinct from hum source — a service may be one, the other, or both: TIDAL is enrichment-only (catalog reads, no login), LastFM is currently both | Metadata provider |
| **Import** | A one-time bulk operation that loads historical hums from a source into the database | Migration, backfill, seed |
| **Sync** | An incremental fetch of only new hums since the last known `listened_at` | Refresh, update, poll (poll is reserved for Spotify) |
| **Poll** | A recurring, cron-triggered fetch of recently-played tracks from Spotify's API | Cron job, background sync |
| **Upsert** | An insert that silently skips if a matching row already exists (deduplication) | Insert-or-ignore, merge |
| **Cross-source deduplication** | The process of detecting the same listening event reported by multiple sources within a ~30-second window | Dedup, reconciliation |
| **Now playing** | A LastFM API entry with no timestamp, indicating a track currently being listened to. Skipped during import (no timestamp to record), but displayed in the Now Playing banner | Currently playing, live track |
| **Enrichment** | A per-source fetch of supplementary entity metadata (artwork, tracklist, durations, external links) from an external API (e.g. LastFM `album.getInfo`, later TIDAL). **Multi-source and multi-grain** — a source may enrich an album and/or its tracks. Attempted on demand when a user visits an entity still un-enriched *by that source*, and retried until it succeeds. Distinct from import/sync, which deal with hums, not entity metadata | Metadata fetch, backfill (reserved for hum import) |

### Schema

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Dimension table** | An entity table (`artists`, `albums`, `tracks`) that describes what was listened to | Lookup table, reference table |
| **Fact table** | The `hums` table that records each listening event with foreign keys to dimension tables | Event table, log table |
| **Star schema** | The normalized schema pattern where a central fact table references surrounding dimension tables | Snowflake schema, normalized schema |

### Infrastructure

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Neon** | The serverless Postgres provider hosting the database | DB, database (too generic) |
| **Drizzle** | The TypeScript ORM used for schema definition, queries, and migrations | ORM (too generic) |
| **`packages/db`** | The shared monorepo package containing the Drizzle schema, client, and migrations | DB package, database layer |
| **`apps/import`** | The standalone script package for bulk LastFM import operations | Import script, importer |
| **`apps/web`** | The Next.js 16 application that serves the UI | Frontend, web app, app |

### AI & discovery

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **Embedding** | A vector representation of a track used for similarity search | Vector, feature vector |
| **Forgotten favourite** | A track with a high historical hum count but a long gap since its last hum | Lost gem, rediscovery |
| **Playlist export** | The act of creating a Tidal playlist from a set of track IDs, making AI recommendations actionable | Playlist creation, playlist generation |

### People

| Term | Definition | Aliases to avoid |
|------|-----------|-----------------|
| **User** | An authenticated identity in the system — before auth is added, the system is implicitly single-user | Account, listener, member |
| **Follow** | A directional relationship where one user gains visibility into another's hums. Asymmetric — A following B does not imply B following A | Friend, contact, connection |

## Relationships

- A **Hum** references exactly one **Track** and records one **Source**
- A **Track** belongs to exactly one **Artist** and optionally one **Album**
- An **Album** belongs to exactly one **Artist**
- An **Artist**, **Album**, and **Track** may each have an optional **MBID**
- A **Hum** is uniquely identified by its `(track_id, listened_at)` pair — this is the deduplication key
- A **User** owns zero or more **Hums** (once auth is added)
- A **Follow** links one **User** (follower) to another **User** (followed) — grants full read access to the followed user's hums
- A **Playlist export** transforms a list of **Tracks** into a playable Tidal playlist

## Flagged ambiguities

- **"sync" vs "poll" vs "import"** — These three terms describe distinct ingestion patterns. **Import** is a one-time bulk load. **Sync** is an on-demand incremental fetch. **Poll** is a recurring background fetch. Do not use them interchangeably.
- **"source" vs "provider"** — Use **source** exclusively. It maps directly to the `source` column on hums (`lastfm`, `spotify`, `tidal`). "Provider" is vague and could refer to OAuth providers, hosting providers, etc.
- **"listen" vs "hum"** — A **listen** is the act of playing a track (and the verb). A **hum** is the recorded data artifact that a listen produces. In code and conversation, say **hum** for the database record and **listen** for the act. There is no verb "to hum"; the system *records a listen → writes a hum*.
- **"playlist" vs "playlist export"** — A playlist is the object in Tidal. A **playlist export** is the action of creating one from Human Hum's data. Use **playlist export** when describing the system's behavior; use **playlist** when referring to the Tidal-side object.
