import { and, eq } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import type { Database } from "./index"
import * as schema from "./schema"

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
        and(
          eq(hums.trackId, trackId),
          eq(hums.listenedAt, input.listenedAt)
        )
      )
      .limit(1)
    if (!existing[0]) {
      throw new Error(
        "Hum resolution failed: duplicate detected but not found"
      )
    }
    humId = existing[0].id
  }

  return { humId, trackId, artistId, albumId, wasNew }
}
