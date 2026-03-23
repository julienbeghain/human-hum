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
  /** Paginate through all pages (200 tracks/page). Default: single page of 50. */
  backfill?: boolean;
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

const BASE_DELAY_MS = 200;
const MAX_RETRIES = 5;

/**
 * Import scrobbles from LastFM into the database.
 * With backfill=true, paginates through all pages (200/page, newest-first).
 */
export async function importScrobbles(
  db: Database,
  options: ImportOptions,
): Promise<ImportResult> {
  const { apiKey, user, from, to, backfill, onProgress } = options;
  const limit = backfill ? 200 : 50;

  let totalImported = 0;
  let totalSkipped = 0;
  let pagesProcessed = 0;
  let currentPage = 1;
  let totalPages = 1;

  do {
    const url = buildUrl({ apiKey, user, from, to, limit, page: currentPage });
    const data = await fetchWithRetry(url);

    const pageTracks = data.recenttracks.track;
    const attrs = data.recenttracks["@attr"];
    totalPages = parseInt(attrs.totalPages, 10);

    let pageImported = 0;
    let pageSkipped = 0;

    for (const t of pageTracks) {
      if (t["@attr"]?.nowplaying === "true" || !t.date) {
        pageSkipped++;
        continue;
      }

      const result = await recordListen(db, {
        artist: {
          name: t.artist["#text"],
          mbid: t.artist.mbid || undefined,
        },
        album: t.album["#text"]
          ? { name: t.album["#text"], mbid: t.album.mbid || undefined }
          : undefined,
        track: { name: t.name, mbid: t.mbid || undefined },
        listenedAt: new Date(parseInt(t.date.uts, 10) * 1000),
        source: "lastfm" satisfies Source,
      });

      if (result.wasNew) pageImported++;
      else pageSkipped++;
    }

    totalImported += pageImported;
    totalSkipped += pageSkipped;
    pagesProcessed++;

    onProgress?.({
      page: currentPage,
      totalPages,
      imported: pageImported,
      skipped: pageSkipped,
    });

    currentPage++;

    if (backfill && currentPage <= totalPages) {
      await delay(BASE_DELAY_MS);
    }
  } while (backfill && currentPage <= totalPages);

  return { totalImported, totalSkipped, pagesProcessed };
}

// --- Helpers ---

function buildUrl(params: {
  apiKey: string;
  user: string;
  from?: Date;
  to?: Date;
  limit: number;
  page: number;
}): URL {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", "user.getRecentTracks");
  url.searchParams.set("user", params.user);
  url.searchParams.set("api_key", params.apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", params.limit.toString());
  url.searchParams.set("page", params.page.toString());

  if (params.from) url.searchParams.set("from", unixSeconds(params.from));
  if (params.to) url.searchParams.set("to", unixSeconds(params.to));

  return url;
}

async function fetchWithRetry(url: URL): Promise<LastfmResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url);

    if (response.ok) {
      return (await response.json()) as LastfmResponse;
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
      await delay(backoff);
      continue;
    }

    throw new Error(
      `LastFM API error: ${response.status} ${response.statusText}`,
    );
  }

  throw new Error("LastFM API: max retries exceeded");
}

function unixSeconds(date: Date): string {
  return Math.floor(date.getTime() / 1000).toString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
