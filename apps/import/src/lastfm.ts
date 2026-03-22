import { createDb, recordListen } from "@workspace/db";

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
    if (t["@attr"]?.nowplaying === "true") {
      console.log(`  Skipping now-playing: ${t.artist["#text"]} - ${t.name}`);
      skipped++;
      continue;
    }

    if (!t.date) {
      skipped++;
      continue;
    }

    const result = await recordListen(db, {
      artist: { name: t.artist["#text"], mbid: t.artist.mbid || undefined },
      album: t.album["#text"]
        ? { name: t.album["#text"], mbid: t.album.mbid || undefined }
        : undefined,
      track: { name: t.name, mbid: t.mbid || undefined },
      listenedAt: new Date(parseInt(t.date.uts, 10) * 1000),
      source: "lastfm",
    });

    console.log(
      `  ${t.artist["#text"]} - ${t.name} @ ${result.wasNew ? "NEW" : "DUP"}`,
    );
    if (result.wasNew) imported++;
    else skipped++;
  }

  console.log(
    `\nDone: ${imported} scrobbles imported, ${skipped} skipped`,
  );
}

importPage().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
