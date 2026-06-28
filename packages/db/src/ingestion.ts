import { and, eq, inArray } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import type { Database } from "./index"
import * as schema from "./schema"
import type { SnapshotRecord } from "./snapshot"

export type Source = (typeof schema.sourceEnum.enumValues)[number]

export interface ListenInput {
  artist: { name: string; mbid?: string }
  album?: { name: string; mbid?: string }
  track: { name: string; mbid?: string }
  listenedAt: Date
  source: Source
}

export interface HumResult {
  humId: number
  trackId: number
  artistId: number
  albumId: number | null
  wasNew: boolean
}

// --- Private helpers ---

function normalizeMbid(mbid?: string): string | null {
  return mbid && mbid.length > 0 ? mbid : null
}

/**
 * Select-Insert-Reselect: race-condition-safe idempotent entity resolution.
 * Returns the entity's ID whether it already existed or was just created.
 */
async function resolveEntity(
  db: Database,
  table: PgTable,
  idColumn: PgColumn,
  conditions: SQL[],
  values: Record<string, unknown>
): Promise<number> {
  // 1. Try to find existing
  const existing = await db
    .select({ id: idColumn })
    .from(table)
    .where(and(...conditions))
    .limit(1)

  if (existing[0]) return existing[0].id as number

  // 2. Try to insert
  const inserted = await db
    .insert(table)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: idColumn })

  if (inserted[0]) return inserted[0].id as number

  // 3. Race condition: another process inserted between our select and insert
  const refetch = await db
    .select({ id: idColumn })
    .from(table)
    .where(and(...conditions))
    .limit(1)

  if (!refetch[0]) {
    throw new Error(
      `Entity resolution failed for ${table._.name}: ${JSON.stringify(values)}`
    )
  }

  return refetch[0].id as number
}

// --- Public API ---

export async function recordListen(
  db: Database,
  input: ListenInput
): Promise<HumResult> {
  const { artists, albums, tracks, hums } = schema

  // Resolve artist (unique on name only — mbid stored but not part of identity)
  const artistMbid = normalizeMbid(input.artist.mbid)
  const artistId = await resolveEntity(
    db,
    artists,
    artists.id,
    [eq(artists.name, input.artist.name)],
    { name: input.artist.name, mbid: artistMbid }
  )

  // Resolve album (optional)
  let albumId: number | null = null
  if (input.album) {
    const albumMbid = normalizeMbid(input.album.mbid)
    albumId = await resolveEntity(
      db,
      albums,
      albums.id,
      [eq(albums.name, input.album.name), eq(albums.artistId, artistId)],
      { name: input.album.name, mbid: albumMbid, artistId }
    )
  }

  // Resolve track (unique on name + artist_id only)
  const trackMbid = normalizeMbid(input.track.mbid)
  const trackId = await resolveEntity(
    db,
    tracks,
    tracks.id,
    [eq(tracks.name, input.track.name), eq(tracks.artistId, artistId)],
    { name: input.track.name, mbid: trackMbid, artistId }
  )

  // Insert hum
  const inserted = await db
    .insert(hums)
    .values({
      trackId,
      albumId,
      listenedAt: input.listenedAt,
      source: input.source,
    })
    .onConflictDoNothing()
    .returning({ id: hums.id })

  const wasNew = inserted.length > 0
  let humId: number
  if (wasNew) {
    humId = inserted[0]!.id
  } else {
    const existing = await db
      .select({ id: hums.id })
      .from(hums)
      .where(
        and(eq(hums.trackId, trackId), eq(hums.listenedAt, input.listenedAt))
      )
      .limit(1)
    if (!existing[0]) {
      throw new Error("Hum resolution failed: duplicate detected but not found")
    }
    humId = existing[0].id
  }

  return { humId, trackId, artistId, albumId, wasNew }
}

// --- Bulk ingest (offline/trusted/high-volume path, see ADR 0006) ---

export interface BulkIngestResult {
  insertedHums: number
  skippedHums: number
}

/**
 * Cumulative progress emitted after each chunk, suitable for a CLI indicator
 * over a multi-minute reseed. `processedRecords` advances by the chunk size;
 * the hum tallies are running totals matching the final `BulkIngestResult`.
 */
export interface BulkProgress {
  processedRecords: number
  totalRecords: number
  insertedHums: number
  skippedHums: number
}

// Postgres caps a statement at 65,535 bind parameters; the widest insert here
// (hums, 4 columns) stays well under that at 5,000 rows.
const DEFAULT_CHUNK_SIZE = 5000

function compositeKey(artistId: number, name: string): string {
  return `${artistId}:${name}`
}

/**
 * Batched, idempotent ingest for trusted offline loads (reseed today). Unlike
 * the per-row `recordListen`, it stages chunked multi-row
 * `onConflictDoNothing` inserts — artists, then albums + tracks, then hums —
 * each followed by a select-back of ids by natural key. No interactive
 * transaction or `db.batch()`, so it runs identically under the PGlite test
 * harness and the runtime `neon-http` driver. Re-running is safe: every insert
 * skips rows already present on their natural key, so a crash mid-load is
 * recovered by replaying the same batch.
 */
