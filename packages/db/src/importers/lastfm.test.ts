import { afterEach, describe, expect, it, vi } from "vitest"

import { LastfmFetcher } from "./lastfm"

// --- Fetch stubbing ---
//
// We stub the global `fetch` rather than the `../lastfm-api` module so the real
// `lastfmFetch` / `LastfmApiError` / zod-parsing paths execute. That exercises
// the actual retry-classification logic in `fetchWithRetry` (which inspects
// `LastfmApiError.status`) instead of a mock's stand-in.

interface LastfmTrack {
  name: string
  mbid?: string
  artist: { "#text": string; mbid?: string }
  album: { "#text": string; mbid?: string }
  date?: { uts: string }
  "@attr"?: { nowplaying: string }
}

function track(overrides: Partial<LastfmTrack> = {}): LastfmTrack {
  return {
    name: "Clipper",
    artist: { "#text": "Autechre" },
    album: { "#text": "Tri Repetae" },
    date: { uts: "1591005600" }, // 2020-06-01T10:00:00Z
    ...overrides,
  }
}

function recentTracksBody(tracks: LastfmTrack[], totalPages = 1): unknown {
  return {
    recenttracks: {
      track: tracks,
      "@attr": { totalPages: String(totalPages) },
    },
  }
}

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as unknown as Response
}

function errorResponse(status: number, statusText = "Error"): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  } as unknown as Response
}

function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn()
  for (const r of responses) fetchMock.mockResolvedValueOnce(r)
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const fetcher = new LastfmFetcher("test-key", "julien")
const params = { page: 1, pageSize: 200 }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// --- fetchPage: response parsing ---

describe("LastfmFetcher.fetchPage parsing", () => {
  it("maps a track into a ListenInput with mbids and a Date", async () => {
    stubFetch(
      okResponse(
        recentTracksBody([
          track({
            name: "Bike",
            mbid: "track-mbid",
            artist: { "#text": "Autechre", mbid: "artist-mbid" },
            album: { "#text": "Incunabula", mbid: "album-mbid" },
            date: { uts: "1591005600" },
          }),
        ])
      )
    )

    const result = await fetcher.fetchPage(params)

    expect(result.totalPages).toBe(1)
    expect(result.skippedCount).toBe(0)
    expect(result.listens).toHaveLength(1)
    expect(result.listens[0]).toEqual({
      artist: { name: "Autechre", mbid: "artist-mbid" },
      album: { name: "Incunabula", mbid: "album-mbid" },
      track: { name: "Bike", mbid: "track-mbid" },
      listenedAt: new Date("2020-06-01T10:00:00Z"),
      source: "lastfm",
    })
  })

  it("coerces empty-string album to an undefined album", async () => {
    stubFetch(
      okResponse(recentTracksBody([track({ album: { "#text": "" } })]))
    )

    const result = await fetcher.fetchPage(params)

    expect(result.listens[0]!.album).toBeUndefined()
  })

  it("coerces empty-string mbids to undefined", async () => {
    stubFetch(
      okResponse(
        recentTracksBody([
          track({
            mbid: "",
            artist: { "#text": "Autechre", mbid: "" },
            album: { "#text": "Tri Repetae", mbid: "" },
          }),
        ])
      )
    )

    const result = await fetcher.fetchPage(params)

    expect(result.listens[0]!.track.mbid).toBeUndefined()
    expect(result.listens[0]!.artist.mbid).toBeUndefined()
    expect(result.listens[0]!.album!.mbid).toBeUndefined()
  })

  it("skips a now-playing track and surfaces it as nowPlaying", async () => {
    stubFetch(
      okResponse(
        recentTracksBody([
          track({
            name: "Gantz Graf",
            album: { "#text": "Gantz Graf EP" },
            date: undefined,
            "@attr": { nowplaying: "true" },
          }),
          track({ name: "Clipper" }),
        ])
      )
    )

    const result = await fetcher.fetchPage(params)

    expect(result.skippedCount).toBe(1)
    expect(result.listens).toHaveLength(1)
    expect(result.nowPlaying).toEqual({
      trackName: "Gantz Graf",
      artistName: "Autechre",
      albumName: "Gantz Graf EP",
    })
  })

  it("skips a dateless (non-now-playing) track without setting nowPlaying", async () => {
    stubFetch(
      okResponse(recentTracksBody([track({ date: undefined })]))
    )

    const result = await fetcher.fetchPage(params)

    expect(result.skippedCount).toBe(1)
    expect(result.listens).toHaveLength(0)
    expect(result.nowPlaying).toBeUndefined()
  })

  it("omits albumName when a now-playing track has an empty album", async () => {
    stubFetch(
      okResponse(
        recentTracksBody([
          track({
            date: undefined,
            album: { "#text": "" },
            "@attr": { nowplaying: "true" },
          }),
        ])
      )
    )

    const result = await fetcher.fetchPage(params)

    expect(result.nowPlaying!.albumName).toBeUndefined()
  })

  it("parses totalPages from the response @attr", async () => {
    stubFetch(okResponse(recentTracksBody([track()], 7)))

    const result = await fetcher.fetchPage(params)

    expect(result.totalPages).toBe(7)
  })
})

