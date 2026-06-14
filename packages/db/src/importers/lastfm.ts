import { z } from "zod"

import { LastfmApiError, lastfmFetch, lastfmUrl } from "../lastfm-api"
import type { ListenInput, Source } from "../ingestion"
import type {
  FetchPageParams,
  FetchPageResult,
  NowPlayingTrack,
  SourceFetcher,
} from "./source-fetcher"

// Re-export orchestration for convenience
export { importHums, syncProbe, syncHums } from "./source-fetcher"
export type {
  CompletenessResult,
  ImportOptions,
  ImportResult,
  NowPlayingTrack,
  PageProgress,
  SyncOptions,
  SyncProbeResult,
  SyncResult,
} from "./source-fetcher"

// --- LastFM API schemas ---

const lastfmTrackSchema = z.object({
  name: z.string(),
  mbid: z.string().optional(),
  artist: z.object({ "#text": z.string(), mbid: z.string().optional() }),
  album: z.object({ "#text": z.string(), mbid: z.string().optional() }),
  date: z.object({ uts: z.string() }).optional(),
  "@attr": z.object({ nowplaying: z.string() }).optional(),
})

const lastfmRecentTracksSchema = z.object({
  recenttracks: z.object({
    track: z.array(lastfmTrackSchema),
    "@attr": z.object({ totalPages: z.string() }),
  }),
})

const lastfmUserInfoSchema = z.object({
  user: z.object({ playcount: z.string() }),
})

type LastfmResponse = z.infer<typeof lastfmRecentTracksSchema>

// --- LastfmFetcher ---

const BASE_DELAY_MS = 200
const MAX_RETRIES = 5

export class LastfmFetcher implements SourceFetcher {
  readonly source: Source = "lastfm"

  constructor(
    private readonly apiKey: string,
    private readonly user: string
  ) {}

  async fetchPage(params: FetchPageParams): Promise<FetchPageResult> {
    const url = buildUrl({
      apiKey: this.apiKey,
      user: this.user,
      from: params.from,
      to: params.to,
      limit: params.pageSize,
      page: params.page,
    })

    const data = await fetchWithRetry(url)
    const pageTracks = data.recenttracks.track
    const totalPages = parseInt(data.recenttracks["@attr"].totalPages, 10)

    const listens: ListenInput[] = []
    let skippedCount = 0
    let nowPlaying: NowPlayingTrack | undefined

    for (const t of pageTracks) {
      if (t["@attr"]?.nowplaying === "true" || !t.date) {
        skippedCount++
        if (t["@attr"]?.nowplaying === "true") {
          nowPlaying = {
            trackName: t.name,
            artistName: t.artist["#text"],
            albumName: t.album["#text"] || undefined,
          }
        }
        continue
      }

      listens.push({
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
      })
    }

    return { listens, totalPages, skippedCount, nowPlaying }
  }

  async getRemoteTotal(): Promise<number> {
    const url = lastfmUrl(this.apiKey, {
      method: "user.getInfo",
      user: this.user,
    })

    const data = await lastfmFetch(url, lastfmUserInfoSchema)
    return parseInt(data.user.playcount, 10)
  }
}

// --- Helpers ---

function buildUrl(params: {
  apiKey: string
  user: string
  from?: Date
  to?: Date
  limit: number
  page: number
}): URL {
  const query: Record<string, string> = {
    method: "user.getRecentTracks",
    user: params.user,
    limit: params.limit.toString(),
    page: params.page.toString(),
  }
  if (params.from) query.from = unixSeconds(params.from)
  if (params.to) query.to = unixSeconds(params.to)

  return lastfmUrl(params.apiKey, query)
}

async function fetchWithRetry(url: URL): Promise<LastfmResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await lastfmFetch(url, lastfmRecentTracksSchema)
    } catch (err) {
      // 4xx client errors (except 429) never succeed on retry. Network errors,
      // 429 rate-limits, and 5xx server errors are transient — back off and retry.
      const fatal =
        err instanceof LastfmApiError && err.status !== 429 && err.status < 500
      if (fatal || attempt >= MAX_RETRIES) throw err

      await delay(BASE_DELAY_MS * Math.pow(2, attempt))
    }
  }

  throw new Error("LastFM API: max retries exceeded")
}

function unixSeconds(date: Date): string {
  return Math.floor(date.getTime() / 1000).toString()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
