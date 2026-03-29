import type { ListenInput, Source } from "../ingestion"
import type { FetchPageParams, FetchPageResult, SourceFetcher } from "./source-fetcher"

// Re-export orchestration for convenience
export { importScrobbles } from "./source-fetcher"
export type {
  CompletenessResult,
  ImportOptions,
  ImportResult,
  PageProgress,
} from "./source-fetcher"

// --- LastFM API types ---

interface LastfmTrack {
  name: string
  mbid: string
  artist: { "#text": string; mbid: string }
  album: { "#text": string; mbid: string }
  date?: { uts: string }
  "@attr"?: { nowplaying: string }
}

interface LastfmResponse {
  recenttracks: {
    track: LastfmTrack[]
    "@attr": {
      total: string
      page: string
      perPage: string
      totalPages: string
    }
  }
}

interface LastfmUserInfo {
  user: { playcount: string }
}

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

    for (const t of pageTracks) {
      if (t["@attr"]?.nowplaying === "true" || !t.date) {
        skippedCount++
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

    return { listens, totalPages, skippedCount }
  }

  async getRemotePlaycount(): Promise<number> {
    const url = new URL("https://ws.audioscrobbler.com/2.0/")
    url.searchParams.set("method", "user.getInfo")
    url.searchParams.set("user", this.user)
    url.searchParams.set("api_key", this.apiKey)
    url.searchParams.set("format", "json")

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `LastFM user.getInfo error: ${response.status} ${response.statusText}`
      )
    }
    const data = (await response.json()) as LastfmUserInfo
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
  const url = new URL("https://ws.audioscrobbler.com/2.0/")
  url.searchParams.set("method", "user.getRecentTracks")
  url.searchParams.set("user", params.user)
  url.searchParams.set("api_key", params.apiKey)
  url.searchParams.set("format", "json")
  url.searchParams.set("limit", params.limit.toString())
  url.searchParams.set("page", params.page.toString())

  if (params.from) url.searchParams.set("from", unixSeconds(params.from))
  if (params.to) url.searchParams.set("to", unixSeconds(params.to))

  return url
}

async function fetchWithRetry(url: URL): Promise<LastfmResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response
    try {
      response = await fetch(url)
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const backoff = BASE_DELAY_MS * Math.pow(2, attempt)
        await delay(backoff)
        continue
      }
      throw err
    }

    if (response.ok) {
      return (await response.json()) as LastfmResponse
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const backoff = BASE_DELAY_MS * Math.pow(2, attempt)
      await delay(backoff)
      continue
    }

    throw new Error(
      `LastFM API error: ${response.status} ${response.statusText}`
    )
  }

  throw new Error("LastFM API: max retries exceeded")
}

function unixSeconds(date: Date): string {
  return Math.floor(date.getTime() / 1000).toString()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
