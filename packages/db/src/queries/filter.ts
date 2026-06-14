import { eq, gte, lte, type SQL } from "drizzle-orm"

import * as schema from "../schema"
import type { HumFilter } from "./types"

/**
 * Build WHERE conditions from a HumFilter.
 * Handles hum-level columns (time range, source, trackId, albumId).
 * artistId requires tracks to be joined — use addArtistCondition separately.
 */
export function buildFilterConditions(filter: HumFilter): SQL[] {
  const conditions: SQL[] = []

  if (filter.from) {
    conditions.push(gte(schema.hums.listenedAt, filter.from))
  }
  if (filter.to) {
    conditions.push(lte(schema.hums.listenedAt, filter.to))
  }
  if (filter.source) {
    conditions.push(eq(schema.hums.source, filter.source))
  }
  if (filter.trackId) {
    conditions.push(eq(schema.hums.trackId, filter.trackId))
  }
  if (filter.albumId) {
    conditions.push(eq(schema.hums.albumId, filter.albumId))
  }

  return conditions
}

/** Append artistId condition — requires tracks table to be joined. */
export function addArtistCondition(
  conditions: SQL[],
  filter: HumFilter
): void {
  if (filter.artistId) {
    conditions.push(eq(schema.tracks.artistId, filter.artistId))
  }
}
