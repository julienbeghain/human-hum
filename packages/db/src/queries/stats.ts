import { and, count, countDistinct, eq, max, min } from "drizzle-orm"

import type { Database } from "../index"
import * as schema from "../schema"
import { addArtistCondition, buildFilterConditions } from "./filter"
import type { HumFilter, HumStats } from "./types"

export async function getStats(
  db: Database,
  params?: HumFilter
): Promise<HumStats> {
  const filter = params ?? {}
  const conditions = buildFilterConditions(filter)
  addArtistCondition(conditions, filter)

  // Always join tracks — needed for uniqueArtists count and artistId filtering
  const [row] = await db
    .select({
      total: count(),
      earliest: min(schema.hums.listenedAt),
      latest: max(schema.hums.listenedAt),
      uniqueArtists: countDistinct(schema.tracks.artistId),
      uniqueTracks: countDistinct(schema.hums.trackId),
      uniqueAlbums: countDistinct(schema.hums.albumId),
    })
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  return {
    total: row?.total ?? 0,
    earliest: row?.earliest ?? null,
    latest: row?.latest ?? null,
    uniqueArtists: row?.uniqueArtists ?? 0,
    uniqueTracks: row?.uniqueTracks ?? 0,
    uniqueAlbums: row?.uniqueAlbums ?? 0,
  }
}
