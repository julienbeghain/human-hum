import { and, count, desc, eq } from "drizzle-orm"

import type { Database } from "../index"
import * as schema from "../schema"
import { buildFilterConditions } from "./filter"
import { topTracksByHums } from "./tracks"
import type {
  ArtistDetail,
  ArtistRanking,
  GetArtistDetailParams,
  GetArtistRankingsParams,
} from "./types"

export async function getArtistRankings(
  db: Database,
  params?: GetArtistRankingsParams
): Promise<ArtistRanking[]> {
  const filter = params ?? {}
  const topN = filter.topN ?? 50
  const conditions = buildFilterConditions(filter)

  return db
    .select({
      artistId: schema.artists.id,
      artistName: schema.artists.name,
      humCount: count(schema.hums.id),
    })
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(schema.artists.id, schema.artists.name)
    .orderBy(desc(count(schema.hums.id)))
    .limit(topN)
}

export async function getArtistDetail(
  db: Database,
  params: GetArtistDetailParams
): Promise<ArtistDetail | null> {
  const { artistId, ...filter } = params
  const conditions = buildFilterConditions(filter)
  conditions.push(eq(schema.tracks.artistId, artistId))

  // Artist info + total play count
  const [artist] = await db
    .select({
      artistId: schema.artists.id,
      artistName: schema.artists.name,
      humCount: count(schema.hums.id),
    })
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .where(and(...conditions))
    .groupBy(schema.artists.id, schema.artists.name)

  if (!artist) return null

  // Top tracks for this artist
  const topTracks = await topTracksByHums(db, conditions, 10)

  // Top albums for this artist (join albums directly)
  const albumConditions = buildFilterConditions(filter)
  albumConditions.push(eq(schema.albums.artistId, artistId))

  const topAlbums = await db
    .select({
      albumId: schema.albums.id,
      albumName: schema.albums.name,
      humCount: count(schema.hums.id),
    })
    .from(schema.hums)
    .innerJoin(schema.albums, eq(schema.hums.albumId, schema.albums.id))
    .where(and(...albumConditions))
    .groupBy(schema.albums.id, schema.albums.name)
    .orderBy(desc(count(schema.hums.id)))
    .limit(10)

  return { ...artist, topTracks, topAlbums }
}
