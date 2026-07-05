import type { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import type {
  AlbumInfoFetcher,
  AlbumInfoResult,
  EnrichmentSource,
  TidalCatalogFetcher,
} from "./enrichment"
import {
  enrichAlbum,
  LastfmAlbumInfoFetcher,
  LastfmEnrichmentSource,
  TidalEnrichmentSource,
} from "./enrichment"
import { recordListen } from "./ingestion"
import { albums, albumSources, albumTracks } from "./schema"
import type { TidalAlbum, TidalAlbumDetail } from "./tidal-api"
import { setupTestDb } from "./test-utils"

let client: PGlite
let db: Database

let albumId: number
let trackId: number

beforeAll(async () => {
  ;({ db, client } = await setupTestDb())

  const r = await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Roygbiv" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T10:00:00Z"),
    source: "lastfm",
  })
  albumId = r.albumId!
  trackId = r.trackId

  await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Aquarius" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T10:05:00Z"),
    source: "lastfm",
  })
})

afterAll(async () => {
  await client.close()
})

function fakeFetcher(result: AlbumInfoResult): AlbumInfoFetcher {
  return {
    getAlbumInfo: async () => result,
  }
}

function failingFetcher(error: Error): AlbumInfoFetcher {
  return {
    getAlbumInfo: async () => {
      throw error
    },
  }
}

function lastfmSource(fetcher: AlbumInfoFetcher): EnrichmentSource {
  return new LastfmEnrichmentSource(fetcher)
}

async function readSourceRows(db: Database, albumId: number) {
  return db
    .select()
    .from(albumSources)
    .where(eq(albumSources.albumId, albumId))
}

