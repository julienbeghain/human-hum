import { eq, gte, lte, type SQL } from "drizzle-orm"

import * as schema from "../schema"
import type { ScrobbleFilter } from "./types"

/**
 * Build WHERE conditions from a ScrobbleFilter.
 * Handles scrobble-level columns (time range, source, trackId, albumId).
 * artistId requires tracks to be joined — use addArtistCondition separately.
 */
export function buildFilterConditions(filter: ScrobbleFilter): SQL[] {
  const conditions: SQL[] = []

  if (filter.from) {
    conditions.push(gte(schema.scrobbles.listenedAt, filter.from))
  }
  if (filter.to) {
    conditions.push(lte(schema.scrobbles.listenedAt, filter.to))
  }
  if (filter.source) {
    conditions.push(eq(schema.scrobbles.source, filter.source))
  }
  if (filter.trackId) {
    conditions.push(eq(schema.scrobbles.trackId, filter.trackId))
  }
  if (filter.albumId) {
    conditions.push(eq(schema.scrobbles.albumId, filter.albumId))
  }

  return conditions
}

/** Append artistId condition — requires tracks table to be joined. */
export function addArtistCondition(
  conditions: SQL[],
  filter: ScrobbleFilter
): void {
  if (filter.artistId) {
    conditions.push(eq(schema.tracks.artistId, filter.artistId))
  }
}
