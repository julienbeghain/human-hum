import type { Database } from "../index";
import { recordListen, type Source } from "../ingestion";
import {
  getEarliestScrobbleTimestamp,
  getLatestScrobbleTimestamp,
  getScrobbleCount,
} from "../queries";

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
  completeness?: CompletenessResult;
}

export interface CompletenessResult {
  localCount: number;
  remotePlaycount: number;
  coveragePercent: number;
}

const BASE_DELAY_MS = 200;
const MAX_RETRIES = 5;

/**
 * Import scrobbles from LastFM into the database.
 *
 * - Default (no flags): incremental sync — fetches from MAX(listened_at)-1s,
 *   paginates through all new scrobbles. Falls back to full backfill on empty DB.
 * - backfill=true: full backfill, paginates all pages (200/page, newest-first).
 */
export async function importScrobbles(
  db: Database,
  options: ImportOptions,
): Promise<ImportResult> {
  const { apiKey, user, backfill, onProgress } = options;
  let { from, to } = options;

  // Incremental sync: auto-detect `from` unless backfill or explicit `from`
  const paginate = backfill ?? false;
  if (!backfill && !from) {
    const latest = await getLatestScrobbleTimestamp(db);
    if (latest) {
      // 1-second overlap — dedup via unique constraint handles duplicates
      from = new Date(latest.getTime() - 1000);
    } else {
      // Empty DB — fall back to full backfill behavior
      return importScrobbles(db, { ...options, backfill: true });
    }
  }

  // Backfill resume: if backfilling with existing data and no explicit `to`,
  // set to = MIN(listened_at) + 1s so we only fetch pages older than what we have
  if (backfill && !to) {
    const earliest = await getEarliestScrobbleTimestamp(db);
    if (earliest) {
      to = new Date(earliest.getTime() + 1000);
    }
  }

  // Backfill and incremental sync both paginate at 200/page
  const limit = paginate || from ? 200 : 50;

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

    if (currentPage <= totalPages) {
      await delay(BASE_DELAY_MS);
    }
  } while (currentPage <= totalPages);

  // After backfill, check completeness against LastFM playcount
  let completeness: CompletenessResult | undefined;
  if (backfill) {
    completeness = await checkCompleteness(db, apiKey, user);
  }

  return { totalImported, totalSkipped, pagesProcessed, completeness };
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
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const backoff = BASE_DELAY_MS * Math.pow(2, attempt);
        await delay(backoff);
        continue;
      }
      throw err;
    }

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

async function checkCompleteness(
  db: Database,
  apiKey: string,
  user: string,
): Promise<CompletenessResult> {
  const [localCount, remotePlaycount] = await Promise.all([
    getScrobbleCount(db),
    fetchUserPlaycount(apiKey, user),
  ]);
  const coveragePercent =
    remotePlaycount > 0
      ? Math.round((localCount / remotePlaycount) * 10000) / 100
      : 100;
  return { localCount, remotePlaycount, coveragePercent };
}

interface LastfmUserInfo {
  user: { playcount: string };
}

async function fetchUserPlaycount(
  apiKey: string,
  user: string,
): Promise<number> {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", "user.getInfo");
  url.searchParams.set("user", user);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `LastFM user.getInfo error: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as LastfmUserInfo;
  return parseInt(data.user.playcount, 10);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
