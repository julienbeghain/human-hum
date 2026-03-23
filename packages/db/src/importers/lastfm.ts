import type { Database } from "../index";
import { recordListen, type Source } from "../ingestion";

// --- LastFM API types ---

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

// --- Public API ---

export interface ImportOptions {
  apiKey: string;
  user: string;
  from?: Date;
  to?: Date;
  onProgress?: (progress: PageProgress) => void;
}

export interface PageProgress {
  page: number;
  totalPages: number;
  imported: number;
  skipped: number;
}

export interface ImportResult {
  totalImported: number;
  totalSkipped: number;
  pagesProcessed: number;
}

/**
 * Import scrobbles from LastFM into the database.
 * Currently fetches a single page; pagination will be added by a follow-up task.
 */
export async function importScrobbles(
  db: Database,
  options: ImportOptions,
): Promise<ImportResult> {
  const { apiKey, user, from, to, onProgress } = options;

  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", "user.getRecentTracks");
  url.searchParams.set("user", user);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "50");
  url.searchParams.set("page", "1");

  if (from) url.searchParams.set("from", unixSeconds(from));
  if (to) url.searchParams.set("to", unixSeconds(to));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `LastFM API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as LastfmResponse;
  const pageTracks = data.recenttracks.track;
  const attrs = data.recenttracks["@attr"];

  let imported = 0;
  let skipped = 0;

  for (const t of pageTracks) {
    if (t["@attr"]?.nowplaying === "true" || !t.date) {
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
      source: "lastfm" satisfies Source,
    });

    if (result.wasNew) imported++;
    else skipped++;
  }

  onProgress?.({
    page: parseInt(attrs.page, 10),
    totalPages: parseInt(attrs.totalPages, 10),
    imported,
    skipped,
  });

  return {
    totalImported: imported,
    totalSkipped: skipped,
    pagesProcessed: 1,
  };
}

// --- Helpers ---

function unixSeconds(date: Date): string {
  return Math.floor(date.getTime() / 1000).toString();
}
