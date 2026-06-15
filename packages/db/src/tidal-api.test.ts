import { afterEach, describe, expect, it, vi } from "vitest"

// --- Fetch stubbing ---
//
// We stub the global `fetch` rather than the `./tidal-api` module so the real
// token-cache, `TidalApiError`, and zod-parsing paths execute. Stubbing the
// module would short-circuit those paths and let a schema regression slip past.

const ENV = {
  DATABASE_URL: "postgres://user:pass@host.neon.tech/db",
  LASTFM_API_KEY: "a-real-key",
  TIDAL_CLIENT_ID: "a-client-id",
  TIDAL_CLIENT_SECRET: "a-client-secret",
}

const TIDAL_AUTH_URL = "https://auth.tidal.com/v1/oauth2/token"

function tokenBody(expiresIn = 14400): unknown {
  return { access_token: "tok-123", token_type: "Bearer", expires_in: expiresIn }
}

interface AlbumSeed {
  id: string
  title: string
  popularity: number
}

function searchAlbumsBody(albums: AlbumSeed[]): unknown {
  return {
    data: albums.map((a) => ({ id: a.id, type: "albums" })),
    included: albums.map((a) => ({
      id: a.id,
      type: "albums",
      attributes: { title: a.title, popularity: a.popularity },
    })),
    links: { self: "/searchResults/q/relationships/albums" },
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

// Fresh module per test so the in-memory token cache starts empty.
async function loadTidal() {
  vi.resetModules()
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
  return import("./tidal-api")
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("getAccessToken", () => {
  it("fetches a client-credentials token with HTTP Basic auth", async () => {
    const fetchMock = stubFetch(okResponse(tokenBody()))
    const { getAccessToken } = await loadTidal()

    const token = await getAccessToken()

    expect(token).toBe("tok-123")
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(TIDAL_AUTH_URL)
    expect(init.method).toBe("POST")
    const expectedBasic =
      "Basic " +
      Buffer.from(`${ENV.TIDAL_CLIENT_ID}:${ENV.TIDAL_CLIENT_SECRET}`).toString(
        "base64"
      )
    expect(init.headers.Authorization).toBe(expectedBasic)
    expect(String(init.body)).toContain("grant_type=client_credentials")
  })

  it("caches the token and does not re-fetch within its expiry", async () => {
    const fetchMock = stubFetch(
      okResponse(tokenBody()),
      okResponse(tokenBody())
    )
    const { getAccessToken } = await loadTidal()

    await getAccessToken()
    await getAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("re-fetches a fresh token once the cached one has expired", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const fetchMock = stubFetch(
      okResponse(tokenBody(120)),
      okResponse(tokenBody(120))
    )
    const { getAccessToken } = await loadTidal()

    await getAccessToken()
    vi.setSystemTime(200_000) // well past a 120s TTL
    await getAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("re-fetches inside the safety margin, before the real TTL elapses", async () => {
    // Guards the `- EXPIRY_MARGIN_MS` term: a 120s TTL minus the 60s margin
    // means the cache lapses at 60s, so a call at 70s must re-fetch even though
    // the real token would not expire until 120s.
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const fetchMock = stubFetch(
      okResponse(tokenBody(120)),
      okResponse(tokenBody(120))
    )
    const { getAccessToken } = await loadTidal()

    await getAccessToken()
    vi.setSystemTime(70_000)
    await getAccessToken()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws a status-carrying TidalApiError when the token endpoint fails", async () => {
    stubFetch(errorResponse(401, "Unauthorized"))
    const { getAccessToken, TidalApiError } = await loadTidal()

    await expect(getAccessToken()).rejects.toBeInstanceOf(TidalApiError)
  })
})

describe("searchTidalAlbums", () => {
  it("parses the JSON:API document into mapped albums", async () => {
    const fetchMock = stubFetch(
      okResponse(tokenBody()),
      okResponse(
        searchAlbumsBody([
          { id: "1", title: "Tri Repetae", popularity: 0.42 },
          { id: "2", title: "Tri Repetae++", popularity: 0.31 },
        ])
      )
    )
    const { searchTidalAlbums } = await loadTidal()

    const albums = await searchTidalAlbums("Tri Repetae Autechre")

    expect(albums).toEqual([
      { id: "1", title: "Tri Repetae", popularity: 0.42 },
      { id: "2", title: "Tri Repetae++", popularity: 0.31 },
    ])
    const [url, init] = fetchMock.mock.calls[1]!
    const requested = String(url)
    expect(requested).toContain("/searchResults/")
    expect(requested).toContain("countryCode=GB")
    expect(requested).toContain("include=albums")
    expect(init.headers.Authorization).toBe("Bearer tok-123")
  })

  it("returns an empty list when nothing matches", async () => {
    stubFetch(okResponse(tokenBody()), okResponse(searchAlbumsBody([])))
    const { searchTidalAlbums } = await loadTidal()

    expect(await searchTidalAlbums("no such album")).toEqual([])
  })

  it("throws when the catalog payload is malformed (real zod parse)", async () => {
    stubFetch(
      okResponse(tokenBody()),
      okResponse({
        data: [{ id: "1", type: "albums" }],
        included: [{ id: "1", type: "albums", attributes: { title: "x" } }],
      })
    )
    const { searchTidalAlbums } = await loadTidal()

    await expect(searchTidalAlbums("anything")).rejects.toThrow()
  })

  it("throws a status-carrying TidalApiError on a non-OK catalog response", async () => {
    stubFetch(okResponse(tokenBody()), errorResponse(429, "Too Many Requests"))
    const { searchTidalAlbums, TidalApiError } = await loadTidal()

    const err = await searchTidalAlbums("anything").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TidalApiError)
    expect((err as InstanceType<typeof TidalApiError>).status).toBe(429)
  })
})
