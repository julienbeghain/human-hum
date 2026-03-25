import type * as schema from "../schema";

export type Source = (typeof schema.sourceEnum.enumValues)[number];

// --- Shared filter applied to every query ---

export type ScrobbleFilter = {
  userId?: number; // Phase 6
  from?: Date;
  to?: Date;
  source?: Source;
  artistId?: number;
  albumId?: number;
  trackId?: number;
};

// --- Scrobble listing ---

export type GetScrobblesParams = ScrobbleFilter & {
  limit?: number; // default: 50
  cursor?: Date; // keyset pagination
  orderAsc?: boolean; // default: false (newest first)
};

export type ScrobbleRow = {
  id: number;
  listenedAt: Date;
  source: Source;
  trackName: string;
  artistName: string;
  albumName: string | null;
};

// --- Stats ---

export type ScrobbleStats = {
  total: number;
  earliest: Date | null;
  latest: Date | null;
  uniqueArtists: number;
  uniqueTracks: number;
  uniqueAlbums: number;
};

// --- Rankings ---

export type GetArtistRankingsParams = ScrobbleFilter & {
  topN?: number; // default: 50
};

export type ArtistRanking = {
  artistId: number;
  artistName: string;
  playCount: number;
};

// --- Artist detail ---

export type GetArtistDetailParams = ScrobbleFilter & {
  artistId: number;
};

export type ArtistDetail = {
  artistId: number;
  artistName: string;
  playCount: number;
  topTracks: { trackId: number; trackName: string; playCount: number }[];
  topAlbums: { albumId: number; albumName: string; playCount: number }[];
};

// --- Album detail ---

export type GetAlbumDetailParams = ScrobbleFilter & {
  albumId: number;
};

export type AlbumDetail = {
  albumId: number;
  albumName: string;
  artistName: string;
  playCount: number;
  tracks: { trackId: number; trackName: string; playCount: number }[];
};

// --- Time series ---

export type TimeSeriesPeriod = "day" | "week" | "month" | "year";

export type GetTimeSeriesParams = ScrobbleFilter & {
  period: TimeSeriesPeriod;
};

export type TimeSeriesBucket = {
  period: Date;
  count: number;
};

// --- Listening clock ---

export type ListeningClockSlot = {
  hour: number;
  count: number;
};
