import type * as schema from "../schema"

export type Source = (typeof schema.sourceEnum.enumValues)[number]

// --- Shared filter applied to every query ---

export type HumFilter = {
  userId?: number // Phase 6
  from?: Date
  to?: Date
  source?: Source
  artistId?: number
  albumId?: number
  trackId?: number
}

// --- Hum listing ---

export type GetHumsParams = HumFilter & {
  page?: number // default: 1
  pageSize?: number // default: 50
  cursor?: Date // keyset pagination (ignored when page is set)
  orderAsc?: boolean // default: false (newest first)
}

export type HumRow = {
  id: number
  listenedAt: Date
  source: Source
  trackName: string
  artistId: number
  artistName: string
  albumId: number | null
  albumName: string | null
}

export type PaginatedHums = {
  rows: HumRow[]
  totalCount: number
}

export type HumDetail = HumRow & {
  trackId: number
  artistId: number
  albumId: number | null
  trackHumCount: number
  artistHumCount: number
}

// --- Stats ---

export type HumStats = {
  total: number
  earliest: Date | null
  latest: Date | null
  uniqueArtists: number
  uniqueTracks: number
  uniqueAlbums: number
}

// --- Rankings ---

export type GetArtistRankingsParams = HumFilter & {
  topN?: number // default: 50
}

export type ArtistRanking = {
  artistId: number
  artistName: string
  humCount: number
}

export type TrackRanking = {
  trackId: number
  trackName: string
  humCount: number
}

// --- Artist detail ---

export type GetArtistDetailParams = HumFilter & {
  artistId: number
}

export type ArtistDetail = {
  artistId: number
  artistName: string
  humCount: number
  topTracks: TrackRanking[]
  topAlbums: { albumId: number; albumName: string; humCount: number }[]
}

// --- Album detail ---

export type GetAlbumDetailParams = HumFilter & {
  albumId: number
}

export type AlbumDetailTrack = {
  trackId: number | null
  trackName: string
  humCount: number
  trackNumber: number | null
  duration: number | null
}

export type AlbumDetail = {
  albumId: number
  albumName: string
  artistId: number
  artistName: string
  humCount: number
  imageUrl: string | null
  tracks: AlbumDetailTrack[]
}

// --- Time series ---

export type TimeSeriesPeriod = "day" | "week" | "month" | "year"

export type GetTimeSeriesParams = HumFilter & {
  period: TimeSeriesPeriod
}

export type TimeSeriesBucket = {
  period: Date
  count: number
}

// --- Listening clock ---

export type ListeningClockSlot = {
  hour: number
  count: number
}
