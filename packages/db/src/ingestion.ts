import { and, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import type { Database } from "./index.js";
import * as schema from "./schema.js";

export type Source = (typeof schema.sourceEnum.enumValues)[number];

export interface ListenInput {
  artist: { name: string; mbid?: string };
  album?: { name: string; mbid?: string };
  track: { name: string; mbid?: string };
  listenedAt: Date;
  source: Source;
}

export interface ScrobbleResult {
  scrobbleId: number;
  trackId: number;
  artistId: number;
  albumId: number | null;
  wasNew: boolean;
}

// --- Private helpers ---

function normalizeMbid(mbid?: string): string | null {
  return mbid && mbid.length > 0 ? mbid : null;
}

/**
 * Select-Insert-Reselect: race-condition-safe idempotent entity resolution.
 * Returns the entity's ID whether it already existed or was just created.
 */
async function resolveEntity(
  db: Database,
  table: PgTable & { id: any },
  conditions: SQL[],
  values: Record<string, unknown>,
): Promise<number> {
  // 1. Try to find existing
  const existing = await (db as any)
    .select({ id: (table as any).id })
    .from(table)
    .where(and(...conditions))
    .limit(1);

  if (existing[0]) return existing[0].id;

  // 2. Try to insert
  const inserted = await (db as any)
    .insert(table)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: (table as any).id });

  if (inserted[0]) return inserted[0].id;

  // 3. Race condition: another process inserted between our select and insert
  const refetch = await (db as any)
    .select({ id: (table as any).id })
    .from(table)
    .where(and(...conditions))
    .limit(1);

  if (!refetch[0]) {
    throw new Error(
      `Entity resolution failed for ${table._.name}: ${JSON.stringify(values)}`,
    );
  }

  return refetch[0].id;
}

// --- Public API ---

export async function recordListen(
  db: Database,
  input: ListenInput,
): Promise<ScrobbleResult> {
  const { artists, albums, tracks, scrobbles } = schema;

  // Resolve artist
  const artistMbid = normalizeMbid(input.artist.mbid);
  const artistConditions: SQL[] = [eq(artists.name, input.artist.name)];
  if (artistMbid) artistConditions.push(eq(artists.mbid, artistMbid));

  const artistId = await resolveEntity(db, artists, artistConditions, {
    name: input.artist.name,
    mbid: artistMbid,
  });

  // Resolve album (optional)
  let albumId: number | null = null;
  if (input.album) {
    const albumMbid = normalizeMbid(input.album.mbid);
    const albumConditions: SQL[] = [
      eq(albums.name, input.album.name),
      eq(albums.artistId, artistId),
    ];
    if (albumMbid) albumConditions.push(eq(albums.mbid, albumMbid));

    albumId = await resolveEntity(db, albums, albumConditions, {
      name: input.album.name,
      mbid: albumMbid,
      artistId,
    });
  }

  // Resolve track
  const trackMbid = normalizeMbid(input.track.mbid);
  const trackConditions: SQL[] = [
    eq(tracks.name, input.track.name),
    eq(tracks.artistId, artistId),
  ];
  if (trackMbid) trackConditions.push(eq(tracks.mbid, trackMbid));

  const trackId = await resolveEntity(db, tracks, trackConditions, {
    name: input.track.name,
    mbid: trackMbid,
    artistId,
    albumId,
  });

  // Insert scrobble
  const inserted = await (db as any)
    .insert(scrobbles)
    .values({
      trackId,
      listenedAt: input.listenedAt,
      source: input.source,
    })
    .onConflictDoNothing()
    .returning({ id: scrobbles.id });

  const wasNew = inserted.length > 0;
  const scrobbleId = wasNew
    ? inserted[0].id
    : (
        await (db as any)
          .select({ id: scrobbles.id })
          .from(scrobbles)
          .where(
            and(
              eq(scrobbles.trackId, trackId),
              eq(scrobbles.listenedAt, input.listenedAt),
            ),
          )
          .limit(1)
      )[0].id;

  return { scrobbleId, trackId, artistId, albumId, wasNew };
}