// --- fetchWithRetry: transient vs fatal classification ---

describe("LastfmFetcher.fetchPage retry behavior", () => {
  it("returns on first success without retrying", async () => {
    const fetchMock = stubFetch(okResponse(recentTracksBody([track()])))

    await fetcher.fetchPage(params)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("retries a 429 rate-limit then succeeds", async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(
      errorResponse(429, "Too Many Requests"),
      okResponse(recentTracksBody([track()]))
    )

    const promise = fetcher.fetchPage(params)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.listens).toHaveLength(1)
  })

  it("retries a 5xx server error then succeeds", async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(
      errorResponse(503, "Service Unavailable"),
      okResponse(recentTracksBody([track()]))
    )

    const promise = fetcher.fetchPage(params)
    await vi.runAllTimersAsync()
    await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retries a transient network error then succeeds", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"))
    fetchMock.mockResolvedValueOnce(okResponse(recentTracksBody([track()])))
    vi.stubGlobal("fetch", fetchMock)

    const promise = fetcher.fetchPage(params)
    await vi.runAllTimersAsync()
    await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not retry a fatal 4xx client error", async () => {
    const fetchMock = stubFetch(errorResponse(404, "Not Found"))

    await expect(fetcher.fetchPage(params)).rejects.toThrow("404")

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("fails fast on a validation error (Last.fm error envelope at HTTP 200)", async () => {
    // A bad api_key/user surfaces as Last.fm's error envelope returned with a
    // 200 status, which fails the zod schema. That's a permanent config error,
    // not a transient one — it must not be retried.
    const fetchMock = stubFetch(
      okResponse({ error: 6, message: "User not found" })
    )

    await expect(fetcher.fetchPage(params)).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("gives up after exhausting MAX_RETRIES on persistent 5xx", async () => {
    vi.useFakeTimers()
    // 1 initial + 5 retries = 6 attempts, all failing.
    const fetchMock = stubFetch(
      ...Array.from({ length: 6 }, () => errorResponse(500, "Server Error"))
    )

    const promise = fetcher.fetchPage(params)
    const assertion = expect(promise).rejects.toThrow("500")
    await vi.runAllTimersAsync()
    await assertion

    expect(fetchMock).toHaveBeenCalledTimes(6)
  })
})

// --- getRemoteTotal ---

describe("LastfmFetcher.getRemoteTotal", () => {
  it("parses the user's playcount", async () => {
    stubFetch(okResponse({ user: { playcount: "12345" } }))

    expect(await fetcher.getRemoteTotal()).toBe(12345)
  })
})
