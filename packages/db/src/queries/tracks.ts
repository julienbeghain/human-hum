import { and, count, desc, eq, type SQL } from "drizzle-orm"

import type { Database } from "../index"
import * as schema from "../schema"
import type { TrackRanking } from "./types"

/**
 * Tracks ranked by hum count (descending), filtered by the given
 * conditions. Shared by the album and artist detail paths. Omit `limit` for
 * the full ranking (album track listings); pass it to cap (artist top tracks).
 */
export async function topTracksByHums(
  db: Database,
  conditions: SQL[],
  limit?: number
): Promise<TrackRanking[]> {
  const query = db
    .select({
      trackId: schema.tracks.id,
      trackName: schema.tracks.name,
      humCount: count(schema.hums.id),
    })
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .where(and(...conditions))
    .groupBy(schema.tracks.id, schema.tracks.name)
    .orderBy(desc(count(schema.hums.id)))

  return limit === undefined ? query : query.limit(limit)
}