describe("LastfmEnrichmentSource via enrichAlbum", () => {
  it("writes artwork and tracks, and a matched lastfm source row", async () => {
    const source = lastfmSource(
      fakeFetcher({
        imageUrl: "https://lastfm.freetls.fastly.net/i/u/300x300/abc.png",
        tracks: [
          { name: "Wildlife Analysis", trackNumber: 1, duration: 373 },
          { name: "An Eagle in Your Mind", trackNumber: 2, duration: 393 },
          { name: "Roygbiv", trackNumber: 3, duration: 172 },
        ],
      })
    )

    await enrichAlbum(db, { albumId, sources: [source] })

    const [album] = await db
      .select({ imageUrl: albums.imageUrl })
      .from(albums)
      .where(eq(albums.id, albumId))

    expect(album!.imageUrl).toBe(
      "https://lastfm.freetls.fastly.net/i/u/300x300/abc.png"
    )

    const [sourceRow] = await readSourceRows(db, albumId)
    expect(sourceRow).toMatchObject({ source: "lastfm", matched: true })
    expect(sourceRow!.enrichedAt).toBeInstanceOf(Date)

    const rows = await db
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, albumId))

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      trackNumber: 1,
      name: "Wildlife Analysis",
      duration: 373,
    })
    expect(rows[2]).toMatchObject({
      trackNumber: 3,
      name: "Roygbiv",
      duration: 172,
    })
  })

  it("self-gates: no API call when a lastfm source row already exists", async () => {
    let callCount = 0
    const source = lastfmSource({
      getAlbumInfo: async () => {
        callCount++
        return { imageUrl: "https://example.com/new.png", tracks: [] }
      },
    })

    await enrichAlbum(db, { albumId, sources: [source] })

    expect(callCount).toBe(0)
  })

  it("matches track_id for tracks with hums", async () => {
    const rows = await db
      .select({
        name: albumTracks.name,
        trackId: albumTracks.trackId,
      })
      .from(albumTracks)
      .where(eq(albumTracks.albumId, albumId))

    const roygbiv = rows.find((r) => r.name === "Roygbiv")
    expect(roygbiv!.trackId).toBe(trackId)
  })

  it("leaves track_id null for tracks without hums", async () => {
    const rows = await db
      .select({
        name: albumTracks.name,
        trackId: albumTracks.trackId,
      })
      .from(albumTracks)
      .where(eq(albumTracks.albumId, albumId))

    const wildlife = rows.find((r) => r.name === "Wildlife Analysis")
    expect(wildlife!.trackId).toBeNull()
  })

  it("writes no source row and no tracks when the fetcher throws", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Autechre" },
      track: { name: "Gantz Graf" },
      album: { name: "Gantz Graf EP" },
      listenedAt: new Date("2024-06-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    const source = lastfmSource(
      failingFetcher(new Error("LastFM API: 503 Service Unavailable"))
    )

    vi.spyOn(console, "error").mockImplementation(() => {})
    await enrichAlbum(freshDb, { albumId: freshAlbumId, sources: [source] })
    vi.restoreAllMocks()

    expect(await readSourceRows(freshDb, freshAlbumId)).toHaveLength(0)

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(0)

    await freshClient.close()
  })

  it("writes no source row and no tracks if the track insert fails", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Squarepusher" },
      track: { name: "Tommib" },
      album: { name: "Go Plastic" },
      listenedAt: new Date("2024-09-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    // Two tracks share trackNumber 1 -> violates album_tracks PK
    // (album_id, track_number) on insert.
    const source = lastfmSource(
      fakeFetcher({
        imageUrl: "https://example.com/go-plastic.jpg",
        tracks: [
          { name: "My Red Hot Car", trackNumber: 1, duration: 295 },
          { name: "Boneville Occident", trackNumber: 1, duration: 222 },
        ],
      })
    )

    vi.spyOn(console, "error").mockImplementation(() => {})
    await enrichAlbum(freshDb, { albumId: freshAlbumId, sources: [source] })
    vi.restoreAllMocks()

    expect(await readSourceRows(freshDb, freshAlbumId)).toHaveLength(0)

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(0)

    await freshClient.close()
  })

  it("heals an album left with stale tracks and no source row on retry", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Plaid" },
      track: { name: "Eyen" },
      album: { name: "Double Figure" },
      listenedAt: new Date("2024-10-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    // Simulate an interrupted prior enrichment: tracks were written but the
    // completion row never committed. The orchestrator sees no source row and
    // retries.
    await freshDb.insert(albumTracks).values({
      albumId: freshAlbumId,
      trackNumber: 1,
      name: "Stale Row",
      trackId: null,
      duration: null,
    })

    const source = lastfmSource(
      fakeFetcher({
        imageUrl: "https://example.com/double-figure.jpg",
        tracks: [
          { name: "Eyen", trackNumber: 1, duration: 268 },
          { name: "Squance", trackNumber: 2, duration: 312 },
        ],
      })
    )

    await enrichAlbum(freshDb, { albumId: freshAlbumId, sources: [source] })

    const [sourceRow] = await readSourceRows(freshDb, freshAlbumId)
    expect(sourceRow).toMatchObject({ source: "lastfm", matched: true })

    const trackRows = await freshDb
      .select({ name: albumTracks.name, trackNumber: albumTracks.trackNumber })
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(2)
    expect(trackRows.map((t) => t.name).sort()).toEqual(["Eyen", "Squance"])

    await freshClient.close()
  })

  it("records the pass but leaves image_url null when there is no artwork", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Aphex Twin" },
      track: { name: "Xtal" },
      album: { name: "Selected Ambient Works" },
      listenedAt: new Date("2024-07-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    const source = lastfmSource(
      fakeFetcher({
        imageUrl: null,
        tracks: [
          { name: "Xtal", trackNumber: 1, duration: 290 },
          { name: "Tha", trackNumber: 2, duration: 540 },
        ],
      })
    )

    await enrichAlbum(freshDb, { albumId: freshAlbumId, sources: [source] })

    const [album] = await freshDb
      .select({ imageUrl: albums.imageUrl })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.imageUrl).toBeNull()

    const [sourceRow] = await readSourceRows(freshDb, freshAlbumId)
    expect(sourceRow).toMatchObject({ source: "lastfm", matched: true })

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(2)

    await freshClient.close()
  })

  it("parses album.getInfo with numeric duration and rank from the real schema", async () => {
    // Regression: the album.getInfo endpoint returns duration
    // and @attr.rank as JSON numbers, not strings. This drives the real Zod
    // schema via a mocked fetch — the fakeFetcher in other tests bypasses it,
    // which is why the global enrichment failure went undetected.
    const payload = {
      album: {
        image: [
          { "#text": "https://lastfm.example/34s/a.png" },
          { "#text": "https://lastfm.example/300x300/a.png" },
        ],
        tracks: {
          track: [
            { name: "Wildlife Analysis", duration: 373, "@attr": { rank: 1 } },
            { name: "Roygbiv", duration: 172, "@attr": { rank: 2 } },
          ],
        },
      },
    }

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )

    try {
      const fetcher = new LastfmAlbumInfoFetcher("test-key")
      const result = await fetcher.getAlbumInfo({
        albumName: "Music Has the Right to Children",
        artistName: "Boards of Canada",
      })

      expect(result.imageUrl).toBe("https://lastfm.example/300x300/a.png")
      expect(result.tracks).toEqual([
        { name: "Wildlife Analysis", trackNumber: 1, duration: 373 },
        { name: "Roygbiv", trackNumber: 2, duration: 172 },
      ])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("handles album with no tracks in response", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Brian Eno" },
      track: { name: "Music for Airports" },
      album: { name: "Ambient 1" },
      listenedAt: new Date("2024-08-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    const source = lastfmSource(
      fakeFetcher({
        imageUrl: "https://example.com/eno.jpg",
        tracks: [],
      })
    )

    await enrichAlbum(freshDb, { albumId: freshAlbumId, sources: [source] })

    const [album] = await freshDb
      .select({ imageUrl: albums.imageUrl })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.imageUrl).toBe("https://example.com/eno.jpg")

    const [sourceRow] = await readSourceRows(freshDb, freshAlbumId)
    expect(sourceRow).toMatchObject({ source: "lastfm", matched: true })

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(0)

    await freshClient.close()
  })
})

