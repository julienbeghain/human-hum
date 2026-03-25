import { and, asc, desc, eq, gt, lt } from "drizzle-orm";

import type { Database } from "../index";
import * as schema from "../schema";
import { addArtistCondition, buildFilterConditions } from "./filter";
import type { GetScrobblesParams, ScrobbleRow } from "./types";

export async function getScrobbles(
  db: Database,
  params?: GetScrobblesParams,
): Promise<ScrobbleRow[]> {
  const filter = params ?? {};
  const limit = filter.limit ?? 50;
  const orderAsc = filter.orderAsc ?? false;

  const conditions = buildFilterConditions(filter);
  addArtistCondition(conditions, filter);

  if (filter.cursor) {
    conditions.push(
      orderAsc
        ? gt(schema.scrobbles.listenedAt, filter.cursor)
        : lt(schema.scrobbles.listenedAt, filter.cursor),
    );
  }

  return db
    .select({
      id: schema.scrobbles.id,
      listenedAt: schema.scrobbles.listenedAt,
      source: schema.scrobbles.source,
      trackName: schema.tracks.name,
      artistName: schema.artists.name,
      albumName: schema.albums.name,
    })
    .from(schema.scrobbles)
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .leftJoin(schema.albums, eq(schema.scrobbles.albumId, schema.albums.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      orderAsc
        ? asc(schema.scrobbles.listenedAt)
        : desc(schema.scrobbles.listenedAt),
    )
    .limit(limit);
}
