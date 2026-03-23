import { count, desc, eq, max, min } from "drizzle-orm";

import type { Database } from "./index";
import * as schema from "./schema";

export type ScrobbleRow = {
  id: number;
  listenedAt: Date;
  source: "lastfm" | "spotify" | "tidal";
  trackName: string;
  artistName: string;
  albumName: string | null;
};

export async function getLatestScrobbleTimestamp(
  db: Database,
): Promise<Date | null> {
  const [row] = await db
    .select({ latest: max(schema.scrobbles.listenedAt) })
    .from(schema.scrobbles);
  return row?.latest ?? null;
}

export async function getEarliestScrobbleTimestamp(
  db: Database,
): Promise<Date | null> {
  const [row] = await db
    .select({ earliest: min(schema.scrobbles.listenedAt) })
    .from(schema.scrobbles);
  return row?.earliest ?? null;
}

export async function getScrobbleCount(db: Database): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(schema.scrobbles);
  return row?.total ?? 0;
}

export async function getRecentScrobbles(
  db: Database,
  opts?: { limit?: number },
): Promise<ScrobbleRow[]> {
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
    .orderBy(desc(schema.scrobbles.listenedAt))
    .limit(opts?.limit ?? 50);
}