const LASTFM_PLACEHOLDER =
  "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png"

// A LastFM-enriched album in a chosen artwork state, the starting point every
// TIDAL artwork test shares. Seeds the image_url plus a completed lastfm source
// row so the album mirrors a post-LastFM pass. Returns the album id.
async function seedLastfmEnrichedAlbum(
  db: Database,
  opts: {
    artist: string
    track: string
    album: string
    imageUrl: string | null
    lastfmRow?: boolean
  }
): Promise<number> {
  const r = await recordListen(db, {
    artist: { name: opts.artist },
    track: { name: opts.track },
    album: { name: opts.album },
    listenedAt: new Date("2024-11-01T10:00:00Z"),
    source: "lastfm",
  })
  const albumId = r.albumId!

  await db
    .update(albums)
    .set({ imageUrl: opts.imageUrl })
    .where(eq(albums.id, albumId))

  if (opts.lastfmRow !== false) {
    await db.insert(albumSources).values({
      albumId,
      source: "lastfm",
      enrichedAt: new Date(),
      matched: true,
    })
  }

  return albumId
}

// Records what the orchestrator asked the catalog so tests can assert no call
// happened on gated paths.
function fakeTidalFetcher(opts: {
  candidates?: TidalAlbum[]
  detail?: TidalAlbumDetail
  searchError?: Error
}): TidalCatalogFetcher & { searchCalls: number; getAlbumCalls: number } {
  const fetcher = {
    searchCalls: 0,
    getAlbumCalls: 0,
    async searchAlbums(): Promise<TidalAlbum[]> {
      fetcher.searchCalls++
      if (opts.searchError) throw opts.searchError
      return opts.candidates ?? []
    },
    async getAlbum(): Promise<TidalAlbumDetail> {
      fetcher.getAlbumCalls++
      return opts.detail ?? { artistName: null, coverArtUrl: null }
    },
  }
  return fetcher
}

function tidalSource(fetcher: TidalCatalogFetcher): EnrichmentSource {
  return new TidalEnrichmentSource(fetcher)
}

async function readAlbumImage(db: Database, albumId: number) {
  const [album] = await db
    .select({ imageUrl: albums.imageUrl })
    .from(albums)
    .where(eq(albums.id, albumId))
  return album!
}

async function readTidalRow(db: Database, albumId: number) {
  const [row] = await db
    .select()
    .from(albumSources)
    .where(
      and(eq(albumSources.albumId, albumId), eq(albumSources.source, "tidal"))
    )
  return row
}

