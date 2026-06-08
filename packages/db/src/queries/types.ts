import type * as schema from "../schema"

export type Source = (typeof schema.sourceEnum.enumValues)[number]

// --- Shared filter applied to every query ---

export type ScrobbleFilter = {
  userId?: number // Phase 6
  from?: Date
  to?: Date
  source?: Source
  artistId?: number
  albumId?: number
  trackId?: number
}

// --- Scrobble listing ---

export type GetScrobblesParams = ScrobbleFilter & {
  page?: number // default: 1
  pageSize?: number // default: 50
  cursor?: Date // keyset pagination (ignored when page is set)
  orderAsc?: boolean // default: false (newest first)
}

export type ScrobbleRow = {
  id: number
  listenedAt: Date
  source: Source
  trackName: string
  artistId: number
  artistName: string
  albumId: number | null
  albumName: string | null
}

export type PaginatedScrobbles = {
  rows: ScrobbleRow[]
  totalCount: number
}

export type ScrobbleDetail = ScrobbleRow & {
  trackId: number
  artistId: number
  albumId: number | null
  trackPlayCount: number
  artistPlayCount: number
}

// --- Stats ---

export type ScrobbleStats = {
  total: number
  earliest: Date | null
  latest: Date | null
  uniqueArtists: number
  uniqueTracks: number
  uniqueAlbums: number
}

// --- Rankings ---

export type GetArtistRankingsParams = ScrobbleFilter & {
  topN?: number // default: 50
}

export type ArtistRanking = {
  artistId: number
  artistName: string
  playCount: number
}

export type TrackRanking = {
  trackId: number
  trackName: string
  playCount: number
}

// --- Artist detail ---

export type GetArtistDetailParams = ScrobbleFilter & {
  artistId: number
}

export type ArtistDetail = {
  artistId: number
  artistName: string
  playCount: number
  topTracks: TrackRanking[]
  topAlbums: { albumId: number; albumName: string; playCount: number }[]
}

// --- Album detail ---

export type GetAlbumDetailParams = ScrobbleFilter & {
  albumId: number
}

export type AlbumDetailTrack = {
  trackId: number | null
  trackName: string
  playCount: number
  trackNumber: number | null
  duration: number | null
}

export type AlbumDetail = {
  albumId: number
  albumName: string
  artistId: number
  artistName: string
  playCount: number
  enrichedAt: Date | null
  imageUrl: string | null
  tracks: AlbumDetailTrack[]
}

// --- Time series ---

export type TimeSeriesPeriod = "day" | "week" | "month" | "year"

export type GetTimeSeriesParams = ScrobbleFilter & {
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
