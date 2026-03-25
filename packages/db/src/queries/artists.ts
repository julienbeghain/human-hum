import { and, count, desc, eq } from "drizzle-orm";

import type { Database } from "../index";
import * as schema from "../schema";
import { buildFilterConditions } from "./filter";
import type {
  ArtistDetail,
  ArtistRanking,
  GetArtistDetailParams,
  GetArtistRankingsParams,
} from "./types";

export async function getArtistRankings(
  db: Database,
  params?: GetArtistRankingsParams,
): Promise<ArtistRanking[]> {
  const filter = params ?? {};
  const topN = filter.topN ?? 50;
  const conditions = buildFilterConditions(filter);

  return db
    .select({
      artistId: schema.artists.id,
      artistName: schema.artists.name,
      playCount: count(schema.scrobbles.id),
    })
    .from(schema.scrobbles)
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(schema.artists.id, schema.artists.name)
    .orderBy(desc(count(schema.scrobbles.id)))
    .limit(topN);
}

export async function getArtistDetail(
  db: Database,
  params: GetArtistDetailParams,
): Promise<ArtistDetail | null> {
  const { artistId, ...filter } = params;
  const conditions = buildFilterConditions(filter);
  conditions.push(eq(schema.tracks.artistId, artistId));

  // Artist info + total play count
  const [artist] = await db
    .select({
      artistId: schema.artists.id,
      artistName: schema.artists.name,
      playCount: count(schema.scrobbles.id),
    })
    .from(schema.scrobbles)
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .where(and(...conditions))
    .groupBy(schema.artists.id, schema.artists.name);

  if (!artist) return null;

  // Top tracks for this artist
  const topTracks = await db
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
    .limit(10);

  // Top albums for this artist (join albums directly)
  const albumConditions = buildFilterConditions(filter);
  albumConditions.push(eq(schema.albums.artistId, artistId));

  const topAlbums = await db
    .select({
      albumId: schema.albums.id,
      albumName: schema.albums.name,
      playCount: count(schema.scrobbles.id),
    })
    .from(schema.scrobbles)
    .innerJoin(schema.albums, eq(schema.scrobbles.albumId, schema.albums.id))
    .where(and(...albumConditions))
    .groupBy(schema.albums.id, schema.albums.name)
    .orderBy(desc(count(schema.scrobbles.id)))
    .limit(10);

  return { ...artist, topTracks, topAlbums };
}
