import { desc, eq } from "drizzle-orm";

import type { Database } from "./index";
import * as schema from "./schema";

export type ScrobbleRow = {
  id: number;
  listenedAt: Date;
  source: "lastfm" | "spotify" | "tidal";
  trackName: string;
  artistName: string;
};

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
    })
    .from(schema.scrobbles)
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .orderBy(desc(schema.scrobbles.listenedAt))
    .limit(opts?.limit ?? 50);
}
