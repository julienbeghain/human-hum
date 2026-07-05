import { and, asc, count, eq } from "drizzle-orm"

import type { Database } from "../index"
import * as schema from "../schema"
import { buildFilterConditions } from "./filter"
import { topTracksByHums } from "./tracks"
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
      imageUrl: schema.albums.imageUrl,
    })
    .from(schema.albums)
    .innerJoin(schema.artists, eq(schema.albums.artistId, schema.artists.id))
    .where(eq(schema.albums.id, albumId))

  if (!album) return null

  const humConditions = buildFilterConditions(filter)
  humConditions.push(eq(schema.hums.albumId, albumId))

  const humCountResult = await db
    .select({ humCount: count(schema.hums.id) })
    .from(schema.hums)
    .where(and(...humConditions))

  const humCount = humCountResult[0]?.humCount ?? 0

  let tracks: AlbumDetailTrack[] = []

  // LastFM is the only source that writes album_tracks, so its completion row
  // is the gate for reading the enriched tracklist.
  const [lastfmSource] = await db
    .select({ albumId: schema.albumSources.albumId })
    .from(schema.albumSources)
    .where(
      and(
        eq(schema.albumSources.albumId, albumId),
        eq(schema.albumSources.source, "lastfm")
      )
    )

  if (lastfmSource) {
    tracks = await getEnrichedTracks(db, albumId, humConditions)
  }

  // Fall back to hum-derived tracks when enrichment produced no tracklist (a
  // LastFM album with no album.getInfo tracks), so an enriched album never
  // renders worse than before it was enriched.
  if (tracks.length === 0) {
    tracks = await getHumDerivedTracks(db, humConditions)
  }

  return { ...album, humCount, tracks }
}

async function getHumDerivedTracks(
  db: Database,
  conditions: ReturnType<typeof buildFilterConditions>
): Promise<AlbumDetailTrack[]> {
  const rows = await topTracksByHums(db, conditions)

  return rows.map((r) => ({
    ...r,
    trackNumber: null,
    duration: null,
  }))
}

async function getEnrichedTracks(
  db: Database,
  albumId: number,
  humConditions: ReturnType<typeof buildFilterConditions>
): Promise<AlbumDetailTrack[]> {
  const rows = await db
    .select({
      trackId: schema.albumTracks.trackId,
      trackName: schema.albumTracks.name,
      trackNumber: schema.albumTracks.trackNumber,
      duration: schema.albumTracks.duration,
      humCount: count(schema.hums.id),
    })
    .from(schema.albumTracks)
    .leftJoin(
      schema.hums,
      and(
        eq(schema.hums.trackId, schema.albumTracks.trackId),
        ...humConditions
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