describe("TidalEnrichmentSource via enrichAlbum", () => {
  it("fills missing artwork from TIDAL when the album and artist match", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Autechre",
      track: "Clipper",
      album: "Tri Repetae",
      imageUrl: null,
    })

    const fetcher = fakeTidalFetcher({
      candidates: [{ id: "t1", title: "Tri Repetae", popularity: 0.5 }],
      detail: { artistName: "Autechre", coverArtUrl: "https://tidal/cover.jpg" },
    })

    await enrichAlbum(db, { albumId, sources: [tidalSource(fetcher)] })

    expect((await readAlbumImage(db, albumId)).imageUrl).toBe(
      "https://tidal/cover.jpg"
    )
    expect(await readTidalRow(db, albumId)).toMatchObject({ matched: true })

    await client.close()
  })

  it("treats the LastFM star placeholder as missing and replaces it", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Boards of Canada",
      track: "Olson",
      album: "Geogaddi",
      imageUrl: LASTFM_PLACEHOLDER,
    })

    const fetcher = fakeTidalFetcher({
      candidates: [{ id: "t1", title: "Geogaddi", popularity: 0.9 }],
      detail: {
        artistName: "Boards of Canada",
        coverArtUrl: "https://tidal/geogaddi.jpg",
      },
    })

    await enrichAlbum(db, { albumId, sources: [tidalSource(fetcher)] })

    expect((await readAlbumImage(db, albumId)).imageUrl).toBe(
      "https://tidal/geogaddi.jpg"
    )
    expect(await readTidalRow(db, albumId)).toMatchObject({ matched: true })

    await client.close()
  })

  it("never overwrites genuine LastFM artwork and skips the catalog", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Aphex Twin",
      track: "Xtal",
      album: "Selected Ambient Works 85-92",
      imageUrl: "https://lastfm.example/real-cover.png",
    })

    const fetcher = fakeTidalFetcher({})

    await enrichAlbum(db, { albumId, sources: [tidalSource(fetcher)] })

    expect((await readAlbumImage(db, albumId)).imageUrl).toBe(
      "https://lastfm.example/real-cover.png"
    )
    expect(await readTidalRow(db, albumId)).toMatchObject({ matched: false })
    expect(fetcher.searchCalls).toBe(0)

    await client.close()
  })

  it("records a no-match without artwork when the album is not on TIDAL", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Some Obscure Act",
      track: "Track",
      album: "Unfindable",
      imageUrl: null,
    })

    const fetcher = fakeTidalFetcher({ candidates: [] })

    await enrichAlbum(db, { albumId, sources: [tidalSource(fetcher)] })

    expect((await readAlbumImage(db, albumId)).imageUrl).toBeNull()
    expect(await readTidalRow(db, albumId)).toMatchObject({ matched: false })
    expect(fetcher.getAlbumCalls).toBe(0)

    await client.close()
  })

  it("treats a title match with a different artist as no-match", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Autechre",
      track: "Clipper",
      album: "Tri Repetae",
      imageUrl: null,
    })

    // Title matches but the catalog album belongs to a different artist.
    const fetcher = fakeTidalFetcher({
      candidates: [{ id: "t1", title: "Tri Repetae", popularity: 0.7 }],
      detail: { artistName: "Daniel Avery", coverArtUrl: "https://tidal/wrong.jpg" },
    })

    await enrichAlbum(db, { albumId, sources: [tidalSource(fetcher)] })

    expect((await readAlbumImage(db, albumId)).imageUrl).toBeNull()
    expect(await readTidalRow(db, albumId)).toMatchObject({ matched: false })

    await client.close()
  })

  it("leaves artwork untouched when the matched TIDAL album has no cover", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Plaid",
      track: "Eyen",
      album: "Double Figure",
      imageUrl: null,
    })

    const fetcher = fakeTidalFetcher({
      candidates: [{ id: "t1", title: "Double Figure", popularity: 0.4 }],
      detail: { artistName: "Plaid", coverArtUrl: null },
    })

    await enrichAlbum(db, { albumId, sources: [tidalSource(fetcher)] })

    expect((await readAlbumImage(db, albumId)).imageUrl).toBeNull()
    expect(await readTidalRow(db, albumId)).toMatchObject({ matched: false })

    await client.close()
  })

  it("writes no tidal row when the catalog call fails", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Squarepusher",
      track: "Tommib",
      album: "Go Plastic",
      imageUrl: null,
    })

    const fetcher = fakeTidalFetcher({
      searchError: new Error("TIDAL API error: 429 Too Many Requests"),
    })

    vi.spyOn(console, "error").mockImplementation(() => {})
    await enrichAlbum(db, { albumId, sources: [tidalSource(fetcher)] })
    vi.restoreAllMocks()

    expect(await readTidalRow(db, albumId)).toBeUndefined()

    await client.close()
  })

  it("self-gates: no catalog call when a tidal source row already exists", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Four Tet",
      track: "Angel Echoes",
      album: "There Is Love in You",
      imageUrl: null,
    })
    await db.insert(albumSources).values({
      albumId,
      source: "tidal",
      enrichedAt: new Date(),
      matched: false,
    })

    const fetcher = fakeTidalFetcher({})

    await enrichAlbum(db, { albumId, sources: [tidalSource(fetcher)] })

    expect(fetcher.searchCalls).toBe(0)

    await client.close()
  })
})

