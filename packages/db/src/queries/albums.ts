import { and, asc, count, desc, eq } from "drizzle-orm"

import type { Database } from "../index"
import * as schema from "../schema"
import { buildFilterConditions } from "./filter"
import type { AlbumDetail, AlbumDetailTrack, GetAlbumDetailParams } from "./types"

export async function getAlbumDetail(
  db: Database,
  params: GetAlbumDetailParams
): Promise<AlbumDetail | null> {
  const { albumId, ...filter } = params

  const [album] = await db
    .select({
      albumId: schema.albums.id,
      albumName: schema.albums.name,
      artistId: schema.artists.id,
      artistName: schema.artists.name,
      enrichedAt: schema.albums.enrichedAt,
      imageUrl: schema.albums.imageUrl,
    })
    .from(schema.albums)
    .innerJoin(schema.artists, eq(schema.albums.artistId, schema.artists.id))
    .where(eq(schema.albums.id, albumId))

  if (!album) return null

  const scrobbleConditions = buildFilterConditions(filter)
  scrobbleConditions.push(eq(schema.scrobbles.albumId, albumId))

  const playCountResult = await db
    .select({ playCount: count(schema.scrobbles.id) })
    .from(schema.scrobbles)
    .where(and(...scrobbleConditions))

  const playCount = playCountResult[0]?.playCount ?? 0

  let tracks: AlbumDetailTrack[]

  if (album.enrichedAt) {
    tracks = await getEnrichedTracks(db, albumId, scrobbleConditions)
  } else {
    tracks = await getScrobbleDerivedTracks(db, scrobbleConditions)
  }

  return { ...album, playCount, tracks }
}

async function getScrobbleDerivedTracks(
  db: Database,
  conditions: ReturnType<typeof buildFilterConditions>
): Promise<AlbumDetailTrack[]> {
  const rows = await db
    .select({
      trackId: schema.tracks.id,
      trackName: schema.tracks.name,
      playCount: count(schema.scrobbles.id),
    })
    .from(schema.scrobbles)
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .where(and(...conditions))
    .groupBy(schema.tracks.id, schema.tracks.name)
    .orderBy(desc(count(schema.scrobbles.id)))

  return rows.map((r) => ({
    ...r,
    trackNumber: null,
    duration: null,
  }))
}

async function getEnrichedTracks(
  db: Database,
  albumId: number,
  scrobbleConditions: ReturnType<typeof buildFilterConditions>
): Promise<AlbumDetailTrack[]> {
  const rows = await db
    .select({
      trackId: schema.albumTracks.trackId,
      trackName: schema.albumTracks.name,
      trackNumber: schema.albumTracks.trackNumber,
      duration: schema.albumTracks.duration,
      playCount: count(schema.scrobbles.id),
    })
    .from(schema.albumTracks)
    .leftJoin(
      schema.scrobbles,
      and(
        eq(schema.scrobbles.trackId, schema.albumTracks.trackId),
        ...scrobbleConditions
      )
    )
    .where(eq(schema.albumTracks.albumId, albumId))
    .groupBy(
      schema.albumTracks.trackNumber,
      schema.albumTracks.name,
      schema.albumTracks.trackId,
      schema.albumTracks.duration
    )
    .orderBy(asc(schema.albumTracks.trackNumber))

  return rows
}
