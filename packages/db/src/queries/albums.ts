import { and, count, desc, eq } from "drizzle-orm";

import type { Database } from "../index";
import * as schema from "../schema";
import { buildFilterConditions } from "./filter";
import type { AlbumDetail, GetAlbumDetailParams } from "./types";

export async function getAlbumDetail(
  db: Database,
  params: GetAlbumDetailParams,
): Promise<AlbumDetail | null> {
  const { albumId, ...filter } = params;
  const conditions = buildFilterConditions(filter);
  conditions.push(eq(schema.scrobbles.albumId, albumId));

  // Album info + total play count
  const [album] = await db
    .select({
      albumId: schema.albums.id,
      albumName: schema.albums.name,
      artistName: schema.artists.name,
      playCount: count(schema.scrobbles.id),
    })
    .from(schema.scrobbles)
    .innerJoin(schema.albums, eq(schema.scrobbles.albumId, schema.albums.id))
    .innerJoin(schema.artists, eq(schema.albums.artistId, schema.artists.id))
    .where(and(...conditions))
    .groupBy(schema.albums.id, schema.albums.name, schema.artists.name);

  if (!album) return null;

  // Track listing with play counts
  const tracks = await db
    .select({
      trackId: schema.tracks.id,
      trackName: schema.tracks.name,
      playCount: count(schema.scrobbles.id),
    })
    .from(schema.scrobbles)
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .where(and(...conditions))
    .groupBy(schema.tracks.id, schema.tracks.name)
    .orderBy(desc(count(schema.scrobbles.id)));

  return { ...album, tracks };
}