// A fake EnrichmentSource that records its calls, for orchestration tests that
// don't need the real source bodies.
function fakeSource(
  name: "lastfm" | "tidal",
  opts: { matched?: boolean; error?: Error; order?: string[] } = {}
): EnrichmentSource & { calls: number } {
  const source = {
    name,
    calls: 0,
    async enrich() {
      source.calls++
      opts.order?.push(name)
      if (opts.error) throw opts.error
      return { matched: opts.matched ?? true }
    },
  }
  return source
}

describe("enrichAlbum orchestrator", () => {
  let db: Database
  let client: PGlite
  let seq = 0

  beforeAll(async () => {
    ;({ db, client } = await setupTestDb())
  })

  afterAll(async () => {
    await client.close()
  })

  // A distinct album per test keeps the shared db free of cross-test coupling.
  async function seedAlbum(): Promise<number> {
    seq++
    const r = await recordListen(db, {
      artist: { name: `Orbital ${seq}` },
      track: { name: "Halcyon" },
      album: { name: `Orbital ${seq}` },
      listenedAt: new Date("2024-12-01T10:00:00Z"),
      source: "lastfm",
    })
    return r.albumId!
  }

  it("runs sources in priority order and writes a row per source", async () => {
    const albumId = await seedAlbum()
    const order: string[] = []

    await enrichAlbum(db, {
      albumId,
      sources: [
        fakeSource("lastfm", { matched: true, order }),
        fakeSource("tidal", { matched: false, order }),
      ],
    })

    expect(order).toEqual(["lastfm", "tidal"])

    const rows = await readSourceRows(db, albumId)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.source === "lastfm")).toMatchObject({
      matched: true,
    })
    expect(rows.find((r) => r.source === "tidal")).toMatchObject({
      matched: false,
    })
  })

  it("self-gates a completed source and does not re-run it", async () => {
    const albumId = await seedAlbum()
    await db.insert(albumSources).values({
      albumId,
      source: "lastfm",
      enrichedAt: new Date(),
      matched: true,
    })

    const lastfm = fakeSource("lastfm")
    const tidal = fakeSource("tidal", { matched: false })

    await enrichAlbum(db, { albumId, sources: [lastfm, tidal] })

    expect(lastfm.calls).toBe(0)
    expect(tidal.calls).toBe(1)
  })

  it("a no-match writes matched=false and is not retried", async () => {
    const albumId = await seedAlbum()

    const first = fakeSource("tidal", { matched: false })
    await enrichAlbum(db, { albumId, sources: [first] })

    expect(await readTidalRow(db, albumId)).toMatchObject({ matched: false })

    const second = fakeSource("tidal", { matched: true })
    await enrichAlbum(db, { albumId, sources: [second] })

    // Still the original no-match row; the completed pass is never retried.
    expect(second.calls).toBe(0)
    expect(await readTidalRow(db, albumId)).toMatchObject({ matched: false })
  })

  it("a transient failure writes no row, stops the ladder, and retries next visit", async () => {
    const albumId = await seedAlbum()

    vi.spyOn(console, "error").mockImplementation(() => {})

    const failing = fakeSource("lastfm", { error: new Error("boom") })
    const tidal = fakeSource("tidal", { matched: true })
    await enrichAlbum(db, { albumId, sources: [failing, tidal] })

    // No row for the failed source, and the lower rung never ran this visit.
    expect(await readSourceRows(db, albumId)).toHaveLength(0)
    expect(tidal.calls).toBe(0)

    // Next visit: the source succeeds and both rungs complete.
    const retry = fakeSource("lastfm", { matched: true })
    const tidal2 = fakeSource("tidal", { matched: true })
    await enrichAlbum(db, { albumId, sources: [retry, tidal2] })
    vi.restoreAllMocks()

    expect(retry.calls).toBe(1)
    expect(tidal2.calls).toBe(1)
    expect(await readSourceRows(db, albumId)).toHaveLength(2)
  })

  it("throws when the album does not exist", async () => {
    await expect(
      enrichAlbum(db, { albumId: 99999, sources: [fakeSource("lastfm")] })
    ).rejects.toThrow("Album not found")
  })
})