export async function bulkIngest(
  db: Database,
  inputs: ListenInput[],
  options?: { chunkSize?: number; onProgress?: (progress: BulkProgress) => void }
): Promise<BulkIngestResult> {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE
  let insertedHums = 0
  let skippedHums = 0
  let processedRecords = 0

  for (let offset = 0; offset < inputs.length; offset += chunkSize) {
    const chunk = inputs.slice(offset, offset + chunkSize)
    const inserted = await ingestChunk(db, chunk)
    insertedHums += inserted
    skippedHums += chunk.length - inserted
    processedRecords += chunk.length
    options?.onProgress?.({
      processedRecords,
      totalRecords: inputs.length,
      insertedHums,
      skippedHums,
    })
  }

  return { insertedHums, skippedHums }
}

async function ingestChunk(
  db: Database,
  chunk: ListenInput[]
): Promise<number> {
  const { artists, albums, tracks, hums } = schema

  // Stage 1: artists (identity is name only).
  const artistByName = new Map<string, { name: string; mbid: string | null }>()
  for (const input of chunk) {
    if (!artistByName.has(input.artist.name)) {
      artistByName.set(input.artist.name, {
        name: input.artist.name,
        mbid: normalizeMbid(input.artist.mbid),
      })
    }
  }
  await db
    .insert(artists)
    .values([...artistByName.values()])
    .onConflictDoNothing()

  const artistRows = await db
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .where(inArray(artists.name, [...artistByName.keys()]))
  const artistIdByName = new Map(artistRows.map((r) => [r.name, r.id]))

  // Stage 2: albums + tracks (identity is name + artist_id).
  const albumByKey = new Map<
    string,
    { name: string; mbid: string | null; artistId: number }
  >()
  const trackByKey = new Map<
    string,
    { name: string; mbid: string | null; artistId: number }
  >()
  for (const input of chunk) {
    const artistId = artistIdByName.get(input.artist.name)!
    const trackKey = compositeKey(artistId, input.track.name)
    if (!trackByKey.has(trackKey)) {
      trackByKey.set(trackKey, {
        name: input.track.name,
        mbid: normalizeMbid(input.track.mbid),
        artistId,
      })
    }
    if (input.album) {
      const albumKey = compositeKey(artistId, input.album.name)
      if (!albumByKey.has(albumKey)) {
        albumByKey.set(albumKey, {
          name: input.album.name,
          mbid: normalizeMbid(input.album.mbid),
          artistId,
        })
      }
    }
  }

  const albumIdByKey = new Map<string, number>()
  if (albumByKey.size > 0) {
    const albumValues = [...albumByKey.values()]
    await db.insert(albums).values(albumValues).onConflictDoNothing()
    const albumRows = await db
      .select({
        id: albums.id,
        name: albums.name,
        artistId: albums.artistId,
      })
      .from(albums)
      .where(
        and(
          inArray(
            albums.name,
            albumValues.map((a) => a.name)
          ),
          inArray(
            albums.artistId,
            albumValues.map((a) => a.artistId)
          )
        )
      )
    for (const row of albumRows) {
      albumIdByKey.set(compositeKey(row.artistId, row.name), row.id)
    }
  }

  const trackValues = [...trackByKey.values()]
  await db.insert(tracks).values(trackValues).onConflictDoNothing()
  const trackRows = await db
    .select({
      id: tracks.id,
      name: tracks.name,
      artistId: tracks.artistId,
    })
    .from(tracks)
    .where(
      and(
        inArray(
          tracks.name,
          trackValues.map((t) => t.name)
        ),
        inArray(
          tracks.artistId,
          trackValues.map((t) => t.artistId)
        )
      )
    )
  const trackIdByKey = new Map<string, number>()
  for (const row of trackRows) {
    trackIdByKey.set(compositeKey(row.artistId, row.name), row.id)
  }

  // Stage 3: hums (identity is track_id + listened_at).
  const humValues = chunk.map((input) => {
    const artistId = artistIdByName.get(input.artist.name)!
    const trackId = trackIdByKey.get(compositeKey(artistId, input.track.name))!
    const albumId = input.album
      ? (albumIdByKey.get(compositeKey(artistId, input.album.name)) ?? null)
      : null
    return {
      trackId,
      albumId,
      listenedAt: input.listenedAt,
      source: input.source,
    }
  })

  const insertedHums = await db
    .insert(hums)
    .values(humValues)
    .onConflictDoNothing()
    .returning({ id: hums.id })

  return insertedHums.length
}

/**
 * Maps a snapshot record onto today's single-artist `ListenInput` by taking the
 * primary credit (`artists[0]`). Lossless for Last.fm, which reports one artist;
 * becomes 1:1 once `ListenInput` carries multiple artists.
 */
export function listenInputFromSnapshot(record: SnapshotRecord): ListenInput {
  const primary = record.artists[0]
  if (!primary) {
    throw new Error("Snapshot record has no artists")
  }
  return {
    artist: primary.mbid
      ? { name: primary.name, mbid: primary.mbid }
      : { name: primary.name },
    ...(record.album ? { album: record.album } : {}),
    track: record.track,
    listenedAt: record.listenedAt,
    source: record.source,
  }
}
