import { createDb, schema } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const { artists, albums, tracks, scrobbles } = schema;

// --- Config ---

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const LASTFM_API_KEY = requireEnv("LASTFM_API_KEY");
const LASTFM_USER = requireEnv("LASTFM_USER");
const DATABASE_URL = requireEnv("DATABASE_URL");

const db = createDb(DATABASE_URL);

// --- LastFM types ---

interface LastfmTrack {
  name: string;
  mbid: string;
  artist: { "#text": string; mbid: string };
  album: { "#text": string; mbid: string };
  date?: { uts: string };
  "@attr"?: { nowplaying: string };
}

interface LastfmResponse {
  recenttracks: {
    track: LastfmTrack[];
    "@attr": {
      total: string;
      page: string;
      perPage: string;
      totalPages: string;
    };
  };
}

// --- Helpers ---

function mbidOrNull(mbid: string): string | null {
  return mbid && mbid.length > 0 ? mbid : null;
}

async function upsertArtist(
  name: string,
  mbid: string | null,
): Promise<number> {
  const conditions = [eq(artists.name, name)];
  if (mbid) {
    conditions.push(eq(artists.mbid, mbid));
  }

  const existing = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(...conditions))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(artists)
    .values({ name, mbid })
    .onConflictDoNothing()
    .returning({ id: artists.id });

  if (inserted[0]) return inserted[0].id;

  // Race condition: re-query
  const refetch = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(...conditions))
    .limit(1);

  return refetch[0]!.id;
}

async function upsertAlbum(
  name: string,
  mbid: string | null,
  artistId: number,
): Promise<number> {
  const conditions = [eq(albums.name, name), eq(albums.artistId, artistId)];
  if (mbid) {
    conditions.push(eq(albums.mbid, mbid));
  }

  const existing = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(...conditions))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(albums)
    .values({ name, mbid, artistId })
    .onConflictDoNothing()
    .returning({ id: albums.id });

  if (inserted[0]) return inserted[0].id;

  const refetch = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(...conditions))
    .limit(1);

  return refetch[0]!.id;
}

async function upsertTrack(
  name: string,
  mbid: string | null,
  artistId: number,
  albumId: number | null,
): Promise<number> {
  const conditions = [eq(tracks.name, name), eq(tracks.artistId, artistId)];
  if (mbid) {
    conditions.push(eq(tracks.mbid, mbid));
  }

  const existing = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(...conditions))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(tracks)
    .values({ name, mbid, artistId, albumId })
    .onConflictDoNothing()
    .returning({ id: tracks.id });

  if (inserted[0]) return inserted[0].id;

  const refetch = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(...conditions))
    .limit(1);

  return refetch[0]!.id;
}

// --- Main ---

async function importPage() {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", "user.getRecentTracks");
  url.searchParams.set("user", LASTFM_USER);
  url.searchParams.set("api_key", LASTFM_API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "50");
  url.searchParams.set("page", "1");

  console.log(`Fetching recent tracks for ${LASTFM_USER}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`LastFM API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as LastfmResponse;
  const pageTracks = data.recenttracks.track;
  const attrs = data.recenttracks["@attr"];

  console.log(
    `Got ${pageTracks.length} tracks (page ${attrs.page}/${attrs.totalPages}, ${attrs.total} total)`,
  );

  let imported = 0;
  let skipped = 0;

  for (const t of pageTracks) {
    // Skip now-playing tracks (they have no timestamp)
    if (t["@attr"]?.nowplaying === "true") {
      console.log(`  Skipping now-playing: ${t.artist["#text"]} - ${t.name}`);
      skipped++;
      continue;
    }

    if (!t.date) {
      skipped++;
      continue;
    }

    const artistMbid = mbidOrNull(t.artist.mbid);
    const albumMbid = mbidOrNull(t.album.mbid);
    const trackMbid = mbidOrNull(t.mbid);

    const artistId = await upsertArtist(t.artist["#text"], artistMbid);

    let albumId: number | null = null;
    if (t.album["#text"]) {
      albumId = await upsertAlbum(t.album["#text"], albumMbid, artistId);
    }

    const trackId = await upsertTrack(t.name, trackMbid, artistId, albumId);

    const listenedAt = new Date(parseInt(t.date.uts, 10) * 1000);

    await db
      .insert(scrobbles)
      .values({ trackId, listenedAt, source: "lastfm" })
      .onConflictDoNothing();

    console.log(
      `  ${t.artist["#text"]} - ${t.name} @ ${listenedAt.toISOString()}`,
    );
    imported++;
  }

  console.log(
    `\nDone: ${imported} scrobbles imported, ${skipped} skipped`,
  );
}

importPage().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
